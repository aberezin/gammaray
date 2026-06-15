'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RecordList, RecordForm, RecordConflictBanner, OfflineToggle } from '@gammaray/ui'
import { contactDescriptor, type RowRecord, type ContactRevisionDto } from '@gammaray/core'
import { getDatabase } from '@/lib/rxdb'
import { startContactReplication, resolveContact } from '@/lib/contacts-sync'
import { makeGqlClient } from '@/lib/graphql-client'

interface ContactConflict {
  contactId: string
  mine: Record<string, unknown>
  theirs: Record<string, unknown>
}

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
  const [conflict, setConflict] = useState<ContactConflict | null>(null)
  const [offline, setOffline] = useState(false)
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const gqlClient = useRef(makeGqlClient(accessToken))
  const clientId = useRef<string>(crypto.randomUUID())
  const replicationRef = useRef<ReturnType<typeof startContactReplication> | null>(null)

  // Load companies for the reference picker (read-only lookup data).
  useEffect(() => {
    let active = true
    gqlClient.current
      .request<{ companies: Array<{ id: string; name: string }> }>('query { companies { id name } }')
      .then((d) => {
        if (active) setCompanies(d.companies)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      active = false
    }
  }, [])

  // Local subscription — always on, so the list reflects local data even offline.
  useEffect(() => {
    let active = true
    let sub: { unsubscribe: () => void } | undefined
    async function init() {
      const db = await getDatabase()
      if (!active) return
      sub = db.contact.find().$.subscribe((docs) => {
        setRecords(docs.map((d) => d.toJSON() as RowRecord))
      })
    }
    void init()
    return () => {
      active = false
      sub?.unsubscribe()
    }
  }, [])

  // Replication (pull + push + live WS stream) — runs only while online, and
  // restarts on offline→online so edits made offline push (and can conflict).
  useEffect(() => {
    if (offline) return
    let active = true
    let started: ReturnType<typeof startContactReplication> | undefined

    async function init() {
      const db = await getDatabase()
      if (!active) return
      started = startContactReplication(
        db.contact,
        gqlClient.current,
        accessToken,
        clientId.current,
        ({ contactId, serverData, clientData }) =>
          setConflict({ contactId, mine: clientData, theirs: serverData }),
      )
      if (!active) {
        void started.replication.cancel()
        void started.wsClient.dispose()
        return
      }
      replicationRef.current = started
    }

    void init()
    return () => {
      active = false
      if (started) {
        void started.replication.cancel()
        void started.wsClient.dispose()
      }
      replicationRef.current = null
    }
  }, [offline])

  const selected = records.find((r) => r.id === selectedId) ?? null
  const selectedVersion = selected ? Number(selected.version ?? 0) : null

  // Reference field maps for the company picker (options) and the list (labels).
  const referenceOptions = {
    companyId: companies.map((c) => ({ value: c.id, label: c.name })),
  }
  const referenceLabels = {
    companyId: Object.fromEntries(companies.map((c) => [c.id, c.name])),
  }

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
        companyId: editDraft.companyId ? String(editDraft.companyId) : null,
      })
    }
    setEditing(false)
  }

  // Soft-delete via RxDB (sets _deleted); replication pushes the tombstone.
  async function handleDelete() {
    if (!selectedId) return
    const db = await getDatabase()
    const doc = await db.contact.findOne(selectedId).exec()
    if (doc) await doc.remove()
    setEditing(false)
    setSelectedId(null)
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
      companyId: draft.companyId ? String(draft.companyId) : null,
      version: 0,
      updatedAt: new Date().toISOString(),
      _deleted: false,
    })
    setCreating(false)
    setDraft({})
    setSelectedId(id)
  }

  // Resolve a conflict by writing the chosen row, then re-sync so the local
  // store reflects the resolved server state.
  async function resolveWith(row: Record<string, unknown>) {
    if (!conflict) return
    const input = {
      id: conflict.contactId,
      firstName: String(row.firstName ?? ''),
      lastName: String(row.lastName ?? ''),
      email: String(row.email ?? ''),
      phone: String(row.phone ?? ''),
      // The chosen side may be a deletion (accept) or not (resurrect).
      deleted: row.deleted === true,
    }
    await resolveContact(gqlClient.current, input, clientId.current)
    setConflict(null)
    replicationRef.current?.replication.reSync()
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
          <OfflineToggle offline={offline} onToggle={setOffline} />
          <Link href="/" style={{ fontSize: 13, color: '#3b82f6' }}>← Notes</Link>
        </div>
      </header>

      {conflict && (
        <RecordConflictBanner
          descriptor={contactDescriptor}
          mine={conflict.mine}
          theirs={conflict.theirs}
          onKeepMine={() => void resolveWith(conflict.mine)}
          onKeepTheirs={() => void resolveWith(conflict.theirs)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        <div>
          <RecordList
            descriptor={contactDescriptor}
            records={records}
            selectedId={selectedId}
            onSelect={select}
            references={referenceLabels}
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
                references={referenceOptions}
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
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={startEdit}
                      style={{ fontSize: 13, padding: '4px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete()}
                      style={{ fontSize: 13, padding: '4px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {editing ? (
                <>
                  <RecordForm
                    descriptor={contactDescriptor}
                    record={editDraft}
                    readOnly={false}
                    onChange={(field, value) => setEditDraft((d) => ({ ...d, [field]: value }))}
                    references={referenceOptions}
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
                <RecordForm descriptor={contactDescriptor} record={selected} readOnly references={referenceOptions} />
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
