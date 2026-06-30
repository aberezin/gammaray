import { test, expect } from '@playwright/test'
import { register, uniqueEmail, waitForSynced } from './helpers'

// Ported from the retired note sync-races spec (single-writer self-conflict): a
// single writer making rapid successive edits to the same row must NEVER produce a
// conflict — there is only one writer. This exercises the BatchCoordinator's
// learned-version path: each push uses the server version it learned from the
// previous push's result, so an in-flight edit doesn't push against a stale
// baseline and self-conflict even before RxDB's reconcile catches up.
test.describe('Contacts (single-writer rapid edits)', () => {
  test('rapid successive edits to one contact never self-conflict and converge', async ({ page }) => {
    await register(page, uniqueEmail('fastedit'))
    await page.goto('/contacts')
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Create the row (v1).
    const surname = `Fast${Date.now()}`
    await page.getByRole('button', { name: 'New contact' }).click()
    await page.getByLabel('First name').fill('Fae')
    await page.getByLabel('Last name').fill(surname)
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText(surname)).toBeVisible({ timeout: 8_000 })
    await page.getByText(surname).click()

    // Fire several edit→save cycles back-to-back, WITHOUT waiting for sync between
    // them, so multiple pushes are in flight against a not-yet-reconciled version.
    const edits = 5
    let lastEmail = ''
    for (let i = 1; i <= edits; i++) {
      lastEmail = `fast${i}-${Date.now()}@x.example.com`
      await page.getByRole('button', { name: 'Edit' }).click()
      await page.getByLabel('Email').fill(lastEmail)
      await page.getByRole('button', { name: 'Save' }).click()
    }

    // A single writer must never see a conflict banner...
    await expect(page.getByText('Update conflict')).not.toBeVisible({ timeout: 8_000 })

    // ...and once syncing settles the row converges to the last value, with every
    // edit applied as a clean version bump (create v1 + N edits = v(N+1)).
    await waitForSynced(page)
    await expect(page.getByText(lastEmail)).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(`v${edits + 1}`).first()).toBeVisible({ timeout: 10_000 })
  })
})
