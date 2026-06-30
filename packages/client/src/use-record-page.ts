'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FieldKind,
  SyncStatus,
  type RowRevisionDto,
  type RowRecord,
  type TableDescriptor,
} from '@gammaray/core'
import { getDatabase, rowCollection } from './rxdb'
import { startRowReplication, BatchCoordinator, type RowConflict } from './batch-sync'
import { makeGqlClient } from './graphql-client'
import { getAccessToken, primeToken } from './token'
import { useSyncHealth } from './sync-health.store'
import {
  getDescriptor,
  isSearchable,
  multiReferenceFields,
  quickAddTargetsOf,
  referenceFields,
  referenceTargetOf,
  replicatedCollectionsForPage,
  titleFieldOf,
  writableFields,
} from './descriptor-registry'

// Version history + conflict resolution + the at-scale picker queries all go
// through the generic engine (JSON rows keyed by table), so they're descriptor-
// agnostic.
const REVISIONS_QUERY = `
  query RowRevisions($table: String!, $rowId: String!) {
    rowRevisions(table: $table, rowId: $rowId)
  }
`
const RESOLVE_CONFLICT = `
  mutation ResolveRowConflict($table: String!, $row: JSON!, $clientId: String!) {
    resolveRowConflict(table: $table, row: $row, clientId: $clientId)
  }
`
const SEARCH_ROWS = `query SearchRows($table: String!, $query: String, $limit: Int) { searchRows(table: $table, query: $query, limit: $limit) }`
const ROWS_BY_IDS = `query RowsByIds($table: String!, $ids: [String!]!) { rowsByIds(table: $table, ids: $ids) }`
const PAGE_ROWS = `query PageRows($table: String!, $after: String, $limit: Int, $sort: String, $dir: String, $filter: String) {
  pageRows(table: $table, after: $after, limit: $limit, sort: $sort, dir: $dir, filter: $filter)
}`

/** One server page for an at-scale `paged` table (ADR 0013). */
interface PageResult {
  rows: RowRecord[]
  nextCursor: string | null
  total: number
}

const PAGE_SIZE = 25

export type SortDir = 'ASC' | 'DESC'

/** Numbered Next/Prev + sort + search controls for a `paged` table's list. */
export interface Pagination {
  /** 0-based current page index. */
  pageIndex: number
  /** Total pages for the current filter (>= 1). */
  pageCount: number
  /** Total matching rows for the current filter. */
  total: number
  pageSize: number
  hasPrev: boolean
  hasNext: boolean
  loading: boolean
  next: () => void
  prev: () => void
  first: () => void
  sort: { field: string; dir: SortDir }
  /** Sort by a field; same field toggles direction, a new field resets to ASC. */
  setSort: (field: string) => void
  filter: string
  setFilter: (query: string) => void
}

/** A Reference/MultiReference picker option (mirrors @gammaray/ui). */
export interface ReferenceOption {
  value: string
  label: string
}

export interface RecordConflict {
  id: string
  mine: Record<string, unknown>
  theirs: Record<string, unknown>
}

export interface QuickAddTarget {
  collection: string
  label: string
  rows: Array<{ id: string; label: string }>
}

export interface UseRecordPage {
  /** Primary rows with virtual MultiReference fields materialized onto them. */
  records: RowRecord[]
  /** id→label maps per field, for the list + the form's current selections.
   *  Non-searchable targets come from the replicated rows; searchable ones are
   *  resolved on demand via `rowsByIds`. */
  referenceLabels: Record<string, Record<string, string>>
  /** Async option source for a field's picker: server `searchRows` for
   *  searchable (large) targets, in-memory filter of replicated rows otherwise. */
  searchReference: (field: string, query: string) => Promise<ReferenceOption[]>
  /** Referenced sibling collections offered an inline quick-add + chips. */
  quickAddTargets: QuickAddTarget[]
  /** True when this table is server-paginated (descriptor.paged) rather than
   *  full-replicated. The list comes from `records` either way; paged tables also
   *  expose `pagination`. */
  paged: boolean
  /** Pagination/sort/search controls — present only for a `paged` table. */
  pagination: Pagination | null
  offline: boolean
  setOffline: (v: boolean) => void
  syncStatus: SyncStatus
  /** True when the local replica is untrusted → the UI goes read-only. */
  suspect: boolean
  conflict: RecordConflict | null
  create: (draft: Record<string, unknown>) => Promise<string>
  update: (id: string, draft: Record<string, unknown>) => Promise<void>
  remove: (id: string) => Promise<void>
  addRelated: (collection: string, title: string) => Promise<void>
  resolveWith: (row: Record<string, unknown>) => Promise<void>
  dismissConflict: () => void
  loadRevisions: (rowId: string) => Promise<RowRevisionDto[]>
}

const now = () => new Date().toISOString()

// Coerce a draft to the descriptor's writable columns with kind-appropriate
// defaults (the server's NOT NULL columns need real values for omitted fields).
function coerceWritable(descriptor: TableDescriptor, draft: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const f of writableFields(descriptor)) {
    const v = draft[f.name]
    switch (f.kind) {
      case FieldKind.Reference:
        data[f.name] = v ? String(v) : null
        break
      case FieldKind.Int:
        data[f.name] = v === undefined || v === null || v === '' ? 0 : Number(v)
        break
      case FieldKind.Boolean:
        data[f.name] = Boolean(v)
        break
      default: // String / Text / Email / Phone / Timestamp
        data[f.name] = v === undefined || v === null ? '' : String(v)
    }
  }
  return data
}

/**
 * The generic client data-layer for one type-A table — the client-side analog of
 * the server's GenericRowService. Derived from the descriptor: which collections
 * to keep live, the reference pickers/labels, m2m materialization + reconcile,
 * CRUD, version history, conflict handling. Large reference targets (fields
 * marked `searchable`) are fetched on demand instead of replicated.
 */
export function useRecordPage(descriptor: TableDescriptor, accessToken: string): UseRecordPage {
  primeToken(accessToken)
  const suspect = useSyncHealth((s) => s.status === 'suspect')

  // At-scale opt-in (ADR 0013): the primary is server-paginated, not replicated.
  const paged = descriptor.paged === true
  const titleField = descriptor.display.titleFields[0] ?? descriptor.identity.field

  // Live rows per replicated collection (primary + joins + non-searchable targets).
  const [data, setData] = useState<Record<string, RowRecord[]>>({})
  // Labels for searchable targets, resolved on demand by id.
  const [resolvedLabels, setResolvedLabels] = useState<Record<string, Record<string, string>>>({})
  const [offline, setOffline] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncStatus.Synced)
  const [conflict, setConflict] = useState<RecordConflict | null>(null)

  // Paged-list state (only used when `paged`). `pageAfters[i]` is the opaque
  // cursor that fetches page i (pageAfters[0] = null); we extend it as we learn
  // each page's nextCursor, so Prev is a stack-pop, not a re-walk.
  const [pagedRows, setPagedRows] = useState<RowRecord[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageTotal, setPageTotal] = useState(0)
  const [pageNextCursor, setPageNextCursor] = useState<string | null>(null)
  const [pageLoading, setPageLoading] = useState(false)
  const [sort, setSortState] = useState<{ field: string; dir: SortDir }>({ field: titleField, dir: 'ASC' })
  const [filter, setFilterState] = useState('')
  const pageAfters = useRef<(string | null)[]>([null])

  const gqlClient = useRef(makeGqlClient())
  const clientId = useRef<string>(crypto.randomUUID())
  const primaryReplication = useRef<ReturnType<typeof startRowReplication> | null>(null)
  const resolvedRef = useRef(resolvedLabels)
  resolvedRef.current = resolvedLabels

  // Collections to replicate. A paged table's primary is excluded from the
  // full-replicated set — it gets a push-only replication instead (writes still
  // sync; the list is fetched via pageRows). Joins + non-searchable targets stay
  // fully replicated so m2m materialization/reconcile and labels keep working.
  const collections = useMemo(() => replicatedCollectionsForPage(descriptor), [descriptor])
  const liveCollections = useMemo(
    () => (paged ? collections.filter((c) => c !== descriptor.collection) : collections),
    [collections, paged, descriptor.collection],
  )
  const fieldByName = useMemo(
    () => Object.fromEntries(descriptor.fields.map((f) => [f.name, f])),
    [descriptor],
  )

  // Local subscriptions — always on, so the UI reflects local data even offline.
  useEffect(() => {
    let active = true
    const subs: Array<{ unsubscribe: () => void }> = []
    async function init() {
      const db = await getDatabase()
      if (!active) return
      for (const collection of liveCollections) {
        const sub = rowCollection(db, collection)
          .find()
          .$.subscribe((docs) => {
            const rows = docs.map((d) => d.toJSON() as RowRecord)
            setData((prev) => ({ ...prev, [collection]: rows }))
          })
        subs.push(sub)
      }
    }
    void init()
    return () => {
      active = false
      subs.forEach((s) => s.unsubscribe())
    }
  }, [liveCollections])

  useEffect(() => {
    setSyncStatus(offline ? SyncStatus.Offline : SyncStatus.Synced)
  }, [offline])

  // Replication — every replicated collection shares ONE BatchCoordinator so
  // sibling writes (e.g. a new company + a contact referencing it) ride a single
  // atomic pushBatch. Runs only while online; restarts on reconnect. Conflicts on
  // the primary table surface to the conflict banner.
  useEffect(() => {
    if (offline) return
    let active = true
    let started: Array<ReturnType<typeof startRowReplication>> = []
    async function init() {
      const db = await getDatabase()
      if (!active) return
      const coordinator = new BatchCoordinator(gqlClient.current, clientId.current, (c: RowConflict) => {
        if (c.table === descriptor.table) {
          setConflict({ id: c.id, mine: c.clientData, theirs: c.serverData })
        }
      })
      started = liveCollections.map((collection) =>
        startRowReplication(getDescriptor(collection), rowCollection(db, collection), gqlClient.current, getAccessToken, coordinator),
      )
      // A paged table's primary gets a push-only replication (no bulk pull / live
      // stream) so local writes still sync without replicating the whole table.
      const primary = paged
        ? startRowReplication(descriptor, rowCollection(db, descriptor.collection), gqlClient.current, getAccessToken, coordinator, { bulkPull: false })
        : null
      if (primary) started.push(primary)
      if (!active) {
        started.forEach((r) => {
          void r.replication.cancel()
          void r.wsClient.dispose()
        })
        return
      }
      // The primary's replication is the one to reSync after a conflict resolve;
      // for a paged table that's its push-only replication, else the first started.
      primaryReplication.current = primary ?? started.find((r) => r != null) ?? null
    }
    void init()
    return () => {
      active = false
      started.forEach((r) => {
        void r.replication.cancel()
        void r.wsClient.dispose()
      })
      primaryReplication.current = null
    }
  }, [offline, liveCollections, paged, descriptor])

  // Fetch one server page for a `paged` table (no-op otherwise). `after` selects
  // the page via its cursor; results + total land in state. Errors mark the
  // replica suspect (same as a failed pull) and leave the page as-is.
  const fetchPage = async (after: string | null, index: number) => {
    setPageLoading(true)
    try {
      const d = await gqlClient.current.request<{ pageRows: PageResult }>(PAGE_ROWS, {
        table: descriptor.table,
        after,
        limit: PAGE_SIZE,
        sort: sort.field,
        dir: sort.dir,
        filter: filter.trim() || null,
      })
      const result = d.pageRows
      setPagedRows(result.rows ?? [])
      setPageTotal(result.total ?? 0)
      setPageIndex(index)
      setPageNextCursor(result.nextCursor ?? null)
      // Remember the cursor that fetched THIS page, so Prev can re-fetch it.
      pageAfters.current[index] = after
    } catch {
      // leave current page; sync-health surfaces the transport error elsewhere
    } finally {
      setPageLoading(false)
    }
  }
  const fetchPageRef = useRef(fetchPage)
  fetchPageRef.current = fetchPage

  // (Re)load page 0 whenever the sort or filter changes (and on first mount).
  // Resetting the cursor stack discards stale Next cursors.
  useEffect(() => {
    if (!paged) return
    pageAfters.current = [null]
    void fetchPageRef.current(null, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged, sort.field, sort.dir, filter])

  // Active target ids per primary row, per MultiReference field, derived from the
  // join rows (the m2m relation lives in the join table, not as a column).
  const records = useMemo(() => {
    const primary = paged ? pagedRows : data[descriptor.collection] ?? []
    const mrefs = multiReferenceFields(descriptor)
    if (mrefs.length === 0) return primary
    return primary.map((r) => {
      const projected: RowRecord = { ...r }
      for (const f of mrefs) {
        const via = f.via!
        const ids = (data[via.joinCollection] ?? [])
          .filter((l) => String(l[via.localField]) === String(r.id))
          .map((l) => String(l[via.remoteField]))
        projected[f.name] = ids
      }
      return projected
    })
  }, [paged, pagedRows, data, descriptor])

  // Resolve labels for searchable targets' currently-referenced ids (by id, so we
  // never replicate the whole catalog). Re-runs as new ids appear in `records`.
  useEffect(() => {
    const targets: Record<string, { titleField: string; ids: Set<string> }> = {}
    for (const f of descriptor.fields) {
      if (!isSearchable(f)) continue
      const t = referenceTargetOf(f)
      if (!t) continue
      const entry = targets[t.collection] ?? (targets[t.collection] = { titleField: t.titleField, ids: new Set() })
      for (const r of records) {
        const v = r[f.name]
        if (f.kind === FieldKind.MultiReference) {
          if (Array.isArray(v)) v.forEach((id) => entry.ids.add(String(id)))
        } else if (v) {
          entry.ids.add(String(v))
        }
      }
    }
    let active = true
    void (async () => {
      for (const [collection, { titleField, ids }] of Object.entries(targets)) {
        const have = resolvedRef.current[collection] ?? {}
        const missing = [...ids].filter((id) => !(id in have))
        if (missing.length === 0) continue
        const table = getDescriptor(collection).table
        const rows = await gqlClient.current
          .request<{ rowsByIds: RowRecord[] }>(ROWS_BY_IDS, { table, ids: missing })
          .then((d) => d.rowsByIds)
          .catch(() => [] as RowRecord[])
        if (!active) return
        setResolvedLabels((prev) => ({
          ...prev,
          [collection]: { ...(prev[collection] ?? {}), ...Object.fromEntries(rows.map((r) => [String(r.id), String(r[titleField] ?? '')])) },
        }))
      }
    })()
    return () => {
      active = false
    }
  }, [records, descriptor])

  // id→label per field, for the list and the form's current selections.
  const referenceLabels = useMemo(() => {
    const labels: Record<string, Record<string, string>> = {}
    const build = (collection: string, titleField: string, searchable: boolean): Record<string, string> =>
      searchable
        ? resolvedLabels[collection] ?? {}
        : Object.fromEntries((data[collection] ?? []).map((row) => [String(row.id), String(row[titleField] ?? '')]))
    for (const f of [...referenceFields(descriptor), ...multiReferenceFields(descriptor)]) {
      const t = referenceTargetOf(f)
      if (t) labels[f.name] = build(t.collection, t.titleField, isSearchable(f))
    }
    return labels
  }, [data, resolvedLabels, descriptor])

  const quickAddTargets = useMemo<QuickAddTarget[]>(() => {
    return quickAddTargetsOf(descriptor).map((t) => ({
      collection: t.collection,
      label: t.label,
      rows: (data[t.collection] ?? []).map((row) => ({ id: String(row.id), label: String(row[t.titleField] ?? '') })),
    }))
  }, [data, descriptor])

  // Async option source for a field's picker.
  async function searchReference(field: string, query: string): Promise<ReferenceOption[]> {
    const f = fieldByName[field]
    if (!f) return []
    const target = referenceTargetOf(f)
    if (!target) return []
    if (isSearchable(f)) {
      const table = getDescriptor(target.collection).table
      const d = await gqlClient.current
        .request<{ searchRows: RowRecord[] }>(SEARCH_ROWS, { table, query, limit: 20 })
        .catch(() => ({ searchRows: [] as RowRecord[] }))
      return d.searchRows.map((r) => ({ value: String(r.id), label: String(r[target.titleField] ?? '') }))
    }
    // Non-searchable: filter the replicated rows in memory (so offline-created
    // and quick-added rows appear immediately).
    const q = query.trim().toLowerCase()
    return (data[target.collection] ?? [])
      .filter((row) => !q || String(row[target.titleField] ?? '').toLowerCase().includes(q))
      .slice(0, 50)
      .map((row) => ({ value: String(row.id), label: String(row[target.titleField] ?? '') }))
  }

  // Reconcile each MultiReference field to its desired set by creating/removing
  // join rows. The inserts/removes ride the batch alongside the primary write, so
  // a brand-new row + its links sync atomically. Reads current links straight
  // from the DB so it doesn't depend on React state being caught up.
  async function reconcileMultiRefs(rowId: string, draft: Record<string, unknown>) {
    const db = await getDatabase()
    for (const f of multiReferenceFields(descriptor)) {
      const via = f.via!
      const desired = Array.isArray(draft[f.name]) ? (draft[f.name] as unknown[]).map(String) : []
      const joinCol = rowCollection(db, via.joinCollection)
      const currentDocs = (await joinCol.find().exec()).filter(
        (d) => String(d.get(via.localField)) === rowId && d.get('_deleted') !== true,
      )
      const currentIds = currentDocs.map((d) => String(d.get(via.remoteField)))
      for (const targetId of desired.filter((t) => !currentIds.includes(t))) {
        await joinCol.insert({
          id: crypto.randomUUID(),
          [via.localField]: rowId,
          [via.remoteField]: targetId,
          version: 0,
          updatedAt: now(),
          _deleted: false,
        })
      }
      for (const targetId of currentIds.filter((t) => !desired.includes(t))) {
        const doc = currentDocs.find((d) => String(d.get(via.remoteField)) === targetId)
        if (doc) await doc.remove()
      }
    }
  }

  async function create(draft: Record<string, unknown>): Promise<string> {
    const db = await getDatabase()
    const id = crypto.randomUUID()
    const writable = coerceWritable(descriptor, draft)
    await rowCollection(db, descriptor.collection).insert({ ...writable, id, version: 0, updatedAt: now(), _deleted: false })
    await reconcileMultiRefs(id, draft)
    // Paged list: the server page won't include the new row until refetched, so
    // show it optimistically now (authoritative refresh on the next nav/sort/
    // search). m2m chips materialize from the replicated join rows automatically.
    if (paged) {
      setPagedRows((prev) => [{ ...writable, id, version: 0, updatedAt: now(), deleted: false } as RowRecord, ...prev])
      setPageTotal((t) => t + 1)
    }
    return id
  }

  async function update(id: string, draft: Record<string, unknown>): Promise<void> {
    const db = await getDatabase()
    const doc = await rowCollection(db, descriptor.collection).findOne(id).exec()
    if (doc) await doc.patch(coerceWritable(descriptor, draft))
    await reconcileMultiRefs(id, draft)
    if (paged) {
      const writable = coerceWritable(descriptor, draft)
      setPagedRows((prev) => prev.map((r) => (String(r.id) === id ? { ...r, ...writable } : r)))
    }
  }

  async function remove(id: string): Promise<void> {
    const db = await getDatabase()
    const doc = await rowCollection(db, descriptor.collection).findOne(id).exec()
    if (doc) await doc.remove()
    if (paged) {
      setPagedRows((prev) => prev.filter((r) => String(r.id) !== id))
      setPageTotal((t) => Math.max(0, t - 1))
    }
  }

  // Quick-create a referenced sibling (e.g. a company/tag) — just its title field.
  async function addRelated(collection: string, title: string): Promise<void> {
    const name = title.trim()
    if (!name) return
    const target = getDescriptor(collection)
    const db = await getDatabase()
    await rowCollection(db, collection).insert({
      ...coerceWritable(target, { [titleFieldOf(target)]: name }),
      id: crypto.randomUUID(),
      version: 0,
      updatedAt: now(),
      _deleted: false,
    })
  }

  // Resolve a detected conflict with the chosen row, then re-sync so the local
  // store reflects the resolved server state.
  async function resolveWith(row: Record<string, unknown>): Promise<void> {
    if (!conflict) return
    const chosen = {
      ...coerceWritable(descriptor, row),
      id: conflict.id,
      deleted: row.deleted === true,
    }
    await gqlClient.current.request(RESOLVE_CONFLICT, {
      table: descriptor.table,
      row: chosen,
      clientId: clientId.current,
    })
    setConflict(null)
    primaryReplication.current?.replication.reSync()
  }

  async function loadRevisions(rowId: string): Promise<RowRevisionDto[]> {
    if (!descriptor.revisioned) return []
    const d = await gqlClient.current.request<{ rowRevisions: RowRevisionDto[] }>(REVISIONS_QUERY, {
      table: descriptor.table,
      rowId,
    })
    return d.rowRevisions
  }

  // Numbered Next/Prev + sort + search for a paged table. Sort/filter changes go
  // through state → the reset effect reloads page 0; Next/Prev fetch directly by
  // cursor (Prev re-fetches the remembered start cursor of the previous page).
  const setSort = (field: string) =>
    setSortState((s) => (s.field === field ? { field, dir: s.dir === 'ASC' ? 'DESC' : 'ASC' } : { field, dir: 'ASC' }))
  const pagination: Pagination | null = paged
    ? {
        pageIndex,
        pageCount: Math.max(1, Math.ceil(pageTotal / PAGE_SIZE)),
        total: pageTotal,
        pageSize: PAGE_SIZE,
        hasPrev: pageIndex > 0,
        hasNext: pageNextCursor != null,
        loading: pageLoading,
        next: () => { if (pageNextCursor != null) void fetchPage(pageNextCursor, pageIndex + 1) },
        prev: () => { if (pageIndex > 0) void fetchPage(pageAfters.current[pageIndex - 1] ?? null, pageIndex - 1) },
        first: () => { void fetchPage(null, 0) },
        sort,
        setSort,
        filter,
        setFilter: setFilterState,
      }
    : null

  return {
    records,
    referenceLabels,
    searchReference,
    quickAddTargets,
    paged,
    pagination,
    offline,
    setOffline,
    syncStatus,
    suspect,
    conflict,
    create,
    update,
    remove,
    addRelated,
    resolveWith,
    dismissConflict: () => setConflict(null),
    loadRevisions,
  }
}
