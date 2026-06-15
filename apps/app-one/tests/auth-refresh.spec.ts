import { test, expect, request } from '@playwright/test'
import { uniqueEmail, DEFAULT_PASSWORD } from './helpers'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// TODO(test): a full "survives token expiry without silent failure" e2e. The
// original bug was the client freezing a 15m token at mount, so writes silently
// stopped once it expired. The server-contract tests below do NOT cover that —
// they prove /auth/refresh works, not that the *client* rotates. Reproducing the
// real bug needs the app to run against a short-lived access token
// (JWT_EXPIRES_IN=2s) so expiry happens during the test; the suite currently
// shares one API on :3001 with the default 15m token. Add it via either a second
// API instance on another port + a dedicated Playwright project, or a global
// short token so every test implicitly exercises refresh. Deferred for infra cost.

const isJwt = (t: unknown) => typeof t === 'string' && t.split('.').length === 3

// The /auth/refresh contract: issue a pair, rotate it, and refuse misuse.
test.describe('Auth refresh (server contract)', () => {
  test('register returns an access + refresh token pair', async () => {
    const api = await request.newContext()
    const res = await api.post(`${API}/auth/register`, {
      data: { email: uniqueEmail('refresh-reg'), password: DEFAULT_PASSWORD },
    })
    const body = (await res.json()) as { accessToken?: string; refreshToken?: string }
    expect(isJwt(body.accessToken)).toBe(true)
    expect(isJwt(body.refreshToken)).toBe(true)
    await api.dispose()
  })

  test('/auth/refresh exchanges a refresh token for a working new pair', async () => {
    const api = await request.newContext()
    const reg = await api.post(`${API}/auth/register`, {
      data: { email: uniqueEmail('refresh-ok'), password: DEFAULT_PASSWORD },
    })
    const { refreshToken } = (await reg.json()) as { refreshToken: string }

    const res = await api.post(`${API}/auth/refresh`, { data: { refreshToken } })
    expect(res.status()).toBe(200)
    const next = (await res.json()) as { accessToken: string; refreshToken: string }
    expect(isJwt(next.accessToken)).toBe(true)
    expect(isJwt(next.refreshToken)).toBe(true)

    // The refreshed access token authorizes a real API call.
    const q = await api.post(`${API}/graphql`, {
      headers: { Authorization: `Bearer ${next.accessToken}`, 'Content-Type': 'application/json' },
      data: { query: '{ contacts { id } }' },
    })
    const qd = (await q.json()) as { data?: { contacts?: unknown[] }; errors?: unknown[] }
    expect(qd.errors).toBeUndefined()
    expect(Array.isArray(qd.data?.contacts)).toBe(true)
    await api.dispose()
  })

  test('a refresh token is rejected as a bearer for API calls', async () => {
    const api = await request.newContext()
    const reg = await api.post(`${API}/auth/register`, {
      data: { email: uniqueEmail('refresh-bearer'), password: DEFAULT_PASSWORD },
    })
    const { refreshToken } = (await reg.json()) as { refreshToken: string }

    // GraphQL returns 200 with an Unauthorized error (not data) for a bad bearer.
    const q = await api.post(`${API}/graphql`, {
      headers: { Authorization: `Bearer ${refreshToken}`, 'Content-Type': 'application/json' },
      data: { query: '{ contacts { id } }' },
    })
    const qd = (await q.json()) as { data: unknown; errors?: Array<{ message: string }> }
    expect(qd.data).toBeNull()
    expect(qd.errors?.[0]?.message).toContain('Unauthorized')
    await api.dispose()
  })

  test('an access token cannot be used at /auth/refresh', async () => {
    const api = await request.newContext()
    const reg = await api.post(`${API}/auth/register`, {
      data: { email: uniqueEmail('refresh-access'), password: DEFAULT_PASSWORD },
    })
    const { accessToken } = (await reg.json()) as { accessToken: string }

    const res = await api.post(`${API}/auth/refresh`, { data: { refreshToken: accessToken } })
    expect(res.status()).toBe(401)
    await api.dispose()
  })
})
