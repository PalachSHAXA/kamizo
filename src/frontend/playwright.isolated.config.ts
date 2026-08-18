import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { configureRunPorts } from './e2e/isolated/ports.mjs';

const runId = process.env.KAMIZO_E2E_RUN_ID || randomUUID();
process.env.KAMIZO_E2E_RUN_ID = runId;
const ports = configureRunPorts(runId);
const webOrigin = `http://127.0.0.1:${ports.web}`;

const adaptiveSpec = '**/06-adaptive-smoke.spec.ts';

export default defineConfig({
  testDir: './e2e',
  testIgnore: [
    '**/global-setup.ts', '**/helpers/**', '**/isolated/**', '**/fixtures.ts',
    '**/07-rentals-overflow.spec.ts',
    '**/08-demo-presentation.spec.ts',
  ],
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-isolated' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: webOrigin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 850 } },
    },
    {
      name: 'tablet-adaptive',
      testMatch: adaptiveSpec,
      grepInvert: /@self-viewport/,
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium', viewport: { width: 768, height: 1024 } },
    },
    {
      name: 'mobile-adaptive',
      testMatch: adaptiveSpec,
      grepInvert: /@self-viewport/,
      use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 } },
    },
    {
      name: 'mobile-small-adaptive',
      testMatch: adaptiveSpec,
      grepInvert: /@self-viewport/,
      use: { ...devices['iPhone SE'], browserName: 'chromium', viewport: { width: 375, height: 667 } },
    },
    {
      name: 'mobile-landscape-adaptive',
      testMatch: adaptiveSpec,
      grepInvert: /@self-viewport/,
      use: { ...devices['iPhone 13 landscape'], browserName: 'chromium', viewport: { width: 812, height: 375 } },
    },
  ],
  webServer: {
    command: 'node e2e/isolated/harness.mjs',
    url: webOrigin,
    reuseExistingServer: false,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
