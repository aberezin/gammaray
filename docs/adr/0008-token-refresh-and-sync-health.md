# ADR 0008 — Token refresh + a sync-health "suspect" guard

- **Status:** Accepted (2026-06-15)
- **Context area:** Auth lifetime, client error handling, offline-first trust

## Context

The access token lives 15 minutes and was captured once at page mount, with no
refresh. A long-lived single-page session therefore started failing silently
after 15 minutes: `pushBatch` mutations 401'd (so writes never landed — versions
never incremented, no revisions were written) and the `contactRevisions` query
401'd (empty history). Both client paths swallowed the error, so the UI looked
healthy while diverging from the server. Worse, rows created after expiry lived
only in the local RxDB replica and would vanish on reload.

Two problems: (1) no token renewal, and (2) server errors were invisible, so the
local store could silently become untrustworthy.

## Decision

**Refresh flow (stateless).** `register`/`login` now return
`{ accessToken, refreshToken }`. The refresh token is a stateless JWT (same
secret, ~7d, marked `type:'refresh'`); `POST /auth/refresh` exchanges it for a
fresh pair (sliding rotation). The `JwtStrategy` rejects `type:'refresh'` tokens
as bearers, so a refresh token can never authorize an API call. This keeps the
"no server-side session" property (ADR-era principle) — revocation would need a
denylist, accepted as a POC trade-off.

Auth.js stores both tokens + `accessTokenExpires` and refreshes inside the `jwt`
callback when within 60s of expiry (stamping `session.error='RefreshError'` on
failure). The long-lived client no longer freezes a token at mount: a
`GET /api/token` route returns the current (transparently refreshed) token, and
the gql client attaches it per request via `requestMiddleware` while the WS
client uses async `connectionParams`. The token is cached client-side until near
expiry and **primed from the SSR token** so first load needs no extra round-trip.

**Sync-health "suspect" guard.** A global store (`useSyncHealth`) has one rule:
**any** server/network/auth error from a real request flips status to `suspect`
and records the cause. Errors funnel in centrally — the gql client's
`responseMiddleware` (classifying 401 → `auth`, else `server`), the token getter
(`network`/`auth`), and each replication's `error$`. Business outcomes
(`CONFLICT`/`REJECTED` in a 200 response) are **not** errors and never trip it.

When suspect, the local UI state and the local RxDB replica are treated as
untrustworthy: a sticky `SyncHealthBanner` appears and **all editing is blocked
(read-only)** across the note, contacts, and categories pages. Recovery:
- `auth` → "Sign in again" (re-auth; with refresh in place, this means refresh
  itself failed).
- otherwise → "Reload & re-sync" (re-pull from the authoritative server) or
  "Reset local data" (`removeRxDatabase` + rebuild).

## Consequences

- A normal long session no longer expires mid-use; the 15m access token is fine
  because it silently rotates.
- Silent divergence is gone: a failed write/query is now loud and stops further
  local edits until the user recovers.
- **Reset is destructive** — it discards local-only writes that never synced,
  which is exactly the data most at risk after a suspect state.

## Future work — a "repair" process (TODO)

Reset currently throws away unsynced local data. Before wiping we want a
**repair** step that recovers it: diff the local replica against the server
per-table/per-row (by version), extract rows that exist only locally or are
ahead of the server into a recovery bundle, and offer to re-apply them after the
rebuild (through the normal batch path, so reference validation still holds).
This turns "Reset" from data-loss into data-preserving recovery. Tracked as
`TODO(repair)` in `SyncHealthBanner.tsx`.
