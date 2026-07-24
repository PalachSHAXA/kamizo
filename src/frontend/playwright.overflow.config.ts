// Isolated Playwright config for the rentals overflow audit spec.
// Skips the standard globalSetup (which seeds test users against a
// local dev backend at :8787 that isn't running here) — the overflow
// spec doesn't need auth because dev-mock modules prime the stores at
// module load.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '07-rentals-overflow.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 20_000,
  reporter: [['line']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'off',
    screenshot: 'off',
    video: 'off',
    // Use system Chrome (already installed) instead of bundled chromium
    // headless-shell which isn't downloaded.
    channel: 'chrome',
  },
});
