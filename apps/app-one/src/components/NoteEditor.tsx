'use client'

import React from 'react'
import { SyncStatus } from '@gammaray/core'

interface Props {
  content: string
  onChange: (value: string) => void
  syncStatus: SyncStatus
  disabled?: boolean
}

export function NoteEditor({ content, onChange, syncStatus, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || syncStatus === SyncStatus.Conflict}
        rows={16}
        style={{
          width: '100%',
          fontFamily: 'monospace',
          fontSize: 14,
          padding: 12,
          resize: 'vertical',
          boxSizing: 'border-box',
          borderColor: syncStatus === SyncStatus.Conflict ? '#ef4444' : '#d1d5db',
          borderRadius: 6,
          borderWidth: 1,
          borderStyle: 'solid',
          outline: 'none',
        }}
        placeholder="Start typing your note…"
      />
    </div>
  )
}
