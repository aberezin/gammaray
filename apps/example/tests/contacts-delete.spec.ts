import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A generalization, increment 4 (Delete), part 1: a soft delete (tombstone)
// removes the row locally and propagates — a fresh client no longer sees it.
// Delete-vs-concurrent-edit conflicts are a follow-up.
test.describe('Contacts (type-A delete)', () => {
  test('deleting a contact removes it locally and for other clients', async ({ browser }: { browser: Browser }) => {
    const surname = `Del${Date.now()}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('del-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Create then delete a known row.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Dan')
    await a.getByLabel('Last name').fill(surname)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Delete' }).click()

    // Gone from this client's list.
    await expect(a.getByText(surname)).not.toBeVisible({ timeout: 8_000 })

    // Let the delete push reach the server before a fresh client pulls.
    await a.waitForTimeout(1500)

    // A fresh client (its own store) does not see the deleted row, but is loaded.
    const ctxC = await browser.newContext()
    const c = await ctxC.newPage()
    await register(c, uniqueEmail('del-c'))
    await c.goto('/contacts')
    await expect(c.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })
    await expect(c.getByText(surname)).not.toBeVisible()

    await ctxA.close()
    await ctxC.close()
  })
})
