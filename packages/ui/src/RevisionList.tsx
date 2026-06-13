'use client'

import React from 'react'
import { RevisionDto, ConflictStatus } from '@gammaray/core'

interface Props {
  revisions: RevisionDto[]
  onRestore?: (content: string) => void
}

const statusLabel: Record<ConflictStatus, { text: string; color: string }> = {
  [ConflictStatus.None]: { text: 'saved', color: '#6b7280' },
  [ConflictStatus.Detected]: { text: 'conflict', color: '#ef4444' },
  [ConflictStatus.Resolved]: { text: 'resolved', color: '#10b981' },
}

export function RevisionList({ revisions, onRestore }: Props) {
  if (revisions.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: 13 }}>No history yet.</p>
  }

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {revisions.map((rev) => {
        const status = statusLabel[rev.conflictStatus]
        return (
          <li
            key={rev.id}
            style={{
              padding: '8px 12px',
              border: '1px solid #e5e7eb',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: '#374151' }}>v{rev.version}</span>
              <span style={{ color: status.color, fontWeight: 500 }}>{status.text}</span>
            </div>
            <div style={{ color: '#6b7280', marginBottom: 4 }}>
              {new Date(rev.createdAt).toLocaleString()} · tab {rev.clientId.slice(0, 8)}
            </div>
            <div
              style={{
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 60,
                overflow: 'hidden',
                color: '#374151',
              }}
            >
              {rev.content || <em style={{ color: '#9ca3af' }}>(empty)</em>}
            </div>
            {onRestore && (
              <button
                onClick={() => onRestore(rev.content)}
                style={{ marginTop: 6, fontSize: 12, cursor: 'pointer', color: '#3b82f6', background: 'none', border: 'none', padding: 0 }}
              >
                Restore this version
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
