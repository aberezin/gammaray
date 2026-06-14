'use client'

import React from 'react'
import { FieldKind, type TableDescriptor } from '@gammaray/core'

interface Props {
  descriptor: TableDescriptor
  mine: Record<string, unknown>
  theirs: Record<string, unknown>
  onKeepMine: () => void
  onKeepTheirs: () => void
}

// Schema-driven, whole-row conflict UI: shows each editable field's "yours" vs
// "server" value, highlighting the ones that differ, and lets the user keep
// either side. (Field-level merge is a later strategy.)
export function RecordConflictBanner({ descriptor, mine, theirs, onKeepMine, onKeepTheirs }: Props) {
  const fields = descriptor.fields.filter((f) => !f.readOnly && f.kind !== FieldKind.Uuid)

  return (
    <div style={{ border: '2px solid #ef4444', borderRadius: 8, padding: 16, background: '#fef2f2', marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 8px', color: '#991b1b' }}>Update conflict</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#7f1d1d' }}>
        This record changed on the server while you were editing. Keep your version or theirs.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 12 }}>
        <thead>
          <tr>
            <th style={th}>Field</th>
            <th style={th}>Yours</th>
            <th style={th}>Server</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const mineVal = str(mine[f.name])
            const theirsVal = str(theirs[f.name])
            const differs = mineVal !== theirsVal
            return (
              <tr key={f.name} style={{ background: differs ? '#fff7ed' : 'transparent' }}>
                <td style={{ ...td, color: '#6b7280', fontWeight: differs ? 600 : 400 }}>{f.label}</td>
                <td style={td}>{mineVal}</td>
                <td style={td}>{theirsVal}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onKeepMine} style={btn('#3b82f6')}>Keep mine</button>
        <button onClick={onKeepTheirs} style={btn('#10b981')}>Keep theirs</button>
      </div>
    </div>
  )
}

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #fca5a5', color: '#7f1d1d' }
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #fee2e2', color: '#374151' }

function btn(bg: string): React.CSSProperties {
  return { background: bg, color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 500 }
}
