import { test, expect, request, Browser } from '@playwright/test'
import { register, uniqueEmail, DEFAULT_PASSWORD, pickReference } from './helpers'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

// Many-to-many: contact ↔ tag via the contact_tags join table. The join row has
// TWO references, so it is the first multi-parent node in the batch.
test.describe('Contacts (type-A many-to-many tags)', () => {
  // Deterministic proof: a join row listed BEFORE both of its parents (contact
  // AND tag, created in the same batch) applies — references validated against
  // DB ∪ batch, independent of order.
  test('a join row listed before both its parents applies (multi-parent)', async () => {
    const api = await request.newContext()
    const email = uniqueEmail('tags-api')
    const reg = await api.post(`${API}/auth/register`, { data: { email, password: DEFAULT_PASSWORD } })
    const token = (await reg.json()).accessToken

    const contact = crypto.randomUUID()
    const tag = crypto.randomUUID()
    const link = crypto.randomUUID()
    const res = await api.post(`${API}/graphql`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        query: `mutation P($c: [RowChange!]!, $cid: String!) {
          pushBatch(changes: $c, clientId: $cid) { results { table id status reason } }
        }`,
        variables: {
          cid: 'pw',
          c: [
            { table: 'contact_tag', id: link, op: 'UPSERT', expectedVersion: 0, data: { id: link, contactId: contact, tagId: tag } },
            { table: 'contact', id: contact, op: 'UPSERT', expectedVersion: 0, data: { id: contact, firstName: 'Grace', lastName: 'H' } },
            { table: 'tag', id: tag, op: 'UPSERT', expectedVersion: 0, data: { id: tag, name: 'vip' } },
          ],
        },
      },
    })
    const results = (await res.json()).data.pushBatch.results as Array<{ status: string }>
    expect(results.every((r) => r.status === 'APPLIED')).toBe(true)
    await api.dispose()
  })

  // A join row pointing at a tag that exists nowhere (DB or batch) is rejected,
  // while a valid sibling in the same batch still commits.
  test('a join row referencing a non-existent tag is rejected, siblings commit', async () => {
    const api = await request.newContext()
    const email = uniqueEmail('tags-api-rej')
    const reg = await api.post(`${API}/auth/register`, { data: { email, password: DEFAULT_PASSWORD } })
    const token = (await reg.json()).accessToken

    const contact = crypto.randomUUID()
    const link = crypto.randomUUID()
    const bogus = crypto.randomUUID()
    const res = await api.post(`${API}/graphql`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        query: `mutation P($c: [RowChange!]!, $cid: String!) {
          pushBatch(changes: $c, clientId: $cid) { results { table id status reason } }
        }`,
        variables: {
          cid: 'pw',
          c: [
            { table: 'contact', id: contact, op: 'UPSERT', expectedVersion: 0, data: { id: contact, firstName: 'Bo', lastName: 'B' } },
            { table: 'contact_tag', id: link, op: 'UPSERT', expectedVersion: 0, data: { id: link, contactId: contact, tagId: bogus } },
          ],
        },
      },
    })
    const results = (await res.json()).data.pushBatch.results as Array<{ table: string; status: string; reason: string | null }>
    expect(results.find((r) => r.table === 'contact')?.status).toBe('APPLIED')
    const linkResult = results.find((r) => r.table === 'contact_tag')
    expect(linkResult?.status).toBe('REJECTED')
    expect(linkResult?.reason).toContain(`tag:${bogus}`)
    await api.dispose()
  })

  // From the UI: create a tag, then a contact with that tag checked; the
  // contact's row shows the tag, and a fresh client sees the same.
  test('tag a contact via the multi-select; the row shows the tag', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const tag = `vip${stamp}`
    const surname = `Tagged${stamp}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('tags-ui'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Create a tag.
    await a.getByPlaceholder('New tag name').fill(tag)
    await a.getByRole('button', { name: 'Add tag' }).click()

    // Create a contact and check that tag in the multi-select.
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Tag')
    await a.getByLabel('Last name').fill(surname)
    await pickReference(a, 'Tags', tag)
    await a.getByRole('button', { name: 'Save' }).click()

    // The contact's row shows the tag name.
    const row = a.getByRole('row').filter({ hasText: surname })
    await expect(row).toContainText(tag, { timeout: 8_000 })

    // A fresh client sees the same — the join row persisted and resolves.
    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('tags-ui-b'))
    await b.goto('/contacts')
    const rowB = b.getByRole('row').filter({ hasText: surname })
    await expect(rowB).toContainText(tag, { timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })

  // The "Link history" panel on the contact detail surfaces each m2m link's
  // effective_from/effective_to. A live link renders as "since <ts>".
  //
  // Not yet covered: after unlinking, the join row should render as a closed
  // period ("<from> → <to>"). It doesn't today — RxDB's default live query
  // excludes soft-deleted docs, so once we `doc.remove()` the join row it
  // disappears from joinRows entirely and the panel can't render the closed
  // period. See docs/backlog.md ("Link history: closed periods (…) don't
  // render after unlink").
  test('link history shows an active link', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const tag = `hist${stamp}`
    const surname = `LinkHistory${stamp}`

    const ctx = await browser.newContext()
    const p = await ctx.newPage()
    await register(p, uniqueEmail('link-history'))
    await p.goto('/contacts')
    await expect(p.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Create a tag, then a contact linked to it.
    await p.getByPlaceholder('New tag name').fill(tag)
    await p.getByRole('button', { name: 'Add tag' }).click()
    await p.getByRole('button', { name: 'New contact' }).click()
    await p.getByLabel('First name').fill('Link')
    await p.getByLabel('Last name').fill(surname)
    await pickReference(p, 'Tags', tag)
    await p.getByRole('button', { name: 'Save' }).click()

    // Select the new contact so the detail pane renders.
    await p.getByRole('row').filter({ hasText: surname }).click()

    // The panel exists and shows an ACTIVE ("since …") entry for the tag.
    await expect(p.getByRole('heading', { name: 'Link history' })).toBeVisible({ timeout: 8_000 })
    const activeLine = p.locator('li').filter({ hasText: tag }).filter({ hasText: /since / })
    await expect(activeLine).toBeVisible({ timeout: 8_000 })
    await expect(activeLine).not.toContainText('→')

    // The header shows a "last change …" relative-time hint.
    await expect(p.getByText(/last change /)).toBeVisible()

    await ctx.close()
  })

  // Offline-first m2m: a brand-new tag AND a contact linked to it, both created
  // offline, sync together atomically on reconnect (multi-parent batch).
  test('an offline tag + a contact linked to it sync atomically', async ({ browser }: { browser: Browser }) => {
    const stamp = Date.now()
    const tag = `OffTag${stamp}`
    const surname = `OffTagged${stamp}`

    const ctxA = await browser.newContext()
    const a = await ctxA.newPage()
    await register(a, uniqueEmail('tags-off-a'))
    await a.goto('/contacts')
    await expect(a.getByText('Lovelace')).toBeVisible({ timeout: 10_000 })

    // Go offline, create a tag and a contact linked to it.
    await a.getByRole('button', { name: /Online/ }).click()
    await a.getByPlaceholder('New tag name').fill(tag)
    await a.getByRole('button', { name: 'Add tag' }).click()
    await a.getByRole('button', { name: 'New contact' }).click()
    await a.getByLabel('First name').fill('Off')
    await a.getByLabel('Last name').fill(surname)
    await pickReference(a, 'Tags', tag)
    await a.getByRole('button', { name: 'Save' }).click()
    await expect(a.getByText(surname)).toBeVisible({ timeout: 8_000 })

    // Reconnect → tag + contact + join row push atomically.
    await a.getByRole('button', { name: /Offline/ }).click()

    const ctxB = await browser.newContext()
    const b = await ctxB.newPage()
    await register(b, uniqueEmail('tags-off-b'))
    await b.goto('/contacts')
    const rowB = b.getByRole('row').filter({ hasText: surname })
    await expect(rowB).toContainText(tag, { timeout: 10_000 })

    await ctxA.close()
    await ctxB.close()
  })
})
