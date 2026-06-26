'use client'

import React, { useState } from 'react'
import { signOut } from 'next-auth/react'
import { useSyncHealth } from '@/store/sync-health.store'
import { clearLocalDatabase } from '@/lib/rxdb'

// A prominent, app-wide banner shown whenever sync health is "suspect". Once
// suspect, the local UI state and the local RxDB replica are NOT trusted — the
// pages drop to read-only and the only ways forward are recovery actions here.
export function SyncHealthBanner() {
  const status = useSyncHealth((s) => s.status)
  const error = useSyncHealth((s) => s.error)
  const [busy, setBusy] = useState(false)

  if (status === 'ok' || !error) return null

  const isAuth = error.kind === 'auth'

  async function resetLocalData() {
    setBusy(true)
    // TODO(repair): before wiping, run a "repair" process that recovers the
    // client's unsynced local writes — diff the local RxDB replica against the
    // server (per-table, per-row by version), export rows that exist only
    // locally or are ahead of the server into a recovery bundle, and offer to
    // re-apply them after the rebuild. Today Reset is destructive: any
    // local-only write that never synced is lost. See docs/adr/0008.
    await clearLocalDatabase()
    window.location.reload()
  }

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        background: isAuth ? '#fef3c7' : '#fee2e2',
        borderBottom: `1px solid ${isAuth ? '#f59e0b' : '#ef4444'}`,
        color: '#7f1d1d',
        padding: '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        fontSize: 13,
      }}
    >
      <strong style={{ color: isAuth ? '#92400e' : '#991b1b' }}>
        {isAuth ? 'Session expired' : 'Sync error — local data may be out of date'}
      </strong>
      <span style={{ color: '#6b7280' }}>{error.message}</span>
      <span style={{ flex: 1 }} />
      {isAuth ? (
        <button onClick={() => void signOut({ callbackUrl: '/login' })} disabled={busy} style={btn('#f59e0b')}>
          Sign in again
        </button>
      ) : (
        <>
          <button onClick={() => window.location.reload()} disabled={busy} style={btn('#3b82f6')}>
            Reload &amp; re-sync
          </button>
          <button onClick={() => void resetLocalData()} disabled={busy} style={btn('#ef4444')}>
            {busy ? 'Resetting…' : 'Reset local data'}
          </button>
        </>
      )}
    </div>
  )
}

function btn(bg: string): React.CSSProperties {
  return {
    fontSize: 13,
    padding: '6px 12px',
    background: bg,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 500,
  }
}
