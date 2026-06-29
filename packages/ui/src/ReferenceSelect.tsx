'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { ReferenceOption } from './types'

interface Props {
  /** Field label — used as the input's accessible name. */
  label: string
  /** Current selected id ('' = none). */
  value: string
  /** Async options source (server search for large targets; in-memory filter
   *  otherwise). Called debounced with the current query. */
  loadOptions: (query: string) => Promise<ReferenceOption[]>
  /** Known id→label for the current value (resolved by the parent). The control
   *  also remembers labels of options it has loaded/picked. */
  labels: Record<string, string>
  onChange: (value: string) => void
  disabled?: boolean
}

// At-scale many-to-one picker: a typeahead single-select backed by an async
// option source, so a large target catalog is never shipped in full. Type to
// search; the dropdown shows only what `loadOptions` returns.
export function ReferenceSelect({ label, value, loadOptions, labels, onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ReferenceOption[]>([])
  // Labels learned from loaded/picked options (covers a just-picked id before the
  // parent's resolved labels catch up).
  const [learned, setLearned] = useState<Record<string, string>>({})

  const loadRef = useRef(loadOptions)
  loadRef.current = loadOptions

  const labelOf = (id: string) => labels[id] ?? learned[id] ?? ''
  const selectedLabel = value ? labelOf(value) : ''

  // Debounced search whenever the query changes while open.
  useEffect(() => {
    if (!open) return
    let active = true
    const timer = setTimeout(() => {
      void loadRef.current(query).then((opts) => {
        if (!active) return
        setResults(opts)
        setLearned((prev) => ({ ...prev, ...Object.fromEntries(opts.map((o) => [o.value, o.label])) }))
      }).catch(() => { if (active) setResults([]) })
    }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query, open])

  function choose(v: string, lbl?: string) {
    if (lbl) setLearned((prev) => ({ ...prev, [v]: lbl }))
    onChange(v)
    setQuery('')
    setOpen(false)
  }

  if (disabled) {
    return <input type="text" aria-label={label} value={selectedLabel} readOnly disabled style={inputStyle(true)} />
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          value={open ? query : selectedLabel}
          placeholder={value ? '' : '— none —'}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ ...inputStyle(false), flex: 1 }}
        />
        {value && (
          <button type="button" aria-label={`Clear ${label}`} onMouseDown={(e) => { e.preventDefault(); choose('') }} style={clearBtn}>
            ×
          </button>
        )}
      </div>
      {open && (
        <ul role="listbox" style={dropdown}>
          <li role="option" aria-selected={value === ''} onMouseDown={(e) => { e.preventDefault(); choose('') }} style={optionStyle(false)}>
            <span style={{ color: '#9ca3af' }}>— none —</span>
          </li>
          {results.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => { e.preventDefault(); choose(o.value, o.label) }}
              style={optionStyle(o.value === value)}
            >
              {o.label}
            </li>
          ))}
          {results.length === 0 && <li style={{ ...optionStyle(false), color: '#9ca3af', cursor: 'default' }}>No matches</li>}
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
  border: '1px solid #d1d5db', borderRadius: 6, background: '#fff', color: '#6b7280',
  cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '4px 8px',
}
const dropdown: React.CSSProperties = {
  position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, margin: '4px 0 0', padding: 4,
  listStyle: 'none', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6,
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto',
}
function optionStyle(active: boolean): React.CSSProperties {
  return { padding: '6px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer', background: active ? '#eff6ff' : 'transparent', color: '#111827' }
}
