// The music app's single entry to the generic client runtime. Importing the
// runtime through THIS module guarantees configureClient() runs before anything
// touches the database or registry. Crate has no bespoke collections (no `note`),
// so it's pure descriptors — proof the runtime is driven entirely by config.
import { configureClient } from '@gammaray/client'
import { musicDescriptors } from '@gammaray/music-schema'

configureClient({
  dbName: 'music',
  descriptors: musicDescriptors,
})

export * from '@gammaray/client'
