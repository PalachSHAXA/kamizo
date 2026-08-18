export const DEMO_LOGIN_WINDOW_MS = 60_000;
export const DEMO_LOGIN_GLOBAL_LIMIT = 30;
export const DEMO_LOGIN_ROLE_LIMIT = 8;

export function resolveDemoLoginGlobalLimit(environment: string, configured?: string): number {
  if (environment !== 'test' || configured === undefined) return DEMO_LOGIN_GLOBAL_LIMIT;
  const parsed = Number(configured);
  return Number.isSafeInteger(parsed) && parsed >= DEMO_LOGIN_GLOBAL_LIMIT && parsed <= 1_000
    ? parsed
    : DEMO_LOGIN_GLOBAL_LIMIT;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export interface DemoLoginLimitResult {
  allowed: boolean;
  reason?: 'global' | 'role';
  retryAfterSec: number;
}

const windows = new Map<string, WindowState>();

function currentWindow(key: string, now: number): WindowState {
  const existing = windows.get(key);
  if (existing && now < existing.resetAt) return existing;
  const fresh = { count: 0, resetAt: now + DEMO_LOGIN_WINDOW_MS };
  windows.set(key, fresh);
  return fresh;
}

function retryAfter(window: WindowState, now: number): number {
  return Math.max(1, Math.ceil((window.resetAt - now) / 1000));
}

export function checkDemoLoginProcessLimit(
  tenantId: string,
  roleKey: string,
  now = Date.now(),
  globalLimit = DEMO_LOGIN_GLOBAL_LIMIT,
): DemoLoginLimitResult {
  const globalWindow = currentWindow(`tenant:${tenantId}`, now);
  const roleWindow = currentWindow(`tenant:${tenantId}:role:${roleKey}`, now);

  if (globalWindow.count >= globalLimit) {
    return { allowed: false, reason: 'global', retryAfterSec: retryAfter(globalWindow, now) };
  }
  if (roleWindow.count >= DEMO_LOGIN_ROLE_LIMIT) {
    return { allowed: false, reason: 'role', retryAfterSec: retryAfter(roleWindow, now) };
  }

  globalWindow.count += 1;
  roleWindow.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}
