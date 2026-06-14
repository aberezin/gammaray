'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
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

// How long the editor waits after the last keystroke before writing to RxDB.
// Collapses a burst of typing into a single versioned write.
const FLUSH_DEBOUNCE_MS = 400

export function NotePageClient({ accessToken }: Props) {
  const { syncStatus, conflict, offline, setSyncStatus, setConflict, setOffline } = useNoteStore()
  const [content, setContent] = useState('')
  const [revisions, setRevisions] = useState<RevisionDto[]>([])
  const replicationRef = useRef<ReturnType<typeof startReplication> | null>(null)
  // Holds the latest unsynced local edit (null when the editor is in sync with
  // RxDB). Also buffers edits that arrive before the initial pull populates RxDB.
  const pendingContentRef = useRef<string | null>(null)
  // Debounce timer so a burst of keystrokes collapses into a single versioned
  // write, instead of one push per character racing the version baseline.
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Last note version the editor has seen; used to refresh the revision list
  // whenever a new accepted version arrives — including remote edits pushed live
  // from another tab (which would otherwise never refresh this tab's history).
  const lastVersionRef = useRef<number | null>(null)
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

  // Persist the latest pending edit to RxDB as a single write. This is the ONLY
  // path that writes the note; keeping it the sole writer prevents two edits
  // racing the same version baseline (which produced false self-conflicts).
  // Replication picks the write up and pushes once. Driven by a debounce timer.
  const flushEdit = useCallback(async () => {
    const value = pendingContentRef.current
    if (value === null) return
    const db = await getDatabase()
    const existing = await db.note.findOne().exec()
    if (!existing) {
      // Note not created by the initial pull yet — retry shortly so the buffered
      // edit isn't lost. (Avoids a second writer in Effect 1.)
      flushTimer.current = setTimeout(() => { void flushEdit() }, FLUSH_DEBOUNCE_MS)
      return
    }
    await existing.patch({ content: value })
    // Mark clean only if no newer keystroke arrived during the await.
    if (pendingContentRef.current === value) pendingContentRef.current = null
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
        // A new accepted version (local push reconciled, or a remote edit pushed
        // live from another tab) means the history changed — refresh it. This is
        // what keeps a passive tab's version list in sync, not just its editor.
        if (lastVersionRef.current !== null && doc.version !== lastVersionRef.current) {
          void fetchRevisions()
        }
        lastVersionRef.current = doc.version
        // While the user has an unsynced local edit, don't overwrite the editor
        // with the store's value — that would clobber in-progress typing. The
        // debounce timer (flushEdit) is the single writer that persists it.
        if (pendingContentRef.current !== null) return
        setContent(doc.content)
      })
    }

    void initLocal()
    return () => {
      active = false
      sub?.unsubscribe()
    }
  }, [fetchRevisions])

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

  // Flush any pending edit on unmount so the last keystrokes aren't lost.
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current)
      void flushEdit()
    }
  }, [flushEdit])

  function handleChange(value: string) {
    // Reflect the keystroke immediately for a responsive editor.
    setContent(value)
    // Record as the latest unsynced edit and debounce the actual RxDB write so a
    // burst of typing becomes one versioned write rather than one push per key.
    pendingContentRef.current = value
    if (flushTimer.current) clearTimeout(flushTimer.current)
    flushTimer.current = setTimeout(() => { void flushEdit() }, FLUSH_DEBOUNCE_MS)
  }

  // Toggling connectivity must not strand a debounced edit: flush it now so the
  // pending write is queued before replication starts/stops. Without this, an
  // edit made just before going online could be lost on the transition.
  function handleToggleOffline(value: boolean) {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current)
      flushTimer.current = null
    }
    void flushEdit()
    setOffline(value)
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
          <Link href="/contacts" style={{ fontSize: 13, color: '#3b82f6' }}>Contacts →</Link>
          <OfflineToggle offline={offline} onToggle={handleToggleOffline} />
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
