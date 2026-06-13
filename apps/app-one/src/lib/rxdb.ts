import { createRxDatabase, addRxPlugin, RxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import type { NoteRxDocument } from '@gammaray/core'

if (process.env.NODE_ENV === 'development') {
  addRxPlugin(RxDBDevModePlugin)
}

export type NoteCollection = {
  note: import('rxdb').RxCollection<NoteRxDocument>
}
export type NoteDatabase = RxDatabase<NoteCollection>

let dbPromise: Promise<NoteDatabase> | null = null

export async function getDatabase(): Promise<NoteDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = createRxDatabase<NoteCollection>({
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
    })
    return db
  })
  return dbPromise
}
