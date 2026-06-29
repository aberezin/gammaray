'use client'

import React, { useMemo, useState } from 'react'
import type { ReferenceOption } from './types'

interface Props {
  /** Field label — used as the search input's accessible name. */
  label: string
  values: string[]
  options: ReferenceOption[]
  onChange: (values: string[]) => void
  disabled?: boolean
}

// At-scale many-to-many picker: a token input. Selected items are removable chips
// in a scrollable area; a search box adds more (type → filtered dropdown → click).
// The dropdown only renders matches (capped) and excludes already-selected items,
// so a 150-row catalog never renders at once. (PR 1: filters in-memory `options`;
// a later data-layer PR swaps the source for async server search.)
const MAX_VISIBLE = 50

export function MultiReferenceSelect({ label, values, options, onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const labelFor = useMemo(() => {
    const m = new Map(options.map((o) => [o.value, o.label]))
    return (id: string) => m.get(id) ?? '(unknown)'
  }, [options])

  const selectedSet = useMemo(() => new Set(values), [values])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options
      .filter((o) => !selectedSet.has(o.value) && (q ? o.label.toLowerCase().includes(q) : true))
      .slice(0, MAX_VISIBLE)
  }, [options, selectedSet, query])

  function add(id: string) {
    if (!selectedSet.has(id)) onChange([...values, id])
    setQuery('')
  }
  function remove(id: string) {
    onChange(values.filter((v) => v !== id))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {values.length > 0 && (
        <div style={chipArea}>
          {values.map((id) => (
            <span key={id} style={chip}>
              {labelFor(id)}
              {!disabled && (
                <button type="button" aria-label={`Remove ${labelFor(id)}`} onMouseDown={(e) => { e.preventDefault(); remove(id) }} style={chipX}>
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {disabled ? (
        values.length === 0 ? <span style={{ fontSize: 12, color: '#9ca3af' }}>none</span> : null
      ) : (
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-label={label}
            value={query}
            placeholder="Search to add…"
            onFocus={() => setOpen(true)}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            style={inputStyle}
          />
          {open && (
            <ul role="listbox" style={dropdown}>
              {matches.map((o) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => { e.preventDefault(); add(o.value) }}
                  style={optionStyle}
                >
                  {o.label}
                </li>
              ))}
              {matches.length === 0 && (
                <li style={{ ...optionStyle, color: '#9ca3af', cursor: 'default' }}>
                  {options.length === 0 ? 'none available' : 'No matches'}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const chipArea: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  maxHeight: 132,
  overflowY: 'auto',
  padding: 2,
}
const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#ede9fe',
  color: '#5b21b6',
  borderRadius: 999,
  padding: '2px 6px 2px 10px',
  fontSize: 13,
}
const chipX: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#7c3aed',
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: 1,
  padding: '0 2px',
}
const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 14,
  background: '#fff',
  color: '#111827',
  outline: 'none',
  width: '100%',
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
const optionStyle: React.CSSProperties = {
  padding: '6px 8px',
  borderRadius: 4,
  fontSize: 14,
  cursor: 'pointer',
  background: 'transparent',
  color: '#111827',
}
