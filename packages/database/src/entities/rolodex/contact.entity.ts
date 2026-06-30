import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// First type-A table: a flat contact row, no foreign keys, shared across clients.
// The primary key is client-generated (offline-first create), so PrimaryColumn —
// not PrimaryGeneratedColumn.
@Entity('contacts')
export class ContactEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '', name: 'first_name' })
  firstName!: string

  @Column({ type: 'text', default: '', name: 'last_name' })
  lastName!: string

  @Column({ type: 'text', default: '' })
  email!: string

  @Column({ type: 'text', default: '' })
  phone!: string

  @Column({ type: 'int', default: 0 })
  version!: number

  /**
   * Many-to-one soft reference to a company (no enforced DB FK — integrity is
   * advisory, see ADR-to-come). Nullable; a dangling id renders as unknown.
   */
  @Column({ type: 'uuid', nullable: true, name: 'company_id' })
  companyId?: string | null

  /** Soft-delete tombstone; retained so deletions replicate and history survives. */
  @Column({ type: 'boolean', default: false })
  deleted!: boolean

  /** Escape hatch for schema evolution — promote fields to columns when stable */
  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
