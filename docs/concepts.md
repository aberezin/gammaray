# Concepts and vocabulary

The core terms that appear throughout the codebase, ADRs, and other docs.
Defined once here so everything else can just use them.

## Type-A

A **type-A table** is a table whose rows the framework can manage generically
— no per-table service, resolver, form, or list. All CRUD, sync, conflict
resolution, and history is derived from the table's
[`TableDescriptor`](#tabledescriptor) by one server engine and one client
runtime.

The term comes from ADR 0001, which coined "type A" to name the shape being
generalized: **N clients editing a database row** (as opposed to the original
NoteSync problem, which was N clients editing a single string).

**A type-A row has the type-A spine:**

- A client-generated UUID primary key (`id`).
- An integer `version` used for optimistic concurrency.
- A `deleted` tombstone (deletions replicate; rows are never removed).
- `createdAt` / `updatedAt` timestamps.
- Everything else is per-table columns declared in the descriptor.

Any table you'd add to a GammaRay app is type-A. The framework has no other
kind. When you see "type-A page" or "type-A m2m," it just means "the generic
codepath, applied to this table."

Read next: [erd.md](erd.md) `## Notes on the type-A spine` for the physical
shape; [ADR 0001](adr/0001-concurrency-token-model.md) for the origin;
[example-app-spec.md](example-app-spec.md) for how you'd fill one out.

## TableDescriptor

The **single source of truth** for a type-A table — a data-only object
(no code). One descriptor per table drives:

- The RxDB collection schema on the client.
- The GraphQL pull/push queries + the WebSocket subscription.
- The generic form (`RecordForm`) and list (`RecordList`).
- Reference pickers (typeahead, multi-select), m2m materialization.
- The server engine's merge, conflict, and revision behavior.

Defined in `packages/core/src/descriptors.ts`. Consumed by the client
runtime (`packages/client`) and the server engine (`apps/api/src/engine`).

See [ADR 0002](adr/0002-descriptor-driven-tables.md).

## Field kinds

Enumerated in `FieldKind` (`packages/core/src/descriptors.ts`). What matters
for reading other docs:

- **Uuid / String / Text / Email / Phone / Int / Boolean / Timestamp** —
  scalar column kinds. Drive the form input type + validation.
- **Reference** — a many-to-one soft foreign key: the field holds another
  row's id. The descriptor's `references: { collection, titleField }` says
  what it points at and how to label it in the picker. See
  [ADR 0005](adr/0005-soft-foreign-key-references.md).
- **MultiReference** — a *virtual* many-to-many field. It is **not** a column
  on this row; the picker's value is an array of target ids that the client
  materializes into rows in a **join table**. The descriptor's `via` block
  names the join collection and the two reference fields on it. See
  [ADR 0007](adr/0007-many-to-many-virtual-fields.md).

## Merge strategy

`MergeStrategyKind` (`packages/core/src/descriptors.ts`) — how the server
reconciles two concurrent edits to the same row. Set per-table on the
descriptor.

- **WholeRow** *(default, safe)* — any concurrent non-identical change is a
  conflict. Handed to the UI's `RecordConflictBanner` (Keep mine / Keep
  theirs).
- **DisjointFields** — auto-merge if the two edits changed non-overlapping
  fields. Overlap → conflict. Requires the table to be `revisioned` so the
  engine can 3-way-merge against the common ancestor.
- **LastWriteWins** — newest write wins, never conflicts. Rare — use only
  when you truly don't care about lost updates.
- **Custom** — app-supplied rule (cross-field invariants, field groups).

See [ADR 0004](adr/0004-merge-strategy-as-table-policy.md) and
[ADR 0010](adr/0010-generic-revisions-merge-conflict.md).

## `revisioned` tables

A descriptor flag: when true, the engine keeps a per-version snapshot in
`row_revisions` (the polymorphic revision log — one table serves every
revisioned table). Required for 3-way merge and for the conflict UI's
history view. Non-revisioned tables just store the latest row; a version
mismatch is a plain conflict — no ancestor needed.

## Temporal validity (on join tables)

A descriptor flag on join tables (`temporalValidity: true`): the engine
stamps **`effectiveFrom`** on create and **`effectiveTo`** on soft-delete,
so the full lifetime of each link is queryable without touching the parent
row's version or revision log. The UI surfaces this in `RecordPage`'s "Link
history" panel (each link's active period + a "last change" hint).

Applied in the base type-A migrations; see migration
`1000000000012-AddJoinTemporalValidity`.

## Paged tables

A descriptor flag (`paged: true`): the table is **not** full-replicated into
the client's local store; its list is fetched one page at a time from the
server via the generic keyset `pageRows` query (server-side sort + filter).
Memory stays bounded at the server, the client store, and the UI regardless
of row count. The trade-off — no full offline browse of that table (loaded
rows are still editable) — is paid only by tables that opt in.

Writes to a paged row bypass RxDB and go straight through the
`BatchCoordinator` — the row isn't in RxDB to observe, so
`useRecordPage` enqueues directly using the loaded page's row as the
`assumedMasterState`. Consequence: paged rows lose RxDB's offline write
queue (a paged edit made while offline is blocked in the UI, not
queued), which matches the "not fully offline" scope of the opt-in.

See [ADR 0013](adr/0013-at-scale-paged-tables.md) for the opt-in itself
and [ADR 0014](adr/0014-paged-write-direct-through-coordinator.md) for
the write path.

### Choosing `paged` vs full-replicated

The default (unpaged) is right for **most tables**. Only turn `paged` on
when the memory ceiling of a full replica is a real problem *for this
specific table* and you've accepted the offline write cost.

Ask, in order:

1. **Row count.** Will this table plausibly grow past ~10³–10⁴ rows on a
   real user's device? If no, leave it unpaged — the full-replica
   offline-first model is strictly better along every axis (offline
   browse, offline edit queue, in-memory filter, no server pagination
   round-trips).
2. **Offline write matters?** Will your users edit or delete existing
   rows while offline (planes, tunnels, spotty coffee shops)? If yes,
   leaving it unpaged keeps RxDB's write queue. If `paged` is on, the
   UI blocks Edit/Delete/Save-in-edit while offline (create still
   queues) — an honest signal but not the same UX.
3. **How is this table searched?** A paged table's list is server-sorted
   and server-filtered; the client can no longer do a rich in-memory
   filter of an unpulled set. If your UX depends on complex client-side
   filtering, paged forces you to push those filters into the server
   query (`filter`, `sort`, `dir`) or a proper full-text search — worth
   confirming the server side can express what the UI needs.
4. **Reference target?** If this table is the target of a
   `Reference`/`MultiReference` field on other tables, prefer marking
   *the field* `searchable` first (ADR 0007 baseline; extended per PR
   #31) — that alone keeps the target from being replicated to every
   client while still allowing full offline browse of the target
   itself, so it's the lighter tool for the same job at the
   reference-picker layer.

**Canonical yes:** Crate's `track` — the app's largest table, browsed
in-app, editable by the logged-in curator, no realistic offline-edit
requirement. **Canonical no:** every other table in either example app
— they're small, referenced, or both, and the full-replica model gives
better UX for zero cost.

## Data epoch / reslate

The server exposes a `serverDataEpoch` value that changes whenever a
destructive out-of-band data event happens (a re-seed, a reset). On boot,
the client's `DataEpochGuard` compares its stored epoch to the server's; a
mismatch prompts a **reslate** — wipe the local RxDB replica and re-pull
from the server. This is how offline-first clients recover from server-side
data replacement without corruption.

See [ADR 0012](adr/0012-data-epoch-reslate.md). Mid-session detection is
[a known gap](backlog.md).

## Suspect state

The client raises a **suspect** flag when it can no longer trust its local
store — replication error, token-refresh failure, or an unrecoverable RxDB
init error. While suspect, the UI's action buttons are disabled and a
banner offers Reload & re-sync / Reset local data. The intent is *fail
loud, never silently corrupt*: better to make the user pause than to accept
edits against a stale replica.

See [ADR 0008](adr/0008-token-refresh-and-sync-health.md) and
`packages/client/src/sync-health.store.ts`.

## See also

- [example-app-spec.md](example-app-spec.md) — the template a type-A app
  is filled into.
- [erd.md](erd.md) — the physical schema of the type-A spine.
- [../platform-architecture.md](../platform-architecture.md) — architecture
  + the ADR index (each concept above links to its founding ADR).
- [README.md](README.md) — the documentation landing index.
