# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GammaRay is a POC whose goal is to develop a reliable tech stack that can be coded by agents (the engineering team is Alan Berezin plus various agents). The example app, **NoteSync** (`apps/example`), is a small contact CRM (contacts, companies, categories, tags) built entirely on the generic, descriptor-driven type-A engine — it exercises offline-first sync, references, many-to-many, and conflict resolution. A second example, **Crate** (`apps/music`, a music library), reuses the same engine to prove the framework is app-agnostic. (A hand-built single-textarea "note" feature was the original first app; it predated the generic engine and was retired once the engine could express everything generically — see ADR-era history and migration `DropNotes`.)

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
packages/ui       Framework React components (RecordForm, RecordList, RecordConflictBanner, Pagination, OfflineToggle, SyncIndicator) — all descriptor-driven
load-tests        k6 load tests for the realtime path (see load-tests/README.md + RESULTS.md)
```

### Data flow

```
RxDB (IndexedDB)  ←→  NestJS GraphQL  ←→  PostgreSQL
     ↑                     ↑
     └──── WebSocket subscription (rowUpdated) for live push
```

RxDB is the authoritative local store; the generic client runtime (`@gammaray/client`) replicates every descriptor's collection via `replicateRxCollection` (`packages/client/src/batch-sync.ts`). Pull is polling + the `rowUpdated` WebSocket stream; push calls the generic `pushBatch` mutation. (A `paged` table fetches its list via `pageRows` instead of full-replicating — ADR 0013.)

### Conflict resolution

The generic engine (`GenericRowService.applyRow` in `apps/api/src/engine/generic-row.service.ts`) implements optimistic concurrency with a DB row lock, for every type-A table:
- Client sends `expectedVersion`; if the server's `row.version !== expectedVersion` → conflict (a `revisioned` table first attempts a 3-way merge against the common ancestor; see ADR 0010).
- The conflicted client revision is persisted as `conflictStatus: 'detected'` in the generic `row_revisions` table.
- The frontend receives the server row in a `RowConflict` and surfaces the generic `RecordConflictBanner` ("Keep mine / Keep theirs").
- Resolution calls the `resolveRowConflict` mutation, which stamps the revision `conflictStatus: 'resolved'`.

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
| `apps/api/src/engine/generic-row.service.ts` | Generic applier: conflict logic, 3-way merge, revisions, `pageRows` |
| `apps/api/src/engine/rows.resolver.ts` | Generic GraphQL surface (`rows`/`pushBatch`/`rowUpdated`/`pageRows`/…) |
| `apps/api/src/sync/sync.broker.ts` | PubSub abstraction (swap here for Redis) |
| `packages/client/src/batch-sync.ts` | RxDB replication + BatchCoordinator (push) wiring |
| `packages/client/src/use-record-page.ts` | Generic client data-layer for one type-A table |
| `packages/client/src/rxdb.ts` | RxDB database init (Dexie storage) |
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
- **Build-time descriptor validator (`@gammaray/core`):** Validate a `TableDescriptor[]` set for referential integrity so typos fail at build/test time, not runtime. Check that every `Reference.references.collection` and `MultiReference.via.{joinCollection,targetCollection}` resolves to a known collection; that `via.{localField,remoteField}` exist as fields on the join table; that every `titleField` exists on its target; and that `display.titleFields` / `identity.field` reference real fields. (Surfaced building `@gammaray/music-schema` — the check was done by hand; it belongs in the framework and should run in each schema package's lint + the API engine's startup.)
- **Single entity registry for the API (remove the double registration):** TypeORM entities are listed in TWO places that must stay in sync — `packages/database/src/data-source.ts` (the migration CLI) and `apps/api/src/database/database.module.ts` (the NestJS runtime `TypeOrmModule`). Adding a table and updating only one yields a runtime `EntityMetadataNotFoundError: No metadata for "X"` (cost an iteration in PR #27). Export one canonical `ALL_ENTITIES` array from `@gammaray/database` and consume it in both places (and ideally derive the engine's `schema-tables.ts` registration from the same source so descriptor↔entity wiring lives in one spot).
- **Data-epoch guard is load-time only → already-open clients silently go stale (ADR 0012):** `DataEpochGuard` checks `serverDataEpoch` once on mount (`useEffect([])`), and out-of-band server data changes (seed/migrate) write through the engine directly — NOT the mutation resolver — so they emit no live `rowUpdated` WebSocket events. Net: an already-open tab neither pulls the new rows live nor re-checks the epoch, so it shows stale data until the user happens to reload (the manual fix). The load-time reslate itself is correct + tested (`apps/example/tests/data-epoch.spec.ts`); the gap is *mid-session* detection. Options: (a) poll `serverDataEpoch` periodically (or subscribe to an epoch-changed WS event) while the app is open and prompt-to-reslate then; (b) have seed/migrate bump the epoch AND emit a lightweight "data changed" signal. Low priority for runtime (out-of-band changes are rare in prod), but it's the exact confusion the music seed caused (PR #29 — a pre-seed tab looked empty until reload). Also minor UX: declining the reslate prompt acknowledges the new epoch and never nudges again, leaving the client stale with no further cue.
- **Many-to-many relationship changes aren't audited (no parent touch, no link history):** Changing a record's m2m links (album↔genre, track↔artist, contact↔tag) writes only to the join table — the parent row's `version`/`updatedAt` don't move and the change never appears in the parent's revision history (`version` tracks the row's own columns; verified: adding a genre leaves `album.version` at 1, renaming the title bumps it to 2). Working as designed, but a relationship edit currently leaves no trace on the parent and the join row's own history is thin (WholeRow, non-revisioned; a remove is a soft-delete tombstone). **Preferred direction (Alan):** give join tables *temporal validity* — an effective/start date and an end date per link — so each relationship's lifetime is recorded; removing a link sets its end date instead of (or alongside) the soft-delete, yielding a full "when was this link active" history. That makes relationship changes auditable in their own right and could feed a parent "last modified / recent activity" view without polluting the parent's column-version/conflict semantics. Alternatives considered + deferred: touch the parent's `updatedAt` only (cheap, needs a server "touch" op), or bump the parent `version` + add a revision (most intuitive, but the revision snapshot can't show *which* link changed since m2m is virtual). Framework-wide decision — applies to every join table, not just music.
- **Server-managed fields show a stale local value briefly after a save (cosmetic):** When you edit a record, the client patches only the writable columns; the server bumps `version` (and `updated_at`) on apply, and that value comes back via the replication reconcile a round-trip later. So right after Save, the read-only `Version`/`Updated` fields in the detail form still show the pre-save local value (e.g. version 1) and only update to the bumped value (2) once the push reconciles — a quick glance can look like "the edit didn't bump the version" even though it did (confirmed: the engine bumps correctly, see `apps/api/src/engine/version.spec.ts`). Options: optimistically reflect the expected bump on save, show a transient "saving…/syncing…" state on those fields, or disable them until reconciled. Purely cosmetic; no data is wrong.
- **Generic manual-merge conflict resolution (framework feature gap):** The generic `RecordConflictBanner` offers only **Keep mine / Keep theirs** — the retired note app additionally let the user hand-edit a merged value before resolving. Bringing that to the framework means a field-aware merge editor in the banner (pick/edit per field, not whole-row) plus a `resolveWith(customRow)` path through `resolveRowConflict` (the mutation already accepts an arbitrary row, so the server side largely exists). Complex in the general case — fields have types (Reference/MultiReference/Int/Bool), so a generic per-field merge UI is non-trivial. Surfaced retiring notes (the note's textarea made manual merge trivial; a generic descriptor-driven one is not).
- **Generic "restore a past version" from history (framework feature gap):** `RecordPage` renders revision history read-only; the retired note app let the user restore a past revision into the editor. Generically this is "write an old `row_revisions` snapshot back as a new version" — needs a server op (re-apply a chosen revision's `data` as a fresh versioned write, with conflict semantics) and a Restore button per revision in the history list. Complex in the general case because a snapshot may reference rows/links that have since changed or been deleted (References/MultiReferences), so a naive restore can resurrect dangling refs. Surfaced retiring notes.
