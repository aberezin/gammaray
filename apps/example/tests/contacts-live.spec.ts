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

  // Ported from the retired note sync-races spec: a remote edit must also update
  // the OTHER tab's version history live, not just the field value. Uses a freshly
  // created contact (never the seeded rows) so it doesn't perturb shared seed data.
  test("a remote edit updates the other tab's version history live", async ({ browser }: { browser: Browser }) => {
    const surname = `LiveHist${Date.now()}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('lh-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('lh-b'))
    await b.goto('/contacts')
    await expect(b.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // A creates the contact (v1); B selects it and sees v1 in its history.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Hist')
    await a.getByLabel('Last name').fill(surname)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(b.getByText(surname)).toBeVisible({ timeout: 10_000 })
    await b.getByText(surname).click()
    await expect(b.getByText('v1').first()).toBeVisible({ timeout: 8_000 })

    // A edits it → v2. B takes no action; its history list must advance to v2 via
    // the live rowUpdated stream (the version bump re-loads B's revisions).
    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Edit' }).click()
    await a.getByLabel('Email').fill(`hist${Date.now()}@x.example.com`)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText('v2').first()).toBeVisible({ timeout: 8_000 })

    await expect(b.getByText('v2').first()).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
