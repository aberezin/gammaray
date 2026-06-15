import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// A self-referential type-A table: categories form a tree via parentId → another
// category. The first table to exercise self-references through batch sync.
@Entity('categories')
export class CategoryEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '' })
  name!: string

  /** Self-reference to the parent category (null = root). Soft FK, deferrable. */
  @Column({ type: 'uuid', nullable: true, name: 'parent_id' })
  parentId?: string | null

  @Column({ type: 'int', default: 0 })
  version!: number

  @Column({ type: 'boolean', default: false })
  deleted!: boolean

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date
}
