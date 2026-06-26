import { Page } from '@playwright/test'

/** Unique email per test run so tests don't share DB state */
export function uniqueEmail(label = 'user') {
  return `test-${label}-${Date.now()}@example.com`
}

export const DEFAULT_PASSWORD = 'password123'

export async function register(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto('/login')
  await page.getByRole('button', { name: 'register' }).click()
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL('/')
}

export async function login(page: Page, email: string, password = DEFAULT_PASSWORD) {
  await page.goto('/login')
  // mode defaults to 'login'
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL('/')
}

/** Wait until the sync indicator shows "Synced" */
export async function waitForSynced(page: Page, timeout = 10_000) {
  await page.getByText('● Synced').waitFor({ timeout })
}
