import { test, expect } from '@playwright/test'
import { register, uniqueEmail, waitForSynced } from './helpers'

// Boot smoke test — the regression guard for "the app loads, authenticates, and
// syncs" against whatever frontend is serving :3000 (Dockerized or host).
//
// Why this exists: a broken dev server (e.g. a Turbopack crash-loop from a stale
// `.next` cache leaking into the image) or a misconfigured host (e.g. missing
// AUTH_TRUST_HOST -> NextAuth "UntrustedHost" -> sync "Unauthorized") manifests
// as an endless browser refresh / a permanent error banner. The rest of the
// e2e suite assumes the server is already healthy and never asserts this, so
// those failures slipped through. These checks fail fast and loudly instead.
test.describe('Boot smoke', () => {
  test('home page boots, authenticates, and reaches Synced — no error banner, no reload loop', async ({ page }) => {
    await register(page, uniqueEmail('smoke'))

    // Home redirects to the contact list (the note home was retired); rendered
    // (not a crash page / blank 500).
    await expect(page).toHaveURL(/\/contacts$/)
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible({ timeout: 10_000 })

    // Reached a healthy sync state — proves auth + the API round-trip work.
    // (Fails if AUTH_TRUST_HOST is missing: NextAuth errors and sync never syncs.)
    await waitForSynced(page)

    // No sync-health banner of either kind.
    await expect(page.getByText('Sync error — local data may be out of date')).toHaveCount(0)
    await expect(page.getByText('Session expired')).toHaveCount(0)

    // Not stuck in a reload loop: the page must stay put for a few seconds. A
    // crash-looping dev server (HMR reconnect storm) would wipe this / bounce the URL.
    await page.waitForTimeout(3_000)
    await expect(page).toHaveURL(/\/contacts$/)
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible()
  })

  test('contacts page (the schema-driven surface) boots and syncs the seed data', async ({ page }) => {
    await register(page, uniqueEmail('smoke-contacts'))
    await page.goto('/contacts')

    // The seeded baseline (ADR 0011) pulls down — proves the generic row
    // engine + @gammaray/rolodex-schema descriptors render end to end.
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('● Synced')).toBeVisible()
    await expect(page.getByText('Sync error — local data may be out of date')).toHaveCount(0)
  })
})
