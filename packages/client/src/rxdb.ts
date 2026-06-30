import { createRxDatabase, removeRxDatabase, addRxPlugin, RxDatabase, RxCollection } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import type { RowRecord } from '@gammaray/core'
import { clientConfig } from './config'
import { rxSchemaFromDescriptor } from './rx-schema'

if (process.env.NODE_ENV === 'development') {
  addRxPlugin(RxDBDevModePlugin)
}

// The database holds the app's type-A collections (all `RowRecord`) plus any
// extra collections the app declared (e.g. notesync's `note`). It's keyed by
// name; typed access goes through the helpers below.
export type ClientDatabase = RxDatabase<Record<string, RxCollection>>

// Access a type-A collection by name (descriptor-driven code holds the
// collection as a string). All type-A collections are RxCollection<RowRecord>;
// this isolates the unavoidable dynamic-index cast.
export function rowCollection(db: ClientDatabase, collection: string): RxCollection<RowRecord> {
  return (db.collections as unknown as Record<string, RxCollection<RowRecord>>)[collection]
}

// Access a non-type-A (extra) collection with its own document type — the
// configureClient({ extraCollections }) escape hatch for app-specific stores that
// aren't descriptor-driven type-A tables.
export function getCollection<T>(db: ClientDatabase, name: string): RxCollection<T> {
  return (db.collections as unknown as Record<string, RxCollection<T>>)[name]
}

// Type-A collection schemas are generated from the registered descriptors, so a
// new type-A table needs no edit here — add it to the app's descriptor set
// (configureClient). Extra collections (e.g. `note`) come from app config.
// Schemas evolve automatically when a descriptor field changes; a stale
// persisted schema is wiped + rebuilt (see getDatabase's DB6 handling).
function buildCollections(): Record<string, { schema: unknown }> {
  const cfg = clientConfig()
  return {
    ...(cfg.extraCollections ?? {}),
    ...Object.fromEntries(cfg.descriptors.map((d) => [d.collection, { schema: rxSchemaFromDescriptor(d) }])),
  }
}

let dbPromise: Promise<ClientDatabase> | null = null

async function build(): Promise<ClientDatabase> {
  const db = await createRxDatabase({
    name: clientConfig().dbName,
    storage: getRxStorageDexie(),
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.addCollections(buildCollections() as any)
  return db as unknown as ClientDatabase
}

export async function getDatabase(): Promise<ClientDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = build().catch(async (err) => {
    // The local store is a disposable replica — the server is authoritative.
    // When a descriptor changes shape, the persisted RxDB schema no longer
    // matches (DB6), so wipe the local database and rebuild from the current
    // schema; replication re-pulls everything from the server.
    if (isSchemaMismatch(err)) {
      // eslint-disable-next-line no-console
      console.warn('[rxdb] local schema is stale; wiping and rebuilding the replica', (err as { code?: string })?.code ?? err)
      await removeRxDatabase(clientConfig().dbName, getRxStorageDexie())
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
// everything. Powers the "Reset local copy" control. Discards any UNSYNCED local
// writes — callers warn.
export async function clearLocalDatabase(): Promise<void> {
  try {
    const db = dbPromise ? await dbPromise.catch(() => null) : null
    if (db) await db.remove()
    else await removeRxDatabase(clientConfig().dbName, getRxStorageDexie())
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
