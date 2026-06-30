import type { TableDescriptor } from '@gammaray/core'

// Per-app configuration of the generic client runtime. An app calls
// configureClient() exactly once — in practice by importing the runtime through
// a single app-client module whose top-level code runs configureClient before
// anything touches the database or registry.
export interface ClientConfig {
  /** IndexedDB database name. Unique per app so two apps on the same origin
   *  don't collide (e.g. 'rolodex' vs 'music'). */
  dbName: string
  /** The app's type-A tables — drives the RxDB collections, the descriptor
   *  registry, and every `<RecordPage>`. */
  descriptors: TableDescriptor[]
  /** Non-type-A collections the app also wants in the same RxDB database — an
   *  escape hatch for app-specific stores that aren't descriptor-driven type-A
   *  tables. Keyed by collection name; `schema` is an RxDB JSON schema (kept loose
   *  so apps needn't import RxDB types). */
  extraCollections?: Record<string, { schema: unknown }>
}

let config: ClientConfig | null = null

/** Configure the client runtime for an app. Call once, before any DB/registry
 *  access. */
export function configureClient(c: ClientConfig): void {
  config = c
}

export function clientConfig(): ClientConfig {
  if (!config) {
    throw new Error(
      '@gammaray/client: configureClient() was not called before using the runtime. ' +
        'Import the runtime through your app-client module so its config is set first.',
    )
  }
  return config
}
