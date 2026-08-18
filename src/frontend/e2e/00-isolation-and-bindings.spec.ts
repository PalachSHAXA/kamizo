import { test, expect } from './fixtures';
import { API, apiCall, apiLogin } from './helpers/auth';

test('browser production API transport stays local and blocks external redirects', async ({ page }) => {
  await page.goto('/');
  const marker = await page.evaluate(async () => {
    const response = await fetch('https://api.kamizo.uz/__e2e/browser-marker', {
      redirect: 'manual',
    });
    return response.json();
  });
  expect(marker).toEqual({ source: 'local-e2e-worker' });

  const redirectResult = await page.evaluate(async () => {
    try {
      await fetch('https://api.kamizo.uz/__e2e/redirect-to-production');
      return 'resolved';
    } catch {
      return 'blocked';
    }
  });
  expect(redirectResult).toBe('blocked');
});

test('Worker outbound fetch blocks direct and redirected production access', async ({ request }) => {
  const response = await request.get(`${API}/__e2e/outbound-probe`);
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({
    directProduction: 'blocked',
    redirectedProduction: 'blocked',
  });
});

test('local Worker exposes compatible realtime and contract-storage bindings', async ({ request }) => {
  const response = await request.get(`${API}/__e2e/bindings-probe`);
  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toEqual({
    connectionManager: 'ok',
    contractsBucket: 'ok',
  });
});

test('ConnectionManager scopes subscriptions and rejects mismatched broadcast tenants', async ({ request }) => {
  await request.post(`${API}/__e2e/connection-manager/reset`);
  const subscribe = await request.post(`${API}/__e2e/connection-manager/subscribe`, {
    data: { tenantId: 'tenant-a', channel: 'chat:channel:one', userId: 'user-a' },
  });
  expect(subscribe.status()).toBe(200);

  const mismatch = await request.post(`${API}/__e2e/connection-manager/broadcast`, {
    headers: { 'x-e2e-tenant-id': 'tenant-a' },
    data: {
      type: 'chat_read',
      data: { channel_id: 'one' },
      channels: ['chat:channel:one'],
      tenantId: 'tenant-b',
    },
  });
  expect(mismatch.status()).toBe(403);

  const broadcast = await request.post(`${API}/__e2e/connection-manager/broadcast`, {
    headers: { 'x-e2e-tenant-id': 'tenant-a' },
    data: {
      type: 'chat_read',
      data: { channel_id: 'one' },
      channels: ['chat:channel:one'],
      tenantId: 'tenant-a',
    },
  });
  expect(broadcast.status()).toBe(200);
  expect(await broadcast.json()).toMatchObject({ ok: true, delivered: 1 });

  const state = await request.get(`${API}/__e2e/connection-manager/state?tenantId=tenant-a`);
  expect(await state.json()).toMatchObject({
    subscriptions: [{ tenantId: 'tenant-a', channel: 'chat:channel:one', userId: 'user-a' }],
    events: [{ tenantId: 'tenant-a', type: 'chat_read', delivered: 1 }],
  });
});

test('chat read route emits a tenant-scoped ConnectionManager broadcast', async ({ request }) => {
  await request.post(`${API}/__e2e/connection-manager/reset`);
  await request.post(`${API}/__e2e/connection-manager/subscribe`, {
    data: {
      tenantId: 'e2e-tenant',
      channel: 'chat:channel:e2e-support',
      userId: 'observer-1',
    },
  });

  const { token } = await apiLogin('resident');
  const read = await apiCall(token, 'POST', '/api/chat/channels/e2e-support/read');
  expect(read.status).toBe(200);
  expect(read.body).toEqual({ success: true });

  const state = await request.get(`${API}/__e2e/connection-manager/state?tenantId=e2e-tenant`);
  const body = await state.json();
  expect(body.events).toHaveLength(1);
  expect(body.events[0]).toMatchObject({
    tenantId: 'e2e-tenant',
    type: 'chat_read',
    channels: ['chat:channel:e2e-support'],
    delivered: 1,
    data: {
      channel_id: 'e2e-support',
      user_id: 'e2e-user-resident',
      user_role: 'resident',
    },
  });
});
