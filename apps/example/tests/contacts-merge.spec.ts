import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A merge strategy: DisjointFields. When two clients edit DIFFERENT fields
// of the same row, the 3-way merge against the ancestor auto-merges them — no
// conflict. (Same-field edits still conflict; that's contacts-conflict.)
test.describe('Contacts (type-A disjoint-field auto-merge)', () => {
  test('edits to different fields auto-merge without a conflict', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const surname = `Merge${stamp}`
    const newFirst = `Annabel${stamp}`
    const bEmail = `b${stamp}@x.example.com`

    // A creates the row (v1).
    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('mg-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Anna')
    await a.getByLabel('Last name').fill(surname)
    await a.getByLabel('Email').fill(`orig${stamp}@x.example.com`)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // B loads it (v1), selects it, and goes offline so it stays stale.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('mg-b'))
    await b.goto('/contacts')
    await expect(b.getByText(surname)).toBeVisible({ timeout: 10_000 })
    await b.getByText(surname).click()
    await b.getByRole('button', { name: /Online/ }).click() // go offline

    // A edits the FIRST NAME online → v2.
    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Edit' }).click()
    await a.getByLabel('First name').fill(newFirst)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText('v2').first()).toBeVisible({ timeout: 8_000 })

    // B edits the EMAIL offline (a different field), then reconnects.
    await b.getByRole('button', { name: 'Edit' }).click()
    await b.getByLabel('Email').fill(bEmail)
    await b.getByRole('button', { name: 'Save' }).click()
    await b.getByRole('button', { name: /Offline/ }).click() // go online

    // No conflict — the two field edits auto-merge. B ends up with BOTH changes.
    await expect(b.getByText(newFirst)).toBeVisible({ timeout: 10_000 })
    await expect(b.getByText(bEmail)).toBeVisible({ timeout: 8_000 })
    await expect(b.getByText('Update conflict')).not.toBeVisible()

    // Convergence: a fresh client sees the merged row.
    const ctxC = await browser.newContext()
    const c = await ctxC.newPage()
    await register(c, uniqueEmail('mg-c'))
    await c.goto('/contacts')
    await expect(c.getByText(newFirst)).toBeVisible({ timeout: 10_000 })
    await expect(c.getByText(bEmail)).toBeVisible()

    await ctxA.close()
    await ctxB.close()
    await ctxC.close()
  })
})
