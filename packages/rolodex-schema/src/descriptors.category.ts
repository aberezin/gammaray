import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// A self-referential tree: parentId references another category. Exercises the
// batch coordinator's reference validation against DB ∪ batch (so a child can be
// created with its parent in the same batch, in any order).
export const categoryDescriptor: TableDescriptor = {
  table: 'category',
  collection: 'category',
  listField: 'categories',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.DisjointFields,
  display: { titleFields: ['name'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'name', label: 'Name', kind: FieldKind.String, required: true },
    {
      name: 'parentId',
      label: 'Parent',
      kind: FieldKind.Reference,
      references: { collection: 'category', titleField: 'name' },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
