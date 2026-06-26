import { FieldKind, type FieldDescriptor, type TableDescriptor } from '@gammaray/core'
import { notesyncDescriptors } from '@gammaray/notesync-schema'

// The client-side descriptor registry — the analog of the server's RowRegistry.
// One source of truth (the example app's `notesyncDescriptors`) drives the RxDB
// collections, the generic RecordPage, and all descriptor-derived wiring, so a
// new type-A table is a descriptor + one array entry, not edits scattered across
// the client.

export const descriptors: TableDescriptor[] = notesyncDescriptors

export const descriptorByCollection: Record<string, TableDescriptor> = Object.fromEntries(
  descriptors.map((d) => [d.collection, d]),
)

export const descriptorByTable: Record<string, TableDescriptor> = Object.fromEntries(
  descriptors.map((d) => [d.table, d]),
)

export function getDescriptor(collection: string): TableDescriptor {
  const d = descriptorByCollection[collection]
  if (!d) throw new Error(`No descriptor registered for collection "${collection}"`)
  return d
}

/**
 * Collections this descriptor references — Reference targets plus MultiReference
 * join + target collections — excluding itself (a self-reference is served by
 * the primary collection's own subscription).
 */
export function referencedCollectionsOf(d: TableDescriptor): string[] {
  const set = new Set<string>()
  for (const f of d.fields) {
    if (f.kind === FieldKind.Reference && f.references) set.add(f.references.collection)
    if (f.kind === FieldKind.MultiReference && f.via) {
      set.add(f.via.joinCollection)
      set.add(f.via.targetCollection)
    }
  }
  set.delete(d.collection)
  return [...set]
}

/**
 * Every collection a RecordPage for this descriptor must subscribe to and
 * replicate: the primary plus everything it references (so e.g. a contact page
 * also keeps company / tag / contact_tag live).
 */
export function collectionsForPage(d: TableDescriptor): string[] {
  return [d.collection, ...referencedCollectionsOf(d)]
}

/** Reference (many-to-one) fields that carry a `references` target. */
export function referenceFields(d: TableDescriptor): FieldDescriptor[] {
  return d.fields.filter((f) => f.kind === FieldKind.Reference && f.references)
}

/** MultiReference (many-to-many) fields that carry a `via` join descriptor. */
export function multiReferenceFields(d: TableDescriptor): FieldDescriptor[] {
  return d.fields.filter((f) => f.kind === FieldKind.MultiReference && f.via)
}

/** Fields a create/update writes: not read-only, not the virtual MultiReference. */
export function writableFields(d: TableDescriptor): FieldDescriptor[] {
  return d.fields.filter((f) => !f.readOnly && f.kind !== FieldKind.MultiReference)
}

/** The field used to label a row (first of `display.titleFields`). */
export function titleFieldOf(d: TableDescriptor): string {
  return d.display.titleFields[0] ?? d.identity.field
}

/**
 * Referenced sibling collections that should get an inline "quick add" control
 * (e.g. the contact page's "Add company" / "Add tag"): the Reference targets and
 * MultiReference *target* collections, minus the primary itself (you create
 * those with the page's own New button) and minus join collections (rows there
 * are created by reconciling a MultiReference, never directly).
 */
export function quickAddTargetsOf(
  d: TableDescriptor,
): Array<{ collection: string; titleField: string; label: string }> {
  const joinCollections = new Set(
    multiReferenceFields(d).map((f) => f.via!.joinCollection),
  )
  const targets = new Set<string>()
  for (const f of referenceFields(d)) targets.add(f.references!.collection)
  for (const f of multiReferenceFields(d)) targets.add(f.via!.targetCollection)
  targets.delete(d.collection)
  return [...targets]
    .filter((c) => !joinCollections.has(c))
    .map((collection) => {
      const target = getDescriptor(collection)
      // Lowercase collection name — matches the existing "Add company" / "Add tag"
      // control labels and "New company name" placeholders.
      return { collection, titleField: titleFieldOf(target), label: collection }
    })
}
