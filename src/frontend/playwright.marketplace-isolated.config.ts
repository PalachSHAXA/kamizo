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
  grep: /Marketplace overflow/,
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-marketplace' }]],
  // Observed cold module graph is 16-27s on local/CI; 45s is bounded headroom, not a retry mask.
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: webOrigin,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'node e2e/isolated/harness.mjs --marketplace-mocks',
    url: webOrigin,
    reuseExistingServer: false,
    timeout: 240_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
  },
});
