import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// Artist — a flat table, the many-to-many target of tracks (via track_artist).
export const artistDescriptor: TableDescriptor = {
  table: 'artist',
  collection: 'artist',
  listField: 'artists',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['name'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'name', label: 'Name', kind: FieldKind.String, required: true },
    { name: 'bio', label: 'Bio', kind: FieldKind.Text },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
