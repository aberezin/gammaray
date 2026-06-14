import { test, expect, Browser } from '@playwright/test'
import { register, uniqueEmail } from './helpers'

// Type-A generalization, increment 3 (Update), part 2: concurrent edits to the
// same row. With the default WholeRow strategy, the stale writer conflicts; the
// user resolves (keep mine), and the dataset converges for everyone.
test.describe('Contacts (type-A update conflict)', () => {
  test('concurrent edits conflict and resolve with "keep mine"', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const surname = `Conflict${stamp}`
    const aEmail = `a${stamp}@x.example.com`
    const bEmail = `b${stamp}@x.example.com`

    // A creates the row (v1).
    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('cf-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Carol')
    await a.getByLabel('Last name').fill(surname)
    await a.getByLabel('Email').fill(`orig${stamp}@x.example.com`)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // B loads it (at v1) and selects it.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('cf-b'))
    await b.goto('/contacts')
    await expect(b.getByText(surname)).toBeVisible({ timeout: 10_000 })
    await b.getByText(surname).click()

    // A edits first → server advances to v2.
    await a.getByText(surname).click()
    await a.getByRole('button', { name: 'Edit' }).click()
    await a.getByLabel('Email').fill(aEmail)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(aEmail)).toBeVisible({ timeout: 8_000 })

    // B edits from its stale v1 → conflict.
    await b.getByRole('button', { name: 'Edit' }).click()
    await b.getByLabel('Email').fill(bEmail)
    await b.getByRole('button', { name: 'Save' }).click()
    await expect(b.getByText('Update conflict')).toBeVisible({ timeout: 10_000 })

    // B keeps its version → resolves; banner clears and B shows its value.
    await b.getByRole('button', { name: 'Keep mine' }).click()
    await expect(b.getByText('Update conflict')).not.toBeVisible({ timeout: 10_000 })
    await expect(b.getByText(bEmail)).toBeVisible({ timeout: 8_000 })

    // Convergence: a fresh client sees B's resolved value.
    const ctxC = await browser.newContext()
    const c = await ctxC.newPage()
    await register(c, uniqueEmail('cf-c'))
    await c.goto('/contacts')
    await expect(c.getByText(bEmail)).toBeVisible({ timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
    await ctxC.close()
  })
})
