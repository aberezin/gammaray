import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { NoteEntity } from './note.entity'
import { ConflictStatus } from '@gammaray/core'

@Entity('note_revisions')
export class NoteRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'note_id' })
  noteId!: string

  @ManyToOne(() => NoteEntity, (note) => note.revisions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'note_id' })
  note!: NoteEntity

  @Column({ type: 'text' })
  content!: string

  @Column({ type: 'int' })
  version!: number

  @Column({ name: 'client_id' })
  clientId!: string

  @Column({
    type: 'enum',
    enum: ConflictStatus,
    default: ConflictStatus.None,
    name: 'conflict_status',
  })
  conflictStatus!: ConflictStatus

  /** Populated when a user resolves a conflict */
  @Column({ type: 'text', nullable: true, name: 'resolved_content' })
  resolvedContent?: string | null

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
