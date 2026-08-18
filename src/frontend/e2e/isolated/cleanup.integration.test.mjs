import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('forced setup failure removes its run directory', { timeout: 30_000 }, async () => {
  const runId = `forced-failure-${process.pid}`;
  const runDir = join(tmpdir(), `kamizo-e2e-${runId}`);
  const child = spawn(process.execPath, ['e2e/isolated/harness.mjs'], {
    cwd: new URL('../..', import.meta.url),
    env: {
      ...process.env,
      KAMIZO_E2E_RUN_ID: runId,
      KAMIZO_E2E_FAIL_STAGE: 'after-run-dir',
      KAMIZO_E2E_QUIET: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  assert.notEqual(exitCode, 0);
  assert.equal(existsSync(runDir), false);
});
