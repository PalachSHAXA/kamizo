import { describe, expect, it } from 'vitest';

import { enforceDemoSessionPolicy } from '../demoSession';
import type { User } from '../../types';

const demoAdmin = {
  id: 'demo-admin', login: 'demo-director-admin', phone: '+998', name: 'Demo Admin',
  role: 'admin', tenant_id: 'tenant-demo', isDemoSession: true as const,
};
const demoDirector = { ...demoAdmin, id: 'demo-director', login: 'demo-director', role: 'director' };
const demoResident = { ...demoAdmin, id: 'demo-resident', login: '98765432', role: 'resident' };

function policy(method: string, routePath: string, user: User = demoResident) {
  return enforceDemoSessionPolicy(
    new Request(`https://api.kamizo.uz${routePath.replace(/:[^/]+/g, 'record-1')}`, { method }),
    user,
    routePath,
  );
}

describe('demo session request policy', () => {
  it('leaves ordinary signed sessions unchanged', () => {
    const { isDemoSession: _demoSession, ...ordinaryAdmin } = demoAdmin;
    expect(policy('POST', '/api/users/me/password', ordinaryAdmin)).toBeNull();
  });

  it.each([
    ['GET', '/api/users'],
    ['HEAD', '/api/requests'],
    ['POST', '/api/requests'],
    ['POST', '/api/requests/:id/assign'],
    ['POST', '/api/requests/:id/accept'],
    ['POST', '/api/requests/:id/start'],
    ['POST', '/api/requests/:id/complete'],
    ['POST', '/api/requests/:id/approve'],
    ['POST', '/api/requests/:id/reject'],
    ['POST', '/api/requests/:id/rate'],
    ['POST', '/api/requests/:id/pause'],
    ['POST', '/api/requests/:id/resume'],
    ['POST', '/api/meetings/:meetingId/schedule-votes'],
    ['POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote'],
    ['POST', '/api/agenda/:agendaItemId/comments'],
    ['POST', '/api/announcements/:id/view'],
    ['POST', '/api/chat/channels/support'],
    ['POST', '/api/chat/channels/:id/messages'],
    ['POST', '/api/chat/channels/:id/read'],
    ['POST', '/api/guest-codes'],
    ['POST', '/api/guest-codes/validate'],
    ['POST', '/api/guest-codes/:id/use'],
    ['POST', '/api/guest-codes/:id/revoke'],
    ['POST', '/api/marketplace/cart'],
    ['DELETE', '/api/marketplace/cart/:productId'],
    ['DELETE', '/api/marketplace/cart'],
    ['POST', '/api/marketplace/favorites/:productId'],
    ['POST', '/api/marketplace/orders'],
    ['POST', '/api/marketplace/orders/:id/rate'],
    ['POST', '/api/training/proposals/:proposalId/votes'],
    ['DELETE', '/api/training/proposals/:proposalId/votes'],
    ['POST', '/api/training/proposals/:proposalId/register'],
    ['DELETE', '/api/training/proposals/:proposalId/register'],
    ['POST', '/api/training/proposals/:proposalId/feedback'],
    ['POST', '/api/notes'],
    ['PUT', '/api/notes/:id'],
    ['DELETE', '/api/notes/:id'],
  ])('allows presentation operation %s %s', (method, routePath) => {
    expect(policy(method, routePath)).toBeNull();
  });

  it.each([
    ['/api/users/me', demoResident],
    ['/api/stats/dashboard', demoAdmin],
    ['/api/requests', demoResident],
    ['/api/meetings', demoResident],
    ['/api/announcements', demoResident],
    ['/api/chat/channels', demoResident],
    ['/api/marketplace/products', demoResident],
    ['/api/rentals/listings', demoResident],
    ['/api/guest-codes', demoResident],
    ['/api/training/proposals', demoResident],
    ['/api/finance/estimates', demoDirector],
    ['/api/settings', demoAdmin],
  ])('allows representative presentation read GET %s', (routePath, user) => {
    expect(policy('GET', routePath, user)).toBeNull();
  });

  it.each([
    '/api/health',
    '/api/admin/cache/stats',
    '/api/admin/metrics',
    '/api/admin/metrics/performance',
    '/api/admin/metrics/errors',
    '/api/super-admin/banners',
    '/api/super-admin/ads',
    '/api/super-admin/ads/:id/tenants',
    '/api/super-admin/ads/:id/views',
    '/api/super-admin/ads/:id/coupons',
    '/api/super-admin/tenants/:id/details',
    '/api/super-admin/analytics',
    '/api/super-admin/demo/status',
    '/api/tenants',
  ])('denies registered sensitive read GET %s', (routePath) => {
    expect(policy('GET', routePath, demoAdmin)?.status).toBe(403);
  });

  it.each([
    ['POST', '/api/users/me/password', demoAdmin],
    ['POST', '/api/users/:id/reset-password', demoDirector],
    ['POST', '/api/auth/register', demoAdmin],
    ['PATCH', '/api/users/:id/name', demoDirector],
    ['PUT', '/api/settings/:key', demoAdmin],
    ['PATCH', '/api/tenants/:id', demoAdmin],
    ['POST', '/api/finance/payments', demoDirector],
    ['POST', '/api/finance/expenses', demoDirector],
    ['POST', '/api/team/import', demoAdmin],
    ['POST', '/api/guest-codes/:id/revoke', demoDirector],
    ['DELETE', '/api/requests/:id', demoDirector],
    ['POST', '/api/meetings', demoDirector],
    ['PATCH', '/api/meetings/:id', demoDirector],
    ['DELETE', '/api/meetings/:id', demoDirector],
    ['POST', '/api/meetings/:id/generate-protocol', demoDirector],
    ['POST', '/api/announcements', demoDirector],
    ['DELETE', '/api/announcements/:id', demoDirector],
    ['POST', '/api/marketplace/admin/upload-image', demoAdmin],
    ['POST', '/api/marketplace/admin/products', demoAdmin],
    ['PATCH', '/api/marketplace/admin/products/:id', demoAdmin],
    ['DELETE', '/api/marketplace/admin/products/:id', demoAdmin],
    ['PATCH', '/api/marketplace/admin/orders/:id', demoAdmin],
    ['POST', '/api/training/proposals', demoDirector],
    ['DELETE', '/api/training/proposals/:id', demoDirector],
    ['POST', '/api/rentals/listings', demoResident],
    ['PATCH', '/api/vehicles/:id', demoResident],
    ['GET', '/api/super-admin', demoAdmin],
    ['GET', '/api/super-administer', demoAdmin],
    ['GET', '/api/super-admin/tenants', demoAdmin],
    ['GET', '/api/super-admin/tenants?tab=active', demoAdmin],
    ['GET', '/api/%73uper-admin/tenants', demoAdmin],
    ['GET', '/api/super-admin%2Ftenants', demoAdmin],
    ['GET', '/api/super-admin%252Ftenants', demoAdmin],
    ['POST', '/api/super-admin/demo/provision', demoDirector],
    ['GET', '/api/admin/metrics', demoAdmin],
    ['GET', '/api/admin/metrics/live', demoAdmin],
    ['GET', '/api/admin/metrics-export', demoAdmin],
    ['GET', '/api/admin/monitoring', demoAdmin],
    ['GET', '/api/admin/monitoring/health?full=true', demoAdmin],
    ['GET', '/api/admin/monitoring-v2', demoAdmin],
    ['GET', '/api/users/me/password', demoAdmin],
    ['GET', '/api/users/reset-password', demoAdmin],
    ['POST', '/api/finance/access', demoDirector],
    ['DELETE', '/api/finance/access/:id', demoDirector],
    ['POST', '/api/%6deetings', demoDirector],
    ['POST', '/api/meetings?next=/api/requests', demoDirector],
    ['POST', '/api/requests%2F:id%2Fdelete', demoDirector],
    ['POST', '/api/marketplace/admin%252Fupload-image', demoAdmin],
    ['GET', '/api/super-admin%ZZtenants', demoAdmin],
  ])('denies privileged operation %s %s', async (method, routePath, user) => {
    const response = policy(method, routePath, user);
    expect(response?.status).toBe(403);
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    expect(await response?.json()).toMatchObject({
      error_ru: 'Демо-сессия доступна только для презентационных действий',
      error_uz: "Demo sessiyada faqat taqdimot amallariga ruxsat berilgan",
    });
  });
});
