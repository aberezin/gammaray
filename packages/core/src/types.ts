import { ConflictStatus } from './enums'

export interface NoteDto {
  id: string
  content: string
  version: number
  updatedAt: string
}

export interface RevisionDto {
  id: string
  noteId: string
  content: string
  version: number
  clientId: string
  conflictStatus: ConflictStatus
  resolvedContent?: string | null
  createdAt: string
}

export interface ConflictResultDto {
  conflict: boolean
  note?: NoteDto | null
  revision?: RevisionDto | null
  /** The current server version when a conflict was detected */
  serverVersion?: number | null
  /** The server's content when a conflict was detected */
  serverContent?: string | null
}

/** Shape of a document stored in the RxDB notes collection */
export interface NoteRxDocument {
  id: string
  content: string
  version: number
  updatedAt: string
  _deleted: boolean
}

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
