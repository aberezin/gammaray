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

## Notes
- Two separate frontend applications sharing a single backend
- Apps communicate through the backend only
- Future decision needed: Redis vs RabbitMQ for messaging
- Chose TypeORM over Prisma due to complex data model requirements
