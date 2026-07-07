import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// Album — a core entity. Many-to-one to a record label, many-to-many to genres
// (via album_genre). Revisioned (history + disjoint-field auto-merge), like
// rolodex's contact.
export const albumDescriptor: TableDescriptor = {
  table: 'album',
  collection: 'album',
  listField: 'albums',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.DisjointFields,
  revisioned: true,
  display: { titleFields: ['title'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'title', label: 'Title', kind: FieldKind.String, required: true },
    { name: 'year', label: 'Year', kind: FieldKind.Int },
    {
      name: 'labelId',
      label: 'Label',
      kind: FieldKind.Reference,
      references: { collection: 'label', titleField: 'name' },
    },
    {
      name: 'genreIds',
      label: 'Genres',
      kind: FieldKind.MultiReference,
      via: {
        joinCollection: 'album_genre',
        localField: 'albumId',
        remoteField: 'genreId',
        targetCollection: 'genre',
        titleField: 'name',
      },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}

// Join table for the album ↔ genre many-to-many. Create/delete only → WholeRow.
export const albumGenreDescriptor: TableDescriptor = {
  table: 'album_genre',
  collection: 'album_genre',
  listField: 'albumGenres',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  temporalValidity: true,
  display: { titleFields: ['id'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    {
      name: 'albumId',
      label: 'Album',
      kind: FieldKind.Reference,
      references: { collection: 'album', titleField: 'title' },
    },
    {
      name: 'genreId',
      label: 'Genre',
      kind: FieldKind.Reference,
      references: { collection: 'genre', titleField: 'name' },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
    { name: 'effectiveFrom', label: 'Active From', kind: FieldKind.Timestamp, readOnly: true },
    { name: 'effectiveTo', label: 'Active To', kind: FieldKind.Timestamp, readOnly: true, nullable: true },
  ],
}
