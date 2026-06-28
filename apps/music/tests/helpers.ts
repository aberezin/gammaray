import { Page } from '@playwright/test'

export function uniqueEmail(label = 'user') {
  return `music-${label}-${Date.now()}@example.com`
}

export const DEFAULT_PASSWORD = 'password123'

// Register a fresh account through the login page; lands on the app (home
// redirects to /albums).
export async function register(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'register' }).click()
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))
}

/** Wait until the sync indicator shows "Synced". */
export async function waitForSynced(page: Page, timeout = 10_000) {
  await page.getByText('● Synced').waitFor({ timeout })
}
