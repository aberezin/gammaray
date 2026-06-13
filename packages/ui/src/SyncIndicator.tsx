'use client'

import React from 'react'
import { SyncStatus } from '@gammaray/core'

interface Props {
  status: SyncStatus
}

const config: Record<SyncStatus, { label: string; color: string }> = {
  [SyncStatus.Synced]: { label: 'Synced', color: '#22c55e' },
  [SyncStatus.Syncing]: { label: 'Syncing…', color: '#f59e0b' },
  [SyncStatus.Offline]: { label: 'Offline', color: '#6b7280' },
  [SyncStatus.Conflict]: { label: 'Conflict', color: '#ef4444' },
  [SyncStatus.Error]: { label: 'Error', color: '#ef4444' },
}

export function SyncIndicator({ status }: Props) {
  const { label, color } = config[status]
  return (
    <span style={{ fontSize: 12, color, fontWeight: 500 }}>
      ● {label}
    </span>
  )
}
