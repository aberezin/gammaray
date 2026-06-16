import { test, expect } from '@playwright/test'

test.describe('Sync Indicator', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh
    await page.goto('http://localhost:3000/login')
    // Note: In CI/automation, this would need auth setup or use test fixtures
  })

  test('shows synced status when online on contacts page', async ({ page }) => {
    await page.goto('http://localhost:3000/contacts')

    // Wait for page to load
    await page.waitForSelector('h1:has-text("Contacts")')

    // Check that sync indicator shows "Synced" status
    const syncIndicator = page.locator('span:has-text("Synced")')
    await expect(syncIndicator).toBeVisible()

    // Verify the indicator has the correct color (green = #22c55e)
    const indicator = page.locator('span:has(text("●"))').first()
    await expect(indicator).toHaveCSS('color', 'rgb(34, 197, 94)') // #22c55e in RGB
  })

  test('updates sync status when toggling offline on contacts page', async ({ page }) => {
    await page.goto('http://localhost:3000/contacts')

    // Initially should show "Synced"
    await page.waitForSelector('span:has-text("Synced")')

    // Click the offline toggle button
    const offlineToggle = page.locator('button:has-text("offline")')
    await offlineToggle.click()

    // Should now show "Offline" status
    const offlineIndicator = page.locator('span:has-text("Offline")')
    await expect(offlineIndicator).toBeVisible()

    // Verify the indicator color is gray (#6b7280)
    const indicator = page.locator('span:has(text("●"))').first()
    await expect(indicator).toHaveCSS('color', 'rgb(107, 114, 128)') // #6b7280 in RGB
  })

  test('returns to synced status when coming back online', async ({ page }) => {
    await page.goto('http://localhost:3000/contacts')

    // Go offline
    const offlineToggle = page.locator('button:has-text("offline")')
    await offlineToggle.click()
    await page.waitForSelector('span:has-text("Offline")')

    // Come back online
    await offlineToggle.click()

    // Should return to "Synced" status
    const syncIndicator = page.locator('span:has-text("Synced")')
    await expect(syncIndicator).toBeVisible()
  })

  test('sync indicator works on categories page', async ({ page }) => {
    await page.goto('http://localhost:3000/categories')

    // Should show "Synced" initially
    await page.waitForSelector('span:has-text("Synced")')

    // Toggle offline
    const offlineToggle = page.locator('button:has-text("offline")')
    await offlineToggle.click()

    // Should show "Offline"
    const offlineIndicator = page.locator('span:has-text("Offline")')
    await expect(offlineIndicator).toBeVisible()
  })
})
