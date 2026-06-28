# Example App Spec — Music Library ("Crate")

This is the canonical worked example of a **type-A app spec**: the input artifact
that drives building a new app on the GammaRay framework. It is filled in for a
music-library app ("Crate") and doubles as a **reusable template** — to spec a
different app, copy the structure and refill sections 1–6.

> Status: **DRAFT for review.** Co-authored (Claude drafts, Alan checks). Once
> approved, this is the frozen input we build `apps/music` from, and we measure
> how few iterations the build takes.

---

## 0. How the framework turns this spec into an app

GammaRay is "type-A": each table is a row with optional foreign keys, described by
one **`TableDescriptor`**. The descriptor drives the server model, the RxDB
schema, the sync queries, and the generic UI — so an app is almost entirely
configuration, not code.

**Adding one table costs:**

- **Server:** a TypeORM entity + a migration + one line in the API `RowRegistry`. No per-table service/resolver — the generic engine (ADR 0009/0010) handles reads, writes, revisions, merge, conflict.
- **Client:** one `TableDescriptor` + one entry in the app's descriptor list. The RxDB collection, GraphQL wiring, reference pickers, m2m materialization, replication, CRUD, history, and conflict UI are all derived.
- **A page:** a ~15-line `<RecordPage descriptor={…} title="…" navLinks={…} />` wrapper.

So most of this spec is **§3 (entities)** + **§4 (relationships)**; the rest is
identity, pages, seed, and the one-time framework prerequisites in §7.

---

## 1. App identity  ⟨check⟩

| Thing | Value |
|---|---|
| Product (display) name | **Crate** |
| Frontend app dir / package | `apps/music` → `@gammaray/music` |
| Schema package | `packages/music-schema` → `@gammaray/music-schema` (exports `musicDescriptors`) |
| Backend | one shared Postgres **server**. **Phase 1:** one logical DB, music tables added to the engine. **Phase 2 (after §7):** a separate logical database per app on that same server (see §7d) |
| Generic client runtime | `@gammaray/client` (hoisted from `apps/example` — see §7) |
| Default port | frontend `:3010` (so it can run alongside notesync `:3000`; reuse `scripts/instance.sh` port scheme) |

---

## 2. Field kinds (cheat-sheet)

The descriptor `kind` for each field, and how the current generic UI renders it.

| FieldKind | Meaning | Current control | Notes |
|---|---|---|---|
| `Uuid` | primary key | hidden in list | client-minted |
| `String` | short text | text input | |
| `Text` | long text | text input | ⚠ no multiline control yet (finding) |
| `Int` | integer | text input | ⚠ no number/stepper control (finding) |
| `Boolean` | true/false | text input | ⚠ no checkbox/toggle control yet (finding) |
| `Timestamp` | ISO datetime | text input (formatted) | usually read-only (`updatedAt`) |
| `Reference` | many-to-one FK | `<select>` | ⚠ breaks past ~dozens of rows (→ problem #2) |
| `MultiReference` | many-to-many via join | flat checkbox set | ⚠ breaks past ~dozens (→ problem #2) |
| `Email` / `Phone` | typed strings | text input | *not used by this app* |

The ⚠ rows are the deliberate stress points (see §8) — this domain is chosen to
make them bite.

---

## 3. Entities  ⟨check the whole section⟩

Conventions: every table also has the implicit system fields `id` (Uuid, ro),
`version` (Int, ro), `updatedAt` (Timestamp, ro). `title` = `display.titleFields`.
"revisioned" tables keep history + 3-way merge; flat tables don't.

### 3.1 `label` — record label
Flat lookup. `merge: WholeRow`, not revisioned. `title: [name]`. listField `labels`.

| field | label | kind | flags |
|---|---|---|---|
| name | Name | String | required |

### 3.2 `artist`
Flat (m2m target of track). `merge: WholeRow`, not revisioned. `title: [name]`. listField `artists`.

| field | label | kind | flags |
|---|---|---|---|
| name | Name | String | required |
| bio | Bio | Text | |

### 3.3 `genre` — self-referential tree
`merge: WholeRow`, not revisioned. `title: [name]`. listField `genres`.

| field | label | kind | flags | ref |
|---|---|---|---|---|
| name | Name | String | required | |
| parentId | Parent | Reference | | → `genre` (titleField `name`) |

### 3.4 `album`  ⟨revisioned⟩
`merge: DisjointFields`, **revisioned** (history + auto-merge, like contacts). `title: [title]`. listField `albums`.

| field | label | kind | flags | ref / via |
|---|---|---|---|---|
| title | Title | String | required | |
| year | Year | Int | | |
| labelId | Label | Reference | | → `label` (name) — m2o |
| genreIds | Genres | MultiReference | | via `album_genre` (albumId, genreId) → `genre` (name) — m2m |

### 3.5 `track`  ⟨revisioned⟩
`merge: DisjointFields`, **revisioned**. `title: [title]`. listField `tracks`.

| field | label | kind | flags | ref / via |
|---|---|---|---|---|
| title | Title | String | required | |
| trackNo | Track # | Int | | |
| durationSec | Duration (s) | Int | | ⚠ raw seconds (finding: no duration formatter) |
| explicit | Explicit | Boolean | | ⚠ renders as text input today |
| albumId | Album | Reference | | → `album` (title) — m2o |
| artistIds | Artists | MultiReference | | via `track_artist` (trackId, artistId) → `artist` (name) — m2m |

### 3.6 `playlist` — the at-scale m2m
`merge: WholeRow`, not revisioned. `title: [name]`. listField `playlists`.

| field | label | kind | flags | via |
|---|---|---|---|---|
| name | Name | String | required | |
| description | Description | Text | | |
| trackIds | Tracks | MultiReference | | via `playlist_track` (playlistId, trackId) → `track` (title) — **large m2m** |

### 3.7 Join tables
First-class type-A rows (`merge: WholeRow`, not revisioned), created/removed by
reconciling the MultiReference fields above — never edited directly.

- `album_genre`: `albumId` (→album), `genreId` (→genre). listField `albumGenres`.
- `track_artist`: `trackId` (→track), `artistId` (→artist). listField `trackArtists`.
- `playlist_track`: `playlistId` (→playlist), `trackId` (→track). listField `playlistTracks`.

---

## 4. Relationship matrix  ⟨check⟩

| Kind | Instance | Exercises |
|---|---|---|
| many-to-one | `track → album`, `album → label` | `Reference` + quick-add of the parent |
| many-to-many | `album ↔ genre`, `track ↔ artist`, `playlist ↔ track` | `MultiReference` + join reconcile + atomic batch |
| self-reference | `genre → parent genre` | self-ref picker (current-row excluded) |

Covers the full matrix notesync proved (1:N, N:N, self-ref) on an unrelated
domain — that's the genericity claim. `playlist ↔ track` (over a large track
catalog) is the one we expect to *break* the flat controls → feeds problem #2.

---

## 5. Pages & navigation  ⟨check⟩

Each is a `<RecordPage>` wrapper. Header nav links cross-link them.

| Route | Descriptor | Notes |
|---|---|---|
| `/albums` | album | primary catalog; quick-add **label** + **genre** appear here automatically |
| `/tracks` | track | quick-add **artist** appears here |
| `/artists` | artist | edit bios |
| `/genres` | genre | the tree (self-ref) |
| `/playlists` | playlist | the at-scale m2m |
| `/` (home) | — | redirect to `/albums` (no "note" concept in this app) |

`label` has **no dedicated page** — it's created via the quick-add affordance on
`/albums` (mirrors how `company` is quick-added on notesync's contacts). Good
proof that the quick-add generalizes.

---

## 6. Seed data  ⟨check⟩

Seeded through the engine (`db:seed`, ADR 0011), idempotent. Sized to make the
catalog feel real **and** to make the at-scale controls visibly strain:

| table | count | shape |
|---|---|---|
| label | 5 | e.g. Verve, Blue Note, Sub Pop, … |
| genre | ~12 | small tree: Rock→{Classic, Indie}, Electronic→{House, Techno}, Jazz, … |
| artist | ~25 | |
| album | ~15 | each → 1 label, 1–3 genres |
| track | ~150 | each → 1 album, 1–2 artists |
| playlist | 3 | one **large** playlist with **~80 tracks** (the stress case) + two small |

---

## 7. Backend & framework prerequisites  ⟨important — check the model⟩

These are the one-time pieces that standing up a *second* app forces. (A third
app would reuse all of this — that's the point.)

**7a. Backend model — Phase 1: shared backend, music tables added.**
One `@gammaray/api` + one Postgres database serves both apps to start. Music
tables are registered in the engine exactly like notesync's: descriptor + entity
+ migration + one `RowRegistry` line each. Proves the engine is schema-driven
with *zero per-table server code* — the fastest path to a working second app.

**Foresight for §7d:** build the api's registered descriptor set from **config**
(which schema package(s) to register) rather than a hard import, even in Phase 1.
Then splitting into per-app backends (§7d) is a config/env change, not a rewrite.

**7b. Hoist the generic client runtime → `@gammaray/client`.**
Today `RecordPage`, `useRecordPage`, `descriptor-registry`, and the rxdb/batch-sync
wiring live in `apps/example/src`. A second app can't import app code, so we
extract them into a shared package, **parameterized** by (a) the app's descriptor
set and (b) app config (DB name, API URLs, token getter, sync-health store). This
is the real genericity test — the friction of this extraction *is* the finding.
`apps/example` then consumes `@gammaray/client` too (so notesync stays green).
Note-specific bits (NoteEditor/RevisionList/ConflictBanner, the note store/sync)
stay in `apps/example`.

**7c. App shell for `apps/music`.** Auth (NextAuth, same pattern), `(app)` layout
with the `SyncHealthBanner` + `DataEpochGuard`, login page, rxdb instance bound to
`musicDescriptors`, Dockerfile, compose service, `.env`. Mostly copied from
`apps/example` and re-pointed.

**7d. Phase 2 (after Phase 1 works) — one logical database per app, shared server.**
Required goal: each app's data lives in its **own Postgres database** on the
**same Postgres server** (logical isolation without per-app DB servers). Plan:

- **One Postgres container, N databases.** Create `notesync` and `music`
  databases in the single Postgres instance (an init script in
  `/docker-entrypoint-initdb.d`, or each api creating its DB on boot). The
  `postgres_data` volume and server stay shared.
- **One api process per app, configured per app** (leans on §7a foresight): each
  api instance gets `DATABASE_URL` → its own db + the descriptor set for its app
  (`@gammaray/notesync-schema` vs `@gammaray/music-schema`). The generic engine
  is unchanged; only its config differs. This is the true "swap the schema
  package → a distinct app + database" story, sharing only the server. (We keep
  one api *codebase*; the alternative — a single multi-tenant api juggling
  several connections — is more complex and not needed.)
- **Migrations split per database:** each db owns its own migration history and
  only its app's tables. Auth/users: decide whether identities are per-app (each
  db has its own `users`) or shared (a small shared `auth` db). Default:
  per-app users (simplest, fully isolated); revisit if cross-app SSO is wanted.
- **Compose:** add `api-music` (+ the music frontend already added in Phase 1)
  pointing at the `music` db; `api` (notesync) points at the `notesync` db.

This is an architecture decision worth an **ADR** (multi-app data isolation:
shared server, separate logical DBs, per-app api config). Sequenced *after* the
Phase-1 music app is green, exactly as requested.

---

## 8. Deliberate stress points (these become problem #2's spec)  ⟨check⟩

Building this app should *produce* the requirements for the at-scale controls:

1. **`playlist.trackIds` over ~150 tracks** → the flat checkbox set is unusable. Needs: searchable, paginated/virtualized multi-select; shows current selections as removable chips; doesn't load all options at once.
2. **`track.albumId` / `album.labelId` `<select>`** as catalogs grow → needs a typeahead single-select (search-as-you-type, lazy options).
3. **Reference *labels* in lists** (`track` row showing album + artists) must resolve without subscribing to the entire target collection — today `useRecordPage` keeps every referenced collection fully live; at scale that's the real cost, not just the widget.
4. Minor field-control gaps surfaced: `Boolean` (explicit) wants a checkbox; `Int` (year, trackNo) a number input; `Text` (bio, description) a textarea; `durationSec` a m:ss formatter.

Point #3 is the deep one: scalable controls may require a **data-layer** change
(fetch reference options/labels on demand) not just a prettier widget.

---

## 9. Build checklist (order)  ⟨for the build, after spec approval⟩

_Phase 1 — working second app on the shared DB:_
1. **Framework hoist** → `@gammaray/client` (§7b); re-point `apps/example`; e2e still 50/50.
2. `packages/music-schema` — descriptors + `musicDescriptors` (§3).
3. Server — entities + one migration (all music tables) + `RowRegistry` lines; register the descriptor set from **config** (§7a foresight).
4. `apps/music` shell (§7c) + `<RecordPage>` pages (§5).
5. Seed (§6).
6. e2e smoke for music (boot → synced → a create round-trips) + verify notesync untouched.
7. Containerize (compose service, port 3010).

_Phase 2 — separate logical DB per app (§7d), after Phase 1 is green:_
8. ADR for the model; create per-app databases on the one server; split api into per-app config (`api` → `notesync` db, `api-music` → `music` db); split migrations; re-run full e2e for both apps.

---

## 10. Open decisions to confirm  ⟨your checklist⟩

- [ ] **Names**: product "Crate"; `apps/music` / `@gammaray/music` / `@gammaray/music-schema` / `@gammaray/client`. OK or rename?
- [ ] **Backend model**: Phase 1 shared DB (§7a) → Phase 2 one logical DB per app on the same server (§7d, after §7). Confirmed direction; open sub-choice: per-app `users`/auth (default) vs. a shared auth db.
- [ ] **Schema**: entities, fields, kinds, merge/revisioned choices, titles (§3) — anything wrong/missing? (e.g. should `album` reference a *primary artist* m2o in addition to track↔artist? should `playlist` be revisioned?)
- [ ] **Pages**: the 5 pages + home→/albums; `label` quick-add-only (§5).
- [ ] **Seed sizes** (§6), esp. the ~80-track playlist.
- [ ] **Scope of this round**: do we build the whole thing, or stop after step 1 (the hoist) since that's the biggest/riskiest and most reusable piece?
