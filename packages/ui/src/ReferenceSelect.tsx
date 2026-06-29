'use client'

import React, { useMemo, useState } from 'react'
import type { ReferenceOption } from './types'

interface Props {
  /** Field label — used as the input's accessible name. */
  label: string
  /** Current selected id ('' = none). */
  value: string
  options: ReferenceOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

// At-scale many-to-one picker: a typeahead single-select. Type to filter; the
// dropdown only renders matches (capped), never the whole catalog. Replaces a
// plain <select> that listed every row. (PR 1: filters the in-memory `options`;
// a later data-layer PR swaps the source for async server search.)
const MAX_VISIBLE = 50

export function ReferenceSelect({ label, value, options, onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const selected = useMemo(() => options.find((o) => o.value === value) ?? null, [options, value])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    return list.slice(0, MAX_VISIBLE)
  }, [options, query])

  function choose(v: string) {
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  if (disabled) {
    return (
      <input type="text" aria-label={label} value={selected?.label ?? ''} readOnly disabled style={inputStyle(true)} />
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          value={open ? query : selected?.label ?? ''}
          placeholder={selected ? '' : '— none —'}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          style={{ ...inputStyle(false), flex: 1 }}
        />
        {selected && (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            onMouseDown={(e) => { e.preventDefault(); choose('') }}
            style={clearBtn}
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul role="listbox" style={dropdown}>
          <li
            role="option"
            aria-selected={value === ''}
            onMouseDown={(e) => { e.preventDefault(); choose('') }}
            style={optionStyle(false)}
          >
            <span style={{ color: '#9ca3af' }}>— none —</span>
          </li>
          {matches.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); choose(o.value) }}
              style={optionStyle(o.value === value)}
            >
              {o.label}
            </li>
          ))}
          {matches.length === 0 && <li style={{ ...optionStyle(false), color: '#9ca3af' }}>No matches</li>}
        </ul>
      )}
    </div>
  )
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
    width: '100%',
  }
}
const clearBtn: React.CSSProperties = {
  border: '1px solid #d1d5db',
  borderRadius: 6,
  background: '#fff',
  color: '#6b7280',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '4px 8px',
}
const dropdown: React.CSSProperties = {
  position: 'absolute',
  zIndex: 20,
  top: '100%',
  left: 0,
  right: 0,
  margin: '4px 0 0',
  padding: 4,
  listStyle: 'none',
  background: '#fff',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  maxHeight: 240,
  overflowY: 'auto',
}
function optionStyle(active: boolean): React.CSSProperties {
  return {
    padding: '6px 8px',
    borderRadius: 4,
    fontSize: 14,
    cursor: 'pointer',
    background: active ? '#eff6ff' : 'transparent',
    color: '#111827',
  }
}
