# ADR 0010 — Generic revisions, 3-way merge, and conflict resolution (engine Phase 2)

- **Status:** Accepted (2026-06-15)
- **Context area:** Type-A engine — completing the generalization

## Context

ADR 0009 (Phase 1) made reads/live/flat-writes generic but left contacts with a
bespoke applier: the revision log, 3-way merge (DisjointFields), conflict
detection, the `contactRevisions` query, and `resolveContactConflict`. That was
the last per-table server code. Phase 2 folds it into the engine so *any* table
can opt into history + merge with no bespoke code.

## Decision

- **One generic `row_revisions` table** `(table_name, row_id, data, version,
  client_id, conflict_status, created_at)` replaces the per-table
  `contact_revisions`. A revision is one accepted/detected version of any table's
  row; `data` is the field-aware JSONB snapshot the 3-way merge reads as the
  common ancestor.
- **A `revisioned` flag on the descriptor.** When true, the generic applier logs
  every accepted write and, on a version mismatch, loads the ancestor and runs
  `mergeRows` per the table's merge strategy (auto-merge on success, a recorded
  `detected` revision + CONFLICT otherwise). When false (the flat WholeRow
  tables), a version mismatch is simply a conflict — no ancestor needed, no
  history written. Behavior is unchanged for every existing table.
- **One generic applier** (`GenericRowService.applyRow`) now serves flat and
  revisioned tables alike; contacts routes through it like everything else. The
  bespoke `ContactsService`/module/resolver and `ContactRevisionEntity` are
  deleted.
- **Generic conflict surface:** `rowRevisions(table, rowId)` query and a
  `resolveRowConflict(table, row, clientId)` mutation (JSON, per ADR 0009),
  replacing `contactRevisions` / `resolveContactConflict`.

## Consequences

- The five-table engine is now fully generic: a new table — flat or
  merge-with-history — is a descriptor (+`revisioned` if it wants history) +
  entity + migration + one registry line. No bespoke server code remains.
- `row_revisions` is keyed by `(table_name, row_id)` and not FK-constrained
  (it spans tables) — consistent with the soft-reference posture (ADR 0005).
- The migration drops `contact_revisions` (its history does not carry over) and
  backfills a baseline v1 snapshot for existing contacts, so the history view and
  merge ancestor still work after the cutover.

## Two bugs the cutover surfaced (and their fixes)

- **NOT NULL coercion.** The flat applier wrote `change.data[name] ?? null`,
  which worked only because flat tables never omit a string column. Contacts'
  optional `email`/`phone` are `TEXT NOT NULL DEFAULT ''`; a create omitting them
  inserted `null` → constraint violation. The applier now coerces writable values
  by `FieldKind` (string-like → `''`, reference → `null`, int → `0`,
  boolean → `false`), matching the column defaults (what the old `str()` did).
- **Mutation-name collision.** The notes module already exposes a
  `resolveConflict` mutation; adding a second generic one silently shadowed it in
  the schema and broke note conflict resolution. The generic mutation is named
  `resolveRowConflict`. (Lesson: generic field names must not collide with any
  existing module's.)
