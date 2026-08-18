import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'admin-1', role: 'admin' } as { id: string; role: string } | null,
  tenantId: 'tenant-1' as string | null,
}));

vi.mock('../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../middleware/auth', () => ({ getAuditAttribution: vi.fn(), getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../middleware/tenant', () => ({ getTenantId: vi.fn(() => mocks.tenantId), clearFeatureCache: vi.fn() }));
vi.mock('../../utils/crypto', () => ({ hashPassword: vi.fn(), createJWT: vi.fn() }));
vi.mock('../../utils/logger', () => ({ createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })) }));
vi.mock('../../validation/validate', () => ({ validateBody: vi.fn() }));
vi.mock('../../validation/schemas', () => ({ createPaymentSchema: {} }));
vi.mock('../../index', () => ({ isSuperAdmin: vi.fn(() => false) }));

import { registerSuperAdminRoutes } from '../super-admin';
import { registerPaymentRoutes } from '../misc/payments';

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'admin-1', role: 'admin' };
  mocks.tenantId = 'tenant-1';
  registerSuperAdminRoutes();
  registerPaymentRoutes();
});

function handler(method: string, path: string) {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing ${method} ${path} route`);
  return registered;
}

function request(path: string) {
  return new Request(`https://api.kamizo.uz${path}`);
}

describe('legacy payments retirement', () => {
  it('returns 410 with canonical bilingual guidance without touching SQL', async () => {
    const sql = vi.fn(() => {
      throw new Error('retired legacy POST must not access SQL');
    });
    const response = await handler('POST', '/api/payments')(
      new Request('https://api.kamizo.uz/api/payments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ apartment_id: 'apt-1', amount: 100 }),
      }),
      { DB: { prepare: sql } },
      {},
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(410);
    expect(body).toEqual({
      error: 'Legacy payments write endpoint retired',
      message_ru: 'Используйте /api/finance/payments для создания платежей',
      message_uz: "To'lov yaratish uchun /api/finance/payments dan foydalaning",
      canonical_endpoint: '/api/finance/payments',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'admin'],
    ['__no_tenant__', 'admin'],
    [null, 'super_admin'],
    ['__no_tenant__', 'super_admin'],
  ])('rejects every legacy read before SQL for tenant %s and role %s', async (tenantId, role) => {
    mocks.tenantId = tenantId;
    mocks.user = { id: `${role}-1`, role };
    const prepare = vi.fn(() => { throw new Error('SQL must not run'); });
    const cases: Array<[string, string, string, Record<string, string>]> = [
      ['GET', '/api/payments', '/api/payments', {}],
      ['GET', '/api/payments/:id', '/api/payments/payment-1', { id: 'payment-1' }],
      ['GET', '/api/apartments/:apartmentId/balance', '/api/apartments/apt-1/balance', { apartmentId: 'apt-1' }],
    ];

    for (const [method, routePath, url, params] of cases) {
      const response = await handler(method, routePath)(request(url), { DB: { prepare } }, params);
      expect(response.status, routePath).toBe(403);
    }
    expect(prepare).not.toHaveBeenCalled();
  });

  it('emits RFC 9745 deprecation dates and endpoint-specific successor links', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const call = { sql, params: [] as unknown[] };
        calls.push(call);
        const statement = {
          bind(...params: unknown[]) { call.params = params; return statement; },
          async first() {
            if (sql.includes('SELECT * FROM payments')) {
              return { id: 'payment-1', resident_id: 'resident-1', tenant_id: mocks.tenantId };
            }
            if (sql.includes('COUNT(*)')) return { total: 0 };
            return { total_charged: 0, total_paid: 0 };
          },
          async all() { return { results: [] }; },
        };
        return statement;
      },
    };
    const requests: Array<[string, string, string, Record<string, string>, string]> = [
      ['GET', '/api/payments', '/api/payments', {}, '</api/finance/payments>; rel="successor-version"'],
      ['GET', '/api/payments/:id', '/api/payments/payment-1', { id: 'payment-1' }, '</api/finance/payments>; rel="successor-version"'],
      ['GET', '/api/apartments/:apartmentId/balance', '/api/apartments/apt-1/balance', { apartmentId: 'apt-1' }, '</api/finance/apartments/apt-1/balance>; rel="successor-version"'],
    ];

    for (const [method, routePath, url, params, successor] of requests) {
      const response = await handler(method, routePath)(
        request(url),
        { DB: db },
        params,
      );

      expect(response.headers.get('Deprecation')).toBe('@1786752000');
      expect(response.headers.get('Sunset')).toBeNull();
      expect(response.headers.get('Link')).toBe(successor);
    }

    const legacyTableCalls = calls.filter(call => /\bpayments\b/.test(call.sql));
    expect(legacyTableCalls.length).toBeGreaterThan(0);
    for (const call of legacyTableCalls) {
      expect(call.sql).toContain('tenant_id = ?');
      expect(call.params).toContain(mocks.tenantId);
    }
  });

  it('uses tenant equality for resident list and detail ownership', async () => {
    mocks.user = { id: 'resident-1', role: 'resident' };
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const call = { sql, params: [] as unknown[] };
        calls.push(call);
        const statement = {
          bind(...params: unknown[]) { call.params = params; return statement; },
          async first() {
            if (sql.includes('SELECT * FROM payments')) {
              return { id: 'payment-1', apartment_id: 'apt-cross-tenant', resident_id: 'other-resident', tenant_id: 'tenant-1' };
            }
            if (sql.includes('FROM apartments')) return sql.includes('tenant_id = ?') ? null : { id: 'apt-cross-tenant' };
            if (sql.includes('COUNT(*)')) return { total: 0 };
            return null;
          },
          async all() { return { results: [] }; },
        };
        return statement;
      },
    };

    await handler('GET', '/api/payments')(request('/api/payments'), { DB: db }, {});
    const detail = await handler('GET', '/api/payments/:id')(
      request('/api/payments/payment-1'), { DB: db }, { id: 'payment-1' },
    );

    expect(detail.status).toBe(403);
    for (const call of calls.filter(call => call.sql.includes('payments'))) {
      expect(call.sql).toContain('tenant_id = ?');
      expect(call.params).toContain('tenant-1');
    }
    const listCalls = calls.filter(call => call.sql.includes('FROM payments') && call.sql.includes('primary_owner_id'));
    expect(listCalls).toHaveLength(2);
    for (const call of listCalls) {
      expect(call.sql).toMatch(/SELECT id FROM apartments WHERE primary_owner_id = \? AND tenant_id = \?/);
      expect(call.params).toEqual(expect.arrayContaining(['tenant-1', 'resident-1']));
    }
    const ownership = calls.find(call => call.sql.includes('SELECT 1 FROM apartments'))!;
    expect(ownership.sql).toContain('tenant_id = ?');
    expect(ownership.params).toEqual(['apt-cross-tenant', 'resident-1', 'tenant-1']);
  });

  it('allows a resident to read their own tenant-scoped detail without an apartment fallback', async () => {
    mocks.user = { id: 'resident-1', role: 'resident' };
    const calls: string[] = [];
    const db = {
      prepare(sql: string) {
        calls.push(sql);
        return {
          bind() { return this; },
          async first() { return { id: 'payment-1', apartment_id: 'apt-1', resident_id: 'resident-1', tenant_id: 'tenant-1' }; },
        };
      },
    };

    const response = await handler('GET', '/api/payments/:id')(
      request('/api/payments/payment-1'), { DB: db }, { id: 'payment-1' },
    );

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('id = ? AND tenant_id = ?');
  });

  it('blocks a resident balance lookup when only a cross-tenant apartment matches', async () => {
    mocks.user = { id: 'resident-1', role: 'resident' };
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      prepare(sql: string) {
        const call = { sql, params: [] as unknown[] };
        calls.push(call);
        return {
          bind(...params: unknown[]) { call.params = params; return this; },
          async first() { return sql.includes('tenant_id = ?') ? null : { id: 'apt-cross-tenant' }; },
        };
      },
    };

    const response = await handler('GET', '/api/apartments/:apartmentId/balance')(
      request('/api/apartments/apt-cross-tenant/balance'), { DB: db }, { apartmentId: 'apt-cross-tenant' },
    );

    expect(response.status).toBe(403);
    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain('tenant_id = ?');
    expect(calls[0].params).toEqual(['apt-cross-tenant', 'resident-1', 'tenant-1']);
  });
});
