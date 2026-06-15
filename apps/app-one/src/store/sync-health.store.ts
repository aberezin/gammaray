import { create } from 'zustand'

// What kind of failure put the app into the suspect state.
//  - 'auth'    : the session/token is no longer valid (refresh failed) → re-login
//  - 'server'  : the server returned an error (GraphQL error / non-2xx)
//  - 'network' : the request never reached the server
export type SyncErrorKind = 'auth' | 'server' | 'network'

export interface SyncError {
  kind: SyncErrorKind
  message: string
}

interface SyncHealthStore {
  // Once suspect, the local UI state AND the local RxDB replica are considered
  // untrustworthy until the user recovers (reload/reset) or re-authenticates.
  status: 'ok' | 'suspect'
  error: SyncError | null
  markSuspect: (kind: SyncErrorKind, message: string) => void
  clear: () => void
}

export const useSyncHealth = create<SyncHealthStore>((set) => ({
  status: 'ok',
  error: null,
  // First error wins — keep the original cause; later errors are likely
  // downstream of it (retries against a dead token, etc.).
  markSuspect: (kind, message) =>
    set((s) => (s.status === 'suspect' ? s : { status: 'suspect', error: { kind, message } })),
  clear: () => set({ status: 'ok', error: null }),
}))

// Non-React access for plain modules (the gql client, token getter, replication
// error handlers) that report failures without a hook.
export const syncHealth = {
  markSuspect: (kind: SyncErrorKind, message: string) =>
    useSyncHealth.getState().markSuspect(kind, message),
  isSuspect: () => useSyncHealth.getState().status === 'suspect',
}
