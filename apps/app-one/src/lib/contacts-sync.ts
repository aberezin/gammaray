import { replicateRxCollection } from 'rxdb/plugins/replication'
import { Observable } from 'rxjs'
import type { RxCollection } from 'rxdb'
import type { GraphQLClient } from 'graphql-request'
import { contactDescriptor, type RowRecord } from '@gammaray/core'

// Pull the full set (read), and push local creates (create). Update/Delete and
// a live pull stream come in later increments. The pull query's field list is
// derived from the descriptor — schema-driven.
const PULL_FIELDS = contactDescriptor.fields.map((f) => f.name).join(' ')
const PULL_CONTACTS = `query { contacts { ${PULL_FIELDS} } }`

const PUSH_CONTACT = `
  mutation PushContact($input: ContactInput!, $expectedVersion: Int!, $clientId: String!) {
    pushContact(input: $input, expectedVersion: $expectedVersion, clientId: $clientId) {
      conflict
      contact { ${PULL_FIELDS} }
    }
  }
`

interface PushContactResult {
  pushContact: {
    conflict: boolean
    contact: RowRecord | null
  }
}

export function startContactReplication(
  collection: RxCollection<RowRecord>,
  gqlClient: GraphQLClient,
  clientId: string,
) {
  return replicateRxCollection<RowRecord, { pulledAt: string }>({
    collection,
    replicationIdentifier: 'contacts-gql',
    live: true, // keep watching for local creates to push
    retryTime: 5_000,
    pull: {
      batchSize: 1000,
      async handler() {
        const data = await gqlClient.request<{ contacts: RowRecord[] }>(PULL_CONTACTS)
        const documents = (data.contacts ?? []).map((c) => ({ ...c, _deleted: false }))
        // Fewer docs than batchSize tells RxDB the pull is complete.
        return { documents, checkpoint: { pulledAt: new Date().toISOString() } }
      },
      // No server-pushed live stream for contacts yet; never emits.
      stream$: new Observable<never>(() => {}),
    },
    push: {
      batchSize: 1,
      async handler(rows) {
        const row = rows[0]
        if (!row) return []
        const doc = row.newDocumentState
        const assumed = row.assumedMasterState as RowRecord | undefined
        const expectedVersion = Number(assumed?.version ?? 0)

        const input = {
          id: String(doc.id),
          firstName: String(doc.firstName ?? ''),
          lastName: String(doc.lastName ?? ''),
          email: String(doc.email ?? ''),
          phone: String(doc.phone ?? ''),
        }

        const data = await gqlClient.request<PushContactResult>(PUSH_CONTACT, {
          input,
          expectedVersion,
          clientId,
        })
        const result = data.pushContact
        // Return the server row so RxDB reconciles the local version (no conflict
        // path yet — that arrives with Update).
        if (result.contact) {
          return [{ ...doc, ...result.contact, _deleted: false }]
        }
        return []
      },
    },
  })
}
