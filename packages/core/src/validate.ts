import { FieldKind, type TableDescriptor } from './descriptors'

// Build-time / startup referential-integrity check for a TableDescriptor set.
// The descriptor is the single source of truth (server model, store schema, UI,
// references), so a typo in a `references.collection` or a `via.localField` would
// otherwise only surface as a confusing runtime failure. Validate the whole set
// as a closed world: every reference target, join table, and titleField must
// resolve to something in the set. Run it in each schema package's check and at
// API engine startup (RowRegistry) so typos fail fast, not in production.

export interface DescriptorValidationError {
  /** The collection whose descriptor has the problem. */
  collection: string
  /** The field involved, when the problem is field-level. */
  field?: string
  message: string
}

export function validateDescriptors(descriptors: TableDescriptor[]): DescriptorValidationError[] {
  const errors: DescriptorValidationError[] = []
  const byCollection = new Map<string, TableDescriptor>()

  for (const d of descriptors) {
    if (byCollection.has(d.collection)) {
      errors.push({ collection: d.collection, message: `duplicate collection "${d.collection}"` })
    } else {
      byCollection.set(d.collection, d)
    }
  }

  const fieldsOf = (d: TableDescriptor) => new Set(d.fields.map((f) => f.name))

  for (const d of descriptors) {
    const own = fieldsOf(d)

    // identity + title fields must be real columns on this descriptor.
    if (!own.has(d.identity.field)) {
      errors.push({ collection: d.collection, message: `identity.field "${d.identity.field}" is not a field on "${d.collection}"` })
    }
    for (const tf of d.display.titleFields) {
      if (!own.has(tf)) {
        errors.push({ collection: d.collection, message: `display.titleFields entry "${tf}" is not a field on "${d.collection}"` })
      }
    }

    for (const f of d.fields) {
      if (f.kind === FieldKind.Reference) {
        if (!f.references) {
          errors.push({ collection: d.collection, field: f.name, message: `Reference field "${f.name}" is missing "references"` })
          continue
        }
        const target = byCollection.get(f.references.collection)
        if (!target) {
          errors.push({ collection: d.collection, field: f.name, message: `Reference "${f.name}" points at unknown collection "${f.references.collection}"` })
        } else if (!fieldsOf(target).has(f.references.titleField)) {
          errors.push({ collection: d.collection, field: f.name, message: `Reference "${f.name}" titleField "${f.references.titleField}" is not a field on "${f.references.collection}"` })
        }
      } else if (f.kind === FieldKind.MultiReference) {
        if (!f.via) {
          errors.push({ collection: d.collection, field: f.name, message: `MultiReference field "${f.name}" is missing "via"` })
          continue
        }
        const join = byCollection.get(f.via.joinCollection)
        if (!join) {
          errors.push({ collection: d.collection, field: f.name, message: `MultiReference "${f.name}" points at unknown joinCollection "${f.via.joinCollection}"` })
        } else {
          const jf = fieldsOf(join)
          if (!jf.has(f.via.localField)) {
            errors.push({ collection: d.collection, field: f.name, message: `MultiReference "${f.name}" via.localField "${f.via.localField}" is not a field on join "${f.via.joinCollection}"` })
          }
          if (!jf.has(f.via.remoteField)) {
            errors.push({ collection: d.collection, field: f.name, message: `MultiReference "${f.name}" via.remoteField "${f.via.remoteField}" is not a field on join "${f.via.joinCollection}"` })
          }
        }
        const target = byCollection.get(f.via.targetCollection)
        if (!target) {
          errors.push({ collection: d.collection, field: f.name, message: `MultiReference "${f.name}" points at unknown targetCollection "${f.via.targetCollection}"` })
        } else if (!fieldsOf(target).has(f.via.titleField)) {
          errors.push({ collection: d.collection, field: f.name, message: `MultiReference "${f.name}" via.titleField "${f.via.titleField}" is not a field on target "${f.via.targetCollection}"` })
        }
      }
    }
  }

  return errors
}

/** Throw a single readable error listing every problem, or return cleanly. Use at
 *  startup (and in schema-package checks) to fail fast on a malformed set. */
export function assertValidDescriptors(descriptors: TableDescriptor[]): void {
  const errors = validateDescriptors(descriptors)
  if (errors.length === 0) return
  const lines = errors.map((e) => `  - [${e.collection}${e.field ? `.${e.field}` : ''}] ${e.message}`)
  throw new Error(`Invalid TableDescriptor set (${errors.length} error${errors.length === 1 ? '' : 's'}):\n${lines.join('\n')}`)
}
