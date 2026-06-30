import { ConflictStatus } from './enums'

export interface ContactDto {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  version: number
  updatedAt: string
}

export interface ContactRevisionDto {
  id: string
  contactId: string
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
