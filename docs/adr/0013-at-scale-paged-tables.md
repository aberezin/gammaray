# ADR 0013 — At-scale tables: per-table opt-in server pagination

- **Status:** Accepted (2026-06-29) — design decision; implementation forthcoming
- **Context area:** Scaling the type-A list path — bounding memory for large tables

## Context

Every type-A list page loads the **entire** table. The replication pull
(`packages/client/src/batch-sync.ts`) issues `rows(table)`, which `SELECT`s the
whole table on the server, serializes it to JSON, stores all of it in RxDB
(IndexedDB), and `RecordList` then renders all of it. The pull handler doesn't
even honor its checkpoint — it always fetches everything. This is fine for the
example tables (tens to low hundreds of rows), but the goal is a framework where
**any** table can hold an arbitrarily large number of rows without blowing up
memory or the UI.

The cost shows up at three layers, and a fix at only one doesn't scale:

1. **Server** — `rows(table)` reads the full table into memory + serializes it.
2. **Client store** — RxDB keeps a *full local replica* of every row.
3. **UI** — `RecordList` renders every row.

Virtualizing the list (e.g. `react-window`) addresses only layer 3. The server
would still SELECT everything and RxDB would still store everything, so it does
not meet "without blowing up memory." The ceiling is the *full pull*, not the
render.

### The unavoidable tension

GammaRay is offline-first: the local RxDB replica is authoritative and the app
works fully offline (ADR 0001, ADR 0006). But **a full offline replica and an
arbitrarily-large table are mutually exclusive** — you cannot hold hundreds of
thousands of rows in IndexedDB and still call it a bounded local store. For a
genuinely large table, something has to give.

The framework already resolved this exact tension once, one level down. The
`searchable` reference opt-in (PR #31, see ADR 0007 for the m2m baseline) stopped
shipping a large *reference target* catalog to every client: a `searchable` field
queries the server on demand (`searchRows` / `rowsByIds`) and resolves labels by
id, instead of replicating the whole target collection. Small targets keep the
replicate-and-filter model. This ADR extends the same philosophy from a *field*
to a whole *table*.

## Decision

Introduce a per-table **`paged: true`** flag on the `TableDescriptor`. It selects
between two list strategies; small tables keep today's behavior unchanged.

**Non-paged (default) — full-replica, offline-first.** Unchanged. The table
replicates in full into RxDB; the list is the local set; everything works
offline. Correct for reference/lookup tables and any table whose row count
comfortably fits a local store.

**Paged (opt-in) — server-paginated, online list.** The list is **not**
full-replicated. `RecordPage` fetches one page at a time from a new generic
server query (a keyset-paginated generalization of `searchRows`), driven by the
descriptor like every other engine query:

```
pageRows(table, after, limit, sort, filter) → { rows, nextCursor, total? }
```

- **Memory is bounded at all three layers** — the server reads one page, the
  client holds one page, the UI renders one page. Row count no longer drives
  memory.
- **Search + sort move server-side** for paged tables (the client can no longer
  filter an in-memory set it doesn't have). The list gains a search box and
  sortable columns that re-query.
- **Writes are unchanged.** Create/update/delete on a loaded row still ride the
  same `pushBatch` path (ADR 0006). A paged table is "online list, normal write,"
  not read-only.

### The trade-off, stated plainly

A `paged` table gives up **full offline browse of that table**. You can view and
edit the rows you've loaded (and queue those edits offline), but you cannot page
through the entire table while disconnected, because the whole table was never
shipped to the client. This cost is paid *only* by tables that opt in; it is the
honest, unavoidable price of "arbitrarily large," and it is scoped per-table so
the rest of the app stays fully offline-first.

### Why opt-in, not automatic

We considered auto-switching a table to paged mode once its row count crosses a
threshold. Rejected: a table's offline guarantee would then silently change
under the app (a table that was browsable offline yesterday isn't today), which
is exactly the kind of implicit behavior the descriptor model exists to avoid.
**The descriptor is the contract** (ADR 0002) — whether a table is fully offline
or online-paged is a deliberate, declared property of that table, the same way
`searchable`, `revisioned`, and merge strategy are. A schema author chooses
`paged` knowing the offline consequence, once, in one place.

### Keyset, not offset

Pagination uses a keyset cursor (`WHERE (sort_key, id) > (:after)` ordered by the
same tuple), not `LIMIT/OFFSET`. Offset pagination scans and discards rows
(O(offset) cost deep in the table) and skips/duplicates rows when the underlying
data shifts between page fetches — both unacceptable for the "arbitrarily large,
concurrently mutated" case this ADR exists to serve. Keyset gives stable,
constant-cost paging. (A total `count` is optional and best-effort; an exact
count over a huge, live table is itself an unbounded query.)

## Alternatives considered

- **Virtualize the list only (full replica + windowed render).** Cheap, and a
  fine *complement* within a page, but it bounds only the UI — the server still
  SELECTs everything and RxDB still stores everything. Does not meet the goal.
- **Incremental / keyset *replication* (still a full local replica, just
  paced).** Make the pull honor its checkpoint and fill RxDB in keyset batches.
  Smooths the initial load and is worth doing regardless, but it still ends with
  the *entire* table in IndexedDB — memory is unbounded in N. Not a solution to
  the stated problem, only to the load *spike*.
- **Automatic threshold-based paging.** See "Why opt-in" — silent change to a
  table's offline guarantee; rejected.

## Consequences

- A new generic, descriptor-driven `pageRows` query on the engine (keyset
  pagination + server-side sort/filter), alongside the existing
  `rows`/`searchRows`/`rowsByIds`. One query serves every paged table — no
  per-table code, consistent with ADR 0009.
- `RecordPage` / `useRecordPage` branch on `descriptor.paged`: paged tables skip
  primary-collection replication and drive the list from `pageRows` (with its own
  page/cursor/sort/filter state); non-paged tables are untouched.
- `RecordList` gains pagination + sort affordances (used only in paged mode); the
  exact UX (numbered pages vs. infinite-scroll/virtualized window) is an
  implementation detail decided at build time, not by this ADR.
- **Paged tables are not fully offline.** Documented per-table; the live
  `rowUpdated` stream + `pushBatch` writes still apply to loaded rows. The
  data-epoch reslate (ADR 0012) and sync-health guard (ADR 0008) continue to
  cover the rows the client does hold.
- The framework's offline-first default is preserved for every table that doesn't
  opt in. Scaling becomes a one-flag, per-table decision with a clearly understood
  cost — the same shape as `searchable` one level down.
