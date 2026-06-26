import { test, expect, request, Browser } from '@playwright/test'
import { register, login, uniqueEmail, DEFAULT_PASSWORD } from './helpers'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// Self-referential tree (retires the ADR 0006 limitation).
test.describe('Categories (self-referential tree)', () => {
  // Deterministic proof of the batch reference fix: a child listed BEFORE its
  // parent in one batch (self-reference) applies — validated against DB ∪ batch,
  // not transaction order.
  test('a child listed before its parent in one batch applies (self-ref)', async () => {
    const api = await request.newContext()
    const email = uniqueEmail('tree-api')
    const reg = await api.post(`${API}/auth/register`, { data: { email, password: DEFAULT_PASSWORD } })
    const token = (await reg.json()).accessToken

    const root = crypto.randomUUID()
    const leaf = crypto.randomUUID()
    const res = await api.post(`${API}/graphql`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        query: `mutation P($c: [RowChange!]!, $cid: String!) {
          pushBatch(changes: $c, clientId: $cid) { results { id status reason } }
        }`,
        variables: {
          cid: 'pw',
          c: [
            { table: 'category', id: leaf, op: 'UPSERT', expectedVersion: 0, data: { id: leaf, name: 'Leaf', parentId: root } },
            { table: 'category', id: root, op: 'UPSERT', expectedVersion: 0, data: { id: root, name: 'Root', parentId: null } },
          ],
        },
      },
    })
    const results = (await res.json()).data.pushBatch.results as Array<{ id: string; status: string }>
    expect(results.every((r) => r.status === 'APPLIED')).toBe(true)
    await api.dispose()
  })

  // The tree is usable from the UI: create a parent, then a child referencing it,
  // and the child row shows the parent's name (the self-reference resolves).
  test('build a parent and child in the UI; child shows its parent', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const parent = `Root${stamp}`
    const child = `Leaf${stamp}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('tree-ui'))
    await a.goto('/categories')
    await expect(a.getByRole('heading', { name: 'Categories' })).toBeVisible({ timeout: 10_000 })

    // Create the parent.
    await a.getByRole('button', { name: 'New category' }).click()
    await a.getByLabel('Name').fill(parent)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(parent)).toBeVisible({ timeout: 8_000 })

    // Create a child referencing the parent.
    await a.getByRole('button', { name: 'New category' }).click()
    await a.getByLabel('Name').fill(child)
    await a.getByLabel('Parent').selectOption({ label: parent })
    await a.getByRole('button', { name: 'Save' }).click()

    // The child's row shows its parent's name (self-reference resolves).
    const row = a.getByRole('row').filter({ hasText: child })
    await expect(row).toContainText(parent, { timeout: 8_000 })

    // A fresh client sees the same.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('tree-ui-b'))
    await b.goto('/categories')
    const rowB = b.getByRole('row').filter({ hasText: child })
    await expect(rowB).toContainText(parent, { timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
