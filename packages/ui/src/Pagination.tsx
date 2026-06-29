'use client'

import React from 'react'

interface Props {
  /** 0-based current page. */
  pageIndex: number
  pageCount: number
  total: number
  hasPrev: boolean
  hasNext: boolean
  loading?: boolean
  onFirst: () => void
  onPrev: () => void
  onNext: () => void
}

// Numbered Next/Prev pager for an at-scale (paged) list. Keyset paging is
// sequential, so we expose First/Prev/Next + a "Page X of N" indicator rather
// than random page jumps (deep random access is the unbounded operation paging
// exists to avoid). See ADR 0013.
export function Pagination({ pageIndex, pageCount, total, hasPrev, hasNext, loading, onFirst, onPrev, onNext }: Props) {
  return (
    <div role="navigation" aria-label="Pagination" style={bar}>
      <span style={{ color: '#6b7280' }}>
        Page <strong style={{ color: '#374151' }}>{pageIndex + 1}</strong> of {pageCount}
        <span style={{ color: '#9ca3af' }}> · {total} total</span>
        {loading && <span style={{ color: '#9ca3af' }}> · loading…</span>}
      </span>
      <span style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onFirst} disabled={!hasPrev} style={btn(hasPrev)}>« First</button>
        <button type="button" onClick={onPrev} disabled={!hasPrev} style={btn(hasPrev)}>‹ Prev</button>
        <button type="button" onClick={onNext} disabled={!hasNext} style={btn(hasNext)}>Next ›</button>
      </span>
    </div>
  )
}

const bar: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 12, marginTop: 12, fontSize: 13,
}
function btn(enabled: boolean): React.CSSProperties {
  return {
    fontSize: 13, padding: '4px 10px', borderRadius: 6,
    border: '1px solid #d1d5db', background: enabled ? '#fff' : '#f9fafb',
    color: enabled ? '#374151' : '#9ca3af', cursor: enabled ? 'pointer' : 'not-allowed',
  }
}
