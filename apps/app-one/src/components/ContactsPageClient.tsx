'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { RecordList, RecordForm, RecordConflictBanner, OfflineToggle, SyncIndicator } from '@gammaray/ui'
import {
  SyncStatus,
  contactDescriptor,
  companyDescriptor,
  tagDescriptor,
  contactTagDescriptor,
  type RowRecord,
  type ContactRevisionDto,
} from '@gammaray/core'
import { getDatabase } from '@/lib/rxdb'
import { ResetLocalButton } from '@/components/ResetLocalButton'
import { startRowReplication, BatchCoordinator } from '@/lib/batch-sync'
import { makeGqlClient } from '@/lib/graphql-client'
import { getAccessToken, primeToken } from '@/lib/token'
import { useSyncHealth } from '@/store/sync-health.store'

interface ContactConflict {
  contactId: string
  mine: Record<string, unknown>
  theirs: Record<string, unknown>
}

interface Props {
  accessToken: string
}

// Version history via the generic engine (rowRevisions returns JSON rows).
const REVISIONS_QUERY = `
  query RowRevisions($table: String!, $rowId: String!) {
    rowRevisions(table: $table, rowId: $rowId)
  }
`

// Resolve a detected conflict with the chosen row, via the generic engine.
const RESOLVE_CONFLICT = `
  mutation ResolveRowConflict($table: String!, $row: JSON!, $clientId: String!) {
    resolveRowConflict(table: $table, row: $row, clientId: $clientId)
  }
`

export function ContactsPageClient({ accessToken }: Props) {
  primeToken(accessToken)
  // When sync health is suspect, the local store is untrusted → read-only.
  const suspect = useSyncHealth((s) => s.status === 'suspect')
  const [records, setRecords] = useState<RowRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<ContactRevisionDto[]>([])
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({})
  const [conflict, setConflict] = useState<ContactConflict | null>(null)
  const [offline, setOffline] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(SyncStatus.Synced)
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [newCompany, setNewCompany] = useState('')
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([])
  const [links, setLinks] = useState<RowRecord[]>([])
  const [newTag, setNewTag] = useState('')
  const gqlClient = useRef(makeGqlClient())
  const clientId = useRef<string>(crypto.randomUUID())
  const replicationRef = useRef<ReturnType<typeof startRowReplication> | null>(null)

  // Local subscriptions — always on, so the UI reflects local data even offline.
  useEffect(() => {
    let active = true
    const subs: Array<{ unsubscribe: () => void }> = []
    async function init() {
      const db = await getDatabase()
      if (!active) return
      subs.push(
        db.contact.find().$.subscribe((docs) => setRecords(docs.map((d) => d.toJSON() as RowRecord))),
      )
      subs.push(
        db.company.find().$.subscribe((docs) =>
          setCompanies(docs.map((d) => ({ id: String(d.get('id')), name: String(d.get('name') ?? '') }))),
        ),
      )
      subs.push(
        db.tag.find().$.subscribe((docs) =>
          setTags(docs.map((d) => ({ id: String(d.get('id')), name: String(d.get('name') ?? '') }))),
        ),
      )
      subs.push(
        db.contact_tag.find().$.subscribe((docs) => setLinks(docs.map((d) => d.toJSON() as RowRecord))),
      )
    }
    void init()
    return () => {
      active = false
      subs.forEach((s) => s.unsubscribe())
    }
  }, [])

  // Update sync status based on offline state
  useEffect(() => {
    setSyncStatus(offline ? SyncStatus.Offline : SyncStatus.Synced)
  }, [offline])

  // Replication — contact + company share one BatchCoordinator so their pushes
  // ride a single atomic pushBatch (offline parent+child sync together). Runs
  // only while online; restarts on reconnect to flush offline edits.
  useEffect(() => {
    if (offline) return
    let active = true
    let started: Array<ReturnType<typeof startRowReplication>> = []

    async function init() {
      const db = await getDatabase()
      if (!active) return
      const coordinator = new BatchCoordinator(gqlClient.current, clientId.current, (c) => {
        if (c.table === 'contact') {
          setConflict({ contactId: c.id, mine: c.clientData, theirs: c.serverData })
        }
      })
      const contactRep = startRowReplication(contactDescriptor, db.contact, gqlClient.current, getAccessToken, coordinator)
      const companyRep = startRowReplication(companyDescriptor, db.company, gqlClient.current, getAccessToken, coordinator)
      const tagRep = startRowReplication(tagDescriptor, db.tag, gqlClient.current, getAccessToken, coordinator)
      const linkRep = startRowReplication(contactTagDescriptor, db.contact_tag, gqlClient.current, getAccessToken, coordinator)
      started = [contactRep, companyRep, tagRep, linkRep]
      if (!active) {
        started.forEach((r) => {
          void r.replication.cancel()
          void r.wsClient.dispose()
        })
        return
      }
      replicationRef.current = contactRep
    }

    void init()
    return () => {
      active = false
      started.forEach((r) => {
        void r.replication.cancel()
        void r.wsClient.dispose()
      })
      replicationRef.current = null
    }
  }, [offline])

  const selected = records.find((r) => r.id === selectedId) ?? null
  const selectedVersion = selected ? Number(selected.version ?? 0) : null

  // Reference field maps for pickers (options) and the list (labels), for both
  // the company (many-to-one) and tags (many-to-many) relations.
  const referenceOptions = {
    companyId: companies.map((c) => ({ value: c.id, label: c.name })),
    tagIds: tags.map((t) => ({ value: t.id, label: t.name })),
  }
  const referenceLabels = {
    companyId: Object.fromEntries(companies.map((c) => [c.id, c.name])),
    tagIds: Object.fromEntries(tags.map((t) => [t.id, t.name])),
  }

  // Active tag ids per contact, derived from the join rows (the m2m relation
  // lives in contact_tags, not as a column on contact).
  const tagsByContact = new Map<string, string[]>()
  for (const l of links) {
    const cid = String(l.contactId)
    if (!tagsByContact.has(cid)) tagsByContact.set(cid, [])
    tagsByContact.get(cid)!.push(String(l.tagId))
  }
  // Project the virtual tagIds onto each row for the descriptor-driven UI.
  const displayRecords = records.map((r) => ({ ...r, tagIds: tagsByContact.get(String(r.id)) ?? [] }))
  const selectedWithTags = selected
    ? { ...selected, tagIds: tagsByContact.get(String(selected.id)) ?? [] }
    : null

  // Fetch the selected record's version history. Re-fetches when its version
  // changes (e.g. after an edit reconciles) so history stays current.
  useEffect(() => {
    if (!selectedId) {
      setRevisions([])
      return
    }
    let active = true
    gqlClient.current
      .request<{ rowRevisions: ContactRevisionDto[] }>(REVISIONS_QUERY, { table: 'contact', rowId: selectedId })
      .then((d) => {
        if (active) setRevisions(d.rowRevisions)
      })
      .catch(() => {
        /* ignore */
      })
    return () => {
      active = false
    }
  }, [selectedId, selectedVersion])

  function startCreate() {
    if (suspect) return
    setSelectedId(null)
    setEditing(false)
    setDraft({})
    setCreating(true)
  }

  // Create a company locally (client-minted id). Works offline; the batch
  // coordinator syncs it (and any contact referencing it) on reconnect.
  async function handleAddCompany() {
    if (suspect) return
    const name = newCompany.trim()
    if (!name) return
    const db = await getDatabase()
    await db.company.insert({
      id: crypto.randomUUID(),
      name,
      version: 0,
      updatedAt: new Date().toISOString(),
      _deleted: false,
    })
    setNewCompany('')
  }

  // Create a tag locally (client-minted id). Works offline; syncs via the batch.
  async function handleAddTag() {
    if (suspect) return
    const name = newTag.trim()
    if (!name) return
    const db = await getDatabase()
    await db.tag.insert({
      id: crypto.randomUUID(),
      name,
      version: 0,
      updatedAt: new Date().toISOString(),
      _deleted: false,
    })
    setNewTag('')
  }

  // Reconcile a contact's tags to `desired` by creating/removing join rows. The
  // inserts/removes ride the batch coordinator alongside the contact write, so a
  // brand-new contact + its links sync atomically.
  async function reconcileLinks(contactId: string, desired: string[]) {
    const db = await getDatabase()
    const current = tagsByContact.get(contactId) ?? []
    const toAdd = desired.filter((t) => !current.includes(t))
    const toRemove = current.filter((t) => !desired.includes(t))
    for (const tagId of toAdd) {
      await db.contact_tag.insert({
        id: crypto.randomUUID(),
        contactId,
        tagId,
        version: 0,
        updatedAt: new Date().toISOString(),
        _deleted: false,
      })
    }
    for (const tagId of toRemove) {
      const link = links.find((l) => String(l.contactId) === contactId && String(l.tagId) === tagId)
      if (link) {
        const doc = await db.contact_tag.findOne(String(link.id)).exec()
        if (doc) await doc.remove()
      }
    }
  }

  function select(id: string) {
    setCreating(false)
    setEditing(false)
    setSelectedId(id)
  }

  function startEdit() {
    if (suspect || !selected) return
    setEditDraft({ ...selected, tagIds: tagsByContact.get(String(selected.id)) ?? [] })
    setEditing(true)
  }

  // Patch the local row; replication pushes it with the row's expectedVersion.
  // The server fast-forwards (no conflict in this path) and the version bumps.
  async function handleSaveEdit() {
    if (suspect) return
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
    if (selectedId) {
      await reconcileLinks(selectedId, (editDraft.tagIds as string[] | undefined) ?? [])
    }
    setEditing(false)
  }

  // Soft-delete via RxDB (sets _deleted); replication pushes the tombstone.
  async function handleDelete() {
    if (suspect || !selectedId) return
    const db = await getDatabase()
    const doc = await db.contact.findOne(selectedId).exec()
    if (doc) await doc.remove()
    setEditing(false)
    setSelectedId(null)
  }

  // Mint the client-side UUID and insert locally; replication pushes it to the
  // server (offline-first create). The new row then appears via the live query.
  async function handleSave() {
    if (suspect) return
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
    await reconcileLinks(id, (draft.tagIds as string[] | undefined) ?? [])
    setCreating(false)
    setDraft({})
    setSelectedId(id)
  }

  // Resolve a conflict by writing the chosen row, then re-sync so the local
  // store reflects the resolved server state.
  async function resolveWith(row: Record<string, unknown>) {
    if (!conflict) return
    const chosen = {
      id: conflict.contactId,
      firstName: String(row.firstName ?? ''),
      lastName: String(row.lastName ?? ''),
      email: String(row.email ?? ''),
      phone: String(row.phone ?? ''),
      companyId: row.companyId ? String(row.companyId) : null,
      // The chosen side may be a deletion (accept) or not (resurrect).
      deleted: row.deleted === true,
    }
    await gqlClient.current.request(RESOLVE_CONFLICT, {
      table: 'contact',
      row: chosen,
      clientId: clientId.current,
    })
    setConflict(null)
    replicationRef.current?.replication.reSync()
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Contacts</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddCompany() }}
            placeholder="New company name"
            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
          />
          <button
            onClick={() => void handleAddCompany()}
            disabled={suspect || !newCompany.trim()}
            style={{
              fontSize: 13,
              padding: '6px 12px',
              background: newCompany.trim() ? '#8b5cf6' : '#e5e7eb',
              color: newCompany.trim() ? '#fff' : '#9ca3af',
              border: 'none',
              borderRadius: 6,
              cursor: newCompany.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 500,
            }}
          >
            Add company
          </button>
          <input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddTag() }}
            placeholder="New tag name"
            style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
          />
          <button
            onClick={() => void handleAddTag()}
            disabled={suspect || !newTag.trim()}
            style={{
              fontSize: 13,
              padding: '6px 12px',
              background: newTag.trim() ? '#8b5cf6' : '#e5e7eb',
              color: newTag.trim() ? '#fff' : '#9ca3af',
              border: 'none',
              borderRadius: 6,
              cursor: newTag.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 500,
            }}
          >
            Add tag
          </button>
          <button
            onClick={startCreate}
            disabled={suspect}
            style={{ fontSize: 13, padding: '6px 12px', background: suspect ? '#e5e7eb' : '#3b82f6', color: suspect ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer', fontWeight: 500 }}
          >
            New contact
          </button>
          <OfflineToggle offline={offline} onToggle={setOffline} />
          <SyncIndicator status={syncStatus} />
          <ResetLocalButton />
          <Link href="/categories" style={{ fontSize: 13, color: '#3b82f6' }}>Categories →</Link>
          <Link href="/" style={{ fontSize: 13, color: '#3b82f6' }}>← Notes</Link>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500 }}>Companies:</span>
        {companies.length === 0 ? (
          <span style={{ fontSize: 12, color: '#9ca3af' }}>none yet — add one above</span>
        ) : (
          companies.map((c) => (
            <span
              key={c.id}
              style={{ fontSize: 12, color: '#5b21b6', background: '#ede9fe', padding: '2px 8px', borderRadius: 999 }}
            >
              {c.name}
            </span>
          ))
        )}
      </div>

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
        {/* minWidth:0 lets the 1fr track shrink below the table's intrinsic
            width (grid items default to min-width:auto); overflowX scrolls a wide
            table inside the column instead of overflowing the whole page. */}
        <div style={{ minWidth: 0, overflowX: 'auto' }}>
          <RecordList
            descriptor={contactDescriptor}
            records={displayRecords}
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
            </>
          ) : selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
                <h2 style={{ margin: 0, fontSize: 15, color: '#374151' }}>Record</h2>
                {!editing && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={startEdit}
                      disabled={suspect}
                      style={{ fontSize: 13, padding: '4px 12px', background: suspect ? '#e5e7eb' : '#3b82f6', color: suspect ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => void handleDelete()}
                      disabled={suspect}
                      style={{ fontSize: 13, padding: '4px 12px', background: suspect ? '#e5e7eb' : '#ef4444', color: suspect ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer' }}
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
                      disabled={suspect}
                      style={{ fontSize: 13, padding: '6px 14px', background: suspect ? '#e5e7eb' : '#10b981', color: suspect ? '#9ca3af' : '#fff', border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer', fontWeight: 500 }}
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
                <RecordForm descriptor={contactDescriptor} record={selectedWithTags ?? {}} readOnly references={referenceOptions} />
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
