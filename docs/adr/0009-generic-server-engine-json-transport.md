# ADR 0009 — Generic descriptor-driven server engine, with a JSON read/live transport

- **Status:** Accepted (2026-06-15)
- **Context area:** Server generalization — the type-A engine

## Context

Each type-A table (`company`, `category`, `tag`, `contact_tag`, `contact`) had a
near-identical hand-written server stack: a GraphQL model, a `<list>` query, a
`<x>Updated` subscription, a flat applier service, and a module — ~600 lines of
duplication. Writes were *already* generic (one `pushBatch` mutation over a
`GraphQLJSON` scalar), and the batch service already kept a per-table registry of
`{descriptor, apply, existing}`. So the remaining duplication was reads, live
updates, and the flat appliers. Adding a table meant copy-pasting a stack — the
opposite of the "coded by agents" goal, where a new table should be a descriptor
+ entity + migration.

## Decision

A single **RowRegistry** (`table → {descriptor, entity, apply, existing}`) is the
engine's spine. Reads, live updates, the batch endpoint, and dependency ordering
all consult it.

- **Reads/live go generic over a JSON scalar.** One `rows(table: String!): [JSON]`
  query and one `rowUpdated(table: String!): JSON` subscription (one PubSub
  channel, server-filtered by `table`) replace the five typed `<list>` queries and
  five `<x>Updated` subscriptions. The server **projects** each row to the
  descriptor's wire shape (stored fields + `deleted`, excluding virtual
  `MultiReference`), so the JSON payload is byte-for-byte what the old typed
  queries returned — the client needed only to change the query strings.
- **A generic flat applier** handles descriptor-driven create/update/delete with
  optimistic-version (WholeRow) reconciliation, retiring the four flat services.
- **Adding a flat table** is now: a descriptor + an entity + a migration + one
  `RowRegistry` line.

### Why JSON, not a dynamically-typed schema

The alternative was to keep a fully typed GraphQL schema by programmatically
building an `@ObjectType` per descriptor at bootstrap. We chose the JSON scalar:

- **Writes already use it.** `pushBatch`/results are `GraphQLJSON`; matching reads
  keeps one consistent representation rather than two parallel worlds.
- **The descriptor is the real contract.** The client already projects rows
  through the descriptor (RxDB schema, forms, lists) and never consumed typed
  GraphQL fields directly — so static field typing over the wire bought us
  nothing the descriptor doesn't already give us.
- **Dynamic code-first typing is fragile.** Generating decorated classes at
  runtime in NestJS code-first is fiddly (metadata, schema-build ordering) and
  would be a maintenance hazard that fights the framework.
- **The cost is bounded.** We lose GraphQL field-level validation/introspection
  for type-A reads. Validation already lives where it matters — class-validator on
  `pushBatch` inputs and descriptor-driven projection on output — and the data is
  uniform shallow rows, so schema introspection adds little. Net simplicity wins.

## Consequences

- ~600 lines of per-table server code deleted; a new flat table is a few lines.
- The wire is uniform: typed only where typing earns its keep (auth, `pushBatch`
  inputs); JSON for the homogeneous type-A row payloads.
- The entities and migrations are unchanged — this is an API/service-layer change.
- **Contacts stays partly bespoke (Phase 2 deferred).** Its reads/live ride the
  engine, but its applier still owns the revision log, 3-way merge, conflict
  detection, the `contactRevisions` query, and `resolveContactConflict`.
  Generalizing those — a generic `row_revisions` table + a generic
  `resolveConflict`, then retiring the bespoke applier — is the next rung.
- Tooling note: a consumer that wanted typed access (e.g. a third-party client)
  would now work against JSON; for this POC's own client that's a non-issue.
