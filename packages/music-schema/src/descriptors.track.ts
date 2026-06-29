import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// Track — a core entity. Many-to-one to its album, many-to-many to the artists
// who performed it (via track_artist). Revisioned (history + disjoint-field
// auto-merge). Exercises Int (trackNo, durationSec) and Boolean (explicit).
//
// `paged` (ADR 0013): the track catalog is the app's largest table, so its list
// is server-paginated (keyset pageRows + server sort/filter) rather than
// full-replicated. The trade-off — no full offline browse of the catalog — is
// acceptable here; loaded tracks are still editable and still push via pushBatch.
export const trackDescriptor: TableDescriptor = {
  table: 'track',
  collection: 'track',
  listField: 'tracks',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.DisjointFields,
  revisioned: true,
  paged: true,
  display: { titleFields: ['title'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'title', label: 'Title', kind: FieldKind.String, required: true },
    { name: 'trackNo', label: 'Track #', kind: FieldKind.Int },
    { name: 'durationSec', label: 'Duration (s)', kind: FieldKind.Int },
    { name: 'explicit', label: 'Explicit', kind: FieldKind.Boolean },
    {
      name: 'albumId',
      label: 'Album',
      kind: FieldKind.Reference,
      // Demonstrates at-scale m2o typeahead (the album catalog can grow large).
      searchable: true,
      references: { collection: 'album', titleField: 'title' },
    },
    {
      name: 'artistIds',
      label: 'Artists',
      kind: FieldKind.MultiReference,
      via: {
        joinCollection: 'track_artist',
        localField: 'trackId',
        remoteField: 'artistId',
        targetCollection: 'artist',
        titleField: 'name',
      },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}

// Join table for the track ↔ artist many-to-many. Create/delete only → WholeRow.
export const trackArtistDescriptor: TableDescriptor = {
  table: 'track_artist',
  collection: 'track_artist',
  listField: 'trackArtists',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['id'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    {
      name: 'trackId',
      label: 'Track',
      kind: FieldKind.Reference,
      references: { collection: 'track', titleField: 'title' },
    },
    {
      name: 'artistId',
      label: 'Artist',
      kind: FieldKind.Reference,
      references: { collection: 'artist', titleField: 'name' },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
