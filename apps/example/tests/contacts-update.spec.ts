import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A generalization, increment 3 (Update), part 1: editing an existing row
// fast-forwards (no conflict) — version bumps, a new revision is recorded, and
// the change persists for other clients. Concurrent-edit conflicts are part 2.
test.describe('Contacts (type-A update)', () => {
  test('editing a contact bumps the version and propagates to other clients', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const surname = `Edit${stamp}`
    const newEmail = `eve${stamp}@new.example.com`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('update-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Own a known row: create it first (at v1).
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Eve')
    await a.getByLabel('Last name').fill(surname)
    await a.getByLabel('Email').fill(`eve${stamp}@old.example.com`)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // Select it and edit the email.
    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Edit' }).click()
    await a.getByLabel('Email').fill(newEmail)
    await a.getByRole('button', { name: 'Save' }).click()

    // The edit shows locally and the history advances to v2.
    await expect(a.getByText(newEmail)).toBeVisible({ timeout: 8_000 })
    await expect(a.getByText('v2').first()).toBeVisible({ timeout: 8_000 })

    // A second, fresh client pulls the updated value — it persisted server-side.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('update-b'))
    await b.goto('/contacts')
    await expect(b.getByText(newEmail)).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
