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
pnpm --filter @gammaray/example dev      # Next.js frontend on :3000

# Build
pnpm build                               # all packages and apps
pnpm --filter @gammaray/core build       # must run before api builds

# Type-check (no emit)
pnpm --filter @gammaray/api lint
pnpm --filter @gammaray/example lint

# Run database migrations
pnpm --filter @gammaray/database db:migrate

# Start PostgreSQL (required before running API)
docker compose up -d

# Load tests (k6) — API must be running on :3001
k6 run load-tests/k6/single-socket.js    # baseline; see load-tests/README.md
```

Build order matters: `packages/core` → `packages/notesync-schema` → `packages/database` → `apps/api`. (`@gammaray/core` is the framework — the descriptor *system* + generic merge/sync logic; `@gammaray/notesync-schema` holds the example app's concrete `TableDescriptor`s built on it.) The `packages/ui` has no separate build step — Next.js transpiles it directly.

## Architecture

### Repository structure

```
apps/api          NestJS backend — GraphQL + REST auth endpoints
apps/example      Next.js 15 frontend (App Router)
packages/core     Framework: the descriptor system (FieldKind, TableDescriptor, MergeStrategyKind), shared DTOs/enums (SyncStatus, ConflictStatus), generic merge + dependency-order logic
packages/notesync-schema  The NoteSync example app's data model: the concrete TableDescriptors (contact, company, category, tag) built on @gammaray/core. Swap this to drive a different app.
packages/auth     JwtPayload interface shared between api and the example app
packages/database TypeORM entities, migrations, and data source config
packages/ui       Framework React components (RecordForm, RecordList, RecordConflictBanner, OfflineToggle, SyncIndicator); note-specific components live in apps/example
load-tests        k6 load tests for the realtime path (see load-tests/README.md + RESULTS.md)
```

### Data flow

```
RxDB (IndexedDB)  ←→  NestJS GraphQL  ←→  PostgreSQL
     ↑                     ↑
     └──── WebSocket subscription (noteUpdated) for live push
```

RxDB is the authoritative local store; it replicates via `replicateRxCollection` in `apps/example/src/lib/sync.ts`. Pull is polling + WebSocket stream; push calls the `pushNote` mutation.

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
| `apps/example/src/lib/sync.ts` | RxDB replication wiring |
| `apps/example/src/lib/rxdb.ts` | RxDB database init (Dexie storage) |
| `apps/example/src/store/note.store.ts` | Zustand UI state (syncStatus, conflict, offline) |
| `packages/database/src/migrations/` | TypeORM migration files |
| `platform-architecture.md` | Architecture decision log — update when decisions change |

## Containerization

All three services (PostgreSQL, API, frontend) are containerized with `docker compose`. The runtime on macOS is **Colima** (not Docker Desktop). See `DEV_SETUP.md` for the full guide.

**Recommended: full stack in Docker** (verified — auth + e2e suite pass against it):
```bash
docker compose up -d   # frontend :3000, API :3001, Postgres :5432
```
Open http://localhost:3000 in Chrome. Colima forwards both published ports to the host; there is **no** port-forwarding limitation.

**Browser-side vs server-side API URL (the key gotcha):** the frontend reaches the API from two places that need different URLs when containerized:
- **Browser-side** (RxDB sync, GraphQL, register form) → `NEXT_PUBLIC_API_URL=http://localhost:3001` (the host's published port).
- **Server-side** (NextAuth `authorize`/refresh in `apps/example/src/auth.ts`) → `API_INTERNAL_URL=http://api:3001` (the compose service name). Inside the frontend container `localhost:3001` is the frontend itself, not the API. Both are set in `docker-compose.yml`. Getting the server-side one wrong looks like "Invalid email or password" on every login.

**Alternative: frontend on the host** (fast Fast-Refresh iteration) — run `docker compose up -d postgres api` then `pnpm --filter @gammaray/example dev`. On the host, `localhost:3001` works for both call sites, so `API_INTERNAL_URL` is not needed.

**If `localhost:3000` hangs:** it's a stale host process on the port, not Colima — `lsof -nP -i :3000` and kill any `node`/`next-server` (Colima's own forwarder shows up as `ssh`).

**Dockerfiles:**
- `apps/api/Dockerfile` — NestJS on :3001, runs migrations on startup
- `apps/example/Dockerfile` — Next.js on :3000 (binds `0.0.0.0` so the container is reachable)

## SDLC

### Branching

- **Major version upgrades** (framework, runtime, major dependency): create a feature branch (e.g. `chore/next-upgrade-16`), commit there, then ask for review before merging. This gives a checkpoint to assess risk.
- **Other changes**: commit directly to main per the workflow ("commit after each major change; PRs only when asked").

### Testing

**All new features and bug fixes must be tested before committing.** Testing can be:

- **Automated (preferred):** Write a Playwright e2e test in `apps/example/tests/` that exercises the feature deterministically. Run with `pnpm --filter @gammaray/example test:e2e`
- **Manual (acceptable for simple UI features):** Start the dev stack (`docker compose up -d && pnpm --filter @gammaray/example dev`), manually test in Chrome, document test steps in the commit message or PR

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

### Git LFS — not used

This repo does **not** use Git LFS (no `.gitattributes` filters, nothing tracked). If a `git push` ever fails on `info/lfs/locks/verify` (a machine-level git-lfs install intercepting the push), disable the optional lock check for this clone:

```bash
git config lfs.https://github.com/aberezin/gammaray.git/info/lfs.locksverify false
```

(Per-clone `.git/config`, not committed — re-run after a fresh clone if needed.)

## Notes

- Two frontend applications (`apps/example`, `apps/app-two` placeholder) share one backend and must communicate only through it.
- Messaging broker (Redis vs RabbitMQ) is still an open decision — see `platform-architecture.md`.
- Commit conventions are not yet defined.

## TODO

- **Document container architecture with Mermaid diagram:** Create a visual showing the three containers (postgres, api, frontend), their ports, volumes, and inter-container networking (docker internal network vs host port mapping). Include health checks and startup dependencies.
