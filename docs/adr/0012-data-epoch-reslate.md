# ADR 0012 — Data epoch + client reslate for server-reset divergence

- **Status:** Proposed (2026-06-16)
- **Context area:** Offline-first sync — distinguishing SDLC/version divergence from legitimate runtime divergence

## Context

The local RxDB replica can diverge from the server in two fundamentally
different ways, and they need opposite handling:

1. **SDLC / version divergence** — the server's data or schema changed as a
   development artifact: `docker compose down -v`, `db:seed --reset`, a
   destructive migration, a restored backup. The client's replica reflects a
   *previous server lifetime*. Row-level reconciliation is **wrong** here: there
   is nothing to merge, and re-pushing orphaned rows either loops or resurrects
   stale-lifetime rows as duplicates (e.g. an old seed "Acme" re-created next to
   the new seed's "Acme" under a different id).
2. **Legitimate runtime divergence** — valid offline edits against the *same*
   server lifetime that the server hasn't seen yet. This is what sync + conflict
   resolution exists for; it must be preserved and reconciled.

Observed symptom of (1): `[batch] rejected "contact" … "missing reference
company:<old-id>"` — a contact in IndexedDB references a company that existed on
the pre-reset server. The push is dropped (`batch-sync.ts`), leaving a stuck
local orphan that re-errors every load.

The codebase already treats **schema** SDLC-divergence this way: `rxdb.ts`
wipes + rebuilds the local store on a schema mismatch (DB6/DM5). This ADR extends
the same "SDLC change → clean reslate, never merge" philosophy to **data**.

## Decision

- **Server data epoch.** The server holds a singleton epoch id that identifies
  the current dataset generation (e.g. `app_meta(epoch uuid)`). It is exposed to
  clients (a small `serverDataEpoch` query, and/or included in pull metadata).
- **Bump on any out-of-app change that actually mutates data** (conservative
  now; can be narrowed as the app stabilizes, or parameterized via build/env as a
  nice-to-have):
  - `db:migrate` — bump only when migrations were **applied** (not "no pending").
  - `db:seed` — bump only when it **created or reset** rows (a no-op idempotent
    boot does NOT bump, so a plain restart doesn't force a reslate).
  - a manual `db:epoch:bump` for ad-hoc SQL / backup restores.
- **Client reslate on mismatch.** The client stores the epoch it last synced
  against. At replication start it compares:
  - **mismatch** → the server was reset. **Reslate**: if there are no unsynced
    local writes, silently `clearLocalDatabase()` + reload; if discarding would
    lose unsynced edits, prompt first ("the server was reset — refresh your local
    copy?"). Reuses the `clearLocalDatabase()` primitive from the Reset-local
    feature.
  - **match** → normal sync; store epoch on first run.
- **No speculative parent re-push.** For a *same-epoch* missing-reference (rare —
  the BatchCoordinator already sends parent+child atomically), the client
  **surfaces** the row as un-syncable and points at *Reset local data*. It never
  resurrects a parent (the duplicate hazard) and never blind-overwrites a child
  (a re-push, if any, would just ride the existing revisioned merge/conflict
  path). This sidesteps the duplicate and concurrent-change hazards by
  construction.

## Consequences

- The real-world error (orphan after a dev reset) self-heals: the epoch mismatch
  triggers a clean reslate instead of a stuck orphan, with no manual DevTools
  clear needed.
- SDLC resets can never be silently "merged" into client data — the epoch is a
  structural separator, not a heuristic, enforcing the boundary the team wants.
- Cost: a singleton epoch row + bump hooks in migrate/seed, a `serverDataEpoch`
  read, and a client-side epoch check before replication. The reslate UX reuses
  the Reset-local plumbing.
- The conservative bump policy may reslate clients more than strictly necessary
  while the app stabilizes; that is intentional and reversible (narrow the
  triggers, or gate via a build/env flag, later).
- The manual *Reset local data* button (shipped separately) remains the
  always-available escape hatch.
