import { test, expect, type Page } from '@playwright/test'
import { register, uniqueEmail, waitForSynced } from './helpers'

// At-scale paged list (ADR 0013): the `track` table is marked `paged`, so its
// list is fetched one keyset page at a time from the server (pageRows) instead of
// being full-replicated. These tests prove the bounded page, numbered Next/Prev,
// server-side sort + search, and that writes still round-trip (optimistic + push).
//
// Assertions read the total dynamically rather than hard-coding the seed count,
// so they don't drift as data changes — they only require a multi-page catalog.

const PAGE_SIZE = 25
const rows = (page: Page) => page.locator('table tbody tr')
const pager = (page: Page) => page.getByRole('navigation', { name: 'Pagination' })
// The Title cell (first column) — synchronous, unlike the async-resolved Album
// label — so it's a stable signal for "did the page's rows change".
const firstTitle = async (page: Page) => ((await rows(page).first().locator('td').first().textContent()) ?? '').trim()
const totalOf = async (page: Page) => {
  const text = (await pager(page).textContent()) ?? ''
  const m = text.match(/(\d+)\s+total/)
  return m ? Number(m[1]) : 0
}

async function openTracks(page: Page) {
  await register(page, uniqueEmail('tracks'))
  await page.goto('/tracks')
  await expect(page.getByRole('heading', { name: 'Tracks' })).toBeVisible({ timeout: 10_000 })
  await waitForSynced(page)
  await expect(pager(page)).toBeVisible({ timeout: 10_000 })
}

test.describe('Tracks — at-scale paged list', () => {
  test('bounded page, total, and First/Prev/Next navigation', async ({ page }) => {
    await openTracks(page)

    const total = await totalOf(page)
    expect(total).toBeGreaterThan(PAGE_SIZE) // a multi-page catalog
    const pageCount = Math.ceil(total / PAGE_SIZE)

    // A bounded first page — exactly PAGE_SIZE rows, not the whole table.
    await expect(rows(page)).toHaveCount(PAGE_SIZE)
    await expect(pager(page)).toContainText(`Page 1 of ${pageCount}`)

    const page1Title = await firstTitle(page)

    // Next → a fresh page of rows (keyset seek, no overlap with page 1).
    await page.getByRole('button', { name: 'Next ›' }).click()
    await expect(pager(page)).toContainText(`Page 2 of ${pageCount}`)
    await expect.poll(() => firstTitle(page)).not.toEqual(page1Title)

    // Prev → back to the same page 1.
    await page.getByRole('button', { name: '‹ Prev' }).click()
    await expect(pager(page)).toContainText(`Page 1 of ${pageCount}`)
    await expect.poll(() => firstTitle(page)).toEqual(page1Title)

    // On page 1, First/Prev are disabled; Next is enabled.
    await expect(page.getByRole('button', { name: '« First' })).toBeDisabled()
    await expect(page.getByRole('button', { name: '‹ Prev' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Next ›' })).toBeEnabled()
  })

  test('server-side sort reorders the whole table, not just the page', async ({ page }) => {
    await openTracks(page)
    const ascFirst = await firstTitle(page) // default Title ASC

    // Click the Title header to flip to DESC; the active sort is marked and the
    // first row (now the alphabetically-last title across ALL pages) changes.
    const titleHeader = page.getByRole('columnheader', { name: /Title/ })
    await titleHeader.click()
    await expect(titleHeader).toHaveText(/▼/)
    await expect(pager(page)).toContainText('Page 1 of') // resets to page 1
    expect(await firstTitle(page)).not.toEqual(ascFirst)
  })

  test('server-side search narrows the result set; clearing restores it', async ({ page }) => {
    await openTracks(page)
    const fullTotal = await totalOf(page)

    const search = page.getByRole('textbox', { name: 'Search Tracks' })
    await search.fill('Pt. 1')

    // Total shrinks below the full catalog and every visible row matches.
    await expect.poll(() => totalOf(page)).toBeLessThan(fullTotal)
    expect(await totalOf(page)).toBeGreaterThan(0)
    await expect(rows(page).first()).toContainText('Pt. 1')

    // Clearing the search restores the full catalog.
    await search.fill('')
    await expect.poll(() => totalOf(page)).toEqual(fullTotal)
  })

  test('edit a seeded track persists server-side (paged update path)', async ({ page }) => {
    await openTracks(page)

    // Edit the FIRST seeded track — the one loaded via pageRows and never
    // bulk-pulled into RxDB. This exercises the paged-update code path;
    // editing a locally-created track wouldn't (that doc is already in RxDB).
    const marker = `[e2e-edit-${Date.now().toString(36)}]`
    const firstRow = rows(page).first()
    const originalTitle = ((await firstRow.locator('td').first().textContent()) ?? '').trim()
    const newTitle = `${originalTitle} ${marker}`

    await firstRow.click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title', { exact: true }).fill(newTitle)
    await page.getByRole('button', { name: 'Save' }).click()

    // Server persistence: hard-reload (dropping the local pagedRows state so
    // the search can only succeed if the server actually has the edit), then
    // let the push settle before the one-shot search query fires.
    await page.waitForTimeout(700)
    await page.reload()
    await waitForSynced(page)
    const search = page.getByRole('textbox', { name: 'Search Tracks' })
    await search.fill(marker)
    await expect(rows(page).filter({ hasText: marker })).toHaveCount(1, { timeout: 8_000 })

    // Clean up: revert the title so the seed stays unmodified for other tests.
    await rows(page).filter({ hasText: marker }).first().click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title', { exact: true }).fill(originalTitle)
    await page.getByRole('button', { name: 'Save' }).click()
    await page.waitForTimeout(700)
    await search.fill(marker)
    await expect(rows(page).filter({ hasText: marker })).toHaveCount(0, { timeout: 8_000 })
  })

  // Paged writes bypass RxDB (ADR 0014) and enqueue direct through the
  // BatchCoordinator — no RxDB offline queue. So an edit while the
  // OfflineToggle is off can't queue, and the app must not let one silently
  // vanish. Save is disabled while offline for the paged path.
  test('paged rows: Save is disabled while offline (writes cannot queue)', async ({ page }) => {
    await openTracks(page)

    const originalTitle = await firstTitle(page)

    // Open edit mode on the first seeded track while ONLINE.
    await rows(page).first().click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByLabel('Title', { exact: true }).fill(`${originalTitle} [would-be-offline-edit]`)

    // Now toggle offline. Save should be disabled — a paged edit can't
    // reach the server and RxDB can't queue it for later.
    await page.getByRole('button', { name: 'Online' }).click()
    await expect(page.getByText('● Offline')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled()

    // Cancel out; go back online; confirm the seed is unchanged.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await page.getByRole('button', { name: 'Offline (click to sync)' }).click()
    await waitForSynced(page)
    expect(await firstTitle(page)).toEqual(originalTitle)
  })

  // If the push fails (server error, transient network) after Save, the
  // optimistic pagedRows change must roll back — otherwise the user sees a
  // stale local edit that never reached the server.
  test('paged rows: server error on save rolls back the optimistic edit', async ({ page }) => {
    await openTracks(page)

    const originalTitle = await firstTitle(page)

    // Intercept the pushBatch mutation and return a 500 once.
    let intercepted = false
    await page.route('**/graphql', async (route) => {
      const body = route.request().postData() || ''
      if (!intercepted && body.includes('pushBatch')) {
        intercepted = true
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ errors: [{ message: 'simulated' }] }) })
      } else {
        await route.continue()
      }
    })

    await rows(page).first().click()
    await page.getByRole('button', { name: 'Edit' }).click()
    const brokenTitle = `${originalTitle} [broken]`
    await page.getByLabel('Title', { exact: true }).fill(brokenTitle)
    await page.getByRole('button', { name: 'Save' }).click()

    // The push fails. The list must not show the broken title indefinitely —
    // roll back to the original within a short window.
    await expect.poll(async () => firstTitle(page), { timeout: 8000 }).toEqual(originalTitle)
    // And the request must actually have been intercepted (guards against the
    // test silently passing because Save didn't fire pushBatch at all).
    expect(intercepted).toBe(true)
  })

  test('create round-trips through the paged path; delete cleans up', async ({ page }) => {
    await openTracks(page)

    const title = `Paged Track ${Date.now()}`
    await page.getByRole('button', { name: 'New track' }).click()
    await page.getByLabel('Title').fill(title)
    await page.getByRole('button', { name: 'Save' }).click()

    // Optimistic: the new track shows immediately atop the current page.
    await expect(page.getByRole('cell', { name: title }).first()).toBeVisible({ timeout: 8_000 })

    // Persisted server-side: a search (a fresh pageRows query) finds it. Let the
    // push settle first so the server has it when the one-shot search query runs.
    await page.waitForTimeout(700)
    await page.getByRole('textbox', { name: 'Search Tracks' }).fill(title)
    const created = rows(page).filter({ hasText: title })
    await expect(created).toHaveCount(1, { timeout: 8_000 })

    // Clean up via the paged delete path (soft-delete + push), then confirm it's
    // gone from the list — leaving the seeded catalog as we found it.
    await created.click()
    await page.getByRole('button', { name: 'Delete' }).click()
    await expect(rows(page).filter({ hasText: title })).toHaveCount(0, { timeout: 8_000 })
  })
})
