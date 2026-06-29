import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail, pickReference } from './helpers'

// Batch sync (client): an offline-created company AND a contact referencing it
// sync together as one atomic batch on reconnect — proving the cross-collection
// batch coordinator + deferred-FK server endpoint. No retry, no dangling ref.
test.describe('Contacts (type-A batch sync)', () => {
  test('an offline company + contact referencing it sync atomically', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const company = `OffCo${stamp}`
    const surname = `OffCt${stamp}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('batch-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Go offline.
    await a.getByRole('button', { name: /Online/ }).click()

    // Create a new company offline (it must appear in the picker while offline).
    await a.getByPlaceholder('New company name').fill(company)
    await a.getByRole('button', { name: 'Add company' }).click()

    // Create a contact referencing that brand-new, unsynced company — offline.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Off')
    await a.getByLabel('Last name').fill(surname)
    await pickReference(a, 'Company', company)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // Reconnect → the whole batch (company + contact) pushes atomically.
    await a.getByRole('button', { name: /Offline/ }).click()

    // A fresh client sees the contact with its company — both persisted, FK intact.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('batch-b'))
    await b.goto('/contacts')
    const rowB = b.getByRole('row').filter({ hasText: surname })
    await expect(rowB).toContainText(company, { timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
