import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Join table for the track ↔ artist many-to-many. Two references (DEFERRABLE FKs).
@Entity('track_artists')
export class TrackArtistEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'track_id' })
  trackId!: string

  @Column({ type: 'uuid', name: 'artist_id' })
  artistId!: string

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
