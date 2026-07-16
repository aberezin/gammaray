# Engineering backlog

Known work not yet in code, not yet in an ADR. Docs describe **current
state**; forward-looking items live here so topic docs stay honest about
what's real.

When something on this list becomes a decision (rather than an open
question), promote it to an ADR (`docs/adr/00NN-*.md`) and drop it from
here. When it ships, drop it.

## Framework feature gaps

- **Generic manual-merge conflict resolution.** `RecordConflictBanner`
  currently offers only *Keep mine / Keep theirs*. The retired note app
  additionally let the user hand-edit a merged value before resolving.
  Bringing that back to the framework generically means a **field-aware
  merge editor** in the banner (pick/edit per field, not whole-row) plus a
  `resolveWith(customRow)` path through `resolveRowConflict` (the mutation
  already accepts an arbitrary row, so the server side largely exists).
  Complex in the general case — fields have kinds (Reference,
  MultiReference, Int, Bool …), so a generic per-field merge UI is
  non-trivial. *Surfaced when the note app was retired.*
- **Generic "restore a past version" from history.** `RecordPage`
  renders revision history read-only; the retired note app let the user
  restore a past revision into the editor. Generically this is "write an
  old `row_revisions` snapshot back as a new version" — needs a server op
  (re-apply a chosen revision's `data` as a fresh versioned write, with
  conflict semantics) and a Restore button per revision in the history
  list. Complex because a snapshot may reference rows/links that have
  since changed or been deleted (References/MultiReferences), so a naive
  restore can resurrect dangling refs. *Surfaced when the note app was
  retired.*

## Client robustness / DX

- **Link history: closed periods (`<from> → <to>`) don't render after
  unlink.** `RecordPage.tsx`'s link-history panel is designed to show
  the full lifetime of each m2m link on a `temporalValidity: true` join
  table — active links as "since &lt;ts&gt;", unlinked ones as
  "&lt;from&gt; → &lt;to&gt;". Only the active case works today. When
  `reconcileMultiRefs` calls `doc.remove()` on the join row, RxDB's
  default `.find().$` live query excludes soft-deleted docs, so the
  join disappears from `joinRows` entirely and the panel has nothing to
  render for the closed period even though the server correctly stamped
  `effectiveTo`. Fix likely requires a separate live subscription that
  includes soft-deleted docs (RxDB `find({}, { includeDeleted: true })`
  or equivalent), scoped to the panel's needs. Test coverage:
  `apps/example/tests/contacts-tags.spec.ts:link history shows an
  active link` covers the active case; the closed-period assertion was
  removed pending this fix.

- **Stale local RxDB after builds → transient client errors; need a
  robust "reset the local store" path.** Observed (2026-06-30) an
  `ensureNotFalsy() is falsy:` RxDB error in the browser on both `:3000`
  and `:3010` after iterating through several builds; it cleared on
  reload and a *fresh* browser never hit it — so the cause is a **stale
  local IndexedDB replica** that accumulated across builds whose
  persisted shape changed underneath it (the `dbName` rename
  `notesync`→`rolodex`, descriptor field changes, and the data-epoch
  bump from `DropNotes`). The local replica is disposable (the server is
  authoritative), but today it only auto-heals on *schema-mismatch* RxDB
  codes: `getDatabase()` in `packages/client/src/rxdb.ts` wipes+rebuilds
  on `DB6`/`DM5`/`DM1` only (`isSchemaMismatch`); any *other* init-time
  failure (like this `ensureNotFalsy`) throws instead of self-healing.
  Directions: (a) broaden `getDatabase()` to **retry-once** — on ANY
  build failure, `removeRxDatabase` + rebuild (and re-pull from the
  server) before giving up; (b) a build/version signal — bump a client
  "store version" (or detect a changed build id) and proactively reslate
  via the existing data-epoch machinery so a stale store is discarded on
  the first load after a deploy; (c) make the **"Reset local copy"**
  control more discoverable / surface it automatically when init fails.
  Low user impact in prod (the persisted shape is stable there); it
  bites during rapid local iteration. Needs the actual `ensureNotFalsy`
  stack to confirm whether it fires at DB init (→ (a) fixes it) or
  during replication (→ different fix) before implementing.
- **Data-epoch guard is load-time only → already-open clients silently
  go stale (ADR 0012).** `DataEpochGuard` checks `serverDataEpoch` once
  on mount (`useEffect([])`), and out-of-band server data changes
  (seed/migrate) write through the engine directly — NOT the mutation
  resolver — so they emit no live `rowUpdated` WebSocket events. An
  already-open tab neither pulls the new rows live nor re-checks the
  epoch, so it shows stale data until the user reloads. The load-time
  reslate itself is correct + tested
  (`apps/example/tests/data-epoch.spec.ts`); the gap is *mid-session*
  detection. Options: (a) poll `serverDataEpoch` periodically (or
  subscribe to an epoch-changed WS event) while the app is open and
  prompt-to-reslate then; (b) have seed/migrate bump the epoch AND emit
  a lightweight "data changed" signal. Low priority for runtime
  (out-of-band changes are rare in prod), but it's the exact confusion
  the music seed caused (PR #29). Minor UX: declining the reslate prompt
  acknowledges the new epoch and never nudges again, leaving the client
  stale with no further cue.
- **Repair-before-reset** (ADR 0008 / `TODO(repair)` in
  `SyncHealthBanner.tsx`): recover unsynced local writes before "Reset
  local data" wipes the RxDB replica.
- **Server-managed fields show a stale local value briefly after a save
  (cosmetic).** When you edit a record, the client patches only the
  writable columns; the server bumps `version` (and `updated_at`) on
  apply, and that value comes back via the replication reconcile a
  round-trip later. So right after Save, the read-only `Version` /
  `Updated` fields in the detail form still show the pre-save local
  value (e.g. version 1) and only update to the bumped value (2) once
  the push reconciles — a quick glance can look like "the edit didn't
  bump the version" even though it did (engine bumps correctly, see
  `apps/api/src/engine/version.spec.ts`). Options: optimistically
  reflect the expected bump on save, show a transient "saving…/syncing…"
  state on those fields, or disable them until reconciled. Purely
  cosmetic; no data is wrong.
## Framework layout / packaging

- **Split `packages/database` into per-app packages.** Entities are now
  *grouped* (framework/rolodex/music subdirs + `FRAMEWORK_ENTITIES` /
  `ROLODEX_ENTITIES` / `MUSIC_ENTITIES` / `ALL_ENTITIES`, consumed in
  both registration sites — the double-registration footgun is fixed).
  The next rung is true decoupling: split the example groups into their
  own packages (`@gammaray/rolodex-database`, `@gammaray/music-database`),
  each owning its entities **and** migrations, leaving `@gammaray/database`
  as framework-only (`user` / `app_meta` / `row_revision` + the
  data-source factory + migrate runner). The API would compose
  `ALL_ENTITIES` from the framework + whichever app packages it serves,
  so adding an app touches no framework code. The wrinkle to solve: the
  migrate runner globs one `migrations/` dir, and the existing migration
  history is interleaved (e.g. `InitialSchema` creates `users`), so
  migrations must either be aggregated across packages at runtime or
  only split going forward. Pairs with the per-app logical-DB work
  (Phase 2, `docs/example-app-spec.md` §7d / `GAMMARAY_SCHEMAS`). Also:
  the engine's `schema-tables.ts` still hand-pairs descriptor↔entity per
  app — could consume the grouped arrays once the packages exist.

## Tooling / infra

- **Update Next.js to the latest version.** `apps/example` is on Next.js
  15 (App Router). Bump to the latest release, review the
  changelog/codemods for breaking changes, and re-run the e2e suite.
  Watch for App Router, caching, and `next-auth`/Auth.js v5
  compatibility shifts.

## See also

- [../platform-architecture.md](../platform-architecture.md) — the
  architecture doc; open *design* questions (like history retention)
  live there, not here.
- [adr/](adr/) — decisions that used to be backlog items.
- [documentation.md](documentation.md) — the "docs describe current
  state" rule that motivated splitting this out.
