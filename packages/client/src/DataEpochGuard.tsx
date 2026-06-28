'use client'

import { useEffect } from 'react'
import { makeGqlClient } from './graphql-client'
import { clearLocalDatabase } from './rxdb'

// ADR 0012: detect a destructive server reset and reslate the local replica.
// The server bumps its "data epoch" on out-of-app changes (migrate/seed/manual);
// we compare it to the epoch we last synced against. A mismatch means the
// server's dataset is a new generation, so the local copy is from a dead
// lifetime — discard + re-pull rather than trying to merge stale rows.
//
// v1 prompts on every mismatch (safe — never silently drops unsynced edits).
// Auto-reslating only when the store is provably clean is a documented follow-up
// (needs reliable pending-write detection). The manual "Reset local data" button
// remains the escape hatch if the user declines.
const EPOCH_QUERY = `query ServerDataEpoch { serverDataEpoch }`
const STORAGE_KEY = 'gammaray.dataEpoch'

export function DataEpochGuard() {
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const client = makeGqlClient()
        const { serverDataEpoch } = await client.request<{ serverDataEpoch: string }>(EPOCH_QUERY)
        if (cancelled || !serverDataEpoch) return

        const stored = localStorage.getItem(STORAGE_KEY)
        if (!stored) {
          localStorage.setItem(STORAGE_KEY, serverDataEpoch)
          return
        }
        if (stored === serverDataEpoch) return

        const refresh = window.confirm(
          "The server's data was reset.\n\n" +
            "Refresh this device's local copy now? Any unsynced offline changes " +
            'will be discarded.\n\n' +
            "(You can also do this later with the 'Reset local data' button.)",
        )
        // Acknowledge the new epoch either way so we don't re-prompt for the same
        // reset; on accept we also wipe and reload to re-pull from the server.
        localStorage.setItem(STORAGE_KEY, serverDataEpoch)
        if (refresh) {
          await clearLocalDatabase()
          window.location.reload()
        }
      } catch {
        // Best-effort: a failed epoch check must never block the app.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return null
}
