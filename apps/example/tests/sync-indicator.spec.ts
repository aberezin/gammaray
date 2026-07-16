import { test, expect } from '@playwright/test'
import { register, uniqueEmail, waitForSynced } from './helpers'

// The sync indicator (● Synced / ● Offline) lives in the header of the notes,
// contacts, and categories pages. It reflects the page's offline state: toggling
// the OfflineToggle flips the indicator. These tests prove the indicator is
// wired up on the contacts and categories pages (the notes page already had it).
test.describe('Sync indicator', () => {
  test('contacts page: toggling offline flips the indicator and back', async ({ page }) => {
    await register(page, uniqueEmail('sync-contacts'))
    await page.goto('/contacts')

    // Online by default → "● Synced".
    await waitForSynced(page)

    // Go offline via the toggle (button reads "Online" while online).
    await page.getByRole('button', { name: 'Online' }).click()
    await expect(page.getByText('● Offline')).toBeVisible()

    // Back online → "● Synced" again.
    await page.getByRole('button', { name: 'Offline (click to sync)' }).click()
    await waitForSynced(page)
  })

  test('categories page: toggling offline flips the indicator and back', async ({ page }) => {
    await register(page, uniqueEmail('sync-categories'))
    await page.goto('/categories')

    await waitForSynced(page)

    await page.getByRole('button', { name: 'Online' }).click()
    await expect(page.getByText('● Offline')).toBeVisible()

    await page.getByRole('button', { name: 'Offline (click to sync)' }).click()
    await waitForSynced(page)
  })

  // The indicator must reflect *pending local writes*, not just the online
  // socket. An honest "Syncing…" state is what would have made the
  // paged-table-edit-silently-dropped bug loud from day one — the indicator
  // would have stayed on "Syncing…" instead of flipping straight to
  // "Synced". This exercises: save → Syncing appears briefly → Synced.
  test('save-while-online shows Syncing briefly, then Synced', async ({ page }) => {
    await register(page, uniqueEmail('sync-pending'))
    await page.goto('/contacts')
    await waitForSynced(page)

    // Kick off a write that has to round-trip through pushBatch.
    await page.getByRole('button', { name: 'New contact' }).click()
    await page.getByLabel('First name').fill('Pending')
    await page.getByLabel('Last name').fill(`Check-${Date.now()}`)
    await page.getByRole('button', { name: 'Save' }).click()

    // "Syncing…" must appear before the batch settles. Playwright polls
    // every ~100ms and the push has a client→server round-trip, so this
    // catches the intermediate state reliably.
    await expect(page.getByText(/Syncing/i)).toBeVisible({ timeout: 2000 })
    // Then it settles.
    await waitForSynced(page, 8000)
  })
})
