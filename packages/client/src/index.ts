// @gammaray/client — the generic type-A client runtime (the client-side analog
// of the server's generic row engine). An app configures it once with its
// descriptor set + db name (configureClient) and then renders `<RecordPage>`
// per table; everything else (subscriptions, replication, reference pickers,
// m2m materialization, CRUD, history, conflicts, sync-health, reslate) is
// derived. App-specific (e.g. note) UI does NOT live here.

export { configureClient, type ClientConfig } from './config'
export {
  getDatabase,
  clearLocalDatabase,
  rowCollection,
  getCollection,
  type ClientDatabase,
} from './rxdb'
export { rxSchemaFromDescriptor } from './rx-schema'
export {
  allDescriptors,
  getDescriptor,
  referencedCollectionsOf,
  collectionsForPage,
  referenceFields,
  multiReferenceFields,
  writableFields,
  titleFieldOf,
  quickAddTargetsOf,
} from './descriptor-registry'
export { startRowReplication, BatchCoordinator, type RowConflict } from './batch-sync'
export { makeGqlClient } from './graphql-client'
export { primeToken, getAccessToken, invalidateToken, type TokenGetter } from './token'
export {
  useSyncHealth,
  syncHealth,
  type SyncError,
  type SyncErrorKind,
} from './sync-health.store'
export {
  useRecordPage,
  type ReferenceOption,
  type RecordConflict,
  type UseRecordPage,
  type QuickAddTarget,
} from './use-record-page'
export { RecordPage } from './RecordPage'
export { ResetLocalButton } from './ResetLocalButton'
export { SyncHealthBanner } from './SyncHealthBanner'
export { DataEpochGuard } from './DataEpochGuard'
