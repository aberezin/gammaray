import { replicateRxCollection } from 'rxdb/plugins/replication'
import { createClient } from 'graphql-ws'
import { Observable } from 'rxjs'
import type { RxCollection } from 'rxdb'
import type { NoteRxDocument, NoteDto, ConflictResultDto } from '@gammaray/core'
import type { GraphQLClient } from 'graphql-request'

const PULL_NOTE = `
  query {
    note { id content version updatedAt }
  }
`

const PUSH_NOTE = `
  mutation PushNote($content: String!, $expectedVersion: Int!, $clientId: String!) {
    pushNote(content: $content, expectedVersion: $expectedVersion, clientId: $clientId) {
      conflict
      serverVersion
      serverContent
      note { id content version updatedAt }
    }
  }
`

const NOTE_UPDATED_SUB = `
  subscription {
    noteUpdated { id content version updatedAt }
  }
`

const RESOLVE_CONFLICT = `
  mutation ResolveConflict($noteId: ID!, $resolvedContent: String!, $clientId: String!) {
    resolveConflict(noteId: $noteId, resolvedContent: $resolvedContent, clientId: $clientId) {
      id content version updatedAt
    }
  }
`

export type ConflictHandler = (opts: {
  serverContent: string
  serverVersion: number
  noteId: string
}) => void

export function startReplication(
  collection: RxCollection<NoteRxDocument>,
  gqlClient: GraphQLClient,
  accessToken: string,
  clientId: string,
  onConflict: ConflictHandler,
) {
  const wsClient = createClient({
    url: `${process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'}/graphql`,
    connectionParams: { Authorization: `Bearer ${accessToken}` },
  })

  const replication = replicateRxCollection<NoteRxDocument, { id: string; updatedAt: string }>({
    collection,
    replicationIdentifier: 'notesync-gql',
    live: true,
    retryTime: 5_000,

    pull: {
      async handler(_lastCheckpoint, _batchSize) {
        const data = await gqlClient.request<{ note: NoteDto | null }>(PULL_NOTE)
        const note = data.note
        if (!note) return { documents: [], checkpoint: null }
        return {
          documents: [{ ...note, _deleted: false }],
          checkpoint: { id: note.id, updatedAt: note.updatedAt },
        }
      },
      stream$: new Observable((subscriber) => {
        const unsub = wsClient.subscribe<{ noteUpdated: NoteDto }>(
          { query: NOTE_UPDATED_SUB },
          {
            next: ({ data }) => {
              if (data?.noteUpdated) {
                const note = data.noteUpdated
                subscriber.next({
                  documents: [{ ...note, _deleted: false }],
                  checkpoint: { id: note.id, updatedAt: note.updatedAt },
                })
              }
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
        const expectedVersion = (row.assumedMasterState as NoteRxDocument | undefined)?.version ?? 0

        const data = await gqlClient.request<{ pushNote: ConflictResultDto & { note: NoteDto | null } }>(
          PUSH_NOTE,
          { content: doc.content, expectedVersion, clientId },
        )

        const result = data.pushNote
        if (result.conflict && result.serverContent != null && result.serverVersion != null) {
          onConflict({
            serverContent: result.serverContent,
            serverVersion: result.serverVersion,
            noteId: doc.id,
          })
          // Return server state as master so RxDB knows the real state
          return [{ ...doc, content: result.serverContent, version: result.serverVersion, _deleted: false }]
        }
        return []
      },
    },
  })

  return { replication, wsClient }
}

export async function resolveConflict(
  gqlClient: GraphQLClient,
  noteId: string,
  resolvedContent: string,
  clientId: string,
): Promise<NoteDto> {
  const data = await gqlClient.request<{ resolveConflict: NoteDto }>(RESOLVE_CONFLICT, {
    noteId,
    resolvedContent,
    clientId,
  })
  return data.resolveConflict
}
