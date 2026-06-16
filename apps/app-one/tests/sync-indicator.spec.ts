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
})
