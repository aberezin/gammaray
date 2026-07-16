import { defineConfig, devices } from '@playwright/test'

// Under claudebox, the frontend is a sibling container reachable at
// $CLAUDEBOX_VM_IP:3000 rather than localhost — honor an env override so the
// same suite runs from inside the container. Defaults keep the local flow.
const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'
const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001'

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
    baseURL: FRONTEND_URL,
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
      url: `${API_URL}/graphql`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @gammaray/example dev',
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
