import { test, expect } from '@playwright/test'
import { register, uniqueEmail, waitForSynced } from './helpers'

// Boot smoke for the music ("Crate") app — proves the second app, driven only by
// musicDescriptors + configureClient over the generic @gammaray/client runtime,
// boots, authenticates, reaches Synced, and round-trips a create. No music-
// specific client code exists beyond the page wrappers.
test.describe('Crate boot smoke', () => {
  test('albums page boots, authenticates, reaches Synced; an album round-trips', async ({ page }) => {
    await register(page, uniqueEmail('smoke'))

    // Home redirected to /albums; the schema-driven page rendered.
    await expect(page.getByRole('heading', { name: 'Albums' })).toBeVisible({ timeout: 10_000 })
    await waitForSynced(page)
    await expect(page.getByText('Sync error — local data may be out of date')).toHaveCount(0)

    // Create an album — exercises the generic create + replication round-trip.
    const title = `Smoke Album ${Date.now()}`
    await page.getByRole('button', { name: 'New album' }).click()
    await page.getByLabel('Title').fill(title)
    await page.getByRole('button', { name: 'Save' }).click()

    // It appears in the list, and survives a reload (persisted server-side).
    await expect(page.getByText(title)).toBeVisible({ timeout: 8_000 })
    await page.reload()
    await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 })
  })

  test('cross-page nav reaches every schema-driven page', async ({ page }) => {
    await register(page, uniqueEmail('nav'))
    for (const name of ['Tracks', 'Artists', 'Genres', 'Playlists', 'Albums']) {
      await page.getByRole('link', { name }).click()
      await expect(page.getByRole('heading', { name })).toBeVisible({ timeout: 10_000 })
    }
  })

  test('seeded catalog syncs down (artists + the large playlist)', async ({ page }) => {
    await register(page, uniqueEmail('seed'))
    await page.getByRole('link', { name: 'Artists' }).click()
    await expect(page.getByText('Miles Davis')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('link', { name: 'Playlists' }).click()
    await expect(page.getByText('Crate Essentials')).toBeVisible({ timeout: 10_000 })
  })
})
