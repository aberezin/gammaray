# ADR 0007 — Many-to-many via a join table + a virtual MultiReference field

- **Status:** Accepted (2026-06-14)
- **Context area:** Type-A relations — many-to-many

## Context

The relation matrix needed its last shape: many-to-many (a contact has many
tags; a tag belongs to many contacts). Everything in the type-A framework is
built around a **row** as the unit of change control — client-minted UUID,
`version`, soft-delete, offline-first replication from a per-collection RxDB
store, and a descriptor that drives the server model, RxDB schema, GraphQL
field lists, and the generic UI. A many-to-many relation has no natural home as
a column on either side, so it does not fit the row model directly.

Two questions had to be answered: how to **store** the relation, and how to
**display/edit** it through the existing generic UI.

## Decision

**Storage — the join row is a first-class type-A row.** A `contact_tags` table
(`id`, `contactId`, `tagId`, `version`, `deleted`, `metadata`, timestamps) joins
`contacts` and `tags`. Its row is an ordinary type-A row with **two**
`FieldKind.Reference` fields. This is the first *multi-parent* node: it
exercises the batch reference validator (validate against DB ∪ batch) and the
topological `dependencyOrder` with a node that has two parents. Both join FKs
are `DEFERRABLE INITIALLY DEFERRED`, so a contact, a tag, and the link between
them can be created offline and sync in one atomic batch in any order. A
**partial unique index** `(contact_id, tag_id) WHERE deleted = false` keeps at
most one active link while letting a soft-deleted tombstone coexist with a fresh
re-link.

**Display/edit — a virtual `MultiReference` field.** The contact descriptor
gains a `tagIds` field of new kind `FieldKind.MultiReference` with `via` metadata
naming the join collection and its two reference fields. It is **virtual**: not
a column on the contact row, and skipped by every storage/transport consumer
(RxDB schema, GraphQL pull/push, reconcile, 3-way merge). It is rendered only by
the UI — `RecordForm` shows a checkbox multi-select, `RecordList` shows the
comma-joined labels. The page materializes it: it derives each contact's active
`tagIds` from the join rows for display, and on save diffs the selected set
against the current links, creating/soft-deleting join rows that ride the shared
`BatchCoordinator` alongside the contact write.

## Consequences

- The relation is **schema-driven end to end** like every other type-A shape: a
  new join table is a descriptor + migration + a registry entry, and the generic
  UI handles the rest.
- The batch path is now proven for multi-parent nodes — a join row listed
  *before* both of its parents in one batch applies (verified by
  `apps/app-one/tests/contacts-tags.spec.ts`), and a link to a non-existent
  target is isolated-`REJECTED` while siblings commit.
- A *virtual* field is a new descriptor concept. The rule is strict and
  load-bearing: anything touching storage or the wire must skip
  `MultiReference`; only the UI and the page consume it. The dependency-order,
  merge, and server reference-validation code filter on `FieldKind.Reference`
  and so ignore it for free.
- RxDB collection names must match `^[a-z][_$a-z0-9-]*$`, so the join
  collection is `contact_tag` (not camelCase). Since `collection` also derives
  the subscription field (`${collection}Updated`), the server subscription is
  `contact_tagUpdated`.
- Soft-deleting a link (rather than hard delete) keeps the relation replicating
  like any other row; the partial unique index is what makes re-linking safe.
- Not yet done: editing tags inline from the list, and a tag-centric view
  (a tag showing its contacts) — both are reads over the same join rows.
