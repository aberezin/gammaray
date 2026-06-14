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
  const gqlClient = useRef(makeGqlClient(accessToken))

  // Load + replicate the contact collection (pull-only for the Read increment).
  useEffect(() => {
    let active = true
    let sub: { unsubscribe: () => void } | undefined
    let replication: ReturnType<typeof startContactReplication> | undefined

    async function init() {
      const db = await getDatabase()
      if (!active) return
      replication = startContactReplication(db.contact, gqlClient.current)
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

  // Fetch the selected record's version history.
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
  }, [selectedId])

  const selected = records.find((r) => r.id === selectedId) ?? null

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Contacts</h1>
        <Link href="/" style={{ fontSize: 13, color: '#3b82f6' }}>← Notes</Link>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        <div>
          <RecordList
            descriptor={contactDescriptor}
            records={records}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        <div>
          {selected ? (
            <>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>Record</h2>
              <RecordForm descriptor={contactDescriptor} record={selected} readOnly />

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
