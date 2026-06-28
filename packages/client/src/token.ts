import { syncHealth } from './sync-health.store'

// A token getter for the long-lived client. The access token is short-lived and
// silently refreshed server-side (Auth.js jwt callback) behind /api/token, so
// the client must fetch the *current* token per use rather than freeze one at
// mount. We cache it until shortly before expiry to avoid a round-trip per call.
let cached: { token: string; expiresAt: number } | null = null
let inflight: Promise<string> | null = null

function expiryMs(token: string): number {
  try {
    const [, payload] = token.split('.')
    const json = JSON.parse(atob(payload)) as { exp?: number }
    return json.exp ? json.exp * 1000 : 0
  } catch {
    return 0
  }
}

async function fetchToken(): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/token', { cache: 'no-store' })
  } catch (e) {
    // Never reached the server.
    syncHealth.markSuspect('network', e instanceof Error ? e.message : 'token request failed')
    throw e
  }
  if (!res.ok) {
    // 401 here means the session is gone or refresh failed — auth-fatal.
    syncHealth.markSuspect('auth', 'Your session has expired. Please sign in again.')
    throw new Error(`token request failed: ${res.status}`)
  }
  const { accessToken } = (await res.json()) as { accessToken: string }
  cached = { token: accessToken, expiresAt: expiryMs(accessToken) }
  return accessToken
}

// Seed the cache with the token the server already rendered with (fresh, since
// auth() refreshes it server-side), so the first client request needs no
// /api/token round-trip. Cheap and idempotent — safe to call on every render.
export function primeToken(token: string): void {
  if (!token || cached?.token === token) return
  cached = { token, expiresAt: expiryMs(token) }
}

export async function getAccessToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - 60_000) return cached.token
  // Coalesce concurrent refreshes into one request.
  if (!inflight) {
    inflight = fetchToken().finally(() => {
      inflight = null
    })
  }
  return inflight
}

/** Force the next getAccessToken() to re-fetch (e.g. after a 401 on a call). */
export function invalidateToken(): void {
  cached = null
}

export type TokenGetter = () => Promise<string>
