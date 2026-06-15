# ADR 0004 — Merge strategy as per-table policy

- **Status:** Accepted (2026-06-14); DisjointFields implemented 2026-06-15
- **Context area:** Type-A generalization — conflict reconciliation policy

## Context

Whether two concurrent edits can be merged is **application-specific**, not a
universal truth: disjoint-field edits are safely mergeable for some tables but
violate cross-field invariants (e.g. `start_date`/`end_date`, `city`/`state`/
`zip`) for others. So merge behaviour must be declared, not assumed — the
mechanism (detect divergence) must stay separate from the policy (how to resolve
it). This is the git `.gitattributes` merge-driver model: a merge driver bound
per path; here, a strategy bound per table.

## Decision

Carry a **merge strategy on each table descriptor** (ADR 0002), resolved by a
shared 3-way merge `mergeRows(descriptor, base, ours, theirs)`
(`packages/core/src/merge.ts`) so client and server agree. `base` is the ancestor
snapshot from the revision history (ADR 0001).

Strategies:

- **WholeRow** (conservative default) — any real divergence is a conflict.
- **DisjointFields** — auto-merge fields only one side changed; conflict only when
  both changed the same field differently. No ancestor → falls back to conflict.
- **LastWriteWins** — ours wins, never conflicts.
- **Custom** — reserved for cross-field-invariant rules (consumes field-group
  metadata; not yet implemented).

The merge runs server-side under the row lock (authoritative); a delete on either
side is never field-merged (it surfaces as a conflict). The contact table opts
into DisjointFields.

## Consequences

- **Positive:** per-table (and later schema-wide-default) configuration without a
  second storage/merge engine; the safe default never silently loses data;
  auto-merge improves UX where it's valid.
- **Negative / notes:** DisjointFields depends on the ancestor surviving in the
  revision log (ties to the history-retention TODO in
  `platform-architecture.md`); Custom and field-group invariants are future work.
