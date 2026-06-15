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
  onChange?: (field: string, value: string | string[]) => void
  /** Options for Reference / MultiReference fields, keyed by field name. */
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

        // Many-to-many: a checkbox set; the value is an array of target ids.
        if (f.kind === FieldKind.MultiReference) {
          const options = references?.[f.name] ?? []
          const selected = Array.isArray(record[f.name]) ? (record[f.name] as unknown[]).map(String) : []
          return (
            <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {labelEl}
              {options.length === 0 ? (
                <span style={{ fontSize: 12, color: '#9ca3af' }}>none available</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {options.map((o) => {
                    const checked = selected.includes(o.value)
                    return (
                      <label
                        key={o.value}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, opacity: disabled ? 0.6 : 1 }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            const next = checked
                              ? selected.filter((v) => v !== o.value)
                              : [...selected, o.value]
                            onChange?.(f.name, next)
                          }}
                        />
                        {o.label}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
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
