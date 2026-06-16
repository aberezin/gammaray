import { test, expect } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// ADR 0012: when the client's stored data-epoch differs from the server's (the
// server was reset out-of-app), the DataEpochGuard prompts and reslates the
// local replica instead of trying to merge stale rows. We simulate the mismatch
// by writing a stale epoch into localStorage, then reload.
test.describe('Data epoch guard', () => {
  test('reslates the local store when the server epoch changed', async ({ page }) => {
    page.on('dialog', (d) => void d.accept()) // accept the "server was reset" confirm

    await register(page, uniqueEmail('epoch'))
    await page.goto('/contacts')
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Pretend we last synced against a different (older) server lifetime.
    await page.evaluate(() => localStorage.setItem('gammaray.dataEpoch', 'stale-epoch-0000'))
    await page.reload()

    // Guard sees stored != server → confirm → clearLocalDatabase + reload →
    // the seeded baseline re-pulls from the server.
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 15_000 })

    // The stale epoch was replaced with the server's real one (so it won't re-prompt).
    const stored = await page.evaluate(() => localStorage.getItem('gammaray.dataEpoch'))
    expect(stored).toBeTruthy()
    expect(stored).not.toBe('stale-epoch-0000')
  })
})
