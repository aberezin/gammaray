import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// Genre — a self-referential tree (a genre's Parent is another genre, e.g.
// Rock → Classic Rock). The many-to-many target of albums (via album_genre).
export const genreDescriptor: TableDescriptor = {
  table: 'genre',
  collection: 'genre',
  listField: 'genres',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['name'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'name', label: 'Name', kind: FieldKind.String, required: true },
    {
      name: 'parentId',
      label: 'Parent',
      kind: FieldKind.Reference,
      references: { collection: 'genre', titleField: 'name' },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
