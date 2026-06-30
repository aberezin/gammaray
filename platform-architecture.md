# Platform Architecture Decision Log

## Core Stack
- Monorepo: Turborepo + pnpm
- Frontend Framework: Next.js (TypeScript)
- Backend Framework: NestJS + GraphQL
- ORM: TypeORM
- Client Database: RxDB (offline-first with sync)
- Real-time Communication: WebSockets (messaging backend TBD)
- Authentication: Auth.js (frontend) + Passport.js (backend)
- State Management: Zustand
- Testing: Jest + Playwright
- CI/CD: GitHub Actions
- API Style: GraphQL

## Repository Structure
- apps/example
- apps/app-two
- apps/api
- packages/ui
- packages/database
- packages/auth
- packages/core

## Data model

The PostgreSQL schema and its relationships (hard FKs, soft references,
deferrable FKs, and the polymorphic revision log) are diagrammed in
[`docs/erd.md`](./docs/erd.md).

## Secure Development Processes
- TODO: Define security practices, secret management, dependency scanning, and code review requirements

## Conflict Detection and Resolution

### Design Options Considered

1. **Document-Level Optimistic Concurrency**  
   Standard RxDB approach using revisions per document. Simple but limited to single-document consistency.

2. **Logical Transaction Boundary**  
   Map one JSON document to multiple database tables, updated within a single SQL transaction. Stronger consistency guarantees.

3. **Event Sourcing**  
   Store only immutable events instead of current state. Current state is derived by replaying events.  
   - **Advantage**: Excellent audit trail and natural fit for offline-first systems.  
   - **Disadvantage**: Performance challenge of replaying all events to get current state. Mitigated by using periodic snapshots.  
   - **Overall**: Significantly increases architectural complexity.

4. **Last Write Wins**

## Architecture Decision Records (ADRs)

Significant, durable design decisions are recorded as ADRs in
[`docs/adr/`](./docs/adr/). This file remains the high-level decision log; ADRs
hold the detailed argument for individual decisions.

- [ADR 0001 — Concurrency token model for type-A rows](./docs/adr/0001-concurrency-token-model.md):
  single row `version` + 3-way merge against the ancestor (not per-field vectors);
  per-table merge strategy carries the policy.
- [ADR 0002 — Descriptor-per-table, schema-driven architecture](./docs/adr/0002-descriptor-driven-tables.md):
  one `TableDescriptor` drives the model, store schema, sync queries, and generic UI.
- [ADR 0003 — Field-aware change control with client-generated UUIDs](./docs/adr/0003-field-aware-client-uuids.md):
  rows tracked per-field (not opaque blobs); clients mint primary keys for offline create.
- [ADR 0004 — Merge strategy as per-table policy](./docs/adr/0004-merge-strategy-as-table-policy.md):
  WholeRow default, DisjointFields auto-merge opt-in; mechanism vs. policy.
- [ADR 0005 — Soft (un-enforced) foreign-key references](./docs/adr/0005-soft-foreign-key-references.md):
  many-to-one as a nullable reference field that rides field sync/merge.
  **Amended:** initially un-enforced, now backed by **DEFERRABLE** FK constraints
  (checked at COMMIT) once the single-transaction batch sync (ADR 0006) made
  cross-collection push order irrelevant. Only `row_revisions` stays FK-free.
- [ADR 0006 — Server-side transactional batch sync](./docs/adr/0006-server-side-batch-sync.md):
  one `pushBatch` transaction with deferrable FKs + FK-graph topo ordering;
  applied-set atomic, conflicts/rejects isolated. Self-reference / cycle handling
  resolved (validate against DB ∪ batch).
- [ADR 0007 — Many-to-many via a join table + virtual MultiReference field](./docs/adr/0007-many-to-many-virtual-fields.md):
  the join row is a first-class type-A row (two references, multi-parent); the
  relation surfaces as a virtual field the UI renders and the page materializes.
- [ADR 0008 — Token refresh + a sync-health "suspect" guard](./docs/adr/0008-token-refresh-and-sync-health.md):
  stateless refresh tokens + per-request fresh token; any server error flips the
  app to read-only with recovery actions. Notes a repair-process follow-up.
- [ADR 0009 — Generic descriptor-driven server engine, JSON read/live transport](./docs/adr/0009-generic-server-engine-json-transport.md):
  one RowRegistry + generic `rows`/`rowUpdated` over a JSON scalar + a generic
  flat applier; retires the per-table read/write stacks (Phase 1).
- [ADR 0010 — Generic revisions, 3-way merge, and conflict resolution](./docs/adr/0010-generic-revisions-merge-conflict.md):
  a single `row_revisions` table + a `revisioned` descriptor flag fold contacts'
  history/merge/conflict into the generic applier; `resolveRowConflict` +
  `rowRevisions`. No bespoke server code remains (Phase 2).
- [ADR 0011 — Database seeding (engine-driven, decoupled from migrations)](./docs/adr/0011-database-seeding.md):
  `db:seed` writes through the engine/descriptors (auto-correct per revision),
  idempotent with `--reset`; seeds out of migrations into the seed; auto-runs at
  container boot + Playwright `globalSetup`. Core e2e fixture kept identical.
- [ADR 0012 — Data epoch + client reslate for server-reset divergence](./docs/adr/0012-data-epoch-reslate.md):
  A server data-epoch (bumped by out-of-app changes — migrate/seed/manual) lets
  clients detect an SDLC reset and cleanly reslate (discard + re-pull) instead of
  mis-merging; no speculative parent re-push. Extends the schema-wipe philosophy
  to data. Manual *Reset local copy* button is the escape hatch. (Merged, PR #20.)
- [ADR 0013 — At-scale tables: per-table opt-in server pagination](./docs/adr/0013-at-scale-paged-tables.md):
  a `paged: true` descriptor flag makes a large table server-paginated (keyset
  `pageRows`, server-side sort/filter) instead of full-replicated, bounding memory
  at server, client store, and UI. The cost — no full offline browse of that table
  — is paid only by tables that opt in; small tables stay full-replica offline-first.
  Extends the `searchable` reference opt-in (PR #31) from a field to a whole table.

## Performance & Capacity (load testing)

The realtime path (REST auth → GraphQL mutations → graphql-ws subscriptions) is
load-tested with k6. Tests, how to run them, the design rationale, and a dated
results log live in [`load-tests/`](./load-tests/) (`load-tests/README.md`,
`load-tests/RESULTS.md`).

Current findings (single dev machine — indicative, not SLAs):
- **Connections:** 500 concurrent held subscriptions with sub-millisecond ack;
  no ceiling found in range. The in-process `SyncBroker`
  (`apps/api/src/sync/sync.broker.ts`) is the suspected ultimate limit — the
  connection-ramp test is how we'll find it as we scale out.
- **Write throughput:** saturates ~100 concurrent writers / ~1,750 push/s, then
  throughput drops and latency rises (correctness holds). Bottleneck is the
  per-push locked DB transaction + revision insert.

These numbers motivate the messaging-broker decision below: horizontal scaling
of subscriptions requires replacing the in-process broker with a shared one
(see `SyncBroker`'s swap-in interface).

## Open: history retention / truncation

**TODO — needs discussion.** Every accepted write appends a revision row
(`note_revisions`, `contact_revisions`, and every future type-A table's revision
log). In a real application, old history is rarely needed for long, so unbounded
growth is both a storage and a performance concern (the per-push revision insert
is already on the write hot path — see Performance & Capacity). We need an
auto-truncation / retention strategy: e.g. keep the last N versions or T days,
snapshot-and-compact, or archive to cold storage. Note retention likely belongs
*per table*, alongside the merge strategy on the table descriptor
(`packages/core/src/descriptors.ts`), since different data has different needs.
Open question: how truncation interacts with 3-way merge, which relies on the
common-ancestor revision still existing.

## Engineering backlog / TODOs

Non-feature maintenance and tooling tasks, tracked here until scheduled.

- **Update Next.js to the latest version.** `apps/example` is on Next.js 15
  (App Router). Bump to the latest release, review the changelog/codemods for
  breaking changes, and re-run the e2e suite. Watch for App Router, caching, and
  `next-auth`/Auth.js v5 compatibility shifts.
- **Add a TypeScript LSP to Claude Code sessions.** Give agent sessions a
  TypeScript language server so they get go-to-definition, find-references,
  hover types, and rename across the monorepo — instead of relying on grep + the
  per-package `tsc --noEmit` lint. Should resolve cross-package types
  (`@gammaray/core`, `@gammaray/database`, etc.) via the workspace.
- **Repair process before destructive local reset** (see ADR 0008 / the
  `TODO(repair)` in `SyncHealthBanner.tsx`): recover unsynced local writes before
  "Reset local data" wipes the RxDB replica.
- **Pending-vs-flushed sync indicator on the type-A pages.** The type-A pages show
  a `SyncIndicator` ("● Synced"), but it reflects only the online/offline toggle,
  not whether local writes have actually flushed to the server — a user can't tell
  pending from synced. Drive a true synced/pending state from the replication
  `active$` and/or the `BatchCoordinator`'s in-flight buffer (pending while rows are
  buffered/un-acked, synced once the batch commits).

## Notes
- Two separate frontend applications sharing a single backend
- Apps communicate through the backend only
- Future decision needed: Redis vs RabbitMQ for messaging — validate the choice
  by re-running `load-tests/k6/connection-ramp.js` against a multi-instance API
- Chose TypeORM over Prisma due to complex data model requirements
