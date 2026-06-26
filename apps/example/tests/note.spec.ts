import { test, expect } from '@playwright/test'
import { register, uniqueEmail, waitForSynced } from './helpers'

test.describe('Note editing', () => {
  test('note editor is visible after login', async ({ page }) => {
    await register(page, uniqueEmail('editor'))
    await expect(page.locator('textarea')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible()
  })

  test('typing in the textarea syncs to the server', async ({ page }) => {
    await register(page, uniqueEmail('typing'))

    const textarea = page.locator('textarea')
    await textarea.click()
    await textarea.fill('Hello from Playwright')

    // Wait for the sync cycle to complete
    await waitForSynced(page)

    // Revision history should appear
    await expect(page.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('saved')).toBeVisible()
  })

  test('version history grows with each save', async ({ page }) => {
    await register(page, uniqueEmail('history'))
    const textarea = page.locator('textarea')

    await textarea.fill('First version')
    await waitForSynced(page)
    await expect(page.getByText('v1').first()).toBeVisible({ timeout: 8_000 })

    await textarea.fill('Second version')
    await waitForSynced(page)
    await expect(page.getByText('v2').first()).toBeVisible({ timeout: 8_000 })
  })

  test('restoring a version from history fills the textarea', async ({ page }) => {
    await register(page, uniqueEmail('restore'))
    const textarea = page.locator('textarea')

    await textarea.fill('Original content')
    await waitForSynced(page)
    await expect(page.getByText('v1').first()).toBeVisible({ timeout: 8_000 })

    await textarea.fill('Updated content')
    await waitForSynced(page)

    // Click "Restore this version" on the first revision
    const restoreButtons = page.getByRole('button', { name: 'Restore this version' })
    await restoreButtons.last().click() // oldest revision is last in the list
    await waitForSynced(page)

    await expect(textarea).toHaveValue('Original content')
  })

  test('sync indicator reflects online state', async ({ page }) => {
    await register(page, uniqueEmail('syncindicator'))
    await waitForSynced(page)
    await expect(page.getByText('● Synced')).toBeVisible()
  })
})
