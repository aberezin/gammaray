import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A generalization, increment 2 (Create): a client mints a UUID, inserts a
// row locally, and it pushes to the server. Because contacts are a shared
// dataset, a second fresh client (its own RxDB) must pull the new row — proving
// it persisted server-side, not just locally.
test.describe('Contacts (type-A create)', () => {
  test('creating a contact persists and is visible to another client', async ({ browser }: { browser: Browser }) => {
    // Contacts are a shared dataset, so use a unique name to stay isolated from
    // other runs/tests (same discipline as uniqueEmail).
    const surname = `Quux${Date.now()}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('create-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Create a new contact via the schema-driven form.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Zoe')
    await a.getByLabel('Last name').fill(surname)
    await a.getByLabel('Email').fill('zoe@example.com')
    await a.getByRole('button', { name: 'Save' }).click()

    // It appears in this client's list.
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // A second client with a fresh local store pulls it from the server.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('create-b'))
    await b.goto('/contacts')
    await expect(b.getByText(surname)).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
