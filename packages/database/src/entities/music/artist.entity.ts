import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Artist — flat type-A table, the many-to-many target of tracks (track_artists).
@Entity('artists')
export class ArtistEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '' })
  name!: string

  @Column({ type: 'text', default: '' })
  bio!: string

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
