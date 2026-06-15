import type { RxJsonSchema } from 'rxdb'
import { FieldKind, type TableDescriptor, type RowRecord } from '@gammaray/core'

// Build an RxDB collection schema from a table descriptor — the storage-side
// half of "schema-driven". One source of truth (the descriptor) drives the
// server model, the client rendering, and the local store shape.
export function rxSchemaFromDescriptor(d: TableDescriptor): RxJsonSchema<RowRecord> {
  const properties: Record<string, Record<string, unknown>> = {}

  for (const f of d.fields) {
    switch (f.kind) {
      case FieldKind.Int:
        properties[f.name] = { type: 'integer', default: 0 }
        break
      case FieldKind.Boolean:
        properties[f.name] = { type: 'boolean', default: false }
        break
      case FieldKind.Reference:
        // A soft FK: the referenced id, or null when unset.
        properties[f.name] = { type: ['string', 'null'] }
        break
      default:
        properties[f.name] = { type: 'string' }
    }
  }

  // The primary key must be a bounded string for RxDB's index.
  properties[d.identity.field] = { type: 'string', maxLength: 64 }
  // Replication checkpoints key off updatedAt; ensure it exists.
  if (!properties.updatedAt) properties.updatedAt = { type: 'string' }
  properties._deleted = { type: 'boolean', default: false }

  return {
    version: 0,
    type: 'object',
    primaryKey: d.identity.field,
    properties,
    required: [d.identity.field],
  } as RxJsonSchema<RowRecord>
}
