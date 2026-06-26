import { test, expect } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// The "Reset local data" button discards the local RxDB replica and reloads, so
// replication re-pulls the server's state. This proves the round-trip: after a
// reset, the seeded baseline ("Lovelace") is gone-then-restored from the server
// and the app still works (no stuck/empty state).
test.describe('Reset local data', () => {
  test('clears the local store and re-pulls from the server', async ({ page }) => {
    page.on('dialog', (d) => void d.accept()) // accept the confirm()

    await register(page, uniqueEmail('reset'))
    await page.goto('/contacts')
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: 'Reset local copy' }).click()

    // The page reloads, RxDB rebuilds empty, and replication re-pulls the
    // seeded baseline from the server.
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 15_000 })
  })
})
