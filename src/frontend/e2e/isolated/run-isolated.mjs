import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const executable = join(
  frontendRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright',
);
const configs = [
  'playwright.isolated.config.ts',
  'playwright.demo-isolated.config.ts',
  'playwright.rentals-isolated.config.ts',
  'playwright.marketplace-isolated.config.ts',
];
let failed = false;

for (const config of configs) {
  const result = spawnSync(executable, ['test', '--config', config], {
    cwd: frontendRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) failed = true;
}

process.exitCode = failed ? 1 : 0;
