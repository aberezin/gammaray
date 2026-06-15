# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GammaRay is a POC whose goal is to develop a reliable tech stack that can be coded by agents (the engineering team is Alan Berezin plus various agents). The first application is **NoteSync** — a single-textarea note per user with full version history, designed to exercise offline-first sync and conflict resolution.

## Local machine

Read `LOCAL.md` (git-ignored; template in `LOCAL.example.md`) for machine-specific nuances — package manager, where global tools live, PATH quirks, and local service setup. It captures environment details (e.g. MacPorts vs Homebrew, the language-server PATH) that aren't derivable from the code.

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

## SDLC

### Branching

- **Major version upgrades** (framework, runtime, major dependency): create a feature branch (e.g. `chore/next-upgrade-16`), commit there, then ask for review before merging. This gives a checkpoint to assess risk.
- **Other changes**: commit directly to main per the workflow ("commit after each major change; PRs only when asked").

## Notes

- Two frontend applications (`apps/app-one`, `apps/app-two` placeholder) share one backend and must communicate only through it.
- Messaging broker (Redis vs RabbitMQ) is still an open decision — see `platform-architecture.md`.
- Commit conventions are not yet defined.
