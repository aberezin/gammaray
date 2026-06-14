'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RecordList, RecordForm } from '@gammaray/ui'
import { contactDescriptor, type RowRecord, type ContactRevisionDto } from '@gammaray/core'
import { getDatabase } from '@/lib/rxdb'
import { startContactReplication } from '@/lib/contacts-sync'
import { makeGqlClient } from '@/lib/graphql-client'

interface Props {
  accessToken: string
}

const REVISIONS_QUERY = `
  query ContactRevisions($contactId: String!) {
    contactRevisions(contactId: $contactId) {
      id version clientId conflictStatus createdAt data
    }
  }
`

export function ContactsPageClient({ accessToken }: Props) {
  const [records, setRecords] = useState<RowRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<ContactRevisionDto[]>([])
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({})
  const gqlClient = useRef(makeGqlClient(accessToken))
  const clientId = useRef<string>(crypto.randomUUID())

  // Load + replicate the contact collection (pull-only for the Read increment).
  useEffect(() => {
    let active = true
    let sub: { unsubscribe: () => void } | undefined
    let replication: ReturnType<typeof startContactReplication> | undefined

    async function init() {
      const db = await getDatabase()
      if (!active) return
      replication = startContactReplication(db.contact, gqlClient.current, clientId.current)
      sub = db.contact.find().$.subscribe((docs) => {
        setRecords(docs.map((d) => d.toJSON() as RowRecord))
      })
    }

    void init()
    return () => {
      active = false
      sub?.unsubscribe()
      if (replication) void replication.cancel()
    }
  }, [])

  const selected = records.find((r) => r.id === selectedId) ?? null
  const selectedVersion = selected ? Number(selected.version ?? 0) : null

  // Fetch the selected record's version history. Re-fetches when its version
  // changes (e.g. after an edit reconciles) so history stays current.
  useEffect(() => {
    if (!selectedId) {
      setRevisions([])
      return
    }
    let active = true
    gqlClient.current
      .request<{ contactRevisions: ContactRevisionDto[] }>(REVISIONS_QUERY, { contactId: selectedId })
      .then((d) => {
        if (active) setRevisions(d.contactRevisions)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      active = false
    }
  }, [selectedId, selectedVersion])

  function startCreate() {
    setSelectedId(null)
    setEditing(false)
    setDraft({})
    setCreating(true)
  }

  function select(id: string) {
    setCreating(false)
    setEditing(false)
    setSelectedId(id)
  }

  function startEdit() {
    if (!selected) return
    setEditDraft({ ...selected })
    setEditing(true)
  }

  // Patch the local row; replication pushes it with the row's expectedVersion.
  // The server fast-forwards (no conflict in this path) and the version bumps.
  async function handleSaveEdit() {
    const db = await getDatabase()
    const doc = await db.contact.findOne(selectedId ?? '').exec()
    if (doc) {
      await doc.patch({
        firstName: String(editDraft.firstName ?? ''),
        lastName: String(editDraft.lastName ?? ''),
        email: String(editDraft.email ?? ''),
        phone: String(editDraft.phone ?? ''),
      })
    }
    setEditing(false)
  }

  // Mint the client-side UUID and insert locally; replication pushes it to the
  // server (offline-first create). The new row then appears via the live query.
  async function handleSave() {
    const id = crypto.randomUUID()
    const db = await getDatabase()
    await db.contact.insert({
      id,
      firstName: String(draft.firstName ?? ''),
      lastName: String(draft.lastName ?? ''),
      email: String(draft.email ?? ''),
      phone: String(draft.phone ?? ''),
      version: 0,
      updatedAt: new Date().toISOString(),
      _deleted: false,
    })
    setCreating(false)
    setDraft({})
    setSelectedId(id)
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Contacts</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={startCreate}
            style={{ fontSize: 13, padding: '6px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
          >
            New contact
          </button>
          <Link href="/" style={{ fontSize: 13, color: '#3b82f6' }}>← Notes</Link>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        <div>
          <RecordList
            descriptor={contactDescriptor}
            records={records}
            selectedId={selectedId}
            onSelect={select}
          />
        </div>

        <div>
          {creating ? (
            <>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>New contact</h2>
              <RecordForm
                descriptor={contactDescriptor}
                record={draft}
                readOnly={false}
                onChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button
                  onClick={() => void handleSave()}
                  style={{ fontSize: 13, padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
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
            </>
          ) : selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
                <h2 style={{ margin: 0, fontSize: 15, color: '#374151' }}>Record</h2>
                {!editing && (
                  <button
                    onClick={startEdit}
                    style={{ fontSize: 13, padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                  >
                    Edit
                  </button>
                )}
              </div>

              {editing ? (
                <>
                  <RecordForm
                    descriptor={contactDescriptor}
                    record={editDraft}
                    readOnly={false}
                    onChange={(field, value) => setEditDraft((d) => ({ ...d, [field]: value }))}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => void handleSaveEdit()}
                      style={{ fontSize: 13, padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 500 }}
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(false)}
                      style={{ fontSize: 13, padding: '6px 14px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <RecordForm descriptor={contactDescriptor} record={selected} readOnly />
              )}

              <h2 style={{ margin: '20px 0 12px', fontSize: 15, color: '#374151' }}>Version history</h2>
              {revisions.length === 0 ? (
                <p style={{ color: '#9ca3af', fontSize: 13 }}>No history yet.</p>
              ) : (
                <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {revisions.map((rev) => (
                    <li key={rev.id} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
                        <span>v{rev.version}</span>
                        <span style={{ color: '#6b7280' }}>{rev.conflictStatus}</span>
                      </div>
                      <div style={{ color: '#6b7280', fontSize: 12 }}>
                        {new Date(rev.createdAt).toLocaleString()} · client {rev.clientId}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Select a record to view its fields and history.</p>
          )}
        </div>
      </div>
    </div>
  )
}
