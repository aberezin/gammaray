import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Genre — self-referential tree (parent_id → genres). Many-to-many target of
// albums (album_genres).
@Entity('genres')
export class GenreEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '' })
  name!: string

  // Self-reference (enforced by a DEFERRABLE FK; nullable for roots).
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
