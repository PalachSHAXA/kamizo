import { test, expect } from '@playwright/test';
import { apiLogin, apiCall } from './helpers/auth';

// 1×1 transparent PNG as a data URL — minimal valid image to assert the
// photos field round-trips through API + DB without any size shenanigans.
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('api: resident attaches photos to a request and they round-trip back', async () => {
  const { token } = await apiLogin('resident');

  const created = await apiCall(token, 'POST', '/api/requests', {
    title: 'E2E test: leak with photos',
    description: 'Hot water leaking under sink, see attached photos',
    category_id: 'plumber',
    priority: 'high',
    photos: [TINY_PNG, TINY_PNG],
  });
  expect([200, 201]).toContain(created.status);
  const reqId = created.body?.id || created.body?.request?.id;
  expect(reqId).toBeTruthy();

  const list = await apiCall(token, 'GET', '/api/requests');
  expect(list.status).toBe(200);
  const items = Array.isArray(list.body) ? list.body : (list.body?.requests || list.body?.data || []);
  const found = items.find((r: any) => r.id === reqId);
  expect(found, `created request ${reqId} not in resident list`).toBeTruthy();
  // photos column comes back as JSON string from D1; the frontend parses it.
  // Test assertion accepts either parsed array or raw string with the marker.
  const rawPhotos = found.photos;
  const parsed = typeof rawPhotos === 'string'
    ? (() => { try { return JSON.parse(rawPhotos); } catch { return null; } })()
    : rawPhotos;
  expect(Array.isArray(parsed) ? parsed.length : 0).toBe(2);
  expect((parsed?.[0] as string).startsWith('data:image/png;base64')).toBe(true);
});
