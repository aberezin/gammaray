import { FieldKind, MergeStrategyKind, TableDescriptor } from './descriptors'

// A flat type-A table joined many-to-many to contacts via contact_tags.
export const tagDescriptor: TableDescriptor = {
  table: 'tag',
  collection: 'tag',
  listField: 'tags',
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

// The join table for the many-to-many contact ↔ tag relation. A first-class
// type-A row with TWO references — the first multi-parent node, exercising the
// batch reference validator and topological order. Create/delete only, so
// WholeRow merge is fine.
export const contactTagDescriptor: TableDescriptor = {
  table: 'contact_tag',
  collection: 'contactTag',
  listField: 'contactTags',
  identity: { field: 'id', clientGenerated: true },
  mergeStrategy: MergeStrategyKind.WholeRow,
  display: { titleFields: ['id'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    {
      name: 'contactId',
      label: 'Contact',
      kind: FieldKind.Reference,
      references: { collection: 'contact', titleField: 'firstName' },
    },
    {
      name: 'tagId',
      label: 'Tag',
      kind: FieldKind.Reference,
      references: { collection: 'tag', titleField: 'name' },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
