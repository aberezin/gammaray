import { replicateRxCollection } from 'rxdb/plugins/replication'
import { Observable } from 'rxjs'
import type { RxCollection } from 'rxdb'
import type { GraphQLClient } from 'graphql-request'
import { contactDescriptor, type RowRecord } from '@gammaray/core'

// Pull the full set (read), and push local creates (create). Update/Delete and
// a live pull stream come in later increments. The pull query's field list is
// derived from the descriptor — schema-driven.
const PULL_FIELDS = contactDescriptor.fields.map((f) => f.name).join(' ')
// `deleted` is a system tombstone field (not in the descriptor); pull it so
// deletions propagate, then map it onto RxDB's native `_deleted`.
const PULL_CONTACTS = `query { contacts { ${PULL_FIELDS} deleted } }`

const PUSH_CONTACT = `
  mutation PushContact($input: ContactInput!, $expectedVersion: Int!, $clientId: String!) {
    pushContact(input: $input, expectedVersion: $expectedVersion, clientId: $clientId) {
      conflict
      serverVersion
      serverData
      contact { ${PULL_FIELDS} }
    }
  }
`

const RESOLVE_CONTACT = `
  mutation ResolveContact($input: ContactInput!, $clientId: String!) {
    resolveContactConflict(input: $input, clientId: $clientId) { ${PULL_FIELDS} }
  }
`

interface PushContactResult {
  pushContact: {
    conflict: boolean
    serverVersion: number | null
    serverData: string | null
    contact: RowRecord | null
  }
}

export type ContactConflictHandler = (opts: {
  contactId: string
  serverVersion: number
  serverData: Record<string, unknown>
  clientData: Record<string, unknown>
}) => void

export async function resolveContact(
  gqlClient: GraphQLClient,
  input: Record<string, unknown>,
  clientId: string,
): Promise<RowRecord> {
  const data = await gqlClient.request<{ resolveContactConflict: RowRecord }>(RESOLVE_CONTACT, {
    input,
    clientId,
  })
  return data.resolveContactConflict
}

export function startContactReplication(
  collection: RxCollection<RowRecord>,
  gqlClient: GraphQLClient,
  clientId: string,
  onConflict?: ContactConflictHandler,
) {
  return replicateRxCollection<RowRecord, { pulledAt: string }>({
    collection,
    replicationIdentifier: 'contacts-gql',
    live: true, // keep watching for local creates to push
    retryTime: 5_000,
    pull: {
      batchSize: 1000,
      async handler() {
        const data = await gqlClient.request<{ contacts: Array<RowRecord & { deleted?: boolean }> }>(
          PULL_CONTACTS,
        )
        const documents = (data.contacts ?? []).map((c) => {
          const { deleted, ...rest } = c
          return { ...rest, _deleted: !!deleted }
        })
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
          deleted: doc._deleted === true,
        }

        const data = await gqlClient.request<PushContactResult>(PUSH_CONTACT, {
          input,
          expectedVersion,
          clientId,
        })
        const result = data.pushContact

        // Delete: the server soft-deleted the row; keep the local tombstone.
        // (Delete-vs-edit conflict handling is a follow-up.)
        if (input.deleted) return []

        if (result.conflict && result.serverData != null) {
          const serverData = JSON.parse(result.serverData) as Record<string, unknown>
          // Capture the client's attempted row before RxDB overwrites the local
          // doc with the server state below.
          onConflict?.({
            contactId: input.id,
            serverVersion: result.serverVersion ?? 0,
            serverData,
            clientData: input,
          })
          // Reconcile the local doc to the server state so it isn't stuck; the
          // user's edit is held in the conflict UI for resolution.
          return [{ ...doc, ...serverData, _deleted: false }]
        }

        // Success: return the server row so RxDB reconciles the local version.
        if (result.contact) {
          return [{ ...doc, ...result.contact, _deleted: false }]
        }
        return []
      },
    },
  })
}
