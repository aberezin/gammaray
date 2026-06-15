# ADR 0002 — Descriptor-per-table, schema-driven architecture

- **Status:** Accepted (2026-06-14)
- **Context area:** Type-A generalization (N clients editing a database row)

## Context

Generalizing from a single string (NoteSync) to arbitrary type-A rows means the
server model, the local store schema, the sync queries, and the UI all need to
know a table's shape. Hardcoding each of those per table would not generalize.

## Decision

Each table is described once by a **`TableDescriptor`** (`packages/core/src/
descriptors.ts`), the single source of truth carrying:

- **fields** (name, label, kind, readOnly) — for rendering and serialization,
- **identity** (primary key + whether the client generates it),
- **mergeStrategy** — how concurrent edits reconcile (see ADR 0004),
- **display** (title fields).

Everything downstream is derived from it: the RxDB collection schema
(`rx-schema.ts`), the replication pull/subscription field lists (`contacts-sync.
ts`), and generic UI components (`RecordList`, `RecordForm`,
`RecordConflictBanner`) that render any descriptor. Adding a field to the
descriptor flows to all of them; a second flat table is mostly a new descriptor
plus its entity/migration.

## Consequences

- **Positive:** one source of truth; generic, reusable UI and sync; new tables
  are cheap; "schema-driven" solves "how to display an arbitrary object" for the
  flat case.
- **Negative / limits:** the server resolvers and entities are still concrete per
  table (only the descriptor and UI are generic) — a fully generic server engine
  is future work. A human UI can't render arbitrarily complex rows; that limit is
  acknowledged and deferred.
