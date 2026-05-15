import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/global-setup.ts', '**/helpers/**'],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Sprint 2: separate projects for each major viewport band so we can run
  // smoke flows against the bands users actually live in. `desktop` is the
  // default; pass `--project=mobile-small` / `tablet` / etc. to exercise
  // the others. The whole suite still runs single-worker per the top-level
  // `workers: 1` setting.
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 850 } },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'], viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'mobile-small',
      use: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } },
    },
    {
      name: 'mobile-landscape',
      use: { ...devices['iPhone 13 landscape'], viewport: { width: 812, height: 375 } },
    },
  ],
});
