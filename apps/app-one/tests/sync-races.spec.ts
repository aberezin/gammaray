import { test, expect, Browser } from '@playwright/test'
import { register, login, uniqueEmail, waitForSynced } from './helpers'

/**
 * These two tests target distinct sync defects, independently:
 *
 *  (1) Single-writer self-conflict: fast per-keystroke typing in ONE tab must
 *      never produce a conflict, because there is only one writer. Fixed by
 *      debouncing/coalescing edits so one logical edit = one versioned write.
 *
 *  (2) Dead WebSocket live-push: an edit saved in one tab must propagate to
 *      another open tab via the `noteUpdated` subscription, with no action in
 *      the second tab. Fixed by wiring the subscription topic/filter to the user.
 */
test.describe('Sync race conditions', () => {
  test('(1) fast typing in a single tab never self-conflicts', async ({ page }) => {
    await register(page, uniqueEmail('fasttype'))
    // Establish a populated, synced note (version >= 1) so the burst below is a
    // stream of UPDATES, not the initial create.
    const textarea = page.locator('textarea')
    await textarea.fill('start ')
    await waitForSynced(page)
    await expect(page.getByText('v1').first()).toBeVisible({ timeout: 8_000 })

    // Simulate typing faster than the push round-trip can reconcile the version.
    // We fire input events directly on the controlled textarea in a tight loop,
    // yielding only a microtask between characters — so multiple edits (and their
    // pushes) are in flight against the same stale version baseline. With a single
    // writer this must still never conflict.
    const burst = 'the quick brown fox jumps over the lazy dog several times over'
    await page.evaluate(async (text) => {
      const el = document.querySelector('textarea') as HTMLTextAreaElement
      const setValue = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )!.set!
      let current = el.value
      for (const ch of text) {
        current += ch
        setValue.call(el, current)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        // Yield a microtask only — far faster than a real keypress, but enough
        // to let React's onChange fire and start a push for each character.
        await Promise.resolve()
      }
    }, burst)

    // No second writer exists, so a conflict banner must never appear.
    await expect(page.getByText('Sync conflict detected')).not.toBeVisible({ timeout: 8_000 })

    // And the note must converge to the full text once syncing settles.
    await waitForSynced(page)
    await expect(textarea).toHaveValue('start ' + burst)
  })

  test('(2) an edit in one tab pushes live to another open tab', async ({ browser }: { browser: Browser }) => {
    const email = uniqueEmail('livepush')

    // Setup: note at v1 so both tabs load a populated, synced note.
    const setupCtx = await browser.newContext()
    const setupPage = await setupCtx.newPage()
    await register(setupPage, email)
    await setupPage.locator('textarea').fill('Base content')
    await waitForSynced(setupPage)
    await expect(setupPage.getByText('v1').first()).toBeVisible({ timeout: 8_000 })
    await setupCtx.close()

    // Two tabs, same user, both online and synced.
    const ctx1 = await browser.newContext()
    const tab1 = await ctx1.newPage()
    await login(tab1, email)
    await waitForSynced(tab1)

    const ctx2 = await browser.newContext()
    const tab2 = await ctx2.newPage()
    await login(tab2, email)
    await waitForSynced(tab2)
    await expect(tab2.locator('textarea')).toHaveValue('Base content')

    // Tab 1 saves a new value.
    await tab1.locator('textarea').fill('Edited in tab 1')
    await waitForSynced(tab1)

    // Tab 2 takes no action — it must receive the change via the WebSocket
    // `noteUpdated` subscription and update its editor on its own.
    await expect(tab2.locator('textarea')).toHaveValue('Edited in tab 1', { timeout: 8_000 })

    await ctx1.close()
    await ctx2.close()
  })
})
