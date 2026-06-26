import { test, expect, Browser } from '@playwright/test'
import { register, login, uniqueEmail, waitForSynced, DEFAULT_PASSWORD } from './helpers'

/**
 * Conflict tests use two browser contexts to simulate two separate tabs
 * with the same logged-in user.
 */
test.describe('Offline sync and conflict resolution', () => {
  test('offline toggle changes indicator to Offline', async ({ page }) => {
    await register(page, uniqueEmail('offline-indicator'))
    await waitForSynced(page)

    await page.getByRole('button', { name: /Online/ }).click()
    await expect(page.getByText('● Offline')).toBeVisible()

    // Toggling back shows syncing then synced
    await page.getByRole('button', { name: /Offline/ }).click()
    await expect(page.getByText(/● Sync/)).toBeVisible()
  })

  test('edits made while offline are synced when coming back online', async ({ page }) => {
    await register(page, uniqueEmail('offline-sync'))
    const textarea = page.locator('textarea')

    // Go offline
    await page.getByRole('button', { name: /Online/ }).click()
    await expect(page.getByText('● Offline')).toBeVisible()

    await textarea.fill('Written while offline')

    // Come back online
    await page.getByRole('button', { name: /Offline/ }).click()
    await waitForSynced(page)

    await expect(page.getByText('v1').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('saved').first()).toBeVisible()
  })

  test('conflict is detected when two tabs edit the same note offline', async ({ browser }: { browser: Browser }) => {
    const email = uniqueEmail('conflict')

    // --- Setup: register and get the note into a known state ---
    const setupCtx = await browser.newContext()
    const setupPage = await setupCtx.newPage()
    await register(setupPage, email)
    const textarea = setupPage.locator('textarea')
    await textarea.fill('Initial content')
    await waitForSynced(setupPage)
    await expect(setupPage.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
    await setupCtx.close()

    // --- Load BOTH tabs while note is at v1 ---
    const ctx1 = await browser.newContext()
    const tab1 = await ctx1.newPage()
    await login(tab1, email)
    await waitForSynced(tab1)

    const ctx2 = await browser.newContext()
    const tab2 = await ctx2.newPage()
    await login(tab2, email)
    await waitForSynced(tab2)

    // --- Both go offline ---
    await tab1.getByRole('button', { name: /Online/ }).click()
    await expect(tab1.getByText('● Offline')).toBeVisible()
    await tab2.getByRole('button', { name: /Online/ }).click()
    await expect(tab2.getByText('● Offline')).toBeVisible()

    // --- Both edit while offline ---
    await tab1.locator('textarea').fill('Tab 1 edit (offline)')
    await tab2.locator('textarea').fill('Tab 2 edit (offline)')

    // --- Tab 1 syncs first (succeeds, becomes v2) ---
    await tab1.getByRole('button', { name: /Offline/ }).click()
    await waitForSynced(tab1)
    await expect(tab1.getByText('v2').first()).toBeVisible({ timeout: 10_000 })

    // --- Tab 2 syncs second (conflicts with tab 1's v2) ---
    await tab2.getByRole('button', { name: /Offline/ }).click()

    // Conflict banner should appear
    await expect(tab2.getByText('Sync conflict detected')).toBeVisible({ timeout: 10_000 })
    // Check content inside the conflict banner's <pre> elements
    await expect(tab2.locator('pre').filter({ hasText: 'Tab 1 edit (offline)' })).toBeVisible()
    await expect(tab2.locator('pre').filter({ hasText: 'Tab 2 edit (offline)' })).toBeVisible()

    await ctx1.close()
    await ctx2.close()
  })

  test('resolving conflict with "Keep mine" saves client content', async ({ browser }: { browser: Browser }) => {
    const email = uniqueEmail('keepmine')

    // Setup: note at v1
    const setupCtx = await browser.newContext()
    const setupPage = await setupCtx.newPage()
    await register(setupPage, email)
    await setupPage.locator('textarea').fill('Base content')
    await waitForSynced(setupPage)
    await expect(setupPage.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
    await setupCtx.close()

    // Load BOTH tabs while note is at v1
    const ctx1 = await browser.newContext()
    const tab1 = await ctx1.newPage()
    await login(tab1, email)
    await waitForSynced(tab1)

    const ctx2 = await browser.newContext()
    const tab2 = await ctx2.newPage()
    await login(tab2, email)
    await waitForSynced(tab2)

    // Both go offline
    await tab1.getByRole('button', { name: /Online/ }).click()
    await expect(tab1.getByText('● Offline')).toBeVisible()
    await tab2.getByRole('button', { name: /Online/ }).click()
    await expect(tab2.getByText('● Offline')).toBeVisible()

    await tab1.locator('textarea').fill('Tab 1 wins')
    await tab2.locator('textarea').fill('Tab 2 my edit')

    // Tab 1 syncs first (v1 → v2)
    await tab1.getByRole('button', { name: /Offline/ }).click()
    await waitForSynced(tab1)
    await ctx1.close()

    // Tab 2 syncs second (conflict: expected v1, server at v2)
    await tab2.getByRole('button', { name: /Offline/ }).click()
    await expect(tab2.getByText('Sync conflict detected')).toBeVisible({ timeout: 10_000 })
    await tab2.getByRole('button', { name: 'Keep mine' }).click()
    // Wait for the banner to disappear — signals resolveConflict completed and setConflict(null) was called
    await expect(tab2.getByText('Sync conflict detected')).not.toBeVisible({ timeout: 10_000 })

    await waitForSynced(tab2)
    await expect(tab2.locator('textarea')).toHaveValue('Tab 2 my edit')
    await expect(tab2.getByText('resolved').first()).toBeVisible({ timeout: 8_000 })

    await ctx2.close()
  })

  test('resolving conflict with "Keep theirs" saves server content', async ({ browser }: { browser: Browser }) => {
    const email = uniqueEmail('keeptheirs')

    // Setup: note at v1
    const setupCtx = await browser.newContext()
    const setupPage = await setupCtx.newPage()
    await register(setupPage, email)
    await setupPage.locator('textarea').fill('Base')
    await waitForSynced(setupPage)
    await expect(setupPage.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
    await setupCtx.close()

    // Load BOTH tabs while note is at v1
    const ctx1 = await browser.newContext()
    const tab1 = await ctx1.newPage()
    await login(tab1, email)
    await waitForSynced(tab1)

    const ctx2 = await browser.newContext()
    const tab2 = await ctx2.newPage()
    await login(tab2, email)
    await waitForSynced(tab2)

    // Both go offline
    await tab1.getByRole('button', { name: /Online/ }).click()
    await expect(tab1.getByText('● Offline')).toBeVisible()
    await tab2.getByRole('button', { name: /Online/ }).click()
    await expect(tab2.getByText('● Offline')).toBeVisible()

    await tab1.locator('textarea').fill('Server content (tab 1)')
    await tab2.locator('textarea').fill('My local edit (tab 2)')

    // Tab 1 syncs first (v1 → v2)
    await tab1.getByRole('button', { name: /Offline/ }).click()
    await waitForSynced(tab1)
    await ctx1.close()

    // Tab 2 conflicts
    await tab2.getByRole('button', { name: /Offline/ }).click()
    await expect(tab2.getByText('Sync conflict detected')).toBeVisible({ timeout: 10_000 })
    await tab2.getByRole('button', { name: 'Keep theirs' }).click()
    await expect(tab2.getByText('Sync conflict detected')).not.toBeVisible({ timeout: 10_000 })

    await waitForSynced(tab2)
    await expect(tab2.locator('textarea')).toHaveValue('Server content (tab 1)')
    await expect(tab2.getByText('resolved').first()).toBeVisible({ timeout: 8_000 })

    await ctx2.close()
  })

  test('resolving conflict with manual merge saves custom content', async ({ browser }: { browser: Browser }) => {
    const email = uniqueEmail('merge')

    // Setup: note at v1
    const setupCtx = await browser.newContext()
    const setupPage = await setupCtx.newPage()
    await register(setupPage, email)
    await setupPage.locator('textarea').fill('Base')
    await waitForSynced(setupPage)
    await expect(setupPage.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
    await setupCtx.close()

    // Load BOTH tabs while note is at v1
    const ctx1 = await browser.newContext()
    const tab1 = await ctx1.newPage()
    await login(tab1, email)
    await waitForSynced(tab1)

    const ctx2 = await browser.newContext()
    const tab2 = await ctx2.newPage()
    await login(tab2, email)
    await waitForSynced(tab2)

    // Both go offline
    await tab1.getByRole('button', { name: /Online/ }).click()
    await expect(tab1.getByText('● Offline')).toBeVisible()
    await tab2.getByRole('button', { name: /Online/ }).click()
    await expect(tab2.getByText('● Offline')).toBeVisible()

    await tab1.locator('textarea').fill('Part A')
    await tab2.locator('textarea').fill('Part B')

    // Tab 1 syncs first (v1 → v2)
    await tab1.getByRole('button', { name: /Offline/ }).click()
    await waitForSynced(tab1)
    await ctx1.close()

    // Tab 2 conflicts
    await tab2.getByRole('button', { name: /Offline/ }).click()
    await expect(tab2.getByText('Sync conflict detected')).toBeVisible({ timeout: 10_000 })
    await tab2.getByRole('button', { name: 'Edit / merge' }).click()

    // The merge textarea pre-fills with client content; overwrite with merged value
    // nth(0) = ConflictBanner's merge textarea; nth(1) = NoteEditor textarea (below)
    const mergeTextarea = tab2.locator('textarea').nth(0)
    await mergeTextarea.fill('Part A + Part B (merged)')
    await tab2.getByRole('button', { name: 'Save merged' }).click()
    await expect(tab2.getByText('Sync conflict detected')).not.toBeVisible({ timeout: 10_000 })

    await waitForSynced(tab2)
    await expect(tab2.locator('textarea').first()).toHaveValue('Part A + Part B (merged)')
    await expect(tab2.getByText('resolved').first()).toBeVisible({ timeout: 8_000 })

    await ctx2.close()
  })
})
