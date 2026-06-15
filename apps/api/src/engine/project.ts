import { FieldKind, type TableDescriptor } from '@gammaray/core'

// Project a row (entity or snapshot) to exactly the descriptor's wire shape:
// its stored fields (everything except virtual MultiReference) plus `deleted`.
// This keeps the generic JSON `rows`/`rowUpdated` payloads identical to the old
// typed per-table queries, so the client needs no extra field stripping.
export function projectToDescriptor(
  descriptor: TableDescriptor,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of descriptor.fields) {
    if (f.kind === FieldKind.MultiReference) continue
    out[f.name] = row[f.name] ?? null
  }
  out.deleted = row.deleted === true
  return out
}
