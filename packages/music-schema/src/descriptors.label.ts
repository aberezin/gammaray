import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// Record label — a flat lookup, referenced many-to-one by albums. No dedicated
// page; created via the quick-add affordance on the albums page.
export const labelDescriptor: TableDescriptor = {
  table: 'label',
  collection: 'label',
  listField: 'labels',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['name'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'name', label: 'Name', kind: FieldKind.String, required: true },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
