import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm'

// Join table for the album ↔ genre many-to-many. A first-class type-A row with
// two references (both DEFERRABLE FKs).
@Entity('album_genres')
export class AlbumGenreEntity {
  @PrimaryColumn('uuid')
  id!: string

  @Column({ type: 'uuid', name: 'album_id' })
  albumId!: string

  @Column({ type: 'uuid', name: 'genre_id' })
  genreId!: string

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
