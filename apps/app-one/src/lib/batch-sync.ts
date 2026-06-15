import { replicateRxCollection } from 'rxdb/plugins/replication'
import { createClient } from 'graphql-ws'
import { Observable } from 'rxjs'
import type { RxCollection, WithDeleted } from 'rxdb'
import type { GraphQLClient } from 'graphql-request'
import { FieldKind, type RowRecord, type TableDescriptor } from '@gammaray/core'

type SyncDoc = WithDeleted<RowRecord>

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

const PUSH_BATCH = `
  mutation PushBatch($changes: [RowChange!]!, $clientId: String!) {
    pushBatch(changes: $changes, clientId: $clientId) {
      results { table id status row serverVersion reason }
    }
  }
`

interface BatchRowResult {
  table: string
  id: string
  status: 'APPLIED' | 'CONFLICT' | 'REJECTED'
  row: (Record<string, unknown> & { deleted?: boolean }) | null
  serverVersion: number | null
  reason: string | null
}

export interface RowConflict {
  table: string
  id: string
  serverData: Record<string, unknown>
  clientData: Record<string, unknown>
  serverVersion: number
}

// A buffered row awaiting the next batch flush, tied to the push.handler call
// that produced it so its conflicts can be returned to RxDB.
interface Buffered {
  table: string
  doc: RowRecord
  expectedVersion: number
}
interface PushCall {
  table: string
  ids: string[]
  resolve: (conflicts: SyncDoc[]) => void
  reject: (err: unknown) => void
}

// Coordinates pushes across collections into ONE atomic pushBatch. Each
// collection's push.handler calls enqueue(); a short debounce lets sibling
// collections (e.g. a company + a contact referencing it) ride the same batch,
// which is what makes the offline parent+child case atomic.
export class BatchCoordinator {
  private buffer: Buffered[] = []
  private calls: PushCall[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly descriptors = new Map<string, TableDescriptor>()
  // Latest known server version per row, learned from batch results. Used as the
  // expectedVersion so rapid successive edits don't depend on RxDB's reconcile
  // (assumedMasterState) having caught up.
  private readonly versions = new Map<string, number>()

  constructor(
    private readonly gqlClient: GraphQLClient,
    private readonly clientId: string,
    private readonly onConflict?: (c: RowConflict) => void,
  ) {}

  register(descriptor: TableDescriptor) {
    this.descriptors.set(descriptor.table, descriptor)
  }

  enqueue(table: string, rows: Array<{ newDocumentState: RowRecord; assumedMasterState?: RowRecord }>) {
    return new Promise<SyncDoc[]>((resolve, reject) => {
      for (const r of rows) {
        this.buffer.push({
          table,
          doc: r.newDocumentState,
          expectedVersion: Number((r.assumedMasterState as RowRecord | undefined)?.version ?? 0),
        })
      }
      this.calls.push({ table, ids: rows.map((r) => String(r.newDocumentState.id)), resolve, reject })
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.flush(), 60)
    })
  }

  private async flush() {
    const buffered = this.buffer
    const calls = this.calls
    this.buffer = []
    this.calls = []
    if (!buffered.length) return

    const changes = buffered.map((b) => {
      const key = `${b.table}:${String(b.doc.id)}`
      return {
        table: b.table,
        id: String(b.doc.id),
        op: b.doc._deleted ? 'DELETE' : 'UPSERT',
        data: this.dataFor(b.table, b.doc),
        expectedVersion: this.versions.has(key) ? (this.versions.get(key) as number) : b.expectedVersion,
      }
    })

    let results: BatchRowResult[]
    try {
      const data = await this.gqlClient.request<{ pushBatch: { results: BatchRowResult[] } }>(
        PUSH_BATCH,
        { changes, clientId: this.clientId },
      )
      results = data.pushBatch.results
    } catch (err) {
      calls.forEach((c) => c.reject(err))
      return
    }

    // Learn the authoritative version of each row for the next push.
    for (const r of results) {
      const key = `${r.table}:${r.id}`
      const applied = (r.row as { version?: number } | null)?.version
      if (r.status === 'APPLIED' && typeof applied === 'number') this.versions.set(key, applied)
      else if (r.status === 'CONFLICT' && typeof r.serverVersion === 'number') this.versions.set(key, r.serverVersion)
    }

    const byKey = new Map(results.map((r) => [`${r.table}:${r.id}`, r]))
    for (const call of calls) {
      const conflicts: SyncDoc[] = []
      for (const id of call.ids) {
        const r = byKey.get(`${call.table}:${id}`)
        if (!r) continue
        const doc = buffered.find((b) => b.table === call.table && String(b.doc.id) === id)?.doc
        if (r.status === 'CONFLICT' && r.row) {
          this.onConflict?.({
            table: call.table,
            id,
            serverData: r.row,
            clientData: doc ?? { id },
            serverVersion: r.serverVersion ?? 0,
          })
          conflicts.push(this.reconcileDoc(call.table, doc, r.row))
        } else if (r.status === 'APPLIED' && r.row) {
          // Reconcile the local version to the server's (no-op if unchanged).
          conflicts.push(this.reconcileDoc(call.table, doc, r.row))
        } else if (r.status === 'REJECTED') {
          // Genuine referential error (parent truly missing). Surface and drop
          // to avoid an infinite retry loop.
          console.error('[batch] rejected', call.table, id, r.reason)
        }
      }
      call.resolve(conflicts)
    }
  }

  private dataFor(table: string, doc: RowRecord): Record<string, unknown> {
    const descriptor = this.descriptors.get(table)
    const data: Record<string, unknown> = {}
    for (const f of descriptor?.fields ?? []) {
      if (f.kind === FieldKind.MultiReference) continue // virtual, not stored
      data[f.name] = doc[f.name]
    }
    data.id = doc.id
    return data
  }

  // Build the reconciled document RxDB should adopt. Project the server row to
  // the descriptor's fields only — the server returns the full entity (createdAt,
  // metadata, …) which aren't in the RxDB schema and would be rejected, leaving
  // assumedMasterState stale (and the next push using the wrong version).
  private reconcileDoc(
    table: string,
    local: RowRecord | undefined,
    serverRow: Record<string, unknown> & { deleted?: boolean },
  ): SyncDoc {
    const descriptor = this.descriptors.get(table)
    const doc: Record<string, unknown> = {}
    for (const f of descriptor?.fields ?? []) {
      if (f.kind === FieldKind.MultiReference) continue // virtual, not stored
      doc[f.name] = f.name in serverRow ? serverRow[f.name] : local?.[f.name]
    }
    doc.id = serverRow.id ?? local?.id
    doc._deleted = serverRow.deleted === true
    return doc as SyncDoc
  }
}

// Generic per-table replication: full pull + live `${collection}Updated` stream,
// with push routed through the shared BatchCoordinator. Pull/stream are
// descriptor-driven; push is batched across all collections sharing the
// coordinator.
export function startRowReplication(
  descriptor: TableDescriptor,
  collection: RxCollection<RowRecord>,
  gqlClient: GraphQLClient,
  accessToken: string,
  coordinator: BatchCoordinator,
) {
  coordinator.register(descriptor)
  // Virtual fields (MultiReference) aren't columns — exclude from the wire query.
  const fields = descriptor.fields
    .filter((f) => f.kind !== FieldKind.MultiReference)
    .map((f) => f.name)
    .join(' ')
  const PULL = `query { ${descriptor.listField} { ${fields} deleted } }`
  const SUB = `subscription { ${descriptor.collection}Updated { ${fields} deleted } }`

  const wsClient = createClient({
    url: `${WS_URL}/graphql`,
    connectionParams: { Authorization: `Bearer ${accessToken}` },
  })

  const toDoc = (row: RowRecord & { deleted?: boolean }): SyncDoc => {
    const { deleted, ...rest } = row
    return { ...(rest as RowRecord), _deleted: deleted === true } as SyncDoc
  }

  const replication = replicateRxCollection<RowRecord, { pulledAt: string }>({
    collection,
    replicationIdentifier: `${descriptor.table}-batch`,
    live: true,
    retryTime: 5_000,
    pull: {
      batchSize: 1000,
      async handler() {
        const data = await gqlClient.request<Record<string, Array<RowRecord & { deleted?: boolean }>>>(PULL)
        const documents = (data[descriptor.listField] ?? []).map(toDoc)
        return { documents, checkpoint: { pulledAt: new Date().toISOString() } }
      },
      stream$: new Observable((subscriber) => {
        const unsub = wsClient.subscribe<Record<string, RowRecord & { deleted?: boolean }>>(
          { query: SUB },
          {
            next: ({ data }) => {
              const row = data?.[`${descriptor.collection}Updated`]
              if (row) {
                subscriber.next({ documents: [toDoc(row)], checkpoint: { pulledAt: new Date().toISOString() } })
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
      batchSize: 50,
      handler: (rows) => coordinator.enqueue(descriptor.table, rows),
    },
  })

  return { replication, wsClient }
}
