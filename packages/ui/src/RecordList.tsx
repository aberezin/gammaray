'use client'

import React from 'react'
import { FieldKind, type TableDescriptor } from '@gammaray/core'

interface Props {
  descriptor: TableDescriptor
  records: Array<Record<string, unknown>>
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Reference id→label maps, keyed by field name, to display names not ids. */
  references?: Record<string, Record<string, string>>
}

// A schema-driven table: columns come from the descriptor, not hardcoded.
// The identity (uuid) column is hidden — it's noise in a list — but used as key.
export function RecordList({ descriptor, records, selectedId, onSelect, references }: Props) {
  const idField = descriptor.identity.field
  const columns = descriptor.fields.filter((f) => f.kind !== FieldKind.Uuid)

  const cell = (record: Record<string, unknown>, field: (typeof columns)[number]): string => {
    if (field.kind === FieldKind.Reference) {
      const id = record[field.name]
      if (!id) return ''
      return references?.[field.name]?.[String(id)] ?? '(unknown)'
    }
    return formatCell(record[field.name], field.kind)
  }

  if (records.length === 0) {
    return <p style={{ color: '#9ca3af', fontSize: 13 }}>No records yet.</p>
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.name} style={th}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {records.map((r) => {
          const id = String(r[idField])
          const selected = id === selectedId
          return (
            <tr
              key={id}
              onClick={() => onSelect?.(id)}
              style={{
                cursor: onSelect ? 'pointer' : 'default',
                background: selected ? '#eff6ff' : 'transparent',
              }}
            >
              {columns.map((c) => (
                <td key={c.name} style={td}>{cell(r, c)}</td>
              ))}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function formatCell(value: unknown, kind: FieldKind): string {
  if (value === null || value === undefined) return ''
  if (kind === FieldKind.Timestamp) {
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
  }
  return String(value)
}

const th: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '2px solid #e5e7eb',
  color: '#374151',
  fontWeight: 600,
}
const td: React.CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid #f3f4f6',
  color: '#374151',
}
