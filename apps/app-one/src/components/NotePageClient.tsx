'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { NoteEditor, RevisionList, ConflictBanner, OfflineToggle, SyncIndicator } from '@gammaray/ui'
import { SyncStatus } from '@gammaray/core'
import { useNoteStore } from '@/store/note.store'
import { makeGqlClient } from '@/lib/graphql-client'
import { startReplication, resolveConflict } from '@/lib/sync'
import { getDatabase } from '@/lib/rxdb'
import type { RevisionDto } from '@gammaray/core'

interface Props {
  accessToken: string
}

export function NotePageClient({ accessToken }: Props) {
  const { syncStatus, conflict, offline, setSyncStatus, setConflict, setOffline } = useNoteStore()
  const [content, setContent] = useState('')
  const [revisions, setRevisions] = useState<RevisionDto[]>([])
  const replicationRef = useRef<ReturnType<typeof startReplication> | null>(null)
  const clientId = useRef<string>(
    typeof sessionStorage !== 'undefined'
      ? (sessionStorage.getItem('clientId') ?? (() => {
          const id = crypto.randomUUID()
          sessionStorage.setItem('clientId', id)
          return id
        })())
      : crypto.randomUUID(),
  )
  const gqlClient = useRef(makeGqlClient(accessToken))

  const fetchRevisions = useCallback(async () => {
    try {
      const data = await gqlClient.current.request<{ revisions: RevisionDto[] }>(`
        query { revisions { id noteId content version clientId conflictStatus resolvedContent createdAt } }
      `)
      setRevisions(data.revisions)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    let cleanup: (() => void) | undefined

    async function init() {
      const db = await getDatabase()
      const collection = db.note

      // Reactively bind local doc to textarea
      const sub = collection.find().$.subscribe((docs) => {
        if (docs[0]) setContent(docs[0].content)
      })

      const { replication, wsClient } = startReplication(
        collection,
        gqlClient.current,
        accessToken,
        clientId.current,
        ({ serverContent, serverVersion, noteId }) => {
          const docs = collection.find().exec()
          void docs.then((d) => {
            setConflict({
              noteId,
              serverContent,
              serverVersion,
              clientContent: d[0]?.content ?? '',
            })
          })
        },
      )

      replicationRef.current = { replication, wsClient }

      replication.active$.subscribe((active) => {
        if (!offline) setSyncStatus(active ? SyncStatus.Syncing : SyncStatus.Synced)
      })

      await fetchRevisions()

      cleanup = () => {
        sub.unsubscribe()
        void replication.cancel()
        void wsClient.dispose()
      }
    }

    void init()
    return () => cleanup?.()
  }, [accessToken, fetchRevisions, offline, setConflict, setSyncStatus])

  // Pause/resume replication when offline toggle changes
  useEffect(() => {
    if (!replicationRef.current) return
    const { replication } = replicationRef.current
    if (offline) {
      void replication.cancel()
    } else {
      void replication.reSync()
    }
  }, [offline])

  async function handleChange(value: string) {
    setContent(value)
    const db = await getDatabase()
    const existing = await db.note.findOne().exec()
    if (existing) {
      await existing.patch({ content: value })
    }
  }

  async function handleKeepMine() {
    if (!conflict) return
    const resolved = await resolveConflict(
      gqlClient.current,
      conflict.noteId,
      conflict.clientContent,
      clientId.current,
    )
    setConflict(null)
    setContent(resolved.content)
    await fetchRevisions()
  }

  async function handleKeepTheirs() {
    if (!conflict) return
    const resolved = await resolveConflict(
      gqlClient.current,
      conflict.noteId,
      conflict.serverContent,
      clientId.current,
    )
    setConflict(null)
    setContent(resolved.content)
    const db = await getDatabase()
    const doc = await db.note.findOne().exec()
    await doc?.patch({ content: resolved.content, version: resolved.version })
    await fetchRevisions()
  }

  async function handleMerge(merged: string) {
    if (!conflict) return
    const resolved = await resolveConflict(
      gqlClient.current,
      conflict.noteId,
      merged,
      clientId.current,
    )
    setConflict(null)
    setContent(resolved.content)
    const db = await getDatabase()
    const doc = await db.note.findOne().exec()
    await doc?.patch({ content: resolved.content, version: resolved.version })
    await fetchRevisions()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>NoteSync</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <OfflineToggle offline={offline} onToggle={setOffline} />
          <SyncIndicator status={syncStatus} />
          <button
            onClick={() => signOut()}
            style={{ fontSize: 12, color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </header>

      {conflict && (
        <ConflictBanner
          serverContent={conflict.serverContent}
          clientContent={conflict.clientContent}
          onKeepMine={handleKeepMine}
          onKeepTheirs={handleKeepTheirs}
          onMerge={handleMerge}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24 }}>
        <div>
          <NoteEditor
            content={content}
            onChange={handleChange}
            syncStatus={syncStatus}
          />
        </div>
        <div>
          <h2 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>Version history</h2>
          <RevisionList
            revisions={revisions}
            onRestore={(c) => handleMerge(c)}
          />
        </div>
      </div>
    </div>
  )
}
