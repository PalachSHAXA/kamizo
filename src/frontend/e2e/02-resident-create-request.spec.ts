import { test, expect } from './fixtures';
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

  await expect(page.getByRole('button', { name: /^(Заявка|Создать|Подать|Yangi)/i }).first()).toBeVisible();
});
