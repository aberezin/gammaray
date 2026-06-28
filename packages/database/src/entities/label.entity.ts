import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Record label — flat type-A table, referenced many-to-one by albums.
@Entity('labels')
export class LabelEntity {
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
