# ADR 0005 — Soft (un-enforced) foreign-key references

- **Status:** Accepted (2026-06-15); **amended 2026-06-17** — the "later hardening
  increment" this ADR deferred was delivered: type-A references are now enforced
  by **DEFERRABLE** FK constraints, not left un-enforced. See the Update below.
- **Context area:** Type-A relations — many-to-one references

## Context

Type-A rows can reference each other (foreign keys). The unit of change control
is the **row** (per-row, FK-as-field — chosen over an aggregate unit), and rows
sync offline-first from independent collections with client-generated UUIDs. A
hard DB foreign-key constraint fights this: a client can create a parent and a
child referencing it offline, and on sync the two collections push
independently — the child can reach the server before its parent, and a DB FK
would reject it. Enforcing it would require cross-collection push ordering or
retry-on-FK-failure.

## Decision

Model a many-to-one relation as a **soft reference**: a nullable column holding
the referenced row's id, with descriptor metadata
(`FieldKind.Reference` + `references: { collection, titleField }`), and **no
enforced DB foreign-key constraint**. Integrity is advisory, handled at the app
level. A dangling reference (referenced row missing/deleted) renders as
`(unknown)`.

The first relation built this way is `contact.company_id → company` (companies
are read-only seeded lookup data for now).

## Consequences

- **Positive:** the FK is just a field, so it rides the existing create / update /
  live / merge machinery for free — including DisjointFields auto-merge (ADR
  0004). No cross-collection push ordering needed. Offline create of parent +
  child works because the child already holds the parent's client-minted UUID.
  Display resolves ids to names via the descriptor's `titleField`.
- **Negative / deferred:** dangling references are possible (no DB guarantee);
  enforced referential integrity, ordered/atomic cross-collection sync, and
  delete semantics across the edge (cascade / block / null-out, plus the
  delete-vs-reference conflict) are a later hardening increment. In-app company
  CRUD (create/edit/delete of the referenced table) is also deferred.

## Update (2026-06-17) — references are now enforced by DEFERRABLE FKs

The "enforced referential integrity / atomic cross-collection sync" deferred
above was delivered once **server-side batch sync (ADR 0006)** made each push a
single transaction. With parent and child applied in the same transaction, a
**`DEFERRABLE INITIALLY DEFERRED`** FK works cleanly: the constraint is checked at
`COMMIT` (the batch endpoint runs `SET CONSTRAINTS ALL DEFERRED`), so the order in
which independent collections push within the batch no longer matters — exactly
the conflict this ADR raised, now resolved without per-statement enforcement.

So the type-A references are **not un-enforced** anymore — they carry real FK
constraints, just deferred to transaction boundary:

- `contacts.company_id → companies.id` — migration `1000000000004-DeferrableCompanyFk`
- `categories.parent_id → categories.id` (self-referential tree) — migration `…005-AddCategories`
- `contact_tags.{contact_id,tag_id} → {contacts,tags}.id` (join table) — migration `…006-AddTags`

The reference field still rides the descriptor/merge machinery as before; the
only change is the DB now guarantees integrity at commit. The app-level
`BatchService.validateReferences` (checks against DB ∪ the in-flight batch)
remains the *friendlier first* layer that returns a `REJECTED` with a clear
reason; the deferrable FK is the backstop.

Genuinely still soft (no FK): the cross-table **`row_revisions`** log, keyed by
`(table_name, row_id)` — it spans every table so it can't target one (ADR 0010).
