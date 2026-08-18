import { Page, expect, request as playwrightRequest } from '@playwright/test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { configuredPorts } from '../isolated/ports.mjs';

export const API = `http://127.0.0.1:${configuredPorts().api}`;

export function tokenFile(): string {
  const runId = process.env.KAMIZO_E2E_RUN_ID;
  if (!runId || !/^[a-zA-Z0-9-]+$/.test(runId)) {
    throw new Error('KAMIZO_E2E_RUN_ID is required for isolated E2E');
  }
  return path.join(os.tmpdir(), `kamizo-e2e-${runId}`, 'tokens.json');
}

function readCachedTokens(): Record<string, { token: string; user: any }> | null {
  try {
    return JSON.parse(fs.readFileSync(tokenFile(), 'utf8'));
  } catch {
    return null;
  }
}

export type Role =
  | 'superadmin' | 'admin' | 'director' | 'manager' | 'department_head'
  | 'dispatcher' | 'resident' | 'commercial_owner' | 'executor' | 'security' | 'advertiser';

export const CREDS: Record<Role, { login: string; password: string }> = {
  superadmin: { login: 'superadmin', password: 'kamizo-e2e-superadmin' },
  admin: { login: 'admin', password: 'kamizo-e2e' },
  director: { login: 'director', password: 'kamizo-e2e' },
  manager: { login: 'manager', password: 'kamizo-e2e' },
  department_head: { login: 'department_head', password: 'kamizo-e2e' },
  dispatcher: { login: 'dispatcher', password: 'kamizo-e2e' },
  resident: { login: 'resident', password: 'kamizo-e2e' },
  commercial_owner: { login: 'commercial_owner', password: 'kamizo-e2e' },
  executor: { login: 'executor', password: 'kamizo-e2e' },
  security: { login: 'security', password: 'kamizo-e2e' },
  advertiser: { login: 'advertiser', password: 'kamizo-e2e' },
};

export async function apiLogin(role: Role): Promise<{ token: string; user: any }> {
  // Prefer the cached token from globalSetup to avoid hitting the 5/min login rate limit.
  const cache = readCachedTokens();
  if (cache?.[role]?.token) return cache[role];

  const { login, password } = CREDS[role];
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${API}/api/auth/login`, {
    data: { login, password, tenantSlug: 'e2e' },
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': `127.0.0.${(Object.keys(CREDS) as Role[]).indexOf(role) + 1}`,
    },
    timeout: 10_000,
  });
  expect(res.ok(), `login ${role} failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  await ctx.dispose();
  return body;
}

// Pre-authenticate the page by setting localStorage exactly the way the app does.
// Bypasses the agreedToTerms gate and the offer-scroll modal.
// Uses addInitScript so localStorage is populated BEFORE the page's modules run
// (otherwise zustand persist initializes empty before our setItem runs).
export async function loginAs(page: Page, role: Role): Promise<{ token: string; user: any }> {
  const { token, user } = await apiLogin(role);

  await page.addInitScript(({ token, user }: { token: string; user: any }) => {
    localStorage.setItem('auth_token', token);
    localStorage.setItem(`onboarding_seen_${user.role}_${user.id}`, '1');
    localStorage.setItem('uk-auth-storage', JSON.stringify({
      state: { user, token, additionalUsers: [] },
      version: 4,
    }));
  }, { token, user });
  return { token, user };
}

export async function apiCall(token: string, method: string, path: string, body?: any) {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.fetch(`${API}${path}`, {
    method,
    headers: {
      'authorization': `Bearer ${token}`,
      'content-type': 'application/json',
    },
    data: body ? JSON.stringify(body) : undefined,
    timeout: 10_000,
  });
  const text = await res.text();
  await ctx.dispose();
  return { status: res.status(), body: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
}
