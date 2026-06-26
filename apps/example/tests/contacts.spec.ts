import { test, expect } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A generalization, increment 1 (Read): the contacts page renders a shared,
// seeded dataset via schema-driven components (RecordList / RecordForm) driven by
// the table descriptor, and shows a selected record's fields + version history.
test.describe('Contacts (type-A read)', () => {
  test('lists seeded contacts and shows a record with its history', async ({ page }) => {
    await register(page, uniqueEmail('contacts'))

    await page.goto('/contacts')

    // Seeded contacts (shared across all clients) appear in the schema-driven list.
    await expect(page.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Turing')).toBeVisible()
    await expect(page.getByText('Hopper')).toBeVisible()

    // Selecting a row renders its fields in the descriptor-driven form.
    await page.getByText('Lovelace').click()
    await expect(page.getByLabel('Email')).toHaveValue('ada@example.com', { timeout: 8_000 })
    await expect(page.getByLabel('First name')).toHaveValue('Ada')

    // ...and its version history (seeded at v1).
    await expect(page.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
  })

  test('contacts are reachable from the notes page', async ({ page }) => {
    await register(page, uniqueEmail('contactsnav'))
    await page.getByRole('link', { name: 'Contacts →' }).click()
    await expect(page).toHaveURL(/\/contacts$/)
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible()
  })
})
