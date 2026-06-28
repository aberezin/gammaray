import { EntityTarget, ObjectLiteral } from 'typeorm'
import type { TableDescriptor } from '@gammaray/core'
import {
  companyDescriptor,
  contactDescriptor,
  categoryDescriptor,
  tagDescriptor,
  contactTagDescriptor,
} from '@gammaray/notesync-schema'
import {
  labelDescriptor,
  artistDescriptor,
  genreDescriptor,
  albumDescriptor,
  trackDescriptor,
  playlistDescriptor,
  albumGenreDescriptor,
  trackArtistDescriptor,
  playlistTrackDescriptor,
} from '@gammaray/music-schema'
import {
  CompanyEntity,
  ContactEntity,
  CategoryEntity,
  TagEntity,
  ContactTagEntity,
  LabelEntity,
  ArtistEntity,
  GenreEntity,
  AlbumEntity,
  TrackEntity,
  PlaylistEntity,
  AlbumGenreEntity,
  TrackArtistEntity,
  PlaylistTrackEntity,
} from '@gammaray/database'

// Pairs a table's descriptor (what) with its TypeORM entity (where). This is the
// only place that maps the two; the generic engine does everything else.
export interface TableDef {
  descriptor: TableDescriptor
  entity: EntityTarget<ObjectLiteral>
}

// The type-A tables of each example app, grouped by schema. Adding a table = one
// entry in its schema's list (+ descriptor + entity + migration).
export const SCHEMA_TABLES: Record<string, TableDef[]> = {
  notesync: [
    { descriptor: companyDescriptor, entity: CompanyEntity },
    { descriptor: categoryDescriptor, entity: CategoryEntity },
    { descriptor: tagDescriptor, entity: TagEntity },
    { descriptor: contactTagDescriptor, entity: ContactTagEntity },
    { descriptor: contactDescriptor, entity: ContactEntity },
  ],
  music: [
    { descriptor: labelDescriptor, entity: LabelEntity },
    { descriptor: artistDescriptor, entity: ArtistEntity },
    { descriptor: genreDescriptor, entity: GenreEntity },
    { descriptor: albumDescriptor, entity: AlbumEntity },
    { descriptor: trackDescriptor, entity: TrackEntity },
    { descriptor: playlistDescriptor, entity: PlaylistEntity },
    { descriptor: albumGenreDescriptor, entity: AlbumGenreEntity },
    { descriptor: trackArtistDescriptor, entity: TrackArtistEntity },
    { descriptor: playlistTrackDescriptor, entity: PlaylistTrackEntity },
  ],
}

// Which schemas THIS api instance serves, from config. Phase 1: both (one shared
// backend for both example apps). Phase 2 (docs/example-app-spec §7d): set
// GAMMARAY_SCHEMAS per api instance (e.g. 'music') so each app gets its own
// logical database on the shared server — a config change, not a rewrite. Shared
// by table registration (here) and seeding (schema-seeds.ts).
export function enabledSchemaNames(): string[] {
  return (process.env.GAMMARAY_SCHEMAS ?? 'notesync,music')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function enabledSchemaTables(): TableDef[] {
  return enabledSchemaNames().flatMap((name) => {
    const tables = SCHEMA_TABLES[name]
    if (!tables) {
      throw new Error(`Unknown schema "${name}" in GAMMARAY_SCHEMAS (known: ${Object.keys(SCHEMA_TABLES).join(', ')})`)
    }
    return tables
  })
}
