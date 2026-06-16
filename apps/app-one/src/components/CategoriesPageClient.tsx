'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RecordList, RecordForm, OfflineToggle, SyncIndicator } from '@gammaray/ui'
import { categoryDescriptor, SyncStatus, type RowRecord } from '@gammaray/core'
import { getDatabase } from '@/lib/rxdb'
import { startRowReplication, BatchCoordinator } from '@/lib/batch-sync'
import { makeGqlClient } from '@/lib/graphql-client'
import { getAccessToken, primeToken } from '@/lib/token'
import { useSyncHealth } from '@/store/sync-health.store'

interface Props {
  accessToken: string
}

// A self-referential tree: a category's "Parent" is another category. Create and
// reference flow through the batch coordinator, so a parent and child created
// offline sync together (validated against DB ∪ batch).
export function CategoriesPageClient({ accessToken }: Props) {
  primeToken(accessToken)
  const suspect = useSyncHealth((s) => s.status === 'suspect')
  const [records, setRecords] = useState<RowRecord[]>([])
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [offline, setOffline] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncStatus.Synced)
  const gqlClient = useRef(makeGqlClient())
  const clientId = useRef<string>(crypto.randomUUID())

  // Local subscription — always on (works offline).
  useEffect(() => {
    let active = true
    let sub: { unsubscribe: () => void } | undefined
    async function init() {
      const db = await getDatabase()
      if (!active) return
      sub = db.category.find().$.subscribe((docs) => setRecords(docs.map((d) => d.toJSON() as RowRecord)))
    }
    void init()
    return () => {
      active = false
      sub?.unsubscribe()
    }
  }, [])

  // Update sync status based on offline state
  useEffect(() => {
    setSyncStatus(offline ? SyncStatus.Offline : SyncStatus.Synced)
  }, [offline])

  // Replication via the batch coordinator (only while online; restart on reconnect).
  useEffect(() => {
    if (offline) return
    let active = true
    let started: ReturnType<typeof startRowReplication> | undefined
    async function init() {
      const db = await getDatabase()
      if (!active) return
      const coordinator = new BatchCoordinator(gqlClient.current, clientId.current)
      started = startRowReplication(categoryDescriptor, db.category, gqlClient.current, getAccessToken, coordinator)
      if (!active) {
        void started.replication.cancel()
        void started.wsClient.dispose()
      }
    }
    void init()
    return () => {
      active = false
      if (started) {
        void started.replication.cancel()
        void started.wsClient.dispose()
      }
    }
  }, [offline])

  // Self-reference: the parent options/labels are the categories themselves.
  const referenceOptions = { parentId: records.map((r) => ({ value: String(r.id), label: String(r.name ?? '') })) }
  const referenceLabels = { parentId: Object.fromEntries(records.map((r) => [String(r.id), String(r.name ?? '')])) }

  async function handleSave() {
    if (suspect) return
    const id = crypto.randomUUID()
    const db = await getDatabase()
    await db.category.insert({
      id,
      name: String(draft.name ?? ''),
      parentId: draft.parentId ? String(draft.parentId) : null,
      version: 0,
      updatedAt: new Date().toISOString(),
      _deleted: false,
    })
    setCreating(false)
    setDraft({})
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Categories</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => { if (suspect) return; setDraft({}); setCreating(true) }}
            disabled={suspect}
            style={{ fontSize: 13, padding: '6px 12px', background: suspect ? '#e5e7eb' : '#3b82f6', color: suspect ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer', fontWeight: 500 }}
          >
            New category
          </button>
          <OfflineToggle offline={offline} onToggle={setOffline} />
          <SyncIndicator status={syncStatus} />
          <Link href="/contacts" style={{ fontSize: 13, color: '#3b82f6' }}>Contacts →</Link>
        </div>
      </header>

      {creating && (
        <div style={{ marginBottom: 16, padding: 16, border: '1px solid #e5e7eb', borderRadius: 8 }}>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>New category</h2>
          <RecordForm
            descriptor={categoryDescriptor}
            record={draft}
            readOnly={false}
            onChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
            references={referenceOptions}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => void handleSave()}
              disabled={suspect}
              style={{ fontSize: 13, padding: '6px 14px', background: suspect ? '#e5e7eb' : '#10b981', color: suspect ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer', fontWeight: 500 }}
            >
              Save
            </button>
            <button
              onClick={() => { setCreating(false); setDraft({}) }}
              style={{ fontSize: 13, padding: '6px 14px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <RecordList descriptor={categoryDescriptor} records={records} references={referenceLabels} />
    </div>
  )
}
