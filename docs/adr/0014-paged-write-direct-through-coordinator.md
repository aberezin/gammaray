# ADR 0014 — Paged-table writes bypass RxDB replication and go directly through the BatchCoordinator

- **Status:** Accepted (2026-07-16)
- **Context area:** Type-A write path — reconciling the paged-table opt-in (ADR 0013) with the RxDB-replication-driven push (ADR 0006)

## Context

ADR 0013 introduced `paged: true` on a `TableDescriptor` for tables too
large to full-replicate. It stated: *"Writes are unchanged. Create/update/
delete on a loaded row still ride the same `pushBatch` path (ADR 0006)."*
That claim was correct in intent but wrong in implementation. Edits to a
paged table's rows were silently dropped: no `pushBatch` fired, the title
appeared to change from optimistic `pagedRows` state, and a page reload
reverted the "edit" (reproduced 2026-07-16 on Crate's `track` table; the
fix is `b97035d`).

### The gap

`useRecordPage.update()` and `remove()` did:

```ts
const doc = await rowCollection(db, descriptor.collection).findOne(id).exec()
if (doc) await doc.patch(...)   // update
if (doc) await doc.remove()     // remove
```

RxDB's replication push handler observes local writes on the collection.
For a full-replicated table this works — the row was pulled into RxDB by
`replicateRxCollection`, so `findOne` returns it, `patch`/`remove` triggers
the push handler, `BatchCoordinator.enqueue` runs, `pushBatch` fires.

For a paged table it does not. The `paged` primary is set up with
`bulkPull: false` — `replicateRxCollection` never pulls rows into RxDB.
The list is fetched via `pageRows` and held in a React `pagedRows` state,
not RxDB. So `findOne` returns null, `patch`/`remove` are skipped, the
push handler is never invoked, and the change lives only in `pagedRows`
until the next `pageRows` refetch clobbers it.

### What was tried before landing this

- **Seed RxDB from the loaded page's baseline before patching.** Insert
  the row into RxDB with the baseline's `version`, then let the normal
  patch flow push it. Result: the doc landed in RxDB but the push handler
  still did not fire. RxDB does not schedule a push for a locally-authored
  doc that has a nonzero server `version` and no `assumedMasterState`
  (its notion of "server state we've caught up to"), even after an
  explicit `replication.reSync()`.
- **`upsert` + patch instead of insert.** Same outcome. The doc lives in
  RxDB; the push does not run.

Diagnosing this fully would have required going into RxDB internals to
feed it a properly-shaped `assumedMasterState` so the seeded doc looked
pulled — a workaround dependent on RxDB implementation details we do not
control, for a table RxDB is otherwise not managing.

## Decision

**Paged-table writes bypass RxDB replication entirely and go directly
through the shared `BatchCoordinator`.**

- `useRecordPage` holds the coordinator in a ref
  (`coordinatorRef.current`) so `update`/`remove` can reach it.
- On `update(id, draft)` for a paged table where `findOne(id)` returns
  null, the code path branches:
  ```ts
  const baseline = pagedRows.find((r) => String(r.id) === id)
  if (baseline) {
    const merged = { ...baseline, ...writable, id, _deleted: false }
    const reconciled = await coordinatorRef.current.enqueue(
      descriptor.table,
      [{ newDocumentState: merged, assumedMasterState: baseline }],
    )
    // Adopt the server-authoritative row (bumped version, updatedAt).
    setPagedRows((prev) => prev.map((r) => r.id === id ? { ...r, ...reconciled[0] } : r))
  }
  ```
- `remove` is symmetric — same enqueue with `_deleted: true`.
- The full-replicated path is unchanged: when `findOne` returns a doc,
  `patch`/`remove` runs as before and RxDB's push handler drives the
  coordinator.

### Why this is the right layer for the fix

The `BatchCoordinator` is already the single push surface (ADR 0006). It
owns the batching, the atomic `pushBatch` mutation, the conflict
callback, and the per-row APPLIED/CONFLICT/REJECTED reconciliation.
Everything a paged write needs. RxDB's replication is the *transport*
that hands rows to the coordinator when they exist locally; for a paged
table where rows are not held locally by design, the transport doesn't
apply. Going straight to the coordinator matches the actual data model.

`assumedMasterState = baseline` is the load-bearing detail: the baseline
carries the row's current server `version` (from the last `pageRows`
response), which the coordinator resolves as `expectedVersion` when
building the `pushBatch` change. Without this the server would see
`expectedVersion: 0` on every paged edit and reject them as conflicts.
(Defensive fallback is `newDocumentState.version` when
`assumedMasterState` is absent; `packages/client/src/batch-sync.ts:83`.)

## Alternatives considered

- **Seed RxDB from the loaded page's baseline, then patch.** Tried; RxDB
  did not schedule a push. Would have required feeding RxDB internals a
  synthetic `assumedMasterState` matching its pull-state schema —
  possible but fragile, RxDB-version-dependent, and does not extend
  cleanly to `remove`. Rejected as a workaround around the wrong layer.
- **Upsert paged rows into RxDB as part of `fetchPage`.** Every
  `pageRows` response would `bulkUpsert` its rows into RxDB, so a
  subsequent `patch` finds the doc and RxDB's push runs. Rejected — a
  paged table exists precisely to avoid holding rows locally; upserting
  them defeats the memory-bounded property from ADR 0013. And it turns
  page navigation into a series of local writes.
- **Reproduce RxDB's replication push logic outside RxDB.** Manually
  track "assumed server version" per paged row and diff on write. All
  the state RxDB tracks, none of the reuse — same problem, more code.

## Consequences

- **Paged tables no longer support offline write queueing via RxDB.**
  Non-paged tables still queue offline writes (RxDB persists the local
  patch and the push handler fires when replication reconnects). For a
  paged table, the direct-coordinator enqueue is a live network call; if
  the user is offline, the enqueue's Promise stays unresolved (the
  pushBatch never fires). This is the honest cost of "the local store
  doesn't hold the row." Reasonable for the tables `paged` is intended
  for (large catalogs, browsed online), but callers relying on offline
  edits to paged rows must know this. Documented per-table on descriptor
  authors, same as ADR 0013's "not fully offline" trade-off.
- **The `BatchCoordinator` is now called from two places** — RxDB's push
  handler (for full-replicated tables) and directly from `useRecordPage`
  (for paged tables). Both paths use the same `enqueue` signature, so
  the coordinator sees uniform input regardless of caller.
  `newDocumentState.version` fallback in `enqueue` (from `84f4a26`)
  ensures a caller that lacks `assumedMasterState` still resolves the
  right `expectedVersion` — defensive for the direct-call case.
- **Regression coverage exists.** `apps/music/tests/tracks-paged.spec.ts`
  now includes an "edit a seeded track persists server-side (paged
  update path)" test that hard-reloads before searching for the marker,
  so a passing local-optimistic-only implementation cannot fool it.
  Adding a new paged descriptor requires nothing new; edits already
  route correctly.
- **The sync indicator surfaces this write's status honestly** (ADR
  supersedes-none, tracked as commit `9d33abe`). The coordinator's
  in-flight counter feeds the SyncIndicator — a stuck direct-coordinator
  push shows `Syncing…`, not `Synced`. The paged-write bug was so easy
  to miss precisely because the indicator lied; that class of miss is
  now caught by both a regression test and a live UI signal.

## See also

- [ADR 0006](0006-server-side-batch-sync.md) — the `pushBatch` +
  BatchCoordinator design this piggybacks on.
- [ADR 0013](0013-at-scale-paged-tables.md) — the `paged` opt-in whose
  implicit "writes are unchanged" claim this ADR corrects.
- [../backlog.md](../backlog.md) — the entry that formerly held the
  three ways forward before this decision landed.
