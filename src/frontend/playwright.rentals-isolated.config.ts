import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { configureRunPorts } from './e2e/isolated/ports.mjs';

const runId = process.env.KAMIZO_E2E_RUN_ID || randomUUID();
process.env.KAMIZO_E2E_RUN_ID = runId;
const ports = configureRunPorts(runId);
const webOrigin = `http://127.0.0.1:${ports.web}`;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/07-rentals-overflow.spec.ts',
  grepInvert: /Marketplace overflow/,
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-rentals' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webOrigin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/isolated/harness.mjs --rentals-mocks',
    url: webOrigin,
    reuseExistingServer: false,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
