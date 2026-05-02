import { test, expect } from '@playwright/test';
import { apiLogin, apiCall } from './helpers/auth';

// Director creates a building, then a meeting on that building.
// Asserts the meeting comes back in /api/meetings list.
test('api: director creates a building and a meeting on it', async () => {
  const { token } = await apiLogin('director');

  const buildingRes = await apiCall(token, 'POST', '/api/buildings', {
    name: `E2E Building ${Date.now()}`,
    address: 'ул. Тестовая, 1',
    branch_code: 'YS',
  });
  expect([200, 201]).toContain(buildingRes.status);
  const buildingId = buildingRes.body?.id || buildingRes.body?.building?.id;
  expect(buildingId, `no building id: ${JSON.stringify(buildingRes.body)}`).toBeTruthy();

  const meetingRes = await apiCall(token, 'POST', '/api/meetings', {
    building_id: buildingId,
    building_address: 'ул. Тестовая, 1',
    description: 'E2E test: создание собрания',
    organizer_type: 'uk',
    format: 'offline',
    location: 'Двор дома',
  });
  expect([200, 201]).toContain(meetingRes.status);
  const meetingId = meetingRes.body?.id || meetingRes.body?.meeting?.id;
  expect(meetingId, `no meeting id: ${JSON.stringify(meetingRes.body)}`).toBeTruthy();

  const list = await apiCall(token, 'GET', '/api/meetings');
  expect(list.status).toBe(200);
  const meetings = Array.isArray(list.body) ? list.body : (list.body?.meetings || list.body?.data || []);
  const found = meetings.find((m: any) => m.id === meetingId);
  expect(found, `created meeting ${meetingId} not in director's list`).toBeTruthy();
});
