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

  // The at-scale data layer: the 150-track catalog is NOT replicated to the
  // client; the playlist Tracks picker (searchable m2m) finds tracks via the
  // server's searchRows, and the added chip's label resolves via rowsByIds.
  test('playlist tracks: server-search picker finds + adds a track (at-scale m2m)', async ({ page }) => {
    await register(page, uniqueEmail('tracksearch'))
    await page.goto('/playlists')
    await expect(page.getByRole('heading', { name: 'Playlists' })).toBeVisible({ timeout: 10_000 })

    const plName = `Search PL ${Date.now()}`
    await page.getByRole('button', { name: 'New playlist' }).click()
    await page.getByLabel('Name').fill(plName)

    const tracks = page.getByLabel('Tracks', { exact: true })
    await tracks.click()
    await tracks.fill('Pt. 1')
    const option = page.getByRole('option').first()
    await expect(option).toBeVisible({ timeout: 8_000 })
    const name = ((await option.textContent()) ?? '').trim()
    await option.click()
    await tracks.blur() // close the dropdown so it doesn't overlay Save

    // The added track appears as a chip with its (rowsByIds-resolved) label —
    // scope to the chip's remove control (the name also appears in other
    // playlists' track cells in the list).
    await expect(page.getByRole('button', { name: `Remove ${name}` })).toBeVisible({ timeout: 5_000 })
    await page.getByRole('button', { name: 'Save' }).click()
    // The new playlist persisted.
    await expect(page.getByText(plName)).toBeVisible({ timeout: 8_000 })
  })
})
