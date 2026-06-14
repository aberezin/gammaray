import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { ContactEntity } from './contact.entity'
import { ConflictStatus } from '@gammaray/core'

// One row per accepted version of a contact. Unlike the note's single `content`
// string, a contact revision stores a JSONB snapshot of all fields (`data`),
// which is what makes a field-aware structural diff possible later.
@Entity('contact_revisions')
export class ContactRevisionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ name: 'contact_id' })
  contactId!: string

  @ManyToOne(() => ContactEntity, (c) => c.revisions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contact_id' })
  contact!: ContactEntity

  /** Field-aware snapshot of the row at this version. */
  @Column({ type: 'jsonb', default: '{}' })
  data!: Record<string, unknown>

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date
}
