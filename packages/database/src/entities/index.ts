// Entity registry, grouped by ownership so the framework/example boundary is
// explicit. `ALL_ENTITIES` is the single canonical list — consumed by BOTH the
// migration data source (data-source.ts) and the API's runtime TypeOrmModule
// (apps/api), so they can't drift (the old double-registration footgun).
//
// TODO: the next rung is to split these groups into separate per-app packages
// (@gammaray/rolodex-database, @gammaray/music-database) so adding an app needs no
// edit to the framework package at all — see the database backlog in CLAUDE.md.

import { UserEntity } from './framework/user.entity'
import { AppMetaEntity } from './framework/app-meta.entity'
import { RowRevisionEntity } from './framework/row-revision.entity'

import { ContactEntity } from './rolodex/contact.entity'
import { CompanyEntity } from './rolodex/company.entity'
import { CategoryEntity } from './rolodex/category.entity'
import { TagEntity } from './rolodex/tag.entity'
import { ContactTagEntity } from './rolodex/contact-tag.entity'

import { LabelEntity } from './music/label.entity'
import { ArtistEntity } from './music/artist.entity'
import { GenreEntity } from './music/genre.entity'
import { AlbumEntity } from './music/album.entity'
import { TrackEntity } from './music/track.entity'
import { PlaylistEntity } from './music/playlist.entity'
import { AlbumGenreEntity } from './music/album-genre.entity'
import { TrackArtistEntity } from './music/track-artist.entity'
import { PlaylistTrackEntity } from './music/playlist-track.entity'

// Re-export every entity class (consumers import them by name as before).
export * from './framework/user.entity'
export * from './framework/app-meta.entity'
export * from './framework/row-revision.entity'
export * from './rolodex/contact.entity'
export * from './rolodex/company.entity'
export * from './rolodex/category.entity'
export * from './rolodex/tag.entity'
export * from './rolodex/contact-tag.entity'
export * from './music/label.entity'
export * from './music/artist.entity'
export * from './music/genre.entity'
export * from './music/album.entity'
export * from './music/track.entity'
export * from './music/playlist.entity'
export * from './music/album-genre.entity'
export * from './music/track-artist.entity'
export * from './music/playlist-track.entity'

/** Framework-owned tables — app-agnostic (auth, data-epoch, the generic revision log). */
export const FRAMEWORK_ENTITIES = [UserEntity, AppMetaEntity, RowRevisionEntity]

/** Rolodex (contact CRM) example tables. */
export const ROLODEX_ENTITIES = [ContactEntity, CompanyEntity, CategoryEntity, TagEntity, ContactTagEntity]

/** Crate (music library) example tables. */
export const MUSIC_ENTITIES = [
  LabelEntity,
  ArtistEntity,
  GenreEntity,
  AlbumEntity,
  TrackEntity,
  PlaylistEntity,
  AlbumGenreEntity,
  TrackArtistEntity,
  PlaylistTrackEntity,
]

/** The one canonical entity list — register this everywhere TypeORM needs entities. */
export const ALL_ENTITIES = [...FRAMEWORK_ENTITIES, ...ROLODEX_ENTITIES, ...MUSIC_ENTITIES]
