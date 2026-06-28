import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// Playlist — a user list of tracks. The deliberately LARGE many-to-many
// (playlist ↔ track, via playlist_track), the case that stresses the at-scale
// reference controls (a playlist can hold hundreds of tracks out of a big
// catalog). Create/rename only → WholeRow.
export const playlistDescriptor: TableDescriptor = {
  table: 'playlist',
  collection: 'playlist',
  listField: 'playlists',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['name'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'name', label: 'Name', kind: FieldKind.String, required: true },
    { name: 'description', label: 'Description', kind: FieldKind.Text },
    {
      name: 'trackIds',
      label: 'Tracks',
      kind: FieldKind.MultiReference,
      via: {
        joinCollection: 'playlist_track',
        localField: 'playlistId',
        remoteField: 'trackId',
        targetCollection: 'track',
        titleField: 'title',
      },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}

// Join table for the playlist ↔ track many-to-many. Create/delete only → WholeRow.
export const playlistTrackDescriptor: TableDescriptor = {
  table: 'playlist_track',
  collection: 'playlist_track',
  listField: 'playlistTracks',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['id'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    {
      name: 'playlistId',
      label: 'Playlist',
      kind: FieldKind.Reference,
      references: { collection: 'playlist', titleField: 'name' },
    },
    {
      name: 'trackId',
      label: 'Track',
      kind: FieldKind.Reference,
      references: { collection: 'track', titleField: 'title' },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
