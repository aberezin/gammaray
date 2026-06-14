import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A follow-up: live cross-client updates. With two clients open at once, a
// change in one must appear in the other without a reload — via a global
// contactUpdated subscription feeding the replication pull stream.
test.describe('Contacts (type-A live updates)', () => {
  test('a change in one open client appears live in another', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const surname = `Live${stamp}`
    const editedEmail = `live${stamp}@x.example.com`

    // Both clients open and synced.
    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('live-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('live-b'))
    await b.goto('/contacts')
    await expect(b.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // A creates a contact — B should see it appear with no action of its own.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Liv')
    await a.getByLabel('Last name').fill(surname)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })
    await expect(b.getByText(surname)).toBeVisible({ timeout: 10_000 })

    // A edits it — B should see the new value live as well.
    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Edit' }).click()
    await a.getByLabel('Email').fill(editedEmail)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(b.getByText(editedEmail)).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
