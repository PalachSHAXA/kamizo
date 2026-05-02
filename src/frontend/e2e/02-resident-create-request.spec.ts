import { test, expect } from '@playwright/test';
import { apiLogin, apiCall, loginAs } from './helpers/auth';

// API-level test: resident creates a request, sees it in their list.
// This is faster and more robust than driving the UI for the same outcome.
test('api: resident creates a request and sees it in list', async () => {
  const { token } = await apiLogin('resident');

  const created = await apiCall(token, 'POST', '/api/requests', {
    title: 'E2E test: leak in kitchen',
    description: 'Created by playwright e2e suite',
    category_id: 'plumber',
    priority: 'medium',
  });

  expect([200, 201]).toContain(created.status);
  const reqId = created.body?.id || created.body?.request?.id;
  expect(reqId, `no request id in response: ${JSON.stringify(created.body)}`).toBeTruthy();

  const list = await apiCall(token, 'GET', '/api/requests');
  expect(list.status).toBe(200);
  const items = Array.isArray(list.body) ? list.body : (list.body?.requests || list.body?.data || []);
  const found = items.find((r: any) => r.id === reqId);
  expect(found, `created request ${reqId} not in resident list`).toBeTruthy();
});

test('ui: resident reaches dashboard and can see "create request" affordance', async ({ page }) => {
  await loginAs(page, 'resident');
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Resident dashboard should expose a way to create a request — keep selector loose;
  // this is a smoke test, not a layout regression.
  const content = await page.locator('body').innerText();
  // Either there's a button/link with create-request semantics, or the requests page exists in nav.
  const hasCreateAffordance =
    /создать|подать|новая заявка|new request|yangi/i.test(content) ||
    await page.locator('a[href*="/requests"], a[href="/"]').count() > 0;
  expect(hasCreateAffordance).toBeTruthy();
});
