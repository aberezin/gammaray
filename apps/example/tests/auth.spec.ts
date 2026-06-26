import { test, expect } from '@playwright/test'
import { register, login, uniqueEmail, DEFAULT_PASSWORD } from './helpers'

test.describe('Authentication', () => {
  test('unauthenticated root redirects to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('register creates account and lands on note page', async ({ page }) => {
    const email = uniqueEmail('reg')
    await register(page, email)
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'NoteSync' })).toBeVisible()
  })

  test('login with valid credentials lands on note page', async ({ page }) => {
    const email = uniqueEmail('login')
    // Register first, then log out and log back in
    await register(page, email)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    await login(page, email)
    await expect(page).toHaveURL('/')
  })

  test('login with wrong password shows error', async ({ page }) => {
    const email = uniqueEmail('badpw')
    await register(page, email)
    await page.getByRole('button', { name: 'Sign out' }).click()

    await page.goto('/login')
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('Invalid email or password')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('registering a duplicate email shows error', async ({ page }) => {
    const email = uniqueEmail('dup')
    await register(page, email)
    await page.getByRole('button', { name: 'Sign out' }).click()

    await page.goto('/login')
    await page.getByRole('button', { name: 'register' }).click()
    await page.fill('input[type="email"]', email)
    await page.fill('input[type="password"]', DEFAULT_PASSWORD)
    await page.getByRole('button', { name: 'Create account' }).click()

    await expect(page.getByText(/already registered|already exists|conflict/i)).toBeVisible()
  })

  test('sign out returns to login page', async ({ page }) => {
    const email = uniqueEmail('signout')
    await register(page, email)
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)
  })
})
