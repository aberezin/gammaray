import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Join table for the playlist ↔ track many-to-many — the large relation. Two
// references (DEFERRABLE FKs).
@Entity('playlist_tracks')
export class PlaylistTrackEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'playlist_id' })
  playlistId!: string

  @Column({ type: 'uuid', name: 'track_id' })
  trackId!: string

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
