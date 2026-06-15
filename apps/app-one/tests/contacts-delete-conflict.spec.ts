import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A delete, part 2: delete-vs-edit conflict. One client deletes a row while
// another edits it from a stale version. Per the design, this surfaces as a
// WholeRow conflict (delete is just another versioned change); the user can
// resurrect with their edit (keep mine) or accept the deletion (keep theirs).
test.describe('Contacts (type-A delete/edit conflict)', () => {
  test('an edit racing a delete conflicts; resurrect keeps the edit', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const surname = `DvE${stamp}`
    const bEmail = `b${stamp}@x.example.com`

    // A creates the row (v1).
    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('dve-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Eli')
    await a.getByLabel('Last name').fill(surname)
    await a.getByLabel('Email').fill(`orig${stamp}@x.example.com`)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // B loads it (stale v1) and selects it.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('dve-b'))
    await b.goto('/contacts')
    await expect(b.getByText(surname)).toBeVisible({ timeout: 10_000 })
    await b.getByText(surname).click()

    // A deletes it → server advances and tombstones the row.
    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Delete' }).click()
    await expect(a.getByText(surname)).not.toBeVisible({ timeout: 8_000 })
    await a.waitForTimeout(1500) // let the delete push land server-side

    // B edits from its stale version → conflict; the server side shows deleted.
    await b.getByRole('button', { name: 'Edit' }).click()
    await b.getByLabel('Email').fill(bEmail)
    await b.getByRole('button', { name: 'Save' }).click()
    await expect(b.getByText('Update conflict')).toBeVisible({ timeout: 10_000 })
    await expect(b.getByText('(deleted)').first()).toBeVisible()

    // B keeps its version → resurrects the row with the edit.
    await b.getByRole('button', { name: 'Keep mine' }).click()
    await expect(b.getByText('Update conflict')).not.toBeVisible({ timeout: 10_000 })
    await expect(b.getByText(bEmail)).toBeVisible({ timeout: 8_000 })

    // Convergence: a fresh client sees the resurrected row with B's value.
    const ctxC = await browser.newContext()
    const c = await ctxC.newPage()
    await register(c, uniqueEmail('dve-c'))
    await c.goto('/contacts')
    await expect(c.getByText(bEmail)).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
    await ctxC.close()
  })
})
