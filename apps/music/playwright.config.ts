import { defineConfig, devices } from '@playwright/test'

// Under claudebox, the music frontend is a sibling container reachable at
// $CLAUDEBOX_VM_IP:3010 rather than localhost — honor an env override so the
// same suite runs from inside the container. Defaults keep the local flow.
const FRONTEND_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3010'
const API_URL = process.env.PLAYWRIGHT_API_URL || 'http://localhost:3001'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
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

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  // Expects the API (:3001) and the music frontend (:3010) running. The shared
  // backend's music tables are migrated on API startup (no music seed yet).
  webServer: [
    {
      command: 'pnpm --filter @gammaray/api dev',
      url: `${API_URL}/graphql`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @gammaray/music dev',
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
