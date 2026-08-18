import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'super-1', role: 'super_admin', name: 'Super Admin' } as any,
  tenant: { id: 'tenant-demo', slug: 'demo', features: '["requests","marketplace","qr","rentals","advertiser"]', is_demo: 1 } as any,
  users: [] as any[],
  queries: [] as Array<{ sql: string; binds: unknown[] }>,
  counts: {} as Record<string, number>,
  sentinelIds: new Set<string>(),
  provisionLogError: vi.fn(),
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../../middleware/tenant', () => ({
  getTenantForRequest: vi.fn(() => mocks.tenant),
  getTenantSlug: vi.fn((hostname: string) => hostname.endsWith('.kamizo.uz') ? hostname.split('.')[0] : null),
}));
vi.mock('../../../utils/crypto', () => ({
  createJWT: vi.fn(async () => 'short-demo-jwt'),
  hashPassword: vi.fn(async () => 'random-inaccessible-hash'),
}));
vi.mock('../../../lib/demo/core', () => ({ demoCoreSeeder: {
  phase: 'core', seed: vi.fn(async () => ({ phase: 'core', counters: { users: { created: 10, updated: 3 } } })),
} }));
vi.mock('../../../lib/demo/commerce', () => ({ demoCommerceSeeder: {
  phase: 'commerce', seed: vi.fn(async () => ({ phase: 'commerce', counters: { marketplaceOrders: { created: 6, updated: 0 } } })),
} }));
vi.mock('../../../lib/demo/finance', () => ({ demoFinanceSeeder: {
  phase: 'finance', seed: vi.fn(async () => ({ phase: 'finance', counters: { charges: { created: 6, updated: 0 } } })),
} }));
vi.mock('../../../lib/demo/engagement', () => ({ demoEngagementSeeder: {
  phase: 'engagement', seed: vi.fn(async () => ({ phase: 'engagement', counters: { notes: { created: 9, updated: 0 } } })),
} }));
vi.mock('../../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/cache-local', () => ({ invalidateCache: vi.fn() }));
vi.mock('../../../utils/logger', () => ({
  createRequestLogger: vi.fn(() => ({ error: mocks.provisionLogError })),
}));

import { invalidateOnChange } from '../../../cache';
import { demoCommerceSeeder } from '../../../lib/demo/commerce';
import { demoCoreSeeder } from '../../../lib/demo/core';
import { demoFinanceSeeder } from '../../../lib/demo/finance';
import { demoEngagementSeeder } from '../../../lib/demo/engagement';
import { demoId } from '../../../lib/demo/ids';
import { RATE_LIMITS } from '../../../middleware/rateLimit';
import { createJWT } from '../../../utils/crypto';
import { registerDemoRoutes } from '../demo';

function handler(method: string, path: string): Handler {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

function createDb() {
  return {
    prepare(sql: string) {
      const query = { sql, binds: [] as unknown[] };
      mocks.queries.push(query);
      const statement = {
        bind(...values: unknown[]) { query.binds = values; return statement; },
        async first() {
          if (sql.includes('FROM tenants')) return mocks.tenant?.slug === 'demo' ? mocks.tenant : null;
          if (sql.includes('COUNT(*)')) {
            const table = sql.match(/FROM\s+([a-z_]+)/i)?.[1] ?? '';
            return { count: mocks.counts[table] ?? 0 };
          }
          if (sql.includes('SELECT id FROM') && query.binds.length === 2) {
            return mocks.sentinelIds.has(String(query.binds[1])) ? { id: query.binds[1] } : null;
          }
          if (sql.includes('FROM users')) {
            const login = String(query.binds[1] ?? '');
            return mocks.users.find((user) => user.login === login) ?? null;
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM users')) return { results: mocks.users };
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://api.kamizo.uz${path}`, {
    ...init,
    headers: { origin: 'https://demo.kamizo.uz', 'content-type': 'application/json', ...init.headers },
  });
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'super-1', role: 'super_admin', name: 'Super Admin' };
  mocks.tenant = { id: 'tenant-demo', slug: 'demo', features: '["requests","marketplace","qr","rentals","advertiser"]', is_demo: 1 };
  mocks.users = [];
  mocks.queries = [];
  mocks.counts = {};
  mocks.sentinelIds = new Set();
  mocks.provisionLogError.mockReset();
  vi.clearAllMocks();
  registerDemoRoutes();
});

describe('demo auth routes', () => {
  it('lists only provisioned allowlisted roles on the exact demo tenant without credentials', async () => {
    mocks.users = [
      { id: 'director-1', login: 'demo-director', role: 'director', specialization: null, is_active: 1 },
      { id: 'resident-1', login: '98765432', role: 'resident', specialization: null, is_active: 1 },
      { id: 'manager-wrong', login: 'demo-manager', role: 'admin', specialization: null, is_active: 1 },
    ];

    const response = await handler('GET', '/api/auth/demo-roles')(
      request('/api/auth/demo-roles'), { DB: createDb() }, {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.roles.map((role: any) => role.roleKey)).toEqual(['director', 'resident']);
    expect(body.roles[0]).toEqual({
      roleKey: 'director', role: 'director', specialization: null, primary: true, order: 10,
    });
    expect(Object.keys(body.roles[0])).toEqual(['roleKey', 'role', 'specialization', 'primary', 'order']);
    expect(JSON.stringify(body)).not.toMatch(/password|super_admin|demo-director|Демо Директор|requiredFeature/);
  });

  it('refuses role discovery when the resolved tenant slug is not exactly demo', async () => {
    mocks.tenant = { id: 'tenant-other', slug: 'other', features: '[]' };
    const response = await handler('GET', '/api/auth/demo-roles')(
      request('/api/auth/demo-roles', { headers: { origin: 'https://other.kamizo.uz' } }),
      { DB: createDb() }, {},
    );

    expect(response.status).toBe(404);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('keeps an allowlisted role unavailable until its user has been provisioned', async () => {
    const response = await handler('POST', '/api/auth/demo-login')(
      request('/api/auth/demo-login', { method: 'POST', body: JSON.stringify({ roleKey: 'manager' }) }),
      { DB: createDb(), JWT_SECRET: 'secret' }, {},
    );

    expect(response.status).toBe(404);
    expect(createJWT).not.toHaveBeenCalled();
  });

  it('returns the normal password-free user shape with a 30-minute JWT', async () => {
    mocks.users = [{
      id: 'manager-1', login: 'demo-manager', phone: '+998901234567', name: 'Manager',
      role: 'manager', specialization: null, address: null, apartment: null,
      building_id: null, entrance: null, floor: null, total_area: null,
      account_type: null, tenant_id: 'tenant-demo', is_active: 1,
    }];

    const response = await handler('POST', '/api/auth/demo-login')(
      request('/api/auth/demo-login', { method: 'POST', body: JSON.stringify({ roleKey: 'manager' }) }),
      { DB: createDb(), JWT_SECRET: 'secret' }, {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.token).toBe('short-demo-jwt');
    expect(body.demoSession).toBe(true);
    expect(body.user).toMatchObject({ id: 'manager-1', login: 'demo-manager', role: 'manager', tenant_id: 'tenant-demo' });
    expect(body.user).not.toHaveProperty('password_hash');
    expect(mocks.queries.find((query) => query.sql.includes('FROM users'))?.sql).not.toContain('password_hash');
    expect(createJWT).toHaveBeenCalledWith(
      { userId: 'manager-1', role: 'manager', tenantId: 'tenant-demo', demo_session: true },
      'secret',
      1800,
    );
  });

  it.each([
    { role: 'admin', specialization: null, label: 'role' },
    { role: 'manager', specialization: 'plumber', label: 'specialization' },
  ])('keeps a login unavailable when its stored $label differs from the descriptor', async ({ role, specialization }) => {
    mocks.users = [{
      id: 'manager-1', login: 'demo-manager', phone: '+998901234567', name: 'Manager',
      role, specialization, tenant_id: 'tenant-demo', is_active: 1,
    }];

    const response = await handler('POST', '/api/auth/demo-login')(
      request('/api/auth/demo-login', { method: 'POST', body: JSON.stringify({ roleKey: 'manager' }) }),
      { DB: createDb(), JWT_SECRET: 'secret' }, {},
    );

    expect(response.status).toBe(404);
    expect(createJWT).not.toHaveBeenCalled();
  });

  it('fails closed at the process-wide per-role cap despite spoofed caller IPs', async () => {
    mocks.tenant = {
      id: 'tenant-rate-route', slug: 'demo', features: '["requests"]', is_demo: 1,
    };
    mocks.users = [{
      id: 'resident-rate', login: '98765432', phone: '+998901234567', name: 'Resident',
      role: 'resident', specialization: null, tenant_id: 'tenant-rate-route', is_active: 1,
    }];
    const login = handler('POST', '/api/auth/demo-login');

    for (let attempt = 0; attempt < 8; attempt++) {
      const response = await login(request('/api/auth/demo-login', {
        method: 'POST', body: JSON.stringify({ roleKey: 'resident' }),
        headers: { origin: 'https://demo.kamizo.uz', 'CF-Connecting-IP': `198.51.100.${attempt}` },
      }), { DB: createDb(), JWT_SECRET: 'secret' }, {});
      expect(response.status).toBe(200);
    }
    const denied = await login(request('/api/auth/demo-login', {
      method: 'POST', body: JSON.stringify({ roleKey: 'resident' }),
      headers: { origin: 'https://demo.kamizo.uz', 'CF-Connecting-IP': '203.0.113.250' },
    }), { DB: createDb(), JWT_SECRET: 'secret' }, {});

    expect(denied.status).toBe(429);
    expect(denied.headers.get('Cache-Control')).toBe('no-store');
    expect(denied.headers.get('Retry-After')).toBe('60');
    expect(createJWT).toHaveBeenCalledTimes(8);
    expect(mocks.queries.filter((query) => query.sql.includes('FROM users'))).toHaveLength(8);
  });
});

describe('demo provision and status routes', () => {
  it('requires super_admin before provisioning', async () => {
    mocks.user = { id: 'director-1', role: 'director' };
    const response = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST' }),
      { DB: createDb() }, {},
    );

    expect(response.status).toBe(403);
    expect(demoCoreSeeder.seed).not.toHaveBeenCalled();
  });

  it('provisions every phase in fixed dependency order by default and aggregates counters', async () => {
    const order: string[] = [];
    vi.mocked(demoCoreSeeder.seed).mockImplementationOnce(async () => {
      order.push('core');
      return { phase: 'core', counters: { users: { created: 10, updated: 3 } } };
    });
    vi.mocked(demoCommerceSeeder.seed).mockImplementationOnce(async () => {
      order.push('commerce');
      return { phase: 'commerce', counters: { users: { created: 0, updated: 1 }, marketplaceOrders: { created: 6, updated: 0 } } };
    });
    vi.mocked(demoFinanceSeeder.seed).mockImplementationOnce(async () => {
      order.push('finance');
      return { phase: 'finance', counters: { charges: { created: 6, updated: 0 } } };
    });
    vi.mocked(demoEngagementSeeder.seed).mockImplementationOnce(async () => {
      order.push('engagement');
      return { phase: 'engagement', counters: { notes: { created: 9, updated: 0 } } };
    });
    const response = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST' }),
      { DB: createDb() }, {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(order).toEqual(['core', 'commerce', 'finance', 'engagement']);
    expect(body.results.map((result: any) => result.phase)).toEqual(order);
    expect(body.counters).toEqual({
      users: { created: 10, updated: 4 },
      marketplaceOrders: { created: 6, updated: 0 },
      charges: { created: 6, updated: 0 },
      notes: { created: 9, updated: 0 },
    });
    expect(demoCoreSeeder.seed).toHaveBeenCalledWith(expect.objectContaining({
      db: expect.anything(), tenantId: 'tenant-demo', tenantSlug: 'demo',
      now: expect.any(Date), createPasswordHash: expect.any(Function),
    }));
    expect(mocks.queries.find((query) => query.sql.includes('FROM tenants'))?.binds).toEqual(['demo']);
    expect(invalidateOnChange).toHaveBeenCalled();
  });

  it('expands requested dependent phases and still runs them in fixed order', async () => {
    const response = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', {
        method: 'POST', body: JSON.stringify({ phases: ['finance', 'commerce'] }),
      }),
      { DB: createDb() }, {},
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(demoCoreSeeder.seed).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(demoCommerceSeeder.seed).mock.invocationCallOrder[0]);
    expect(vi.mocked(demoCommerceSeeder.seed).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(demoFinanceSeeder.seed).mock.invocationCallOrder[0]);
  });

  it('runs core before an explicitly requested engagement phase', async () => {
    const response = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', {
        method: 'POST', body: JSON.stringify({ phases: ['engagement'] }),
      }),
      { DB: createDb() }, {},
    );

    expect(response.status).toBe(200);
    expect(vi.mocked(demoCoreSeeder.seed).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(demoEngagementSeeder.seed).mock.invocationCallOrder[0]);
    expect(vi.mocked(demoCommerceSeeder.seed)).not.toHaveBeenCalled();
    expect(vi.mocked(demoFinanceSeeder.seed)).not.toHaveBeenCalled();
  });

  it.each([
    { body: 'null', label: 'null' },
    { body: '[]', label: 'an array' },
    { body: '{', label: 'invalid JSON' },
    { body: JSON.stringify({ phases: 'core' }), label: 'a non-array phases value' },
    { body: JSON.stringify({ phases: ['unknown'] }), label: 'an unknown phase' },
    { body: JSON.stringify({ phases: ['core', 'core'] }), label: 'duplicate phases' },
    { body: JSON.stringify({ phases: [] }), label: 'an empty phase list' },
    { body: JSON.stringify({ phases: [], extra: true }), label: 'unknown fields' },
  ])('rejects $label as a provision body before seeding', async ({ body }) => {
    const response = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST', body }),
      { DB: createDb() }, {},
    );

    expect(response.status).toBe(400);
    expect(demoCoreSeeder.seed).not.toHaveBeenCalled();
  });

  it('rejects a concurrent provision for the same tenant and releases the guard afterward', async () => {
    let finish!: () => void;
    vi.mocked(demoCoreSeeder.seed).mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve({ phase: 'core', counters: {} });
    }));
    const first = handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST', body: JSON.stringify({ phases: ['core'] }) }),
      { DB: createDb() }, {},
    );
    await vi.waitFor(() => expect(demoCoreSeeder.seed).toHaveBeenCalledTimes(1));

    const concurrent = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST', body: JSON.stringify({ phases: ['core'] }) }),
      { DB: createDb() }, {},
    );
    expect(concurrent.status).toBe(409);
    finish();
    expect((await first).status).toBe(200);

    const rerun = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST', body: JSON.stringify({ phases: ['core'] }) }),
      { DB: createDb() }, {},
    );
    expect(rerun.status).toBe(200);
  });

  it('returns only completed phase names on failure and permits a repairing rerun', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(demoCommerceSeeder.seed).mockRejectedValueOnce(new Error('database details must stay private'));
    const failed = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST' }), { DB: createDb() }, {},
    );
    const failedBody = await failed.json() as any;

    expect(failed.status).toBe(500);
    expect(failedBody).toEqual({ error: 'Demo provision failed', completedPhases: ['core'] });
    expect(JSON.stringify(failedBody)).not.toContain('database details');
    expect(consoleError).not.toHaveBeenCalled();
    expect(mocks.provisionLogError).toHaveBeenCalledTimes(1);
    expect(mocks.provisionLogError).toHaveBeenCalledWith('demo_provision_failed', undefined, {
      tenantId: 'tenant-demo', phase: 'commerce', code: 'DEMO_PROVISION_PHASE_FAILED',
    });

    const repaired = await handler('POST', '/api/super-admin/demo/provision')(
      request('/api/super-admin/demo/provision', { method: 'POST' }), { DB: createDb() }, {},
    );
    expect(repaired.status).toBe(200);
    consoleError.mockRestore();
  });

  it('exposes all fixed domain counts, available role keys, and deterministic readiness flags', async () => {
    mocks.users = [
      { id: 'director-1', login: 'demo-director', role: 'director', specialization: null },
      { id: 'courier-1', login: 'demo-courier', role: 'executor', specialization: 'courier' },
      { id: 'manager-wrong', login: 'demo-manager', role: 'admin', specialization: null },
    ];
    mocks.counts = { users: 13, marketplace_orders: 6, finance_charges: 6, notes: 9, training_proposals: 3 };
    mocks.sentinelIds = new Set(await Promise.all([
      'request:completed', 'meeting:active', 'chat:building-general',
      'market-product:water', 'market-order:delivered', 'rental-listing:bright-two',
      'finance:estimate:complex', 'finance:charge:0', 'finance:access:manager',
      'training:proposal:scheduled', 'employee-rating:executor:resident', 'note:manager:1',
    ].map((key) => demoId('tenant-demo', key))));
    const response = await handler('GET', '/api/super-admin/demo/status')(
      request('/api/super-admin/demo/status'), { DB: createDb() }, {},
    );
    const body = await response.json() as any;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      tenantId: 'tenant-demo', slug: 'demo', isDemo: true,
      counts: { users: 13, marketplace_orders: 6, finance_charges: 6, notes: 9, training_proposals: 3 },
      availableRoleKeys: ['director', 'courier'],
      ready: { core: true, commerce: true, finance: true, engagement: true },
    });
    expect(Object.keys(body.counts)).toEqual(expect.arrayContaining([
      'meeting_vote_records', 'marketplace_order_items', 'rental_listing_photos',
      'guest_access_logs', 'finance_estimate_items', 'personal_accounts', 'finance_claims',
      'training_partners', 'training_feedback', 'employee_ratings', 'notes',
    ]));
    expect(mocks.queries.filter((query) => query.sql.includes('COUNT(*)')).every((query) => query.binds[0] === 'tenant-demo')).toBe(true);
  });

  it('uses tight endpoint-specific rate limits', () => {
    expect(RATE_LIMITS['GET:/api/auth/demo-roles']).toEqual({ maxRequests: 30, windowSeconds: 60 });
    expect(RATE_LIMITS['POST:/api/auth/demo-login']).toEqual({ maxRequests: 5, windowSeconds: 60 });
    expect(RATE_LIMITS['POST:/api/super-admin/demo/provision']).toEqual({ maxRequests: 2, windowSeconds: 60 });
    expect(RATE_LIMITS['GET:/api/super-admin/demo/status']).toEqual({ maxRequests: 30, windowSeconds: 60 });
  });
});
