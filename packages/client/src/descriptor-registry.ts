import { FieldKind, type FieldDescriptor, type TableDescriptor } from '@gammaray/core'
import { clientConfig } from './config'

// The client-side descriptor registry — the analog of the server's RowRegistry.
// The descriptor set is supplied per app via configureClient() (rolodex's
// `rolodexDescriptors`, music's `musicDescriptors`, …), so this package is
// app-agnostic: it drives the RxDB collections, the generic RecordPage, and all
// descriptor-derived wiring from whatever descriptors the app registered.

/** The registered app's descriptors (set via configureClient). */
export function allDescriptors(): TableDescriptor[] {
  return clientConfig().descriptors
}

export function getDescriptor(collection: string): TableDescriptor {
  const d = allDescriptors().find((x) => x.collection === collection)
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

/** The (collection, titleField) a Reference/MultiReference field points at. */
export function referenceTargetOf(f: FieldDescriptor): { collection: string; titleField: string } | null {
  if (f.kind === FieldKind.Reference && f.references) return { collection: f.references.collection, titleField: f.references.titleField }
  if (f.kind === FieldKind.MultiReference && f.via) return { collection: f.via.targetCollection, titleField: f.via.titleField }
  return null
}

/** A reference field that opts into at-scale server search (large target). */
export function isSearchable(f: FieldDescriptor): boolean {
  return f.searchable === true && (f.kind === FieldKind.Reference || f.kind === FieldKind.MultiReference)
}

/** Target collections fetched on demand (server search) — NOT replicated. */
export function searchableTargetCollections(d: TableDescriptor): Set<string> {
  const set = new Set<string>()
  for (const f of d.fields) {
    if (isSearchable(f)) {
      const t = referenceTargetOf(f)
      if (t) set.add(t.collection)
    }
  }
  return set
}

/**
 * Collections the page replicates locally: everything in collectionsForPage
 * except searchable targets (those are fetched on demand via searchRows /
 * rowsByIds). The primary, all join collections, and small non-searchable target
 * collections stay live (so offline create + quick-add still work for them).
 */
export function replicatedCollectionsForPage(d: TableDescriptor): string[] {
  const searchable = searchableTargetCollections(d)
  return collectionsForPage(d).filter((c) => !searchable.has(c))
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
  // Searchable (large) targets are managed on their own page, not quick-added —
  // and they aren't replicated, so we couldn't show their existing-row chips.
  const searchable = searchableTargetCollections(d)
  const targets = new Set<string>()
  for (const f of referenceFields(d)) targets.add(f.references!.collection)
  for (const f of multiReferenceFields(d)) targets.add(f.via!.targetCollection)
  targets.delete(d.collection)
  return [...targets]
    .filter((c) => !joinCollections.has(c) && !searchable.has(c))
    .map((collection) => {
      const target = getDescriptor(collection)
      // Lowercase collection name — matches the existing "Add company" / "Add tag"
      // control labels and "New company name" placeholders.
      return { collection, titleField: titleFieldOf(target), label: collection }
    })
}
