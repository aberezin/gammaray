import { ConflictStatus } from './enums'

/**
 * A revision of any type-A row, as returned by the generic `rowRevisions` query
 * (newest first) and rendered in the descriptor-driven history view.
 */
export interface RowRevisionDto {
  id: string
  /** JSON-encoded snapshot of the row's fields at this version. */
  data: string
  version: number
  clientId: string
  conflictStatus: ConflictStatus
  createdAt: string
}

/**
 * A generic type-A row as stored in RxDB and rendered by the descriptor-driven
 * UI. Keyed by `id`; other columns are open since the descriptor defines them.
 */
export type RowRecord = { id: string; _deleted?: boolean } & Record<string, unknown>
