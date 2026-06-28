'use client'

import { useState } from 'react'
import { clearLocalDatabase } from './rxdb'

// Discards this device's local copy (RxDB/IndexedDB) and reloads so replication
// re-downloads everything from the server. Useful when the local store has
// diverged from the server (e.g. an orphaned row that can't sync) or you simply
// want a clean copy. Confirms first because unsynced offline edits are lost.
export function ResetLocalButton() {
  const [busy, setBusy] = useState(false)

  async function handleReset() {
    if (busy) return
    const ok = window.confirm(
      'Reset local copy?\n\n' +
        "This discards this device's local copy and re-downloads everything from " +
        'the server. Any unsynced offline changes will be lost.',
    )
    if (!ok) return
    setBusy(true)
    try {
      await clearLocalDatabase()
    } finally {
      // Reload so RxDB and replication reinitialize from the fresh (empty) store
      // and pull the current server state.
      window.location.reload()
    }
  }

  return (
    <button
      onClick={() => void handleReset()}
      disabled={busy}
      title="Discard the local copy and re-download from the server"
      style={{
        fontSize: 12,
        padding: '4px 10px',
        border: '1px solid #d1d5db',
        borderRadius: 6,
        background: '#fff',
        color: '#6b7280',
        cursor: busy ? 'default' : 'pointer',
      }}
    >
      {busy ? 'Resetting…' : 'Reset local copy'}
    </button>
  )
}
