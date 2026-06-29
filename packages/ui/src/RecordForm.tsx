'use client'

import React from 'react'
import { FieldKind, type TableDescriptor } from '@gammaray/core'
import type { ReferenceFieldSource } from './types'
import { ReferenceSelect } from './ReferenceSelect'
import { MultiReferenceSelect } from './MultiReferenceSelect'

export type { ReferenceOption, ReferenceFieldSource } from './types'

const EMPTY_SOURCE: ReferenceFieldSource = { loadOptions: async () => [], labels: {} }

interface Props {
  descriptor: TableDescriptor
  record: Record<string, unknown>
  readOnly?: boolean
  onChange?: (field: string, value: string | string[]) => void
  /** Per-field option source + labels for Reference / MultiReference fields. */
  references?: Record<string, ReferenceFieldSource>
}

// A schema-driven record form: one labeled control per descriptor field. Most
// fields are text inputs; Reference fields render an at-scale typeahead
// (ReferenceSelect) and MultiReference fields a token/chip input
// (MultiReferenceSelect), both of which search rather than list every row.
// Read-only fields (id, version, timestamps) are disabled.
export function RecordForm({ descriptor, record, readOnly = true, onChange, references }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {descriptor.fields.map((f) => {
        const disabled = Boolean(readOnly || f.readOnly)
        const labelEl = (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{f.label}</span>
        )

        if (f.kind === FieldKind.Reference) {
          return (
            <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {labelEl}
              <ReferenceSelect
                label={f.label}
                value={String(record[f.name] ?? '')}
                loadOptions={(references?.[f.name] ?? EMPTY_SOURCE).loadOptions}
                labels={(references?.[f.name] ?? EMPTY_SOURCE).labels}
                onChange={(v) => onChange?.(f.name, v)}
                disabled={disabled}
              />
            </div>
          )
        }

        if (f.kind === FieldKind.MultiReference) {
          const selected = Array.isArray(record[f.name]) ? (record[f.name] as unknown[]).map(String) : []
          return (
            <div key={f.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {labelEl}
              <MultiReferenceSelect
                label={f.label}
                values={selected}
                loadOptions={(references?.[f.name] ?? EMPTY_SOURCE).loadOptions}
                labels={(references?.[f.name] ?? EMPTY_SOURCE).labels}
                onChange={(vals) => onChange?.(f.name, vals)}
                disabled={disabled}
              />
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
