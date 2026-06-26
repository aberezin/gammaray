import { create } from 'zustand'
import { SyncStatus } from '@gammaray/core'

interface ConflictState {
  noteId: string
  serverContent: string
  serverVersion: number
  clientContent: string
}

interface NoteStore {
  syncStatus: SyncStatus
  conflict: ConflictState | null
  offline: boolean

  setSyncStatus: (s: SyncStatus) => void
  setConflict: (c: ConflictState | null) => void
  setOffline: (v: boolean) => void
}

export const useNoteStore = create<NoteStore>((set) => ({
  syncStatus: SyncStatus.Syncing,
  conflict: null,
  offline: false,

  setSyncStatus: (syncStatus) => set({ syncStatus }),
  setConflict: (conflict) =>
    set({ conflict, syncStatus: conflict ? SyncStatus.Conflict : SyncStatus.Synced }),
  setOffline: (offline) =>
    set({ offline, syncStatus: offline ? SyncStatus.Offline : SyncStatus.Syncing }),
}))
