# ADR 0011 — Database seeding (engine-driven, decoupled from migrations)

- **Status:** Proposed (2026-06-16)
- **Context area:** Dev/test data — reproducible baseline across revisions and parallel instances

## Context

There is no seed system. Seed data is **embedded inside schema migrations**:
`AddContacts` creates the table *and* inserts Ada Lovelace / Alan Turing / Grace
Hopper plus their v1 `contact_revisions` snapshots (hand-built JSON via
`jsonb_build_object`); `AddCompanies` and `AddRowRevisions` insert rows too.
Because `db:migrate` runs on API container boot, migrating also seeds — which is
why the e2e suite finds "Lovelace".

This entanglement causes five problems:

1. **Runs in every environment, always** — migrations run in prod, so demo rows
   would land in prod.
2. **Immutable & non-refreshable** — changing the seed needs a new migration; a
   dev DB can't be reset to a known baseline without dropping the volume.
3. **Schema and data concerns are entangled** in one file.
4. **Silent drift on the generic engine** — the `contact_revisions` seed
   hand-codes the descriptor's JSON wire shape in SQL. When a `TableDescriptor`
   changes, that SQL is silently wrong.
5. **One seed can't serve two purposes** — e2e needs a minimal deterministic
   fixture; dev wants a richer browsable dataset.

The seed must also stay correct as the schema evolves across revisions, and must
work for the parallel `gammaray-N` instances (ADR-less infra change in
`docker-compose.yml` + `scripts/instance.sh`), each of which has its own
Postgres volume.

## Decision

- **Seed through the app's own write path, not raw SQL.** `db:seed` writes rows
  via the generic engine (`GenericRowService.applyRow`) using the
  `TableDescriptor`s in `packages/core`. Revision-coupling is then *automatic*:
  check out revision R → `db:migrate` builds schema R → `db:seed` imports the
  descriptors at R and writes through the engine at R. Same code, same FieldKind
  coercion, same revision snapshotting, same JSON shape — the seed cannot drift
  from the schema because it goes through the same writer the client uses. (We
  reject version-pinned seed files: they add bookkeeping this gets for free. We
  reject keeping seed-as-migration: it has all five problems above.)
- **`pnpm --filter @gammaray/database db:seed`**, idempotent (upsert by stable
  IDs), with `--reset` to truncate the type-A tables first for a clean baseline.
- **Two layers.** A small **core fixture** (the deterministic rows e2e asserts
  on) and an optional **dev/demo** layer (more rows + relationships) behind a
  flag/env. e2e seeds core only; dev seeds core + demo.
- **Triggers.** (a) Container entrypoint runs `db:migrate` then `db:seed`, where
  the auto-run seeds only when the type-A tables are empty — so restarts don't
  duplicate and each fresh `gammaray-N` volume starts populated. (b) The manual
  script anytime. (c) A Playwright **`globalSetup`** runs `db:seed` for the test
  path (the local `pnpm api dev` the test `webServer` uses does not migrate/seed
  today, and there is no `globalSetup`).
- **Keep the e2e core fixture identical for this change** — the same
  {Ada, Alan, Grace} contacts (same emails/phones/version) **and** their v1
  `contact_revisions` snapshots (`client_id='seed'`), plus the seed company. This
  confines the change to *mechanism, not data*: the ~10 specs that assert
  `getByText('Lovelace')` and the history/merge/conflict specs that depend on the
  initial revision are untouched, and the existing 46-test suite is the
  regression gate. Demo enrichment is additive and cannot affect existing
  assertions.
- **Extract the embedded seeds via a new forward migration** that deletes the
  seed rows the old migrations inserted, leaving applied migration history
  intact. From then on `db:seed` is the single source of seed data.

## Consequences

- Seeds no longer run in prod by accident; dev/test baselines are resettable
  (`db:seed --reset`) and reproducible per revision without volume surgery.
- A new seedable table needs no SQL — add its rows to the seed definition and the
  engine writes them (with revisions if the descriptor is `revisioned`).
- Parallel instances each seed on first boot, so `gammaray-1` and `gammaray-2`
  start from the same baseline in isolated databases.
- One-time cost: the extraction migration, the `db:seed` command, the container
  entrypoint change, and the Playwright `globalSetup`. Behavior-preservation is
  proven by the existing e2e suite passing unchanged.
- Risk is confined to "does the new mechanism reproduce the exact baseline" —
  directly testable, with the 46-test suite as the gate.
