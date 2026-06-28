import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['line']],

  use: {
    baseURL: 'http://localhost:3010',
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
      url: 'http://localhost:3001/graphql',
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'pnpm --filter @gammaray/music dev',
      url: 'http://localhost:3010',
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
})
