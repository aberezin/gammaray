import { FieldKind, MergeStrategyKind, TableDescriptor } from '@gammaray/core'

// The company table — referenced many-to-one by contacts. A flat type-A table;
// with batch sync it also supports in-app create (not just seeded lookup).
export const companyDescriptor: TableDescriptor = {
  table: 'company',
  collection: 'company',
  listField: 'companies',
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
