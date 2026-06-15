# ADR 0005 — Soft (un-enforced) foreign-key references

- **Status:** Accepted (2026-06-15)
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
