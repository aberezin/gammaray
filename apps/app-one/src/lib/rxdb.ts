import { createRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import type { NoteRxDocument, RowRecord } from '@gammaray/core'
import { contactDescriptor, companyDescriptor, categoryDescriptor } from '@gammaray/core'
import { rxSchemaFromDescriptor } from './rx-schema'

if (process.env.NODE_ENV === 'development') {
  addRxPlugin(RxDBDevModePlugin)
}

export type AppCollections = {
  note: RxCollection<NoteRxDocument>
  contact: RxCollection<RowRecord>
  company: RxCollection<RowRecord>
  category: RxCollection<RowRecord>
}
export type AppDatabase = RxDatabase<AppCollections>

let dbPromise: Promise<AppDatabase> | null = null

export async function getDatabase(): Promise<AppDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = createRxDatabase<AppCollections>({
    name: 'notesync',
    storage: getRxStorageDexie(),
  }).then(async (db) => {
    await db.addCollections({
      note: {
        schema: {
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
        },
      },
      // The contact collection's schema is generated from its descriptor — the
      // first type-A table to ride the schema-driven path end to end.
      contact: {
        schema: rxSchemaFromDescriptor(contactDescriptor),
      },
      company: {
        schema: rxSchemaFromDescriptor(companyDescriptor),
      },
      category: {
        schema: rxSchemaFromDescriptor(categoryDescriptor),
      },
    })
    return db
  })
  return dbPromise
}
