import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { NoteEntity, NoteRevisionEntity } from '@gammaray/database'
import { ConflictStatus } from '@gammaray/core'
import { SyncBroker } from '../sync/sync.broker'
import { ConflictResultModel, NoteModel, RevisionModel } from './note.model'

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(NoteEntity)
    private readonly notes: Repository<NoteEntity>,
    @InjectRepository(NoteRevisionEntity)
    private readonly revisions: Repository<NoteRevisionEntity>,
    private readonly dataSource: DataSource,
    private readonly broker: SyncBroker,
  ) {}

  async getOrCreateNote(userId: string): Promise<NoteEntity> {
    let note = await this.notes.findOneBy({ userId })
    if (!note) {
      note = await this.notes.save(this.notes.create({ userId, content: '', version: 0 }))
    }
    return note
  }

  async getRevisions(userId: string): Promise<NoteRevisionEntity[]> {
    const note = await this.getOrCreateNote(userId)
    return this.revisions.find({
      where: { noteId: note.id },
      order: { createdAt: 'DESC' },
    })
  }

  async pushNote(
    userId: string,
    content: string,
    expectedVersion: number,
    clientId: string,
  ): Promise<ConflictResultModel> {
    return this.dataSource.transaction(async (manager) => {
      const noteRepo = manager.getRepository(NoteEntity)
      const revRepo = manager.getRepository(NoteRevisionEntity)

      // Row-level lock prevents concurrent writes from racing
      const note = await noteRepo
        .createQueryBuilder('note')
        .where('note.userId = :userId', { userId })
        .setLock('pessimistic_write')
        .getOne()

      // First-ever note for this user
      if (!note) {
        const created = await noteRepo.save(
          noteRepo.create({ userId, content, version: 1 }),
        )
        const rev = await revRepo.save(
          revRepo.create({
            noteId: created.id,
            content,
            version: 1,
            clientId,
            conflictStatus: ConflictStatus.None,
          }),
        )
        this.broker.emit(userId, toNoteModel(created))
        return { conflict: false, note: toNoteModel(created), revision: toRevisionModel(rev) }
      }

      if (note.version !== expectedVersion) {
        // Save the rejected client revision for audit trail
        const rev = await revRepo.save(
          revRepo.create({
            noteId: note.id,
            content,
            version: note.version,
            clientId,
            conflictStatus: ConflictStatus.Detected,
          }),
        )
        return {
          conflict: true,
          serverVersion: note.version,
          serverContent: note.content,
          revision: toRevisionModel(rev),
        }
      }

      const nextVersion = note.version + 1
      await noteRepo.update(note.id, { content, version: nextVersion })
      const updated = { ...note, content, version: nextVersion, updatedAt: new Date() }

      const rev = await revRepo.save(
        revRepo.create({
          noteId: note.id,
          content,
          version: nextVersion,
          clientId,
          conflictStatus: ConflictStatus.None,
        }),
      )

      this.broker.emit(userId, toNoteModel(updated as NoteEntity))
      return { conflict: false, note: toNoteModel(updated as NoteEntity), revision: toRevisionModel(rev) }
    })
  }

  async resolveConflict(
    userId: string,
    noteId: string,
    resolvedContent: string,
    clientId: string,
  ): Promise<NoteModel> {
    return this.dataSource.transaction(async (manager) => {
      const noteRepo = manager.getRepository(NoteEntity)
      const revRepo = manager.getRepository(NoteRevisionEntity)

      const note = await noteRepo
        .createQueryBuilder('note')
        .where('note.id = :noteId AND note.userId = :userId', { noteId, userId })
        .setLock('pessimistic_write')
        .getOneOrFail()

      const nextVersion = note.version + 1
      await noteRepo.update(note.id, { content: resolvedContent, version: nextVersion })

      await revRepo.save(
        revRepo.create({
          noteId: note.id,
          content: resolvedContent,
          version: nextVersion,
          clientId,
          conflictStatus: ConflictStatus.Resolved,
          resolvedContent,
        }),
      )

      // Mark all detected-but-unresolved revisions as resolved
      await revRepo
        .createQueryBuilder()
        .update()
        .set({ conflictStatus: ConflictStatus.Resolved, resolvedContent })
        .where('noteId = :noteId AND conflictStatus = :s', {
          noteId: note.id,
          s: ConflictStatus.Detected,
        })
        .execute()

      const result = { ...note, content: resolvedContent, version: nextVersion, updatedAt: new Date() }
      this.broker.emit(userId, toNoteModel(result as NoteEntity))
      return toNoteModel(result as NoteEntity)
    })
  }
}

function toNoteModel(e: NoteEntity): NoteModel {
  const m = new NoteModel()
  m.id = e.id
  m.content = e.content
  m.version = e.version
  m.updatedAt = e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt)
  return m
}

function toRevisionModel(e: NoteRevisionEntity): RevisionModel {
  const m = new RevisionModel()
  m.id = e.id
  m.noteId = e.noteId
  m.content = e.content
  m.version = e.version
  m.clientId = e.clientId
  m.conflictStatus = e.conflictStatus
  m.resolvedContent = e.resolvedContent
  m.createdAt = e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt)
  return m
}
