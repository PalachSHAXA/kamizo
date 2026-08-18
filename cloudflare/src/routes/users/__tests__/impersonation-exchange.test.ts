import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'super-1', role: 'super_admin' } as any,
  tenantId: 'tenant-1' as string | null,
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));

vi.mock('../../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/auth')>();
  return { ...actual, getUser: vi.fn(async () => mocks.user) };
});

vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  setTenantForRequest: vi.fn(),
  getTenantSlug: vi.fn(() => null),
  clearFeatureCache: vi.fn(),
}));

vi.mock('../../../middleware/rateLimit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/rateLimit')>();
  return {
    ...actual,
    checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
    getClientIdentifier: vi.fn(() => 'test-client'),
  };
});

vi.mock('../../../middleware/cors', () => ({ getCurrentCorsOrigin: vi.fn(() => 'https://tenant.kamizo.uz') }));
vi.mock('../../../utils/logger', () => ({ createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })) }));
vi.mock('../../../validation/validate', () => ({ validateBody: vi.fn() }));
vi.mock('../../../validation/schemas', () => ({ loginSchema: {}, createPaymentSchema: {} }));
vi.mock('../../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/cache-local', () => ({ invalidateCache: vi.fn() }));
vi.mock('../../../utils/crypto', () => ({
  hashPassword: vi.fn(async () => 'hash'),
  verifyPasswordTolerant: vi.fn(async () => false),
  createJWT: vi.fn(async () => 'secret-jwt'),
}));
vi.mock('../../../index', () => ({
  isExecutorRole: () => false,
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}));

import { registerAuthRoutes } from '../auth';
import { registerImpersonationExchangeRoutes } from '../impersonation-exchange';
import { registerSuperAdminRoutes } from '../../super-admin';
import { RATE_LIMITS } from '../../../middleware/rateLimit';
import { createJWT } from '../../../utils/crypto';

function handler(method: string, path: string): Handler {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`https://api.kamizo.uz${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://tenant.kamizo.uz',
    },
    body: JSON.stringify(body),
  });
}

function createDb(auditQueries: Array<{ sql: string; binds: unknown[] }> = []) {
  return {
    prepare(sql: string) {
      const query = { sql, binds: [] as unknown[] };
      const statement = {
        bind(...binds: unknown[]) {
          query.binds = binds;
          return statement;
        },
        async first() {
          if (sql.includes('FROM tenants')) {
            return { id: 'tenant-1', slug: 'tenant', name: 'Tenant One', url: 'https://tenant.kamizo.uz' };
          }
          if (sql.includes('FROM users')) {
            return { id: 'admin-1', login: 'admin', phone: '+998', name: 'Admin', role: 'admin', tenant_id: 'tenant-1' };
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes('INSERT INTO audit_log')) auditQueries.push(query);
          return { success: true };
        },
      };
      return statement;
    },
  };
}

type ExchangeRecord = {
  token: string;
  user: Record<string, unknown>;
  tenantId: string;
  tenantName: string;
  originUrl: string;
  expiresAt: number;
};

function createKv(initial: Record<string, ExchangeRecord> = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    values,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _options?: { expirationTtl: number }) => { values.set(key, value); }),
    delete: vi.fn(async (key: string) => { values.delete(key); }),
  };
}

function record(overrides: Partial<ExchangeRecord> = {}): ExchangeRecord {
  return {
    token: 'secret-jwt',
    user: { id: 'admin-1', login: 'admin', phone: '+998', name: 'Admin', role: 'admin', tenant_id: 'tenant-1' },
    tenantId: 'tenant-1',
    tenantName: 'Tenant One',
    originUrl: 'https://app.kamizo.uz/admin',
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'super-1', role: 'super_admin' };
  mocks.tenantId = 'tenant-1';
  vi.mocked(createJWT).mockClear();
  registerAuthRoutes();
  registerImpersonationExchangeRoutes();
  registerSuperAdminRoutes();
});

describe('super-admin impersonation exchange creation', () => {
  it('returns only an opaque exchange code and stores credentials with a 60 second TTL', async () => {
    const kv = createKv();
    const auditQueries: Array<{ sql: string; binds: unknown[] }> = [];
    const response = await handler('POST', '/api/super-admin/impersonate/:id')(
      jsonRequest('/api/super-admin/impersonate/tenant-1', { originUrl: 'https://app.kamizo.uz/admin' }),
      { DB: createDb(auditQueries), RATE_LIMITER: kv, JWT_SECRET: 'secret' },
      { id: 'tenant-1' },
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      exchangeCode: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
      tenantUrl: 'https://tenant.kamizo.uz',
      ttlSec: 60,
    });
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('user');
    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key, rawValue, options] = kv.put.mock.calls[0];
    expect(key).toBe(`impersonation-exchange:${body.exchangeCode}`);
    expect(options).toEqual({ expirationTtl: 60 });
    expect(JSON.parse(rawValue)).toMatchObject({
      token: 'secret-jwt',
      user: { id: 'admin-1' },
      tenantId: 'tenant-1',
      tenantName: 'Tenant One',
      originUrl: 'https://app.kamizo.uz/admin',
    });
    expect(createJWT).toHaveBeenCalledWith({
      userId: 'admin-1',
      role: 'admin',
      tenantId: 'tenant-1',
      imp: true,
      imp_by: 'super-1',
    }, 'secret', 1800);
    expect(auditQueries).toHaveLength(1);
    expect(auditQueries[0].binds[1]).toBe('super-1');
    expect(JSON.parse(String(auditQueries[0].binds[3]))).toEqual({
      tenant_id: 'tenant-1',
      tenant_slug: 'tenant',
      target_role: 'admin',
      session_ttl_sec: 1800,
      exchange_ttl_sec: 60,
    });
    expect(String(auditQueries[0].binds[3])).not.toContain('secret-jwt');
  });

  it('fails closed when exchange storage is unavailable', async () => {
    const kv = createKv();
    kv.put.mockRejectedValueOnce(new Error('KV unavailable'));

    const response = await handler('POST', '/api/super-admin/impersonate/:id')(
      jsonRequest('/api/super-admin/impersonate/tenant-1', { originUrl: 'https://app.kamizo.uz/admin' }),
      { DB: createDb(), RATE_LIMITER: kv, JWT_SECRET: 'secret' },
      { id: 'tenant-1' },
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(body).not.toHaveProperty('token');
    expect(body).not.toHaveProperty('user');
  });
});

describe('POST /api/auth/impersonation-exchange', () => {
  it('consumes a valid same-tenant code before returning credentials with no-store', async () => {
    const code = 'valid-code-000000000000000000000';
    const key = `impersonation-exchange:${code}`;
    const kv = createKv({ [key]: record() });

    const response = await handler('POST', '/api/auth/impersonation-exchange')(
      jsonRequest('/api/auth/impersonation-exchange', { code }),
      { DB: createDb(), RATE_LIMITER: kv },
      {},
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(kv.delete).toHaveBeenCalledWith(key);
    expect(body).toMatchObject({
      token: 'secret-jwt',
      user: { id: 'admin-1' },
      tenantName: 'Tenant One',
      originUrl: 'https://app.kamizo.uz/admin',
    });
  });

  it('rejects replay after a successful exchange', async () => {
    const code = 'replay-code-00000000000000000000';
    const key = `impersonation-exchange:${code}`;
    const kv = createKv({ [key]: record() });
    const exchange = handler('POST', '/api/auth/impersonation-exchange');

    const first = await exchange(jsonRequest('/api/auth/impersonation-exchange', { code }), { DB: createDb(), RATE_LIMITER: kv }, {});
    const replay = await exchange(jsonRequest('/api/auth/impersonation-exchange', { code }), { DB: createDb(), RATE_LIMITER: kv }, {});

    expect(first.status).toBe(200);
    expect(replay.status).not.toBe(200);
    expect(replay.headers.get('Cache-Control')).toBe('no-store');
  });

  it('rejects and consumes a cross-tenant code', async () => {
    const code = 'cross-tenant-code-000000000000000';
    const key = `impersonation-exchange:${code}`;
    const kv = createKv({ [key]: record({ tenantId: 'tenant-2' }) });

    const response = await handler('POST', '/api/auth/impersonation-exchange')(
      jsonRequest('/api/auth/impersonation-exchange', { code }),
      { DB: createDb(), RATE_LIMITER: kv },
      {},
    );

    expect(response.status).not.toBe(200);
    expect(kv.values.has(key)).toBe(false);
  });

  it('rejects and consumes an expired code', async () => {
    const code = 'expired-code-00000000000000000000';
    const key = `impersonation-exchange:${code}`;
    const kv = createKv({ [key]: record({ expiresAt: Date.now() - 1 }) });

    const response = await handler('POST', '/api/auth/impersonation-exchange')(
      jsonRequest('/api/auth/impersonation-exchange', { code }),
      { DB: createDb(), RATE_LIMITER: kv },
      {},
    );

    expect(response.status).not.toBe(200);
    expect(kv.values.has(key)).toBe(false);
  });

  it('rejects a malformed record without a numeric expiry', async () => {
    const code = 'malformed-code-000000000000000000';
    const key = `impersonation-exchange:${code}`;
    const kv = createKv({ [key]: record({ expiresAt: undefined as unknown as number }) });

    const response = await handler('POST', '/api/auth/impersonation-exchange')(
      jsonRequest('/api/auth/impersonation-exchange', { code }),
      { DB: createDb(), RATE_LIMITER: kv },
      {},
    );

    expect(response.status).not.toBe(200);
    expect(kv.values.has(key)).toBe(false);
  });

  it('allows only one concurrent exchange while the KV read is in flight', async () => {
    const code = 'concurrent-code-000000000000000000';
    const key = `impersonation-exchange:${code}`;
    let releaseGet!: () => void;
    const blocked = new Promise<void>((resolve) => { releaseGet = resolve; });
    const kv = createKv({ [key]: record() });
    kv.get.mockImplementationOnce(async () => {
      await blocked;
      return JSON.stringify(record());
    });
    const exchange = handler('POST', '/api/auth/impersonation-exchange');

    const firstPromise = exchange(jsonRequest('/api/auth/impersonation-exchange', { code }), { DB: createDb(), RATE_LIMITER: kv }, {});
    const second = await exchange(jsonRequest('/api/auth/impersonation-exchange', { code }), { DB: createDb(), RATE_LIMITER: kv }, {});
    releaseGet();
    const first = await firstPromise;

    expect(first.status).toBe(200);
    expect(second.status).not.toBe(200);
    expect(kv.get).toHaveBeenCalledTimes(1);
  });

  it('fails closed when KV cannot read or delete the exchange', async () => {
    const code = 'unavailable-code-000000000000000000';
    const kv = createKv();
    kv.get.mockRejectedValueOnce(new Error('KV unavailable'));

    const response = await handler('POST', '/api/auth/impersonation-exchange')(
      jsonRequest('/api/auth/impersonation-exchange', { code }),
      { DB: createDb(), RATE_LIMITER: kv },
      {},
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).not.toHaveProperty('token');
  });

  it('uses a tight exchange rate limit', () => {
    expect(RATE_LIMITS['POST:/api/auth/impersonation-exchange']).toEqual({ maxRequests: 5, windowSeconds: 60 });
  });
});
