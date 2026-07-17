'use client'

import React, { useEffect, useState } from 'react'
import { RecordList, RecordForm, RecordConflictBanner, OfflineToggle, SyncIndicator, Pagination, type ReferenceFieldSource } from '@gammaray/ui'
import { FieldKind, type RowRevisionDto, type TableDescriptor } from '@gammaray/core'
import { ResetLocalButton } from './ResetLocalButton'
import { useRecordPage } from './use-record-page'

interface Props {
  descriptor: TableDescriptor
  accessToken: string
  /** Page heading, e.g. "Contacts". */
  title: string
  /** Cross-page navigation rendered at the end of the header. */
  navLinks?: React.ReactNode
  maxWidth?: number
}

// One generic, descriptor-driven page for any type-A table — the client-side
// analog of the server's generic row engine. All the per-table wiring
// (subscriptions, reference pickers, m2m materialization/reconcile, replication,
// CRUD, history, conflicts) lives in useRecordPage; this component is just the
// layout, parameterized by the descriptor. A new type-A page is a one-line
// wrapper: <RecordPage descriptor={fooDescriptor} title="Foos" />.
export function RecordPage({ descriptor, accessToken, title, navLinks, maxWidth = 1000 }: Props) {
  const page = useRecordPage(descriptor, accessToken)
  const { records, referenceLabels, joinRows, quickAddTargets, suspect, pagedOffline, pagination } = page
  // Any write on a paged table (except CREATE, which queues via RxDB) must be
  // blocked while offline — direct-coordinator writes have no offline queue
  // (ADR 0014). `suspect` already gates everything; `pagedOffline` adds the
  // scope-specific block for editing an existing paged row.
  const editingBlocked = suspect || pagedOffline

  // Debounced search box for a paged table (drives the server-side `filter`).
  const [search, setSearch] = useState('')
  const setFilter = pagination?.setFilter
  useEffect(() => {
    if (!setFilter) return
    const t = setTimeout(() => setFilter(search), 250)
    return () => clearTimeout(t)
  }, [search, setFilter])

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState<Record<string, unknown>>({})
  const [revisions, setRevisions] = useState<RowRevisionDto[]>([])
  const [addInputs, setAddInputs] = useState<Record<string, string>>({})
  // Transient "✓ Added X" flash per quick-add target — the input clears on
  // success so without this the click looks like a no-op.
  const [addedFlash, setAddedFlash] = useState<Record<string, string>>({})

  const selected = records.find((r) => String(r.id) === selectedId) ?? null
  const selectedVersion = selected ? Number(selected.version ?? 0) : null
  const newLabel = `New ${descriptor.table}`

  // Self-referencing fields (e.g. a category's parentId → category). A row can't
  // reference itself, so exclude the row being edited from its own picker.
  const selfRefFields = descriptor.fields
    .filter((f) => f.kind === FieldKind.Reference && f.references?.collection === descriptor.collection)
    .map((f) => f.name)

  // Build the form's per-field option source + labels. Self-referencing fields
  // exclude the row being edited from their own picker results.
  function formReferences(excludeId: string | null): Record<string, ReferenceFieldSource> {
    const refs: Record<string, ReferenceFieldSource> = {}
    for (const f of descriptor.fields) {
      if (f.kind !== FieldKind.Reference && f.kind !== FieldKind.MultiReference) continue
      const isSelf = selfRefFields.includes(f.name)
      refs[f.name] = {
        loadOptions: async (q: string) => {
          const opts = await page.searchReference(f.name, q)
          return excludeId && isSelf ? opts.filter((o) => o.value !== excludeId) : opts
        },
        labels: referenceLabels[f.name] ?? {},
      }
    }
    return refs
  }

  // Load the selected record's version history (revisioned tables only).
  useEffect(() => {
    if (!selectedId) {
      setRevisions([])
      return
    }
    let active = true
    page.loadRevisions(selectedId).then((r) => { if (active) setRevisions(r) }).catch(() => {})
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, selectedVersion])

  function startCreate() {
    if (suspect) return
    setSelectedId(null)
    setEditing(false)
    setDraft({})
    setCreating(true)
  }

  function select(id: string) {
    setCreating(false)
    setEditing(false)
    setSelectedId(id)
  }

  function startEdit() {
    if (suspect || !selected) return
    setEditDraft({ ...selected })
    setEditing(true)
  }

  async function handleSave() {
    if (suspect) return
    const id = await page.create(draft)
    setCreating(false)
    setDraft({})
    setSelectedId(id)
  }

  async function handleSaveEdit() {
    if (suspect || !selectedId) return
    await page.update(selectedId, editDraft)
    setEditing(false)
  }

  async function handleDelete() {
    if (suspect || !selectedId) return
    await page.remove(selectedId)
    setEditing(false)
    setSelectedId(null)
  }

  async function handleAdd(collection: string) {
    if (suspect) return
    const name = (addInputs[collection] ?? '').trim()
    if (!name) return
    await page.addRelated(collection, name)
    setAddInputs((s) => ({ ...s, [collection]: '' }))
    setAddedFlash((s) => ({ ...s, [collection]: name }))
    setTimeout(() => {
      setAddedFlash((s) => (s[collection] === name ? { ...s, [collection]: '' } : s))
    }, 2500)
  }

  return (
    <div style={{ maxWidth, margin: '0 auto', padding: '24px 16px' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>{title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {quickAddTargets.map((t) => {
            const value = addInputs[t.collection] ?? ''
            return (
              <React.Fragment key={t.collection}>
                <input
                  value={value}
                  onChange={(e) => setAddInputs((s) => ({ ...s, [t.collection]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(t.collection) }}
                  placeholder={`New ${t.label} name`}
                  style={{ fontSize: 13, padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
                />
                <button
                  onClick={() => void handleAdd(t.collection)}
                  disabled={suspect || !value.trim()}
                  style={controlBtn(value.trim() ? '#8b5cf6' : '#e5e7eb', Boolean(value.trim()) && !suspect)}
                >
                  Add {t.label}
                </button>
                {addedFlash[t.collection] && (
                  <span style={{ fontSize: 12, color: '#10b981', whiteSpace: 'nowrap' }}>
                    ✓ Added &ldquo;{addedFlash[t.collection]}&rdquo;
                  </span>
                )}
              </React.Fragment>
            )
          })}
          <button onClick={startCreate} disabled={suspect} style={controlBtn(suspect ? '#e5e7eb' : '#3b82f6', !suspect)}>
            {newLabel}
          </button>
          <OfflineToggle offline={page.offline} onToggle={page.setOffline} />
          <SyncIndicator status={page.syncStatus} />
          <ResetLocalButton />
          {navLinks}
        </div>
      </header>

      {page.conflict && (
        <RecordConflictBanner
          descriptor={descriptor}
          mine={page.conflict.mine}
          theirs={page.conflict.theirs}
          onKeepMine={() => void page.resolveWith(page.conflict!.mine)}
          onKeepTheirs={() => void page.resolveWith(page.conflict!.theirs)}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, alignItems: 'start' }}>
        {/* minWidth:0 lets the 1fr track shrink below the table's intrinsic width;
            overflowX scrolls a wide table inside the column. */}
        <div style={{ minWidth: 0 }}>
          {pagination && (
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${title.toLowerCase()}…`}
              aria-label={`Search ${title}`}
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 12, fontSize: 13, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
            />
          )}
          <div style={{ overflowX: 'auto' }}>
            <RecordList
              descriptor={descriptor}
              records={records}
              selectedId={selectedId}
              onSelect={select}
              references={referenceLabels}
              sort={pagination?.sort}
              onSort={pagination ? pagination.setSort : undefined}
            />
          </div>
          {pagination && (
            <Pagination
              pageIndex={pagination.pageIndex}
              pageCount={pagination.pageCount}
              total={pagination.total}
              hasPrev={pagination.hasPrev}
              hasNext={pagination.hasNext}
              loading={pagination.loading}
              onFirst={pagination.first}
              onPrev={pagination.prev}
              onNext={pagination.next}
            />
          )}
        </div>

        <div>
          {creating ? (
            <>
              <h2 style={{ margin: '0 0 12px', fontSize: 15, color: '#374151' }}>{newLabel}</h2>
              <RecordForm
                descriptor={descriptor}
                record={draft}
                readOnly={false}
                onChange={(field, value) => setDraft((d) => ({ ...d, [field]: value }))}
                references={formReferences(null)}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => void handleSave()} disabled={suspect} style={saveBtn(suspect)}>Save</button>
                <button onClick={() => { setCreating(false); setDraft({}) }} style={cancelBtn}>Cancel</button>
              </div>
            </>
          ) : selected ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 12px' }}>
                <h2 style={{ margin: 0, fontSize: 15, color: '#374151' }}>Record</h2>
                {!editing && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={startEdit} disabled={editingBlocked} style={smallBtn(editingBlocked ? '#e5e7eb' : '#3b82f6', !editingBlocked)}>Edit</button>
                    <button onClick={() => void handleDelete()} disabled={editingBlocked} style={smallBtn(editingBlocked ? '#e5e7eb' : '#ef4444', !editingBlocked)}>Delete</button>
                  </div>
                )}
              </div>

              {editing ? (
                <>
                  <RecordForm
                    descriptor={descriptor}
                    record={editDraft}
                    readOnly={false}
                    onChange={(field, value) => setEditDraft((d) => ({ ...d, [field]: value }))}
                    references={formReferences(selectedId)}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => void handleSaveEdit()} disabled={editingBlocked} style={saveBtn(editingBlocked)}>Save</button>
                    <button onClick={() => setEditing(false)} style={cancelBtn}>Cancel</button>
                  </div>
                </>
              ) : (
                <RecordForm descriptor={descriptor} record={selected} readOnly references={formReferences(selectedId)} />
              )}

              {descriptor.revisioned && (
                <>
                  <h2 style={{ margin: '20px 0 12px', fontSize: 15, color: '#374151' }}>Version history</h2>
                  {revisions.length === 0 ? (
                    <p style={{ color: '#9ca3af', fontSize: 13 }}>No history yet.</p>
                  ) : (
                    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {revisions.map((rev) => (
                        <li key={rev.id} style={{ padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 13 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#374151' }}>
                            <span>v{rev.version}</span>
                            <span style={{ color: '#6b7280' }}>{rev.conflictStatus}</span>
                          </div>
                          <div style={{ color: '#6b7280', fontSize: 12 }}>
                            {new Date(rev.createdAt).toLocaleString()} · client {rev.clientId}
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}
                </>
              )}

              {/* Link history — present on any descriptor with MultiReference fields */}
              {selectedId && (() => {
                const mrefFields = descriptor.fields.filter(
                  (f) => f.kind === FieldKind.MultiReference && f.via,
                )
                if (mrefFields.length === 0) return null

                const sections = mrefFields.map((f) => {
                  const via = f.via!
                  const rows = (joinRows[via.joinCollection] ?? [])
                    .filter((r) => String(r[via.localField]) === selectedId)
                    .slice()
                    .sort((a, b) =>
                      String(a.effectiveFrom ?? '').localeCompare(String(b.effectiveFrom ?? '')),
                    )
                  return { field: f, via, rows }
                })

                const allRows = sections.flatMap((s) => s.rows)
                const lastActivity = allRows.reduce<Date | null>((latest, r) => {
                  const d = r.effectiveFrom ? new Date(String(r.effectiveFrom)) : null
                  return d && (!latest || d > latest) ? d : latest
                }, null)

                return (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '20px 0 12px' }}>
                      <h2 style={{ margin: 0, fontSize: 15, color: '#374151' }}>Link history</h2>
                      {lastActivity && (
                        <span style={{ fontSize: 12, color: '#9ca3af' }}>
                          last change {relativeTime(lastActivity)}
                        </span>
                      )}
                    </div>
                    {sections.every((s) => s.rows.length === 0) ? (
                      <p style={{ color: '#9ca3af', fontSize: 13 }}>No links yet.</p>
                    ) : (
                      sections.map(({ field, via, rows }) =>
                        rows.length === 0 ? null : (
                          <div key={field.name} style={{ marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                              {field.label}
                            </div>
                            <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {rows.map((r) => {
                                const targetLabel =
                                  (referenceLabels[field.name] ?? {})[String(r[via.remoteField])] ??
                                  String(r[via.remoteField]).slice(0, 8) + '…'
                                const fromStr = r.effectiveFrom
                                  ? new Date(String(r.effectiveFrom)).toLocaleString()
                                  : null
                                const toStr = r.effectiveTo
                                  ? new Date(String(r.effectiveTo)).toLocaleString()
                                  : null
                                return (
                                  <li
                                    key={String(r.id)}
                                    style={{
                                      padding: '5px 10px',
                                      border: '1px solid #e5e7eb',
                                      borderRadius: 6,
                                      fontSize: 13,
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                    }}
                                  >
                                    <span style={{ color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span
                                        style={{
                                          display: 'inline-block',
                                          width: 6,
                                          height: 6,
                                          borderRadius: '50%',
                                          background: '#10b981',
                                          flexShrink: 0,
                                        }}
                                      />
                                      {targetLabel}
                                    </span>
                                    <span style={{ fontSize: 12, color: '#6b7280', textAlign: 'right' }}>
                                      {toStr ? `${fromStr} → ${toStr}` : fromStr ? `since ${fromStr}` : 'pending…'}
                                    </span>
                                  </li>
                                )
                              })}
                            </ol>
                          </div>
                        ),
                      )
                    )}
                  </>
                )
              })()}
            </>
          ) : (
            <p style={{ color: '#9ca3af', fontSize: 13 }}>Select a record to view its fields and history.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function relativeTime(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function controlBtn(background: string, active: boolean): React.CSSProperties {
  return {
    fontSize: 13, padding: '6px 12px', background, color: active ? '#fff' : '#9ca3af',
    border: 'none', borderRadius: 6, cursor: active ? 'pointer' : 'not-allowed', fontWeight: 500,
  }
}
function saveBtn(suspect: boolean): React.CSSProperties {
  return {
    fontSize: 13, padding: '6px 14px', background: suspect ? '#e5e7eb' : '#10b981', color: suspect ? '#9ca3af' : '#fff',
    border: 'none', borderRadius: 6, cursor: suspect ? 'not-allowed' : 'pointer', fontWeight: 500,
  }
}
function smallBtn(background: string, active: boolean): React.CSSProperties {
  return {
    fontSize: 13, padding: '4px 12px', background, color: active ? '#fff' : '#9ca3af',
    border: 'none', borderRadius: 6, cursor: active ? 'pointer' : 'not-allowed',
  }
}
const cancelBtn: React.CSSProperties = {
  fontSize: 13, padding: '6px 14px', background: '#6b7280', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
}
