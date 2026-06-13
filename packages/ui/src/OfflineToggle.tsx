'use client'

import React from 'react'

interface Props {
  offline: boolean
  onToggle: (offline: boolean) => void
}

export function OfflineToggle({ offline, onToggle }: Props) {
  return (
    <button
      onClick={() => onToggle(!offline)}
      title={offline ? 'Click to go online and sync' : 'Click to simulate offline mode'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 9999,
        border: '1px solid',
        fontSize: 12,
        fontWeight: 500,
        cursor: 'pointer',
        background: offline ? '#fef2f2' : '#f0fdf4',
        borderColor: offline ? '#fca5a5' : '#86efac',
        color: offline ? '#991b1b' : '#166534',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: offline ? '#ef4444' : '#22c55e',
          display: 'inline-block',
        }}
      />
      {offline ? 'Offline (click to sync)' : 'Online'}
    </button>
  )
}
