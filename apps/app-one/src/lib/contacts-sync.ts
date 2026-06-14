import { replicateRxCollection } from 'rxdb/plugins/replication'
import type { RxCollection } from 'rxdb'
import type { GraphQLClient } from 'graphql-request'
import { contactDescriptor, type RowRecord } from '@gammaray/core'

// Read-only replication for the contact collection (increment 1). Pull the full
// set once; Create/Update/Delete and live push will extend this later.
// The pull query's field list is derived from the descriptor — schema-driven.
const PULL_FIELDS = contactDescriptor.fields.map((f) => f.name).join(' ')
const PULL_CONTACTS = `query { contacts { ${PULL_FIELDS} } }`

export function startContactReplication(
  collection: RxCollection<RowRecord>,
  gqlClient: GraphQLClient,
) {
  return replicateRxCollection<RowRecord, { pulledAt: string }>({
    collection,
    replicationIdentifier: 'contacts-gql',
    live: false, // read-only for now; no push, no live stream yet
    retryTime: 5_000,
    pull: {
      batchSize: 1000,
      async handler() {
        const data = await gqlClient.request<{ contacts: RowRecord[] }>(PULL_CONTACTS)
        const documents = (data.contacts ?? []).map((c) => ({ ...c, _deleted: false }))
        // Returning fewer docs than batchSize tells RxDB the pull is complete.
        return { documents, checkpoint: { pulledAt: new Date().toISOString() } }
      },
    },
  })
}
