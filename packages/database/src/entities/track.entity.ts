import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Track — revisioned type-A entity. Many-to-one to its album; many-to-many to
// the artists who performed it (track_artists).
@Entity('tracks')
export class TrackEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'text', default: '' })
  title!: string

  @Column({ type: 'int', default: 0, name: 'track_no' })
  trackNo!: number

  @Column({ type: 'int', default: 0, name: 'duration_sec' })
  durationSec!: number

  @Column({ type: 'boolean', default: false })
  explicit!: boolean

  // Many-to-one soft reference (enforced by a DEFERRABLE FK; nullable).
  @Column({ type: 'uuid', nullable: true, name: 'album_id' })
  albumId?: string | null

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
