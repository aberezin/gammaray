'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FieldKind,
  SyncStatus,
  type ContactRevisionDto,
  type RowRecord,
  type TableDescriptor,
} from '@gammaray/core'
import { getDatabase, rowCollection } from './rxdb'
import { startRowReplication, BatchCoordinator, type RowConflict } from './batch-sync'
import { makeGqlClient } from './graphql-client'
import { getAccessToken, primeToken } from './token'
import { useSyncHealth } from '@/store/sync-health.store'
import {
  collectionsForPage,
  getDescriptor,
  multiReferenceFields,
  quickAddTargetsOf,
  referenceFields,
  titleFieldOf,
  writableFields,
} from './descriptor-registry'

// Version history + conflict resolution go through the generic engine (JSON rows
// keyed by table), so these are descriptor-agnostic.
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

/** A Reference/MultiReference picker option (mirrors @gammaray/ui's RecordForm). */
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
  /** Options for Reference/MultiReference pickers, keyed by field name. */
  referenceOptions: Record<string, ReferenceOption[]>
  /** id→label maps for the list, keyed by field name. */
  referenceLabels: Record<string, Record<string, string>>
  /** Referenced sibling collections offered an inline quick-add + chips. */
  quickAddTargets: QuickAddTarget[]
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
  loadRevisions: (rowId: string) => Promise<ContactRevisionDto[]>
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
 * the server's GenericRowService. Everything is derived from the descriptor:
 * which collections to keep live, the reference pickers/labels, the m2m
 * materialization + reconcile, CRUD, version history, and conflict handling. A
 * page that wants a different table just passes a different descriptor.
 */
export function useRecordPage(descriptor: TableDescriptor, accessToken: string): UseRecordPage {
  primeToken(accessToken)
  const suspect = useSyncHealth((s) => s.status === 'suspect')

  // Live rows per collection (primary + everything it references).
  const [data, setData] = useState<Record<string, RowRecord[]>>({})
  const [offline, setOffline] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncStatus.Synced)
  const [conflict, setConflict] = useState<RecordConflict | null>(null)

  const gqlClient = useRef(makeGqlClient())
  const clientId = useRef<string>(crypto.randomUUID())
  const primaryReplication = useRef<ReturnType<typeof startRowReplication> | null>(null)

  const collections = useMemo(() => collectionsForPage(descriptor), [descriptor])

  // Local subscriptions — always on, so the UI reflects local data even offline.
  useEffect(() => {
    let active = true
    const subs: Array<{ unsubscribe: () => void }> = []
    async function init() {
      const db = await getDatabase()
      if (!active) return
      for (const collection of collections) {
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
  }, [collections])

  useEffect(() => {
    setSyncStatus(offline ? SyncStatus.Offline : SyncStatus.Synced)
  }, [offline])

  // Replication — every collection shares ONE BatchCoordinator so sibling writes
  // (e.g. a new company + a contact referencing it) ride a single atomic
  // pushBatch. Runs only while online; restarts on reconnect to flush offline
  // edits. Conflicts on the primary table surface to the conflict banner.
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
      started = collections.map((collection) =>
        startRowReplication(getDescriptor(collection), rowCollection(db, collection), gqlClient.current, getAccessToken, coordinator),
      )
      if (!active) {
        started.forEach((r) => {
          void r.replication.cancel()
          void r.wsClient.dispose()
        })
        return
      }
      primaryReplication.current = started[0] ?? null
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
  }, [offline, collections, descriptor])

  // Active target ids per primary row, per MultiReference field, derived from the
  // join rows (the m2m relation lives in the join table, not as a column).
  const records = useMemo(() => {
    const primary = data[descriptor.collection] ?? []
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
  }, [data, descriptor])

  const referenceOptions = useMemo(() => {
    const opts: Record<string, ReferenceOption[]> = {}
    for (const f of referenceFields(descriptor)) {
      const ref = f.references!
      opts[f.name] = (data[ref.collection] ?? []).map((row) => ({
        value: String(row.id),
        label: String(row[ref.titleField] ?? ''),
      }))
    }
    for (const f of multiReferenceFields(descriptor)) {
      const via = f.via!
      opts[f.name] = (data[via.targetCollection] ?? []).map((row) => ({
        value: String(row.id),
        label: String(row[via.titleField] ?? ''),
      }))
    }
    return opts
  }, [data, descriptor])

  const referenceLabels = useMemo(() => {
    const labels: Record<string, Record<string, string>> = {}
    for (const [field, options] of Object.entries(referenceOptions)) {
      labels[field] = Object.fromEntries(options.map((o) => [o.value, o.label]))
    }
    return labels
  }, [referenceOptions])

  const quickAddTargets = useMemo<QuickAddTarget[]>(() => {
    return quickAddTargetsOf(descriptor).map((t) => ({
      collection: t.collection,
      label: t.label,
      rows: (data[t.collection] ?? []).map((row) => ({ id: String(row.id), label: String(row[t.titleField] ?? '') })),
    }))
  }, [data, descriptor])

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
    await rowCollection(db, descriptor.collection).insert({
      ...coerceWritable(descriptor, draft),
      id,
      version: 0,
      updatedAt: now(),
      _deleted: false,
    })
    await reconcileMultiRefs(id, draft)
    return id
  }

  async function update(id: string, draft: Record<string, unknown>): Promise<void> {
    const db = await getDatabase()
    const doc = await rowCollection(db, descriptor.collection).findOne(id).exec()
    if (doc) await doc.patch(coerceWritable(descriptor, draft))
    await reconcileMultiRefs(id, draft)
  }

  async function remove(id: string): Promise<void> {
    const db = await getDatabase()
    const doc = await rowCollection(db, descriptor.collection).findOne(id).exec()
    if (doc) await doc.remove()
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

  async function loadRevisions(rowId: string): Promise<ContactRevisionDto[]> {
    if (!descriptor.revisioned) return []
    const d = await gqlClient.current.request<{ rowRevisions: ContactRevisionDto[] }>(REVISIONS_QUERY, {
      table: descriptor.table,
      rowId,
    })
    return d.rowRevisions
  }

  return {
    records,
    referenceOptions,
    referenceLabels,
    quickAddTargets,
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
