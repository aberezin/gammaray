# ADR 0006 — Server-side transactional batch sync

- **Status:** Accepted (2026-06-15)
- **Context area:** Type-A relations — cross-collection write sync under offline-first

## Context

Each RxDB collection replicated independently, so a child row could reach the
server before its parent (the two collections push separately). With an enforced
foreign key that fails. Two paths were weighed (see the discussion preceding ADR
0005 / this one): **retry-on-miss** (let the child push fail and retry until the
parent lands) vs. a **real ordering system**. Retry was rejected — it doesn't
scale as the relationship graph deepens (cascading retries, no atomicity, a
transiently inconsistent graph). We chose ordering, and within that, **server-
side** ordering over client-side: integrity must be enforced server-side
regardless, so client ordering would be redundant-not-sufficient, and the
deferred-constraint mechanism that makes ordering robust is itself a server/DB
capability (see the client-vs-server analysis).

## Decision

A single **transactional batch endpoint**: `pushBatch(changes, clientId)`.

- **One transaction, deferred constraints.** The batch runs in one DB
  transaction with `SET CONSTRAINTS ALL DEFERRED`; the contact→company FK is
  `DEFERRABLE INITIALLY DEFERRED`, so referential integrity is validated at
  commit — the batch may contain parent and child in any order.
- **Ordering is inferred, not the guarantee.** Tables are applied in a
  topological order derived from the descriptor FK graph (`dependencyOrder`),
  parents before children. The deferred constraint is the actual guarantee; the
  topo order is an optimization (and the source of delete order later).
- **Atomicity policy.** The applied set commits atomically. `CONFLICT` and
  `REJECTED` rows are isolated and reported per-row — they do not abort the
  batch. (A conflict means the row exists, so referencing rows stay valid; a
  rejected create's dependents are also rejected.)
- **Per-row reconcile reused.** Each row goes through the same Model-A version +
  merge-strategy logic (`applyContactChange` / `applyCompanyChange`), now
  transaction-free so the batch owns the transaction.
- **Client coordinator.** A `BatchCoordinator` buffers each collection's pushes,
  debounces, and issues one `pushBatch`; results route back per row (APPLIED →
  reconcile; CONFLICT → conflict UI; REJECTED → surfaced). It tracks server
  versions itself (decoupled from RxDB's lagging `assumedMasterState`) and
  projects reconciled rows to the descriptor's schema fields.

## Consequences

**Positive**
- Atomic cross-collection writes with real referential integrity; no retry.
- Generic over tables (a `RowChange`/`RowResult` JSON contract) — the first real
  piece of the generic server engine ADR 0002 deferred.
- The dependency graph and batch path are reused by every future relation.

**Negative / trade-offs**
- More logic concentrated server-side; the client push path is now "drain all
  collections into one batch" rather than N independent pushes.
- Cross-collection atomicity for a single sync depends on a debounce window
  (siblings must ride the same flush); far-apart pushes split into batches that
  are individually consistent but commit separately.
- Two subtleties learned in implementation, now encoded: the client must track
  versions itself (RxDB's reconcile lags after a batched push), and must project
  reconciled rows to the schema (the server returns the full entity).

## Self-references and cycles — resolved

This was originally recorded as a bounded gap: the per-row reference check
(`applyContactChange` looked up the referenced company *in the current
transaction state*) was **order-dependent** — it only passed if the referenced
row had already been applied earlier in the batch. The cross-table topo order
covered acyclic cross-table references (parents applied first), but not:

- **Self-referential tables** (e.g. `category.parent_id → category`, a tree):
  no table-level order helps — a child applied before its parent was spuriously
  REJECTED.
- **Cycles between tables** (A→B and B→A): no topological order exists, so
  whichever table applied second was checked against rows not yet inserted.

**Fix (shipped with the `category` self-referential tree).** Reference
validation moved out of the per-applier path and into the coordinator
(`BatchService.validateReferences`). Each upsert's reference targets are checked
against `willExist = existing DB ids ∪ all upsert ids in this batch`, with a
**fixpoint loop**: when a row is rejected its id is removed from `willExist`, so
dependents pointing at a rejected row are rejected transitively. This is
order-independent — child-before-parent within a batch is valid because the
parent is in the batch set — and the deferred constraint confirms at commit.
Per-row attribution is preserved (each bad row gets its own REJECTED + reason).

Verified end to end: a batch listing a child *before* its parent applies both
(`apps/example/tests/categories-tree.spec.ts`), and a category with a bogus
`parentId` is REJECTED with `missing reference category:<id>`.
