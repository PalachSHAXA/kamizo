import { spawn } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS = 240_000;
export const INTEGRATION_READY_WAIT = {
  attempts: 1_000,
  intervalMs: 500,
  timeoutMs: 2_000,
  totalTimeoutMs: PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS,
};
export const HARNESS_READY_WAIT = { ...INTEGRATION_READY_WAIT };
const PROCESS_GROUP = Symbol('kamizoE2EProcessGroup');

export function spawnIsolated(bin, args, options = {}) {
  const grouped = process.platform !== 'win32';
  const child = spawn(bin, args, {
    ...options,
    detached: grouped,
  });
  if (grouped && Number.isInteger(child.pid) && child.pid > 1 && child.pid !== process.pid) {
    child[PROCESS_GROUP] = child.pid;
  }
  return child;
}

export function readinessBudgetMs(options) {
  return options.totalTimeoutMs ?? options.attempts * options.timeoutMs
    + Math.max(0, options.attempts - 1) * options.intervalMs;
}

export async function createRunContext(runId) {
  const runDir = runId
    ? join(tmpdir(), `kamizo-e2e-${runId}`)
    : await mkdtemp(join(tmpdir(), 'kamizo-e2e-'));
  if (runId) {
    if (!/^[a-zA-Z0-9-]+$/.test(runId)) throw new Error('Invalid KAMIZO_E2E_RUN_ID');
    await mkdir(runDir, { recursive: false });
  }
  await chmod(runDir, 0o700);
  let cleaned = false;

  return {
    runDir,
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      await rm(runDir, { recursive: true, force: true });
    },
  };
}

export async function writePrivateJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function waitForHttp(url, options = {}) {
  const attempts = options.attempts ?? 40;
  const intervalMs = options.intervalMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 2_000;
  const totalTimeoutMs = options.totalTimeoutMs;
  const fetchImpl = options.fetchImpl ?? fetch;
  const deadline = totalTimeoutMs ? Date.now() + totalTimeoutMs : null;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const remainingMs = deadline ? deadline - Date.now() : timeoutMs;
    if (remainingMs <= 0) break;
    const controller = new AbortController();
    const attemptTimeoutMs = Math.max(1, Math.min(timeoutMs, remainingMs));
    const timeout = setTimeout(() => {
      controller.abort(new DOMException(`HTTP attempt timed out after ${attemptTimeoutMs}ms`, 'TimeoutError'));
    }, attemptTimeoutMs);
    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts) {
      const sleepMs = deadline ? Math.min(intervalMs, Math.max(0, deadline - Date.now())) : intervalMs;
      if (sleepMs > 0) await new Promise(resolve => setTimeout(resolve, sleepMs));
    }
  }

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`${url} not ready after ${attempts} attempts${detail}`);
}

function waitForExit(child, graceMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      resolve();
    }, graceMs);
    child.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function processGroupExists(groupId) {
  try {
    process.kill(-groupId, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

async function waitForGroupExit(groupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(groupId) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return !processGroupExists(groupId);
}

function signalOwnedGroup(child, signal) {
  const groupId = child?.[PROCESS_GROUP];
  if (!Number.isInteger(groupId) || groupId <= 1 || groupId === process.pid) return false;
  try {
    process.kill(-groupId, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
  return true;
}

async function taskkillTree(pid) {
  await new Promise(resolve => {
    const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', () => resolve());
    killer.once('exit', () => resolve());
  });
}

export async function stopChildren(children, options = {}) {
  const graceMs = options.graceMs ?? 3_000;
  if (process.platform !== 'win32') {
    for (const child of children.filter(Boolean)) {
      if (!signalOwnedGroup(child, 'SIGTERM')) {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        continue;
      }
      const groupId = child[PROCESS_GROUP];
      if (!await waitForGroupExit(groupId, graceMs)) {
        signalOwnedGroup(child, 'SIGKILL');
        await waitForGroupExit(groupId, 500);
      }
    }
    const ungrouped = children.filter(child => child && !child[PROCESS_GROUP]
      && child.exitCode === null && child.signalCode === null);
    await Promise.all(ungrouped.map(child => waitForExit(child, graceMs)));
    return;
  }

  const live = children.filter(child => child && child.exitCode === null && child.signalCode === null);
  for (const child of live) child.kill('SIGTERM');
  await Promise.all(live.map(async child => {
    await waitForExit(child, graceMs);
    if (Number.isInteger(child.pid)) await taskkillTree(child.pid);
  }));
}
