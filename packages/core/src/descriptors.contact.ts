import { FieldKind, MergeStrategyKind, TableDescriptor } from './descriptors'

// The first concrete type-A table: a flat contact row, no foreign keys, shared
// across all authenticated clients. Drives schema-driven rendering on the client
// and declares the (currently dormant) merge strategy.
export const contactDescriptor: TableDescriptor = {
  table: 'contact',
  collection: 'contact',
  listField: 'contacts',
  identity: { field: 'id', clientGenerated: true },
  // Disjoint field edits auto-merge (3-way against the ancestor); same-field
  // edits and delete-vs-edit still conflict.
  mergeStrategy: MergeStrategyKind.DisjointFields,
  display: { titleFields: ['firstName', 'lastName'] },
  fields: [
    { name: 'id', label: 'ID', kind: FieldKind.Uuid, readOnly: true },
    { name: 'firstName', label: 'First name', kind: FieldKind.String, required: true },
    { name: 'lastName', label: 'Last name', kind: FieldKind.String, required: true },
    { name: 'email', label: 'Email', kind: FieldKind.Email },
    { name: 'phone', label: 'Phone', kind: FieldKind.Phone },
    {
      name: 'companyId',
      label: 'Company',
      kind: FieldKind.Reference,
      references: { collection: 'company', titleField: 'name' },
    },
    {
      // Many-to-many to tags via the contact_tags join table. Virtual: not a
      // column on contact — the page materializes it into join rows.
      name: 'tagIds',
      label: 'Tags',
      kind: FieldKind.MultiReference,
      via: {
        joinCollection: 'contact_tag',
        localField: 'contactId',
        remoteField: 'tagId',
        targetCollection: 'tag',
        titleField: 'name',
      },
    },
    { name: 'version', label: 'Version', kind: FieldKind.Int, readOnly: true },
    { name: 'updatedAt', label: 'Updated', kind: FieldKind.Timestamp, readOnly: true },
  ],
}
