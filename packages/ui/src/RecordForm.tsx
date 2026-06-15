'use client'

import React from 'react'
import { FieldKind, type TableDescriptor } from '@gammaray/core'

export interface ReferenceOption {
  value: string
  label: string
}

interface Props {
  descriptor: TableDescriptor
  record: Record<string, unknown>
  /** Read-only for now (the Read increment). Editing arrives with Update. */
  readOnly?: boolean
  onChange?: (field: string, value: string) => void
  /** Options for Reference fields, keyed by field name (e.g. companyId). */
  references?: Record<string, ReferenceOption[]>
}

// A schema-driven record form: one labeled control per descriptor field. Most
// fields are text inputs; Reference fields render a <select> picker populated
// from `references`. Read-only fields (id, version, timestamps) are disabled.
export function RecordForm({ descriptor, record, readOnly = true, onChange, references }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {descriptor.fields.map((f) => {
        const disabled = Boolean(readOnly || f.readOnly)
        const labelEl = (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{f.label}</span>
        )

        if (f.kind === FieldKind.Reference) {
          const options = references?.[f.name] ?? []
          return (
            <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {labelEl}
              <select
                value={String(record[f.name] ?? '')}
                disabled={disabled}
                onChange={(e) => onChange?.(f.name, e.target.value)}
                style={selectStyle(disabled)}
              >
                <option value="">— none —</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )
        }

        return (
          <label key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {labelEl}
            <input
              type="text"
              value={formatValue(record[f.name], f.kind)}
              readOnly={disabled}
              disabled={disabled}
              onChange={(e) => onChange?.(f.name, e.target.value)}
              style={inputStyle(disabled)}
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

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '8px 10px',
    border: '1px solid #d1d5db',
    borderRadius: 6,
    fontSize: 14,
    background: disabled ? '#f9fafb' : '#fff',
    color: '#111827',
    outline: 'none',
  }
}

function selectStyle(disabled: boolean): React.CSSProperties {
  return { ...inputStyle(disabled), appearance: 'auto' }
}
