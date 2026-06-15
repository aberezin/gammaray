import { FieldKind, MergeStrategyKind, type TableDescriptor } from './descriptors'

// 3-way merge of a row against its common ancestor, per the table's merge
// strategy. Shared by client and server so they agree on outcomes. `base` is the
// ancestor snapshot (the revision at the client's expectedVersion); `ours` is the
// client's pushed row; `theirs` is the current server row.
export type MergeResult =
  | { ok: true; merged: Record<string, unknown> }
  | { ok: false; conflictingFields: string[] }

function dataFields(d: TableDescriptor): string[] {
  return d.fields.filter((f) => !f.readOnly && f.kind !== FieldKind.Uuid).map((f) => f.name)
}

function eq(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '')
}

export function mergeRows(
  descriptor: TableDescriptor,
  base: Record<string, unknown> | null,
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
): MergeResult {
  const fields = dataFields(descriptor)

  switch (descriptor.mergeStrategy) {
    case MergeStrategyKind.LastWriteWins: {
      const merged: Record<string, unknown> = { ...theirs }
      for (const f of fields) merged[f] = ours[f]
      return { ok: true, merged }
    }

    case MergeStrategyKind.DisjointFields: {
      // Need the ancestor to tell who changed what; without it, fall back to
      // conflict (see ADR 0001 — truncating ancestors degrades to 2-way).
      if (!base) return { ok: false, conflictingFields: fields }
      const merged: Record<string, unknown> = { ...theirs }
      const conflictingFields: string[] = []
      for (const f of fields) {
        const ourChanged = !eq(ours[f], base[f])
        const theirChanged = !eq(theirs[f], base[f])
        if (ourChanged && theirChanged && !eq(ours[f], theirs[f])) {
          conflictingFields.push(f) // both edited the same field differently
        } else if (ourChanged && !theirChanged) {
          merged[f] = ours[f] // only we changed it → take ours (theirs kept otherwise)
        }
      }
      return conflictingFields.length ? { ok: false, conflictingFields } : { ok: true, merged }
    }

    case MergeStrategyKind.WholeRow:
    case MergeStrategyKind.Custom:
    default: {
      // Any real divergence is a conflict; identical content is not.
      const changed = fields.filter((f) => !eq(ours[f], theirs[f]))
      return changed.length ? { ok: false, conflictingFields: changed } : { ok: true, merged: { ...theirs } }
    }
  }
}
