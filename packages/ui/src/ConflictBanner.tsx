'use client'

import React, { useState } from 'react'

interface Props {
  serverContent: string
  clientContent: string
  onKeepMine: () => void
  onKeepTheirs: () => void
  onMerge: (merged: string) => void
}

export function ConflictBanner({ serverContent, clientContent, onKeepMine, onKeepTheirs, onMerge }: Props) {
  const [mergeMode, setMergeMode] = useState(false)
  const [merged, setMerged] = useState(() => clientContent)

  return (
    <div
      style={{
        border: '2px solid #ef4444',
        borderRadius: 8,
        padding: 16,
        background: '#fef2f2',
        marginBottom: 16,
      }}
    >
      <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>Sync conflict detected</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#7f1d1d' }}>
        Your local edits conflict with a change saved from another tab.
        Choose which version to keep, or merge them manually.
      </p>

      {!mergeMode ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Your version</div>
              <pre style={{ margin: 0, padding: 8, background: '#fff', border: '1px solid #fca5a5', borderRadius: 4, fontSize: 12, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {clientContent || '(empty)'}
              </pre>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#374151' }}>Server version</div>
              <pre style={{ margin: 0, padding: 8, background: '#fff', border: '1px solid #86efac', borderRadius: 4, fontSize: 12, maxHeight: 120, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                {serverContent || '(empty)'}
              </pre>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onKeepMine} style={btnStyle('#3b82f6')}>Keep mine</button>
            <button onClick={onKeepTheirs} style={btnStyle('#10b981')}>Keep theirs</button>
            <button onClick={() => { setMerged(clientContent); setMergeMode(true) }} style={btnStyle('#f59e0b')}>Edit / merge</button>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={merged}
            onChange={(e) => setMerged(e.target.value)}
            rows={8}
            style={{ width: '100%', fontFamily: 'monospace', fontSize: 13, padding: 8, boxSizing: 'border-box', border: '1px solid #d1d5db', borderRadius: 4, marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onMerge(merged)} style={btnStyle('#10b981')}>Save merged</button>
            <button onClick={() => setMergeMode(false)} style={btnStyle('#6b7280')}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    background: bg,
    color: '#fff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 500,
  }
}
