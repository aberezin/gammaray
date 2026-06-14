# ADR 0001 — Concurrency token model for type-A rows

- **Status:** Accepted (2026-06-14)
- **Context area:** Type-A generalization (N clients editing a database row), Update path

## Context

We are generalizing NoteSync from "N clients editing a string" to "N clients
editing a database row" (type A). Change control is **field-aware**, and we need
to reconcile concurrent edits to the same row. Two candidate concurrency-token
models were considered:

- **Model A — single row `version` + 3-way merge against the ancestor.** One
  integer version per row. A client edits from a known version V and pushes
  `expectedVersion = V`. If the server is still at V → fast-forward; otherwise a
  3-way merge runs with `base` = the snapshot at V (we already store full
  per-version snapshots in the revision log), `ours` = client row, `theirs` =
  current server row. This is git's model: linear history, HEAD = version, merge
  on non-fast-forward.
- **Model B — per-field version vectors.** Each field carries its own
  version/timestamp; writes merge field-by-field. Concurrent edits to different
  fields converge automatically; same-field edits are last-write-wins or flagged.
  The column-level-LWW / CRDT-ish family.

This decision builds on the earlier one that **mergeability of disjoint-field
edits is a per-application policy, not a universal truth** — captured as the
pluggable merge strategy on the table descriptor
(`packages/core/src/descriptors.ts`).

## Decision

Adopt **Model A as the single concurrency mechanism.** Express all per-table (and
later schema-wide-default) variation through the **merge strategy** on the
descriptor — default `WholeRow` (any concurrent change → conflict), with opt-in
`DisjointFields` and `Custom`. Defer a true per-field / CRDT engine until a
concrete table demands it; the descriptor leaves that door open.

## Rationale

1. **Mechanism vs. policy.** Model A keeps the token model neutral — `version`
   only *detects divergence*. *Whether* a divergence auto-merges is the pluggable
   strategy operating on `(base, ours, theirs)`. Model B bakes the policy
   (disjoint-field auto-merge) into the mechanism and makes invariant-preservation
   the awkward exception — backwards from the principle we already set.
2. **A can emulate B; not vice versa.** Model A + a `DisjointFields` strategy
   yields B's disjoint auto-merge as a *policy choice*, while still allowing
   `WholeRow` (atomic rows) or `Custom` (cross-field invariants) elsewhere. Model
   B cannot express atomic-row or cross-field-invariant semantics without bolting
   row-level merge back on.
3. **Reuses what we already store.** One integer `version` already exists, and the
   revision log already stores the full field snapshot per version — those *are*
   the ancestors 3-way merge needs. Near-zero added schema.
4. **Coherent history & diff.** A linear commit log (version → snapshot) preserves
   the "git for rows" story and gives an exact structural diff
   (`base→ours` vs `base→theirs`) for both merging and the history UI. Model B has
   no single fork point, so no coherent linear sequence without materializing one.
5. **Cross-field invariants.** A's merge function sees the whole row plus the
   ancestor, so it can reason about field combinations (e.g. `start_date`/
   `end_date`, `city`/`state`/`zip`). B merges fields independently.

## Consequences

**Positive**
- One engine, many policies. Configurability lives on the strategy axis: per-table
  now, schema-wide default + overrides later, and even per-field-group strategies
  for invariants — without running two storage/merge engines.
- Minimal schema impact; reuses existing version + snapshots.

**Negative / trade-offs**
- **Coupled to ancestor retention.** True 3-way needs the `base` snapshot to still
  exist; if history is truncated past it, merge degrades to 2-way ours/theirs.
  This is the interaction flagged in the history-retention TODO
  (`platform-architecture.md`); a retention policy must keep ancestors for recent
  / unresolved forks.
- **Whole-row granularity at the mechanism level.** Disjoint-field edits still
  engage the merge step on version mismatch (the strategy may auto-resolve them).
- **Per-row write serialization is unchanged.** The physical DB row lock
  serializes writers regardless of model (observed in the conflict-storm load
  test); Model B's theoretical field-parallelism does not materialize at the DB
  layer for a single row.

## Alternatives considered

- **Model B (per-field version vectors)** — rejected as the foundational model for
  the reasons above. Its genuine edge (less dependence on ancestor retention;
  native convergence for invariant-free data) is real but narrow.
- **Making the token *model* itself pluggable per table** — rejected for now. It
  would mean maintaining two revision models, two conflict UIs, and two sets of
  edge cases for value that Model A + `DisjointFields` largely already delivers.
  Revisit only if a concrete table needs CRDT-like semantics (presence, counters,
  telemetry, a free-form collaborative field), added then as an isolated per-table
  engine.
