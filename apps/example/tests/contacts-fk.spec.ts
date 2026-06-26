import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A relations, increment 1: many-to-one (contact.company_id → company.id),
// modeled as a soft reference (a field holding another row's id). The field is
// edited via a picker and displayed as the company name, and it syncs like any
// other field.
test.describe('Contacts (type-A many-to-one reference)', () => {
  test('a contact can reference a company via a picker and it persists', async ({ browser }: { browser: Browser }) => {
    const surname = `Fk${Date.now()}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('fk-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Create a contact and pick a (seeded) company.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Fk')
    await a.getByLabel('Last name').fill(surname)
    await a.getByLabel('Company').selectOption({ label: 'Acme Inc' })
    await a.getByRole('button', { name: 'Save' }).click()

    // The contact's row shows the referenced company's name (not its id).
    const row = a.getByRole('row').filter({ hasText: surname })
    await expect(row).toContainText('Acme Inc', { timeout: 8_000 })

    // A fresh client sees the same — the reference persisted and resolves.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('fk-b'))
    await b.goto('/contacts')
    const rowB = b.getByRole('row').filter({ hasText: surname })
    await expect(rowB).toContainText('Acme Inc', { timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
