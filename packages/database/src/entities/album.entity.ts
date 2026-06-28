import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Album — revisioned type-A entity. Many-to-one to a label; many-to-many to
// genres (album_genres).
@Entity('albums')
export class AlbumEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '' })
  title!: string

  @Column({ type: 'int', default: 0 })
  year!: number

  // Many-to-one soft reference (enforced by a DEFERRABLE FK; nullable).
  @Column({ type: 'uuid', nullable: true, name: 'label_id' })
  labelId?: string | null

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
