# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GammaRay is a POC whose goal is to develop a reliable tech stack that can be coded by agents (the engineering team is Alan Berezin plus various agents). The first application is **NoteSync** — a single-textarea note per user with full version history, designed to exercise offline-first sync and conflict resolution.

## Local machine

**Check `LOCAL.md` first** — it is git-ignored and contains machine-specific environment details that affect how this repo runs. If it doesn't exist, copy `LOCAL.example.md` to `LOCAL.md` and fill in your setup.

Examples of what goes in LOCAL.md:
- Package manager and tool locations (`brew` vs MacPorts, global npm prefix)
- Node version manager and PATH configuration
- Container runtime (Docker Desktop vs Colima)
- Database connection details and how services are started locally
- Any OS-specific quirks or workarounds

Agents will read LOCAL.md to understand your machine's configuration and avoid environment-specific gotchas.

**For development and Chrome testing, see `DEV_SETUP.md`** — comprehensive guide explaining:
- How to run the full stack
- How to run frontend locally for Chrome testing (recommended)
- The Colima port forwarding quirks and why port 3000 hangs
- How to stop the containerized frontend and run it locally

## Commands

```bash
# Install all workspace dependencies
pnpm install

# Start everything (API + frontend)
pnpm dev

# Start individual apps
pnpm --filter @gammaray/api dev          # NestJS API on :3001
pnpm --filter @gammaray/app-one dev      # Next.js frontend on :3000

# Build
pnpm build                               # all packages and apps
pnpm --filter @gammaray/core build       # must run before api builds

# Type-check (no emit)
pnpm --filter @gammaray/api lint
pnpm --filter @gammaray/app-one lint

# Run database migrations
pnpm --filter @gammaray/database db:migrate

# Start PostgreSQL (required before running API)
docker compose up -d

# Load tests (k6) — API must be running on :3001
k6 run load-tests/k6/single-socket.js    # baseline; see load-tests/README.md
```

Build order matters: `packages/core` → `packages/database` → `apps/api`. The `packages/ui` has no separate build step — Next.js transpiles it directly.

## Architecture

### Repository structure

```
apps/api          NestJS backend — GraphQL + REST auth endpoints
apps/app-one      Next.js 15 frontend (App Router)
packages/core     Shared TypeScript DTOs and enums (NoteDto, ConflictResultDto, SyncStatus, ConflictStatus)
packages/auth     JwtPayload interface shared between api and app-one
packages/database TypeORM entities, migrations, and data source config
packages/ui       Shared React components (NoteEditor, RevisionList, ConflictBanner, OfflineToggle, SyncIndicator)
load-tests        k6 load tests for the realtime path (see load-tests/README.md + RESULTS.md)
```

### Data flow

```
RxDB (IndexedDB)  ←→  NestJS GraphQL  ←→  PostgreSQL
     ↑                     ↑
     └──── WebSocket subscription (noteUpdated) for live push
```

RxDB is the authoritative local store; it replicates via `replicateRxCollection` in `apps/app-one/src/lib/sync.ts`. Pull is polling + WebSocket stream; push calls the `pushNote` mutation.

### Conflict resolution

`NotesService.pushNote` in `apps/api/src/notes/notes.service.ts` implements optimistic concurrency with a DB row lock:
- Client sends `expectedVersion`; if server's `note.version !== expectedVersion` → conflict detected
- Conflicted client revision is persisted as `conflictStatus: 'detected'` in `note_revisions`
- Frontend receives `ConflictResultDto { conflict: true, serverContent, serverVersion }` and stores it in Zustand
- `ConflictBanner` component lets the user pick "Keep mine / Keep theirs / Edit merge"
- Resolution calls `resolveConflict` mutation which stamps the revision as `conflictStatus: 'resolved'`

### Stateless / multi-instance design

`SyncBroker` (`apps/api/src/sync/sync.broker.ts`) wraps PubSub behind an interface. Today it uses in-process `graphql-subscriptions` PubSub. To scale horizontally, replace with `RedisPubSub` — no caller changes needed.

Auth is fully stateless JWT. No server-side session storage.

### Schema evolution strategy

- TypeORM migrations only — `synchronize: false` everywhere
- New columns must be nullable or have a DEFAULT (additive-only rule)
- Every entity has a `metadata: JSONB` column as an escape hatch for fields not yet promoted to first-class columns
- Migration files live in `packages/database/src/migrations/`

### Key files

| File | Purpose |
|------|---------|
| `apps/api/src/notes/notes.service.ts` | Conflict logic + `pushNote` transaction |
| `apps/api/src/sync/sync.broker.ts` | PubSub abstraction (swap here for Redis) |
| `apps/app-one/src/lib/sync.ts` | RxDB replication wiring |
| `apps/app-one/src/lib/rxdb.ts` | RxDB database init (Dexie storage) |
| `apps/app-one/src/store/note.store.ts` | Zustand UI state (syncStatus, conflict, offline) |
| `packages/database/src/migrations/` | TypeORM migration files |
| `platform-architecture.md` | Architecture decision log — update when decisions change |

## Containerization

All services (PostgreSQL, API, frontend) are containerized with `docker compose`. The setup uses **Colima** as the container runtime on macOS (not Docker Desktop).

**Recommended dev setup (verified working):**

Run backend in containers, frontend locally:
```bash
# Terminal 1: Backend services
docker compose up -d              # API on :3001, Postgres on :5432

# Terminal 2: Frontend for Chrome testing
pnpm --filter @gammaray/app-one dev  # Frontend on :3000
```

Frontend is pre-configured to reach the API at `http://localhost:3001`. Full integration works end-to-end.

**Why this works:**
- API port 3001 is accessible from host via Colima port forwarding ✓
- Frontend port 3000 has forwarding issues (Colima limitation) but runs locally fine ✓
- Frontend config has `NEXT_PUBLIC_API_URL=http://localhost:3001` ✓

**Colima specifics (see LOCAL.md):**
- Runtime: Colima (not Docker Desktop)
- Port forwarding: IPv6 ports work (3001), IPv4 ports hang (3000) — likely VM networking layer
- Attempted fixes: `address: true`, `mode: bridged` — neither resolved the 3000 forwarding issue

**Dockerfiles:**
- `apps/api/Dockerfile` — NestJS on :3001, runs migrations on startup
- `apps/app-one/Dockerfile` — Next.js on :3000, binds to 0.0.0.0 for external access

## SDLC

### Branching

- **Major version upgrades** (framework, runtime, major dependency): create a feature branch (e.g. `chore/next-upgrade-16`), commit there, then ask for review before merging. This gives a checkpoint to assess risk.
- **Other changes**: commit directly to main per the workflow ("commit after each major change; PRs only when asked").

### Testing

**All new features and bug fixes must be tested before committing.** Testing can be:

- **Automated (preferred):** Write a Playwright e2e test in `apps/app-one/tests/` that exercises the feature deterministically. Run with `pnpm --filter @gammaray/app-one test:e2e`
- **Manual (acceptable for simple UI features):** Start the dev stack (`docker compose up -d && pnpm --filter @gammaray/app-one dev`), manually test in Chrome, document test steps in the commit message or PR

**Examples:**
- **Sync indicator:** Test by toggling offline mode and verifying the indicator updates
- **Form validation:** Test by entering invalid data and checking error states
- **API endpoint:** Test with Playwright or curl to verify response codes and data shape

If automated testing is expensive or requires infrastructure setup, discuss with the team first — manual tests are acceptable if well-documented.

### Working with executable scripts

The Edit tool loses file permissions (executable bit) when modifying files. When editing shell scripts (`.sh`) or other executables:

1. After editing, restore the executable bit: `chmod +x scripts/your-script.sh`
2. Commit with: `git update-index --chmod=+x scripts/your-script.sh && git commit`

This ensures clones of the repo will have executable scripts. Examples: `scripts/dev-with-ports.sh`, `scripts/find-free-port.sh`.

## Notes

- Two frontend applications (`apps/app-one`, `apps/app-two` placeholder) share one backend and must communicate only through it.
- Messaging broker (Redis vs RabbitMQ) is still an open decision — see `platform-architecture.md`.
- Commit conventions are not yet defined.

## TODO

- **Document container architecture with Mermaid diagram:** Create a visual showing the three containers (postgres, api, frontend), their ports, volumes, and inter-container networking (docker internal network vs host port mapping). Include health checks and startup dependencies.
