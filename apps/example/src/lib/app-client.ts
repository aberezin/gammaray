// The example app's single entry to the generic client runtime. Importing the
// runtime through THIS module guarantees configureClient() runs before anything
// touches the database or registry (its top-level code executes on first import,
// and every client module imports from here, not '@gammaray/client' directly).
import { configureClient } from '@gammaray/client'
import { notesyncDescriptors } from '@gammaray/notesync-schema'

configureClient({
  dbName: 'notesync',
  descriptors: notesyncDescriptors,
})

export * from '@gammaray/client'
