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
  /**
   * Many-to-many reference, materialized through a join table. A *virtual*
   * field: it is not a column on this row and is skipped by all storage and
   * transport (RxDB schema, GraphQL pull/push, merge). The UI renders it as a
   * multi-select and the page reconciles it into join rows. Its value is an
   * array of target ids. See `via` for the join descriptor.
   */
  MultiReference = 'multi-reference',
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
  /**
   * For Reference/MultiReference fields whose target is LARGE: opt into at-scale
   * handling. The client fetches picker options via server-side `searchRows`
   * (typeahead) and resolves selected labels via `rowsByIds`, instead of
   * replicating the whole target collection. Small/user-created targets (where
   * offline create + quick-add matter) leave this off and keep the
   * replicate-and-filter behavior. Default false.
   */
  searchable?: boolean
  /** For Reference fields: the referenced table and which field labels a row. */
  references?: { collection: string; titleField: string }
  /**
   * For MultiReference fields: the join table that materializes the relation.
   * `localField`/`remoteField` are the two reference fields on the join row
   * (this row's id and the target's id); `targetCollection`/`titleField` say
   * what to offer and how to label it.
   */
  via?: {
    joinCollection: string
    localField: string
    remoteField: string
    targetCollection: string
    titleField: string
  }
}

export interface TableDescriptor {
  /** Logical table name. */
  table: string
  /** RxDB collection name on the client. */
  collection: string
  /** GraphQL query field returning all rows (e.g. "contacts"). The live
   *  subscription is assumed to be `${collection}Updated`. */
  listField: string
  /** Primary key field and whether the client generates it (offline-first create). */
  identity: { field: string; clientGenerated: boolean }
  fields: FieldDescriptor[]
  /** Reconciliation policy. Dormant until UPDATE; defaults to the safe WholeRow. */
  mergeStrategy: MergeStrategyKind
  /**
   * Whether the engine keeps a version history for this table in `row_revisions`.
   * Required for 3-way merge (DisjointFields/Custom need the common ancestor) and
   * for the conflict UI's history view. WholeRow tables can stay non-revisioned
   * (a version mismatch is simply a conflict — no ancestor needed). Default false.
   */
  revisioned?: boolean
  /** Fields used to summarize a row in a list/title. */
  display: { titleFields: string[] }
}
