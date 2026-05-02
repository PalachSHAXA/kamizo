import { Page, expect, request as playwrightRequest } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const API = 'http://localhost:8787';
const __filename_helper = fileURLToPath(import.meta.url);
const __dirname_helper = path.dirname(__filename_helper);
const TOKEN_FILE = path.join(__dirname_helper, '..', '.auth', 'tokens.json');

function readCachedTokens(): Record<string, { token: string; user: any }> | null {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

export type Role =
  | 'superadmin' | 'admin' | 'director' | 'manager' | 'department_head'
  | 'dispatcher' | 'resident' | 'executor' | 'security' | 'advertiser';

export const CREDS: Record<Role, { login: string; password: string }> = {
  superadmin: { login: 'superadmin', password: 'admin123' },
  admin: { login: 'admin', password: 'palach27' },
  director: { login: 'director', password: 'kamizo' },
  manager: { login: 'manager', password: 'kamizo' },
  department_head: { login: 'department_head', password: 'kamizo' },
  dispatcher: { login: 'dispatcher', password: 'kamizo' },
  resident: { login: 'resident', password: 'kamizo' },
  executor: { login: 'executor', password: 'kamizo' },
  security: { login: 'security', password: 'kamizo' },
  advertiser: { login: 'advertiser', password: 'kamizo' },
};

export async function apiLogin(role: Role): Promise<{ token: string; user: any }> {
  // Prefer the cached token from globalSetup to avoid hitting the 5/min login rate limit.
  const cache = readCachedTokens();
  if (cache?.[role]?.token) return cache[role];

  const { login, password } = CREDS[role];
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${API}/api/auth/login`, {
    data: { login, password },
    headers: { 'content-type': 'application/json' },
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
  });
  const text = await res.text();
  await ctx.dispose();
  return { status: res.status(), body: text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null };
}
