import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  // Migrate + seed the deterministic baseline once before the suite (ADR 0011).
  globalSetup: './tests/global-setup.ts',
  fullyParallel: false, // conflict tests share state via DB; keep serial
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Expects both servers running. Start them with `pnpm dev` before running tests.
  // In CI, set CI=true and launch servers in the workflow before `playwright test`.
  webServer: [
    {
      command: 'pnpm --filter @gammaray/api dev',
      url: 'http://localhost:3001/graphql',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @gammaray/example dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
