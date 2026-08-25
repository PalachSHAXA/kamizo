import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeFeatures } from '../../lib/features';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'admin-1', role: 'admin' } as { id: string; role: string } | null,
  tenantId: 'tenant-1' as string | null,
  tenantForRequest: undefined as Record<string, unknown> | undefined,
  clearFeatureCache: vi.fn(),
  mirror: vi.fn(async () => {}),
}));

vi.mock('../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../middleware/tenant', () => ({
  clearFeatureCache: mocks.clearFeatureCache,
  getTenantForRequest: vi.fn(() => mocks.tenantForRequest),
  getTenantId: vi.fn(() => mocks.tenantId),
  getTenantSlug: vi.fn(() => null),
}));
vi.mock('../../lib/tenantMirror', () => ({ mirrorTenantWriteToD1: mocks.mirror }));
vi.mock('../../cache', () => ({ getCacheStats: vi.fn(), invalidateOnChange: vi.fn() }));
vi.mock('../../monitoring', () => ({
  metricsAggregator: { getAggregatedStats: vi.fn() },
  healthCheck: vi.fn(),
  AlertManager: { checkThresholds: vi.fn() },
  logAnalyticsEvent: vi.fn(),
}));
vi.mock('../../utils/logger', () => ({
  createRequestLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));
vi.mock('../../utils/crypto', () => ({ verifyJWT: vi.fn(async () => null) }));

import { registerHealthRoutes } from '../misc/health';

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'admin-1', role: 'admin' };
  mocks.tenantId = 'tenant-1';
  mocks.tenantForRequest = undefined;
  mocks.clearFeatureCache.mockClear();
  mocks.mirror.mockClear();
  registerHealthRoutes();
});

function handler(method: string, path: string) {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing ${method} ${path} route`);
  return registered;
}

/** DB-заглушка: отдаёт заданные features и запоминает UPDATE. */
function dbWith(features: string | null, writes: Array<{ sql: string; params: unknown[] }>) {
  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: async () => (/SELECT features/.test(sql) ? { features } : null),
        run: async () => {
          writes.push({ sql, params });
          return { success: true };
        },
      }),
    }),
  };
}

function patchRequest(body: unknown) {
  return new Request('https://api.kamizo.uz/api/tenant/features', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('tenant feature keys', () => {
  it('maps the legacy "votes" key onto the canonical "meetings" gate', () => {
    expect(normalizeFeatures('["requests","votes","qr"]')).toEqual(['requests', 'meetings', 'qr']);
  });

  it('drops unknown keys, non-strings and duplicates without throwing', () => {
    expect(normalizeFeatures('["requests",42,"nope","requests","votes","meetings"]'))
      .toEqual(['requests', 'meetings']);
    expect(normalizeFeatures('not json')).toEqual([]);
    expect(normalizeFeatures(null)).toEqual([]);
  });
});

describe('GET /api/tenant/config', () => {
  it('returns "meetings" for a tenant still stored with the legacy key', async () => {
    mocks.tenantForRequest = {
      id: 'tenant-1',
      name: 'Choko',
      slug: 'choko',
      features: '["requests","votes","qr"]',
    };
    const response = await handler('GET', '/api/tenant/config')(
      new Request('https://api.kamizo.uz/api/tenant/config'),
      { DB: dbWith(null, []) },
      {},
    );
    const body = await response.json() as { features: string[] };

    expect(body.features).toContain('meetings');
    expect(body.features).not.toContain('votes');
  });
});

describe('PATCH /api/tenant/features', () => {
  it('enables a module for the caller\'s own tenant and clears the feature cache', async () => {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const response = await handler('PATCH', '/api/tenant/features')(
      patchRequest({ feature: 'rental_listings', enabled: true }),
      { DB: dbWith('["requests","qr"]', writes) },
      {},
    );
    const body = await response.json() as { features: string[] };

    expect(response.status).toBe(200);
    expect(body.features).toEqual(['requests', 'qr', 'rental_listings']);
    expect(writes).toHaveLength(1);
    expect(writes[0].params).toEqual([JSON.stringify(['requests', 'qr', 'rental_listings']), 'tenant-1']);
    expect(mocks.clearFeatureCache).toHaveBeenCalledWith('tenant-1');
    expect(mocks.mirror).toHaveBeenCalledTimes(1);
  });

  it('disables a module and normalises the legacy key on the way out', async () => {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const response = await handler('PATCH', '/api/tenant/features')(
      patchRequest({ feature: 'meetings', enabled: false }),
      { DB: dbWith('["requests","votes"]', writes) },
      {},
    );
    const body = await response.json() as { features: string[] };

    expect(body.features).toEqual(['requests']);
  });

  it('ignores a tenant id supplied in the body — the tenant comes from the request', async () => {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    await handler('PATCH', '/api/tenant/features')(
      patchRequest({ feature: 'chat', enabled: true, tenant_id: 'other-tenant', id: 'other-tenant' }),
      { DB: dbWith('["requests"]', writes) },
      {},
    );

    expect(writes[0].params[1]).toBe('tenant-1');
  });

  it('refuses a manager — changing the module set is an owner-level action', async () => {
    mocks.user = { id: 'mgr-1', role: 'manager' };
    const response = await handler('PATCH', '/api/tenant/features')(
      patchRequest({ feature: 'meetings', enabled: true }),
      { DB: dbWith('["requests"]', []) },
      {},
    );

    expect(response.status).toBe(403);
  });

  it('rejects an unknown feature key instead of writing junk into tenants.features', async () => {
    const writes: Array<{ sql: string; params: unknown[] }> = [];
    const response = await handler('PATCH', '/api/tenant/features')(
      patchRequest({ feature: 'votes', enabled: true }),
      { DB: dbWith('["requests"]', writes) },
      {},
    );

    expect(response.status).toBe(400);
    expect(writes).toHaveLength(0);
  });

  it('rejects a non-boolean `enabled`', async () => {
    const response = await handler('PATCH', '/api/tenant/features')(
      patchRequest({ feature: 'chat', enabled: 'yes' }),
      { DB: dbWith('["requests"]', []) },
      {},
    );

    expect(response.status).toBe(400);
  });
});
