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
