import { createRxDatabase, removeRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import type { NoteRxDocument, RowRecord } from '@gammaray/core'
import { contactDescriptor, companyDescriptor, categoryDescriptor, tagDescriptor, contactTagDescriptor } from '@gammaray/notesync-schema'
import { rxSchemaFromDescriptor } from './rx-schema'

if (process.env.NODE_ENV === 'development') {
  addRxPlugin(RxDBDevModePlugin)
}

export type AppCollections = {
  note: RxCollection<NoteRxDocument>
  contact: RxCollection<RowRecord>
  company: RxCollection<RowRecord>
  category: RxCollection<RowRecord>
  tag: RxCollection<RowRecord>
  contact_tag: RxCollection<RowRecord>
}
export type AppDatabase = RxDatabase<AppCollections>

const DB_NAME = 'notesync'

const collections = {
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
  // The type-A collections' schemas are generated from their descriptors, so
  // they evolve whenever a descriptor field is added.
  contact: { schema: rxSchemaFromDescriptor(contactDescriptor) },
  company: { schema: rxSchemaFromDescriptor(companyDescriptor) },
  category: { schema: rxSchemaFromDescriptor(categoryDescriptor) },
  tag: { schema: rxSchemaFromDescriptor(tagDescriptor) },
  contact_tag: { schema: rxSchemaFromDescriptor(contactTagDescriptor) },
} as const

let dbPromise: Promise<AppDatabase> | null = null

async function build(): Promise<AppDatabase> {
  const db = await createRxDatabase<AppCollections>({
    name: DB_NAME,
    storage: getRxStorageDexie(),
  })
  await db.addCollections(collections)
  return db
}

export async function getDatabase(): Promise<AppDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = build().catch(async (err) => {
    // The local store is a disposable replica — the server is authoritative.
    // When a descriptor changes shape, the persisted RxDB schema no longer
    // matches (DB6), so wipe the local database and rebuild from the current
    // schema; replication re-pulls everything from the server.
    if (isSchemaMismatch(err)) {
      // eslint-disable-next-line no-console
      console.warn('[rxdb] local schema is stale; wiping and rebuilding the replica', err?.code ?? err)
      await removeRxDatabase(DB_NAME, getRxStorageDexie())
      return build()
    }
    dbPromise = null
    throw err
  })
  return dbPromise
}

// Throw away the local replica (IndexedDB/Dexie) on purpose. The local store is
// a disposable copy — the server is authoritative — so after this the caller
// should reload the page; replication then rebuilds the store and re-pulls
// everything from the server. Powers the "Reset local data" control: handy when
// the local copy has diverged (e.g. an orphaned row that can't sync) or you just
// want a clean re-download. Discards any UNSYNCED local writes — callers warn.
export async function clearLocalDatabase(): Promise<void> {
  try {
    const db = dbPromise ? await dbPromise.catch(() => null) : null
    if (db) await db.remove()
    else await removeRxDatabase(DB_NAME, getRxStorageDexie())
  } finally {
    dbPromise = null
  }
}

function isSchemaMismatch(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  const message = (err as { message?: string })?.message ?? ''
  // DB6: collection created with a different schema. DM5/DM1: migration needed.
  return code === 'DB6' || code === 'DM5' || code === 'DM1' || message.includes('different schema')
}
