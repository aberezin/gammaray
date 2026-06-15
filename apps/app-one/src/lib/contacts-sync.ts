import { replicateRxCollection } from 'rxdb/plugins/replication'
import { createClient } from 'graphql-ws'
import { Observable } from 'rxjs'
import type { RxCollection } from 'rxdb'
import type { GraphQLClient } from 'graphql-request'
import { contactDescriptor, type RowRecord } from '@gammaray/core'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

// Pull the full set, push local writes, and receive live changes from other
// clients over a WebSocket subscription. The field list is derived from the
// descriptor — schema-driven.
const PULL_FIELDS = contactDescriptor.fields.map((f) => f.name).join(' ')
// `deleted` is a system tombstone field (not in the descriptor); carry it so
// deletions propagate, then map it onto RxDB's native `_deleted`.
const PULL_CONTACTS = `query { contacts { ${PULL_FIELDS} deleted } }`
const CONTACT_UPDATED_SUB = `subscription { contactUpdated { ${PULL_FIELDS} deleted } }`

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
  accessToken: string,
  clientId: string,
  onConflict?: ContactConflictHandler,
) {
  const wsClient = createClient({
    url: `${WS_URL}/graphql`,
    connectionParams: { Authorization: `Bearer ${accessToken}` },
  })

  const replication = replicateRxCollection<RowRecord, { pulledAt: string }>({
    collection,
    replicationIdentifier: 'contacts-gql',
    live: true, // keep watching for local writes to push
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
      // Live changes from any client arrive over the global contactUpdated
      // subscription and flow straight into the local store.
      stream$: new Observable((subscriber) => {
        const unsub = wsClient.subscribe<{ contactUpdated: RowRecord & { deleted?: boolean } }>(
          { query: CONTACT_UPDATED_SUB },
          {
            next: ({ data }) => {
              const c = data?.contactUpdated
              if (!c) return
              const { deleted, ...rest } = c
              subscriber.next({
                documents: [{ ...rest, _deleted: !!deleted }],
                checkpoint: { pulledAt: new Date().toISOString() },
              })
            },
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          },
        )
        return unsub
      }),
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
          companyId: doc.companyId ? String(doc.companyId) : null,
          deleted: doc._deleted === true,
        }

        const data = await gqlClient.request<PushContactResult>(PUSH_CONTACT, {
          input,
          expectedVersion,
          clientId,
        })
        const result = data.pushContact

        // Conflict first — applies to a stale edit OR a stale delete.
        if (result.conflict && result.serverData != null) {
          const serverData = JSON.parse(result.serverData) as Record<string, unknown>
          // Capture the client's attempted row (incl. its delete flag) before
          // RxDB overwrites the local doc with the server state below.
          onConflict?.({
            contactId: input.id,
            serverVersion: result.serverVersion ?? 0,
            serverData,
            clientData: input,
          })
          // Reconcile the local doc to the server state so it isn't stuck — which
          // may itself be a tombstone (the other client deleted the row). The
          // user's attempt is held in the conflict UI for resolution.
          const { deleted: srvDeleted, ...srvRest } = serverData
          return [{ ...doc, ...srvRest, _deleted: srvDeleted === true }]
        }

        // Delete success: the server soft-deleted the row; keep the local tombstone.
        if (input.deleted) return []

        // Success: return the server row so RxDB reconciles the local version.
        if (result.contact) {
          return [{ ...doc, ...result.contact, _deleted: false }]
        }
        return []
      },
    },
  })

  return { replication, wsClient }
}
