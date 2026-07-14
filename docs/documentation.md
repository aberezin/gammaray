# Documenting GammaRay

How this repo's docs are organized, and the conventions to follow when you add
or edit one. Keeping to these is what keeps a topic-split doc set navigable.

## Where things go

| Location | What lives there |
|---|---|
| [README.md](../README.md) | The landing page — what GammaRay is, quick start, pointer to the docs index. |
| [CLAUDE.md](../CLAUDE.md) | **Agent conventions and runbook** — rules an editor would surprise-break if they didn't know them. Not a status log, not a TODO list. |
| [platform-architecture.md](../platform-architecture.md) | Architecture decisions and topology — stack, deployment layout, ADR index, load-test summary. |
| [DEV_SETUP.md](../DEV_SETUP.md) | How to boot the stack locally and test it in Chrome (setup, gotchas, troubleshooting). |
| [LOCAL.md](../LOCAL.md) *(git-ignored)* | Machine-specific overrides — package manager paths, node version manager, Docker runtime. Copy from `LOCAL.example.md`. |
| [docs/](./) | Landing index ([README.md](README.md)); topic docs go here. |
| [docs/adr/](adr/) | Architecture Decision Records — one file per decision, numbered. Immutable once accepted; update via a superseding ADR. |
| [docs/backlog.md](backlog.md) | The known engineering backlog / TODOs. Docs describe *current state*; forward-looking work goes here. |
| [docs/concepts.md](concepts.md) | Vocabulary — **type-A**, `TableDescriptor`, field kinds, merge strategies, revisioned, temporal validity, paged tables, data epoch, suspect state. When you introduce a term other docs will lean on, define it here. |
| [docs/erd.md](erd.md) | The PostgreSQL entity-relationship diagram. |
| [docs/example-app-spec.md](example-app-spec.md) | The type-A app-spec template (worked for the Crate music library). |
| [CHANGELOG.md](../CHANGELOG.md) *(not yet present)* | Per release, when we start tagging. |

## House style

- **Open with one line saying what the doc is** — no throat-clearing.
- **Be concrete and specific to this codebase** — real file paths, real
  command names, real env vars. Verify they exist; don't invent flags or
  helpers.
- Prefer **tables** for enumerations and **fenced code blocks** for commands
  and layouts.
- Match the tone of sibling docs; no filler.
- **End every doc with `## See also`** (man-page style), linking the
  sibling/related pages a reader would go to next. This is what keeps a
  per-topic doc set navigable — it's a hard convention, not a nicety.
- **Docs describe current state, not future intent.** Backlog items and open
  questions go in [`backlog.md`](backlog.md), not inline in topic docs
  (where they rot and confuse readers about what's real).

## Diagrams — we use Mermaid

Diagrams are written in **[Mermaid](https://mermaid.js.org/)** inside fenced
` ```mermaid ` blocks. Mermaid renders on GitHub, stays diffable, and lives
inside the doc so there is no separate binary to keep in sync.

**Syntax gotchas worth knowing (they fail silently):**

- **No unescaped `;` in labels.** Mermaid treats `;` as a statement separator,
  so text after it parses as a new (invalid) statement and the diagram just
  doesn't render. Use a comma, em-dash, or `<br/>` instead.
- Wrap labels containing `{ } ( ) [ ]`, quotes, or a leading `#` in `"…"`.
- Use `<br/>` to force a line break inside a label.
- **Sanity-check on GitHub preview** before committing — a broken diagram
  fails quietly.

## Updating docs when you change something

The point of these triggers is that a code change often implies a docs
change. Batch them into the same PR — a stale doc is worse than no doc.

- **New ADR** → `docs/adr/00NN-<slug>.md` **and** a row in
  [`platform-architecture.md`](../platform-architecture.md) `## Architecture
  Decision Records (ADRs)`.
- **New table descriptor** (in `packages/rolodex-schema` or
  `packages/music-schema`) → make sure `docs/erd.md` still matches the schema;
  if the new table exercises a novel framework feature, add an ADR.
- **New migration** (`packages/database/src/migrations/`) → the migration file
  itself carries the "why" comment; if it changes an invariant (defaults,
  nullability, a new column meaning), update `docs/erd.md` and any ADR that
  covered the old shape.
- **New `apps/*` example app** → update `README.md` "What's in the repo,"
  the topology diagram in `platform-architecture.md`, and the `docker-compose.yml`.
- **Change to the compose topology** (services, published ports, healthchecks,
  networking) → update `platform-architecture.md` `## Deployment topology`
  (the diagram + the four bullets) and `DEV_SETUP.md` if setup steps shift.
- **New setup gotcha or workaround for local dev** → `DEV_SETUP.md`.
- **New agent-facing convention** (a rule that would surprise an editor who
  didn't know it) → `CLAUDE.md`. If it's just a fact about the current
  codebase that can be read directly, don't add it — that's noise.
- **New load test or a substantial perf shift** → dated entry in
  `load-tests/RESULTS.md` and update the summary in `load-tests/README.md`.
- **New shared term** (a word other docs will lean on — e.g. adding a
  new descriptor flag like `paged`, or a client-side concept like
  "suspect") → define it in `docs/concepts.md`. If it already appears in
  more than one doc, it belongs there.

## See also

- [README.md](README.md) — the documentation landing index.
- [../platform-architecture.md](../platform-architecture.md) — the ADR index
  and where architecture decisions live.
- [../CLAUDE.md](../CLAUDE.md) — the agent runbook this style keeps clean.
- [backlog.md](backlog.md) — the destination for forward-looking work that
  used to be stashed in topic docs.
