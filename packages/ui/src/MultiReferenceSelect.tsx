'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ReferenceOption } from './types'

interface Props {
  /** Field label — used as the search input's accessible name. */
  label: string
  values: string[]
  /** Async options source (server search for large targets; in-memory filter
   *  otherwise). Called debounced with the current query. */
  loadOptions: (query: string) => Promise<ReferenceOption[]>
  /** Known id→label for the current values (resolved by the parent). The control
   *  also remembers labels of options it has loaded/added. */
  labels: Record<string, string>
  onChange: (values: string[]) => void
  disabled?: boolean
}

// At-scale many-to-many picker: a token input backed by an async option source.
// Selected items are removable chips; a search box adds more. The dropdown only
// shows what `loadOptions` returns and excludes already-selected items, so a
// large catalog is never shipped in full.
export function MultiReferenceSelect({ label, values, loadOptions, labels, onChange, disabled }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ReferenceOption[]>([])
  const [learned, setLearned] = useState<Record<string, string>>({})

  const loadRef = useRef(loadOptions)
  loadRef.current = loadOptions
  const selectedSet = useMemo(() => new Set(values), [values])

  const labelOf = (id: string) => labels[id] ?? learned[id] ?? '(unknown)'

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

  function add(id: string, lbl: string) {
    if (!selectedSet.has(id)) {
      setLearned((prev) => ({ ...prev, [id]: lbl }))
      onChange([...values, id])
    }
    setQuery('')
  }
  function remove(id: string) {
    onChange(values.filter((v) => v !== id))
  }

  const visible = results.filter((o) => !selectedSet.has(o.value))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {values.length > 0 && (
        <div style={chipArea}>
          {values.map((id) => (
            <span key={id} style={chip}>
              {labelOf(id)}
              {!disabled && (
                <button type="button" aria-label={`Remove ${labelOf(id)}`} onMouseDown={(e) => { e.preventDefault(); remove(id) }} style={chipX}>
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
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            style={inputStyle}
          />
          {open && (
            <ul role="listbox" style={dropdown}>
              {visible.map((o) => (
                <li
                  key={o.value}
                  role="option"
                  aria-selected={false}
                  onMouseDown={(e) => { e.preventDefault(); add(o.value, o.label) }}
                  style={optionStyle}
                >
                  {o.label}
                </li>
              ))}
              {visible.length === 0 && <li style={{ ...optionStyle, color: '#9ca3af', cursor: 'default' }}>No matches</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const chipArea: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 132, overflowY: 'auto', padding: 2 }
const chip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, background: '#ede9fe', color: '#5b21b6', borderRadius: 999, padding: '2px 6px 2px 10px', fontSize: 13 }
const chipX: React.CSSProperties = { border: 'none', background: 'transparent', color: '#7c3aed', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }
const inputStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, background: '#fff', color: '#111827', outline: 'none', width: '100%' }
const dropdown: React.CSSProperties = { position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, margin: '4px 0 0', padding: 4, listStyle: 'none', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto' }
const optionStyle: React.CSSProperties = { padding: '6px 8px', borderRadius: 4, fontSize: 14, cursor: 'pointer', background: 'transparent', color: '#111827' }
