import { replicateRxCollection } from 'rxdb/plugins/replication'
import { createClient } from 'graphql-ws'
import { Observable } from 'rxjs'
import type { RxCollection, WithDeleted } from 'rxdb'
import type { GraphQLClient } from 'graphql-request'
import { FieldKind, type RowRecord, type TableDescriptor } from '@gammaray/core'
import { getAccessToken, type TokenGetter } from './token'
import { syncHealth } from './sync-health.store'

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
//
// `bulkPull: false` (push-only) is for an at-scale `paged` table (ADR 0013): its
// list is fetched page-by-page from the server (see useRecordPage), so we must
// NOT replicate the whole collection — but local writes still need to sync. We
// keep the push path and make the bulk pull + live stream no-ops, so the local
// store only ever holds rows the user actually created/edited (bounded), and
// those still ride pushBatch.
export function startRowReplication(
  descriptor: TableDescriptor,
  collection: RxCollection<RowRecord>,
  gqlClient: GraphQLClient,
  getToken: TokenGetter,
  coordinator: BatchCoordinator,
  options?: { bulkPull?: boolean },
) {
  const bulkPull = options?.bulkPull !== false
  coordinator.register(descriptor)
  // Reads/live go through the generic engine: one rows(table)/rowUpdated(table)
  // pair over a JSON scalar, keyed by the descriptor's table. The server projects
  // each row to the descriptor's wire shape (stored fields + deleted), so the
  // payload matches what the old typed per-table queries returned.
  const table = descriptor.table
  const PULL = `query Rows($table: String!) { rows(table: $table) }`
  const SUB = `subscription RowUpdated($table: String!) { rowUpdated(table: $table) }`

  const wsClient = createClient({
    url: `${WS_URL}/graphql`,
    // A fresh token per (re)connect, so the live stream survives token rotation.
    connectionParams: async () => ({ Authorization: `Bearer ${await getToken()}` }),
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
        // Push-only (paged) table: never bulk-load the collection.
        if (!bulkPull) return { documents: [], checkpoint: { pulledAt: new Date().toISOString() } }
        const data = await gqlClient.request<{ rows: Array<RowRecord & { deleted?: boolean }> }>(PULL, { table })
        const documents = (data.rows ?? []).map(toDoc)
        return { documents, checkpoint: { pulledAt: new Date().toISOString() } }
      },
      // Push-only (paged) table: no live stream — we don't want remote updates
      // accumulating the whole collection locally. The list refreshes via pageRows.
      stream$: bulkPull
        ? new Observable((subscriber) => {
            const unsub = wsClient.subscribe<{ rowUpdated: RowRecord & { deleted?: boolean } }>(
              { query: SUB, variables: { table } },
              {
                next: ({ data }) => {
                  const row = data?.rowUpdated
                  if (row) {
                    subscriber.next({ documents: [toDoc(row)], checkpoint: { pulledAt: new Date().toISOString() } })
                  }
                },
                error: (err) => subscriber.error(err),
                complete: () => subscriber.complete(),
              },
            )
            return unsub
          })
        : new Observable<{ documents: SyncDoc[]; checkpoint: { pulledAt: string } }>(() => () => {}),
    },
    push: {
      batchSize: 50,
      handler: (rows) => coordinator.enqueue(descriptor.table, rows),
    },
  })

  // Replication-level errors (pull/stream/push transport) — the gql client
  // already reports request errors, but pull retries and the WS stream surface
  // here too. Anything other than an auth error (handled by the token getter) is
  // a server/network failure → the local replica is suspect.
  replication.error$.subscribe((err) => {
    const message = (err as { message?: string })?.message ?? 'replication error'
    if (!/unauthor|401/i.test(message)) syncHealth.markSuspect('server', message)
  })

  return { replication, wsClient }
}
