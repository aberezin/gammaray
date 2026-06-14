'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from 'next-auth/react'
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
  // Buffer edits that arrive before the initial pull populates RxDB
  const pendingContentRef = useRef<string | null>(null)
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

  // Effect 1: Local subscription — always active (even while offline).
  // Applies buffered edits once the note first arrives from the server.
  useEffect(() => {
    let active = true
    let sub: { unsubscribe: () => void } | undefined

    async function initLocal() {
      const db = await getDatabase()
      if (!active) return

      sub = db.note.find().$.subscribe((docs) => {
        const doc = docs[0]
        if (!doc) return
        const pending = pendingContentRef.current
        if (pending !== null) {
          pendingContentRef.current = null
          void doc.patch({ content: pending }).then(() => setContent(pending))
        } else {
          setContent(doc.content)
        }
      })
    }

    void initLocal()
    return () => {
      active = false
      sub?.unsubscribe()
    }
  }, [])

  // Effect 2: Replication — only runs when online. Re-runs (restart) on
  // offline→online transition, and is cleaned up on online→offline.
  useEffect(() => {
    if (offline) return

    let active = true
    let replication: ReturnType<typeof startReplication>['replication'] | undefined
    let wsClient: ReturnType<typeof startReplication>['wsClient'] | undefined

    async function initReplication() {
      const db = await getDatabase()
      if (!active) return
      const collection = db.note

      const started = startReplication(
        collection,
        gqlClient.current,
        accessToken,
        clientId.current,
        ({ serverContent, serverVersion, noteId, clientContent }) => {
          setConflict({ noteId, serverContent, serverVersion, clientContent })
        },
        () => { void fetchRevisions() },
      )

      if (!active) {
        void started.replication.cancel()
        void started.wsClient.dispose()
        return
      }

      replication = started.replication
      wsClient = started.wsClient
      replicationRef.current = started

      replication.active$.subscribe((isActive) => {
        setSyncStatus(isActive ? SyncStatus.Syncing : SyncStatus.Synced)
      })

      await fetchRevisions()
    }

    void initReplication()
    return () => {
      active = false
      if (replication) void replication.cancel()
      if (wsClient) void wsClient.dispose()
      replicationRef.current = null
    }
  }, [offline, accessToken, fetchRevisions, setConflict, setSyncStatus])

  async function handleChange(value: string) {
    setContent(value)
    const db = await getDatabase()
    const existing = await db.note.findOne().exec()
    if (existing) {
      await existing.patch({ content: value })
    } else {
      // Initial pull hasn't completed yet; buffer the edit.
      // Effect 1's subscription applies it once the note arrives from the server.
      pendingContentRef.current = value
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
    await fetchRevisions()
  }

  async function handleRestore(content: string) {
    setContent(content)
    const db = await getDatabase()
    const doc = await db.note.findOne().exec()
    if (doc) await doc.patch({ content })
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
            onRestore={handleRestore}
          />
        </div>
      </div>
    </div>
  )
}
