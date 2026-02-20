import { defineConfig } from '@playwright/test'

const serverURL = process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  globalTimeout: 600_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: serverURL,
    trace: 'on-first-retry',
    viewport: { width: 1920, height: 1080 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm preview' : 'pnpm dev',
    url: serverURL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
