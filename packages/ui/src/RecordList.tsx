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
  /** Server-side sort state (paged tables). When `onSort` is set, sortable column
   *  headers become clickable and show the active direction. */
  sort?: { field: string; dir: 'ASC' | 'DESC' }
  onSort?: (field: string) => void
}

// Only scalar columns can be server-sorted (a Reference sorts by opaque id, a
// MultiReference is virtual) — so those headers stay inert.
const isSortable = (kind: FieldKind) => kind !== FieldKind.Reference && kind !== FieldKind.MultiReference

// A schema-driven table: columns come from the descriptor, not hardcoded.
// The identity (uuid) column is hidden — it's noise in a list — but used as key.
export function RecordList({ descriptor, records, selectedId, onSelect, references, sort, onSort }: Props) {
  const idField = descriptor.identity.field
  const columns = descriptor.fields.filter((f) => f.kind !== FieldKind.Uuid)

  const cell = (record: Record<string, unknown>, field: (typeof columns)[number]): string => {
    if (field.kind === FieldKind.Reference) {
      const id = record[field.name]
      if (!id) return ''
      return references?.[field.name]?.[String(id)] ?? '(unknown)'
    }
    if (field.kind === FieldKind.MultiReference) {
      const ids = Array.isArray(record[field.name]) ? (record[field.name] as unknown[]).map(String) : []
      const map = references?.[field.name] ?? {}
      return ids.map((id) => map[id] ?? '(unknown)').join(', ')
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
          {columns.map((c) => {
            const sortable = Boolean(onSort) && isSortable(c.kind)
            const active = sort?.field === c.name
            return (
              <th
                key={c.name}
                onClick={sortable ? () => onSort!(c.name) : undefined}
                style={{ ...th, cursor: sortable ? 'pointer' : 'default', userSelect: 'none', color: active ? '#111827' : th.color }}
                aria-sort={active ? (sort!.dir === 'ASC' ? 'ascending' : 'descending') : undefined}
              >
                {c.label}
                {active ? (sort!.dir === 'ASC' ? ' ▲' : ' ▼') : ''}
              </th>
            )
          })}
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
