export enum ConflictStatus {
  None = 'none',
  Detected = 'detected',
  Resolved = 'resolved',
}

export enum SyncStatus {
  Synced = 'synced',
  Syncing = 'syncing',
  Offline = 'offline',
  Conflict = 'conflict',
  Error = 'error',
}
