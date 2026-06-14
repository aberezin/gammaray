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

## Notes
- Two separate frontend applications sharing a single backend
- Apps communicate through the backend only
- Future decision needed: Redis vs RabbitMQ for messaging — validate the choice
  by re-running `load-tests/k6/connection-ramp.js` against a multi-instance API
- Chose TypeORM over Prisma due to complex data model requirements
