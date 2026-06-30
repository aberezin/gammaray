import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm'

// A flat type-A table joined many-to-many to contacts via contact_tags.
@Entity('tags')
export class TagEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '' })
  name!: string

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
