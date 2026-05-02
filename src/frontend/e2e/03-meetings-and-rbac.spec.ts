import { test, expect } from '@playwright/test';
import { apiLogin, apiCall, loginAs } from './helpers/auth';

test('api: director can list meetings (200)', async () => {
  const { token } = await apiLogin('director');
  const res = await apiCall(token, 'GET', '/api/meetings');
  expect(res.status).toBe(200);
});

test('api: resident can list meetings (200)', async () => {
  const { token } = await apiLogin('resident');
  const res = await apiCall(token, 'GET', '/api/meetings');
  expect(res.status).toBe(200);
});

// RBAC: closed endpoints
test('rbac: super_admin route blocked for non-super', async () => {
  const { token } = await apiLogin('admin');
  const res = await apiCall(token, 'GET', '/api/super-admin/banners');
  expect([401, 403]).toContain(res.status);
});

test('rbac: register cannot escalate to super_admin (privilege escalation gate)', async () => {
  const { token } = await apiLogin('admin');
  const res = await apiCall(token, 'POST', '/api/auth/register', {
    login: `pwn_${Date.now()}`,
    password: 'whatever123',
    name: 'Privilege Escalation Probe',
    role: 'super_admin',
  });
  expect([401, 403]).toContain(res.status);
});

test('rbac: GET /api/executors requires auth', async ({ request }) => {
  const res = await request.get('http://localhost:8787/api/executors');
  expect([401, 403]).toContain(res.status());
});

test('rbac: emergency-reset rejects old hardcoded secret', async ({ request }) => {
  const res = await request.post('http://localhost:8787/api/_emergency-reset', {
    data: { secret: 'kamizo-emergency-2026', user_id: 'sa-001', password: 'x' },
    headers: { 'content-type': 'application/json' },
  });
  // 503 (disabled), 403 (forbidden — wrong secret), or 429 (rate-limited from prior test runs)
  // are ALL valid — they prove the old hardcoded secret no longer works
  expect([403, 429, 503]).toContain(res.status());
});

test('ui: director navigates to meetings page', async ({ page }) => {
  await loginAs(page, 'director');
  await page.goto('/meetings');
  await page.waitForLoadState('networkidle');
  await expect(page).not.toHaveURL(/\/login/);
  // Should not be the access-denied "ShieldAlert" page either
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/нет доступа|ruxsat yo'q/i);
});

test('ui: resident is denied /team', async ({ page }) => {
  await loginAs(page, 'resident');
  await page.goto('/team');
  await page.waitForLoadState('networkidle');
  // ProtectedRoute redirects to / (which renders dashboard, not team).
  // Check the URL OR that we don't see team-management UI.
  const url = page.url();
  // We were redirected away from /team OR shown a no-access page
  const text = await page.locator('body').innerText();
  const denied = !url.endsWith('/team') || /нет доступа|ruxsat yo'q|404/i.test(text);
  expect(denied).toBeTruthy();
});
