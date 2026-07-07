import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// The join table materializing the many-to-many contact ↔ tag relation. A
// first-class type-A row (surrogate UUID id, version, soft-delete) with TWO
// references — so a single row has two parents, exercising the batch reference
// validator and topological order with a multi-parent node.
@Entity('contact_tags')
export class ContactTagEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'contact_id' })
  contactId!: string

  @Column({ type: 'uuid', name: 'tag_id' })
  tagId!: string

  @Column({ type: 'int', default: 0 })
  version!: number

  @Column({ type: 'boolean', default: false })
  deleted!: boolean

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>

  @Column({ name: 'effective_from', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  effectiveFrom!: Date

  @Column({ name: 'effective_to', type: 'timestamptz', nullable: true, default: null })
  effectiveTo!: Date | null

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
