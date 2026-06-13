import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm'
import { UserEntity } from './user.entity'
import { NoteRevisionEntity } from './note-revision.entity'

@Entity('notes')
export class NoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'user_id' })
  userId!: string

  @ManyToOne(() => UserEntity, (user) => user.note, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity

  @Column({ type: 'text', default: '' })
  content!: string

  @Column({ type: 'int', default: 0 })
  version!: number

  /** Escape hatch for schema evolution — promote fields to columns when stable */
  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date

  @OneToMany(() => NoteRevisionEntity, (rev) => rev.note)
  revisions?: NoteRevisionEntity[]
}
