# GammaRay documentation

Documentation for GammaRay — a POC descriptor-driven, offline-first stack
built to be coded by agents. New here? Start with the top-level
[README](../README.md) for the overview and quick start, and
[`CLAUDE.md`](../CLAUDE.md) for the repo conventions agents follow.

## Reference

| Doc | What it covers |
|---|---|
| [../README.md](../README.md) | What GammaRay is, quick start, links into the docs. |
| [../CLAUDE.md](../CLAUDE.md) | Agent conventions and runbook — the rules an editor would surprise-break without knowing. |
| [../platform-architecture.md](../platform-architecture.md) | Architecture: core stack, repo structure, data model pointer, **deployment topology**, ADR index, load-test summary. |
| [../DEV_SETUP.md](../DEV_SETUP.md) | How to run the stack locally and test in Chrome (setup, gotchas, troubleshooting). |
| [../LOCAL.example.md](../LOCAL.example.md) | Template for `LOCAL.md` — machine-specific overrides (git-ignored). |
| [concepts.md](concepts.md) | Core vocabulary — **type-A**, `TableDescriptor`, field kinds, merge strategies, revisioned/temporal-validity/paged, data epoch, suspect state. Read this first if the terms in other docs are unfamiliar. |
| [documentation.md](documentation.md) | How to document this repo — where things go, `See also` rule, Mermaid convention, update triggers. |
| [backlog.md](backlog.md) | Known engineering backlog — items not yet in code and not yet ADR'd. |
| [erd.md](erd.md) | PostgreSQL entity-relationship diagram (hard FKs, soft references, revision log). |
| [example-app-spec.md](example-app-spec.md) | The type-A app-spec template (worked for the "Crate" music library). |

## Architecture Decision Records

Numbered, immutable once accepted; superseding decisions get a new number
and reference the one they replace. Full list on
[`platform-architecture.md`](../platform-architecture.md) `## Architecture
Decision Records (ADRs)`.

| ADR | Topic |
|---|---|
| [0001](adr/0001-concurrency-token-model.md) | Concurrency token model for type-A rows |
| [0002](adr/0002-descriptor-driven-tables.md) | Descriptor-per-table, schema-driven architecture |
| [0003](adr/0003-field-aware-client-uuids.md) | Field-aware change control with client-generated UUIDs |
| [0004](adr/0004-merge-strategy-as-table-policy.md) | Merge strategy as per-table policy |
| [0005](adr/0005-soft-foreign-key-references.md) | Soft (un-enforced) foreign-key references |
| [0006](adr/0006-server-side-batch-sync.md) | Server-side transactional batch sync |
| [0007](adr/0007-many-to-many-virtual-fields.md) | Many-to-many via a join table + a virtual MultiReference field |
| [0008](adr/0008-token-refresh-and-sync-health.md) | Token refresh + a sync-health "suspect" guard |
| [0009](adr/0009-generic-server-engine-json-transport.md) | Generic descriptor-driven server engine, JSON transport |
| [0010](adr/0010-generic-revisions-merge-conflict.md) | Generic revisions, 3-way merge, and conflict resolution |
| [0011](adr/0011-database-seeding.md) | Database seeding (engine-driven, decoupled from migrations) |
| [0012](adr/0012-data-epoch-reslate.md) | Data epoch + client reslate for server-reset divergence |
| [0013](adr/0013-at-scale-paged-tables.md) | At-scale tables: per-table opt-in server pagination |
| [0014](adr/0014-paged-write-direct-through-coordinator.md) | Paged-table writes bypass RxDB replication and go directly through the BatchCoordinator |

## Load testing

| Doc | What it covers |
|---|---|
| [../load-tests/README.md](../load-tests/README.md) | k6 scripts, how to run them, headline summary. |
| [../load-tests/RESULTS.md](../load-tests/RESULTS.md) | Dated log of load-test runs — update after any change that could affect perf. |

## See also

- [../README.md](../README.md) — landing page, quick start.
- [../CLAUDE.md](../CLAUDE.md) — agent conventions.
- [documentation.md](documentation.md) — the house-style rules for this doc set.
