'use client'

import React from 'react'
import { FieldKind, type TableDescriptor } from '@gammaray/core'

interface Props {
  descriptor: TableDescriptor
  record: Record<string, unknown>
  /** Read-only for now (the Read increment). Editing arrives with Update. */
  readOnly?: boolean
  onChange?: (field: string, value: string) => void
}

// A schema-driven record form: one labeled input per descriptor field. Read-only
// fields (id, version, timestamps) are always disabled; the rest follow the
// form's readOnly prop until the Update increment makes them editable.
export function RecordForm({ descriptor, record, readOnly = true, onChange }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {descriptor.fields.map((f) => {
        const disabled = readOnly || f.readOnly
        const value = formatValue(record[f.name], f.kind)
        return (
          <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{f.label}</span>
            <input
              type="text"
              value={value}
              readOnly={disabled}
              disabled={disabled}
              onChange={(e) => onChange?.(f.name, e.target.value)}
              style={{
                padding: '8px 10px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
                background: disabled ? '#f9fafb' : '#fff',
                color: '#111827',
                outline: 'none',
              }}
            />
          </label>
        )
      })}
    </div>
  )
}

function formatValue(value: unknown, kind: FieldKind): string {
  if (value === null || value === undefined) return ''
  if (kind === FieldKind.Timestamp) {
    const d = new Date(String(value))
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString()
  }
  return String(value)
}
