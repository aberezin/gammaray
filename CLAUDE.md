# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

GammaRay is a POC whose goal is to develop a reliable tech stack that can be coded by agents (the engineering team is Alan Berezin plus various agents). The example app, **Rolodex** (`apps/example`), is a small contact CRM (contacts, companies, categories, tags) built entirely on the generic, descriptor-driven type-A engine — it exercises offline-first sync, references, many-to-many, and conflict resolution. A second example, **Crate** (`apps/music`, a music library), reuses the same engine to prove the framework is app-agnostic. (A hand-built single-textarea "note" feature was the original first app; it predated the generic engine and was retired once the engine could express everything generically — see ADR-era history and migration `DropNotes`.)

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

Build order matters: `packages/core` → `packages/rolodex-schema` → `packages/database` → `apps/api`. (`@gammaray/core` is the framework — the descriptor *system* + generic merge/sync logic; `@gammaray/rolodex-schema` holds the example app's concrete `TableDescriptor`s built on it.) The `packages/ui` has no separate build step — Next.js transpiles it directly.

## Architecture

### Repository structure

```
apps/api          NestJS backend — GraphQL + REST auth endpoints
apps/example      Next.js 15 frontend (App Router)
packages/core     Framework: the descriptor system (FieldKind, TableDescriptor, MergeStrategyKind), shared DTOs/enums (SyncStatus, ConflictStatus), generic merge + dependency-order logic
packages/rolodex-schema  The Rolodex example app's data model: the concrete TableDescriptors (contact, company, category, tag) built on @gammaray/core. Swap this to drive a different app.
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

Four services (PostgreSQL, API, Rolodex frontend, Crate frontend) run under `docker compose` on macOS via **Colima** (not Docker Desktop). For the topology diagram and published-ports/internal-DNS/persistence/startup rules, see [`platform-architecture.md`](./platform-architecture.md) `## Deployment topology`. For setup, the browser-side-vs-server-side URL split, VM-IP-access gotchas, and troubleshooting, see [`DEV_SETUP.md`](./DEV_SETUP.md).

Two things worth knowing when editing here:

- **Under claudebox** (agent-run sessions), `docker-compose.override.yml` strips the source bind-mounts with `!reset []` because the workspace host path is not visible to the Colima VM. Application containers are rebuilt from their Dockerfiles rather than hot-reloading from the workspace.
- **`api` startup** runs `db:migrate` then `db:seed` before `dev`, so migrations always apply on boot. The bash `CMD` is in `apps/api/Dockerfile`.

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

**Ad-hoc CDP scripts (`cb-browser cdp` / `cb-browser script` driving the human's real Chrome via the browser bridge):** the tabs opened by `context.newPage()` **do not go away when the script exits** — `browser.close()` only detaches the CDP connection; the tab lives on in the human's Chrome until explicitly closed. Wrap the whole script body in `try { ... } finally { await page.close() }` (and hook `SIGINT`/`SIGTERM` to the same cleanup) so a crash mid-run doesn't leak a tab. Do NOT try to sweep multiple tabs by URL on crash — the human may have their own legitimate tabs open at the same URL.

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

## See also

- [docs/README.md](docs/README.md) — full documentation index.
- [platform-architecture.md](platform-architecture.md) — architecture, deployment topology, ADR index.
- [DEV_SETUP.md](DEV_SETUP.md) — how to boot and troubleshoot the stack locally.
- [docs/documentation.md](docs/documentation.md) — the house-style rules that keep this doc set from rotting.
- [docs/backlog.md](docs/backlog.md) — engineering backlog (was previously an inline TODO section here).
