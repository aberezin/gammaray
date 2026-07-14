# GammaRay

A POC for a **tech stack that agents can build in.** GammaRay isn't the product
— the *stack* is the product. The example apps prove that a generic,
descriptor-driven engine can express real offline-first, sync-and-conflict
apps without per-table code.

## What's interesting

- **Descriptor-driven engine.** Each table (a "**type-A**" table — see
  [concepts.md](./docs/concepts.md)) is described by one
  `TableDescriptor`: fields, kinds, merge strategy, references, join
  tables. The server engine and the client runtime are entirely generic —
  adding a table is configuration, not code. See
  [ADR 0002](./docs/adr/0002-descriptor-driven-tables.md) and
  [ADR 0009](./docs/adr/0009-generic-server-engine-json-transport.md).
- **Offline-first with real sync + conflict resolution.** The client owns an
  RxDB replica, replicates over GraphQL + a WebSocket push channel, and
  survives disconnects. When two clients diverge, the server performs a
  3-way merge for `revisioned` tables or hands the conflict to the UI.
  See [ADR 0010](./docs/adr/0010-generic-revisions-merge-conflict.md).
- **Type-A m2m with temporal validity.** Join tables record
  `effectiveFrom`/`effectiveTo` for every link, so link history is
  queryable without touching the parent's version/conflict semantics.
  See [ADR 0007](./docs/adr/0007-many-to-many-virtual-fields.md).
- **App-agnostic.** Two example apps share the same engine, packages, and
  API: **Rolodex** (`apps/example`, a contact CRM) and **Crate**
  (`apps/music`, a music library). Swapping the schema swaps the app.

## Quick start

**👉 [DEV_SETUP.md](./DEV_SETUP.md)** — how to run the stack locally and test
it in Chrome. **Start here.**

TL;DR:
```bash
docker compose up -d          # postgres :5432, api :3001, rolodex :3000, crate :3010
open http://localhost:3000    # register, then explore Contacts / Companies / Categories / Tags
```

## What's in the repo

```
apps/
  api/          NestJS backend — GraphQL + REST auth, shared across all frontends
  example/      Next.js 15 frontend — Rolodex (contact CRM)
  music/        Next.js 15 frontend — Crate (music library)
packages/
  core/         The descriptor system (FieldKind, TableDescriptor, MergeStrategyKind) + generic merge/dependency logic
  rolodex-schema/  Rolodex's TableDescriptors
  music-schema/    Crate's TableDescriptors
  client/       Generic RxDB + replication runtime + RecordPage
  ui/           Framework React components (RecordForm, RecordList, RecordConflictBanner, …)
  database/     TypeORM entities + migrations + data-source factory
  auth/         JwtPayload shared between api and frontends
load-tests/     k6 load tests for the realtime path
docs/           Topic docs, ADRs, ERD, example-app-spec
```

## Documentation

Full index in [**docs/README.md**](./docs/README.md). The main entry points:

| Doc | Audience | What |
|---|---|---|
| [DEV_SETUP.md](./DEV_SETUP.md) | Someone running it locally | Setup, gotchas, troubleshooting |
| [docs/concepts.md](./docs/concepts.md) | Anyone reading other docs | **Vocabulary** — type-A, descriptors, merge strategies, temporal validity, data epoch, etc. |
| [platform-architecture.md](./platform-architecture.md) | Architects | Stack, deployment topology, ADR index |
| [CLAUDE.md](./CLAUDE.md) | Agents | Conventions and runbook |
| [docs/documentation.md](./docs/documentation.md) | Anyone editing docs | House style, `See also` rule, update triggers |
| [docs/backlog.md](./docs/backlog.md) | Contributors | Known work not yet in code |

## SDLC

### Test-first bug fixing

When fixing a bug, write a failing test *before* changing any production code:

1. **Reproduce.** Write a unit, integration, or functional/e2e test that
   captures the bug and **fails** for the right reason. Run it and confirm the
   failure matches the reported behavior.
2. **Fix.** Change the production code to make that test pass — and no more.
3. **Verify.** Re-run the new test (now green) and the full suite to confirm no
   regressions.

Pick the lowest level of test that reliably reproduces the bug: a unit test if
the logic is isolated, an integration test if it spans modules, a functional/e2e
test (Playwright) if it only manifests through the running app.

When a single change touches multiple distinct defects, prefer **one failing
test per defect** so each can be fixed and verified independently.

### Open: merge strategy

**Undecided:** whether pull requests should be squash-merged or merged with a
merge commit. PR #1 was merged as a merge commit, but no policy has been agreed.
Decide this and document it here (and enforce it in the repo's branch settings)
so branch history stays consistent.

### Load tests and the results log

The realtime path has k6 load tests in [`load-tests/`](./load-tests/). After a
body of work that could affect performance (sync, broker, DB, or query
changes), re-run the relevant load tests and compare against
[`load-tests/RESULTS.md`](./load-tests/RESULTS.md). If the results differ
**substantially** — a meaningful shift in throughput, latency percentiles,
connection capacity, or any new errors/conflicts — add a dated entry to
[`RESULTS.md`](./load-tests/RESULTS.md) (using its template, with commit,
machine, and metrics) and update the headline summary in
[`load-tests/README.md`](./load-tests/README.md). Keeping the log current is what
lets the next person or agent tell an intentional change from a regression.

### Agents

This repo is built by Claude Code agents alongside the human engineer, so the
agent toolchain is part of the SDLC.

**TypeScript LSP.** Agents use a TypeScript language server for code intelligence
— go-to-definition, find-references, hover types, and automatic post-edit
diagnostics — rather than relying on grep + per-package `tsc --noEmit`. It is the
`typescript-lsp@claude-plugins-official` plugin, enabled for the project in
[`.claude/settings.json`](./.claude/settings.json) so every agent/teammate gets
it. Setup:

```bash
npm install -g typescript-language-server typescript   # the language server binary
# the plugin is already enabled in .claude/settings.json; restart Claude Code to load it
```

Cross-package `@gammaray/*` resolution relies on the workspace packages being
built (`core`/`database`/`auth` resolve via their emitted `.d.ts`, with
`declarationMap` jumping to source; `ui` resolves to its `src`). Keep them built
(`pnpm build`) so the LSP doesn't report false-positive unresolved imports.

### Git LFS — not used

This repo does **not** use Git LFS (no `.gitattributes` filters, nothing tracked).
If `git push` fails on `info/lfs/locks/verify` (a machine-level git-lfs install
intercepting the push), disable the optional lock check for your clone:

```bash
git config lfs.https://github.com/aberezin/gammaray.git/info/lfs.locksverify false
```

## See also

- [docs/README.md](./docs/README.md) — the full documentation index.
- [platform-architecture.md](./platform-architecture.md) — architecture, topology, and the ADR index.
- [DEV_SETUP.md](./DEV_SETUP.md) — the setup guide referenced by "Quick start."
- [CLAUDE.md](./CLAUDE.md) — the conventions agents follow when editing this repo.
