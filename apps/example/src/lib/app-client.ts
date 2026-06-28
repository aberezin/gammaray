// The example app's single entry to the generic client runtime. Importing the
// runtime through THIS module guarantees configureClient() runs before anything
// touches the database or registry (its top-level code executes on first import,
// and every client module imports from here, not '@gammaray/client' directly).
import { configureClient } from '@gammaray/client'
import { notesyncDescriptors } from '@gammaray/notesync-schema'

// The bespoke single-note collection — notesync-specific, not a type-A table, so
// it's supplied as an extra collection rather than derived from a descriptor.
const NOTE_SCHEMA = {
  version: 0,
  type: 'object',
  primaryKey: 'id',
  properties: {
    id: { type: 'string', maxLength: 36 },
    content: { type: 'string', default: '' },
    version: { type: 'integer', default: 0 },
    updatedAt: { type: 'string' },
    _deleted: { type: 'boolean', default: false },
  },
  required: ['id', 'content', 'version', 'updatedAt'],
} as const

configureClient({
  dbName: 'notesync',
  descriptors: notesyncDescriptors,
  extraCollections: { note: { schema: NOTE_SCHEMA } },
})

export * from '@gammaray/client'
