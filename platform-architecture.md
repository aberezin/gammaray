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
- apps/app-one
- apps/app-two
- apps/api
- packages/ui
- packages/database
- packages/auth
- packages/core

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

## Notes
- Two separate frontend applications sharing a single backend
- Apps communicate through the backend only
- Future decision needed: Redis vs RabbitMQ for messaging — validate the choice
  by re-running `load-tests/k6/connection-ramp.js` against a multi-instance API
- Chose TypeORM over Prisma due to complex data model requirements
