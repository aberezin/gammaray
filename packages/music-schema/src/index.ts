// The "Crate" music-library example app's data model: the TableDescriptors for
// its type-A tables, built on the @gammaray/core framework. A second example
// (alongside @gammaray/rolodex-schema) that proves the framework is driven
// entirely by swapping the descriptor set — see docs/example-app-spec.md.
export * from './descriptors.label'
export * from './descriptors.artist'
export * from './descriptors.genre'
export * from './descriptors.album'
export * from './descriptors.track'
export * from './descriptors.playlist'

import type { TableDescriptor } from '@gammaray/core'
import { labelDescriptor } from './descriptors.label'
import { artistDescriptor } from './descriptors.artist'
import { genreDescriptor } from './descriptors.genre'
import { albumDescriptor, albumGenreDescriptor } from './descriptors.album'
import { trackDescriptor, trackArtistDescriptor } from './descriptors.track'
import { playlistDescriptor, playlistTrackDescriptor } from './descriptors.playlist'

// Every type-A TableDescriptor this app defines, ordered referenced-table-first
// (lookups/entities before the joins that reference them). Consumers build their
// registries from this one list — the client-side analog of the server's
// RowRegistry, and what configureClient() / the API engine register.
export const musicDescriptors: TableDescriptor[] = [
  labelDescriptor,
  artistDescriptor,
  genreDescriptor,
  albumDescriptor,
  trackDescriptor,
  playlistDescriptor,
  albumGenreDescriptor,
  trackArtistDescriptor,
  playlistTrackDescriptor,
]
