// Per-table change-control descriptors — the metadata spine of the type-A
// generalization. One descriptor per table carries everything the generic
// machinery needs: how to render a row (fields + types), how identity works
// (PK + whether the client mints it), and how concurrent edits are reconciled
// (the merge strategy). Shared by API and client so they agree on semantics.

export enum FieldKind {
  Uuid = 'uuid',
  String = 'string',
  Text = 'text',
  Email = 'email',
  Phone = 'phone',
  Int = 'int',
  Boolean = 'boolean',
  Timestamp = 'timestamp',
  /** Many-to-one reference: the field holds another row's id (a soft FK). */
  Reference = 'reference',
}

// How concurrent edits to the same row are reconciled. The 3-way merge runs at
// UPDATE time against the common ancestor from the revision history.
// Default is the conservative WholeRow: any concurrent non-identical change is a
// conflict. Auto-merging disjoint field edits is opt-in per table, never assumed.
export enum MergeStrategyKind {
  WholeRow = 'whole-row', // any concurrent change → conflict (default, safe)
  DisjointFields = 'disjoint-fields', // auto-merge iff changed field sets don't overlap
  LastWriteWins = 'last-write-wins', // newest write wins, never conflicts
  Custom = 'custom', // app-supplied rule (cross-field invariants, field groups)
}

export interface FieldDescriptor {
  /** Property name on the row object (camelCase, as exposed over the API). */
  name: string
  /** Human-facing label for UI. */
  label: string
  kind: FieldKind
  /** Not user-editable (id, version, timestamps). */
  readOnly?: boolean
  required?: boolean
  /** For Reference fields: the referenced table and which field labels a row. */
  references?: { collection: string; titleField: string }
}

export interface TableDescriptor {
  /** Logical table name. */
  table: string
  /** RxDB collection name on the client. */
  collection: string
  /** Primary key field and whether the client generates it (offline-first create). */
  identity: { field: string; clientGenerated: boolean }
  fields: FieldDescriptor[]
  /** Reconciliation policy. Dormant until UPDATE; defaults to the safe WholeRow. */
  mergeStrategy: MergeStrategyKind
  /** Fields used to summarize a row in a list/title. */
  display: { titleFields: string[] }
}
