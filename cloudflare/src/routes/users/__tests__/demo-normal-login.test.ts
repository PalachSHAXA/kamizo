import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  tenantId: 'tenant-demo' as string | null,
  tenantSlug: 'demo',
  login: 'demo-director',
  role: 'director',
  passwordHash: '50000:salt:hash',
  dbRuns: [] as string[],
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  setTenantForRequest: vi.fn(),
  getTenantSlug: vi.fn(() => null),
}));
vi.mock('../../../middleware/rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
  getClientIdentifier: vi.fn(() => 'ip:test'),
}));
vi.mock('../../../middleware/cors', () => ({ getCurrentCorsOrigin: vi.fn(() => 'https://demo.kamizo.uz') }));
vi.mock('../../../validation/validate', () => ({
  validateBody: vi.fn(async () => ({ data: { login: mocks.login, password: 'valid-password' }, errors: null })),
}));
vi.mock('../../../validation/schemas', () => ({ loginSchema: {} }));
vi.mock('../../../utils/crypto', () => ({
  verifyPasswordTolerant: vi.fn(async () => true),
  hashPassword: vi.fn(async () => 'rehash'),
  createJWT: vi.fn(async () => 'ordinary-jwt'),
}));
vi.mock('../../../utils/logger', () => ({ createRequestLogger: vi.fn(() => ({ error: vi.fn() })) }));
vi.mock('../../../utils/notifications', () => ({ notifyManagers: vi.fn(async () => undefined) }));
vi.mock('../../../index', () => ({
  isExecutorRole: (role: string) => role === 'executor',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}));

import { createJWT, hashPassword } from '../../../utils/crypto';
import { registerAuthRoutes } from '../auth';

function createDb() {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { binds = values; return statement; },
        async first() {
          if (sql.includes('FROM users')) {
            return {
              id: `${mocks.login}-id`, login: mocks.login, phone: '+998', name: 'Demo User',
              role: mocks.role, specialization: null, password_hash: mocks.passwordHash,
              tenant_id: mocks.tenantId, is_active: 1,
            };
          }
          if (sql.includes('FROM tenants')) {
            if (sql.includes("slug = 'demo'") && mocks.tenantSlug !== 'demo') return null;
            return { id: String(binds[0] ?? mocks.tenantId), slug: mocks.tenantSlug, is_active: 1, features: '[]' };
          }
          return null;
        },
        async all() { return { results: [] }; },
        async run() { mocks.dbRuns.push(sql); return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

function loginHandler(): Handler {
  registerAuthRoutes();
  const registered = mocks.handlers.get('POST /api/auth/login');
  if (!registered) throw new Error('Login route not registered');
  return registered;
}

function request() {
  return new Request('https://api.kamizo.uz/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://demo.kamizo.uz' },
    body: JSON.stringify({ login: mocks.login, password: 'valid-password' }),
  });
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.tenantId = 'tenant-demo';
  mocks.tenantSlug = 'demo';
  mocks.login = 'demo-director';
  mocks.role = 'director';
  mocks.passwordHash = '50000:salt:hash';
  mocks.dbRuns = [];
  vi.clearAllMocks();
});

describe('normal login demo manifest boundary', () => {
  it.each([
    ['demo-director', 'director'],
    ['demo-director-admin', 'admin'],
  ])('redirects valid %s credentials to capability login', async (login, role) => {
    mocks.login = login;
    mocks.role = role;

    const response = await loginHandler()(request(), { DB: createDb(), JWT_SECRET: 'secret' }, {});
    const body = await response.json() as any;

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({
      demo_login_required: true,
      demo_login_endpoint: '/api/auth/demo-login',
      error_ru: expect.any(String),
      error_uz: expect.any(String),
    });
    expect(createJWT).not.toHaveBeenCalled();
    expect(mocks.dbRuns).toHaveLength(0);
  });

  it('allows a non-manifest resident in the demo tenant to use normal login', async () => {
    mocks.login = 'manual-resident';
    mocks.role = 'resident';

    const response = await loginHandler()(request(), { DB: createDb(), JWT_SECRET: 'secret' }, {});

    expect(response.status).toBe(200);
    expect(createJWT).toHaveBeenCalled();
  });

  it('leaves the same login unrestricted in an ordinary tenant', async () => {
    mocks.tenantId = 'tenant-ordinary';
    mocks.tenantSlug = 'ordinary';

    const response = await loginHandler()(request(), { DB: createDb(), JWT_SECRET: 'secret' }, {});

    expect(response.status).toBe(200);
    expect(createJWT).toHaveBeenCalled();
  });

  it('cannot bypass capability login after a password reset or legacy rehash', async () => {
    mocks.passwordHash = 'newly-reset-legacy-hash';

    const response = await loginHandler()(request(), { DB: createDb(), JWT_SECRET: 'secret' }, {});

    expect(response.status).toBe(403);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mocks.dbRuns).toHaveLength(0);
    expect(createJWT).not.toHaveBeenCalled();
  });
});
