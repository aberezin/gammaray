import type { EntityManager } from 'typeorm'
import type { TableDescriptor } from '@gammaray/core'

export type ChangeOp = 'UPSERT' | 'DELETE'
export type ChangeStatus = 'APPLIED' | 'CONFLICT' | 'REJECTED'

// One row change on the wire / in a batch.
export interface RowChangeInput {
  table: string
  id: string
  op: ChangeOp
  data: Record<string, unknown>
  expectedVersion: number
}

// The result of applying a single change, within the batch transaction.
export interface ApplyOutcome {
  status: ChangeStatus
  /** APPLIED: the new row; CONFLICT: the current server row (for the merge UI).
   *  An entity or a plain snapshot; the batch normalizes it to JSON. */
  row?: object | null
  serverVersion?: number
  reason?: string
  /** Applied row to broadcast live after commit. */
  emit?: object | null
}

// Per-table apply unit. The batch coordinator owns the transaction and ordering;
// an applier just reconciles one row against the given manager.
export interface RowApplier {
  table: string
  descriptor: TableDescriptor
  apply(manager: EntityManager, change: RowChangeInput, clientId: string): Promise<ApplyOutcome>
  /** Broadcast an applied row to live subscribers (called after commit). */
  emitLive(row: Record<string, unknown>): void
}
