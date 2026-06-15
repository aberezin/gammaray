import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// The error guard: any server error puts the app into a "suspect" state — a
// prominent banner appears and editing is blocked until the user recovers.
test.describe('Sync health (error guard)', () => {
  test('a server error trips the suspect banner and makes the UI read-only', async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await register(p, uniqueEmail('health'))
    await p.goto('/contacts')
    await expect(p.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Controls are live before any error.
    await expect(p.getByRole('button', { name: 'New contact' })).toBeEnabled()

    // From now on, every GraphQL call fails.
    await p.route('**/graphql', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'boom' }] }),
      }),
    )

    // Trigger a push: create a contact. The local insert succeeds but the push
    // fails → the app becomes suspect.
    await p.getByRole('button', { name: 'New contact' }).click()
    await p.getByLabel('First name').fill('Will')
    await p.getByLabel('Last name').fill('Fail')
    await p.getByRole('button', { name: 'Save' }).click()

    // The banner appears with recovery actions, and editing is now blocked.
    await expect(p.getByText('Sync error — local data may be out of date')).toBeVisible({ timeout: 8_000 })
    await expect(p.getByRole('button', { name: 'Reload & re-sync' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Reset local data' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'New contact' })).toBeDisabled()
    await expect(p.getByRole('button', { name: 'Add tag' })).toBeDisabled()

    await ctx.close()
  })

  test('a 401 trips the auth-specific banner (session expired / sign in again)', async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await register(p, uniqueEmail('health-401'))
    await p.goto('/contacts')
    await expect(p.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Force every GraphQL call to 401 (an expired/rejected token).
    await p.route('**/graphql', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ errors: [{ message: 'Unauthorized' }] }),
      }),
    )

    await p.getByRole('button', { name: 'New contact' }).click()
    await p.getByLabel('First name').fill('Auth')
    await p.getByLabel('Last name').fill('Gone')
    await p.getByRole('button', { name: 'Save' }).click()

    // The auth branch: session-expired banner with a sign-in action, read-only.
    await expect(p.getByText('Session expired')).toBeVisible({ timeout: 8_000 })
    await expect(p.getByRole('button', { name: 'Sign in again' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'New contact' })).toBeDisabled()

    await ctx.close()
  })

  test('the token route returns the current access token when authenticated', async ({ browser }: { browser: Browser }) => {
    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await register(p, uniqueEmail('token'))
    await p.goto('/')
    const res = await p.request.get('/api/token')
    expect(res.ok()).toBe(true)
    const body = (await res.json()) as { accessToken?: string }
    expect(typeof body.accessToken).toBe('string')
    expect((body.accessToken ?? '').split('.').length).toBe(3) // a JWT
    await ctx.close()
  })
})
