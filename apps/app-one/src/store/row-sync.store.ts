import { create } from 'zustand'
import type { SyncStatus } from '@gammaray/core'

interface RowSyncStore {
  syncStatus: SyncStatus
  offline: boolean
  setSyncStatus: (status: SyncStatus) => void
  setOffline: (offline: boolean) => void
}

export const useRowSyncStore = create<RowSyncStore>((set) => ({
  syncStatus: 'idle',
  offline: false,
  setSyncStatus: (status) => set({ syncStatus: status }),
  setOffline: (offline) => set({ offline }),
}))
