import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: {} as any,
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));

vi.mock('../../../middleware/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/auth')>();
  return { ...actual, getUser: vi.fn(async () => mocks.user) };
});

vi.mock('../../../middleware/tenant', () => ({ getTenantId: vi.fn(() => 'tenant-1') }));
vi.mock('../../../middleware/cache-local', () => ({ invalidateCache: vi.fn() }));
vi.mock('../../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/cors', () => ({ getCurrentCorsOrigin: vi.fn(() => 'https://tenant.kamizo.uz') }));

import { registerChangesRoutes } from '../changes';

type Query = { sql: string; binds: unknown[] };

function createDb(queries: Query[]) {
  return {
    prepare(sql: string) {
      const query: Query = { sql, binds: [] };
      queries.push(query);
      const statement = {
        bind(...binds: unknown[]) {
          query.binds = binds;
          return statement;
        },
        async first() {
          if (sql.includes("role = 'resident'")) return { id: 'resident-1', name: 'Resident', status: 'active' };
          return null;
        },
        async run() { return { success: true }; },
      };
      return statement;
    },
  };
}

function deactivateHandler(): Handler {
  const registered = mocks.handlers.get('POST /api/users/:id/deactivate');
  if (!registered) throw new Error('Deactivate route was not registered');
  return registered;
}

function request() {
  return new Request('https://api.kamizo.uz/api/users/resident-1/deactivate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
    body: JSON.stringify({ reason: 'duplicate' }),
  });
}

beforeEach(() => {
  mocks.handlers.clear();
  registerChangesRoutes();
});

describe('users audit attribution', () => {
  it('attributes an impersonated action to the signed super-admin actor', async () => {
    mocks.user = {
      id: 'tenant-admin-1', name: 'Tenant Admin', role: 'admin', tenant_id: 'tenant-1',
      isImpersonated: true, impersonatedBy: 'super-admin-1',
    };
    const queries: Query[] = [];

    const response = await deactivateHandler()(request(), { DB: createDb(queries), RATE_LIMITER: {} }, { id: 'resident-1' });
    const audit = queries.find(query => query.sql.includes('INSERT INTO audit_log'));

    expect(response.status).toBe(200);
    expect(audit?.binds.slice(1)).toEqual([
      'tenant-1',
      'super-admin-1',
      'super_admin',
      'super_admin',
      'user_deactivated',
      'user',
      'resident-1',
      JSON.stringify({ reason: 'duplicate', impersonated_session_user_id: 'tenant-admin-1' }),
      '192.0.2.10',
    ]);
  });

  it('keeps ordinary user audit attribution unchanged', async () => {
    mocks.user = { id: 'admin-2', name: 'Admin Two', role: 'admin', tenant_id: 'tenant-1' };
    const queries: Query[] = [];

    const response = await deactivateHandler()(request(), { DB: createDb(queries), RATE_LIMITER: {} }, { id: 'resident-1' });
    const audit = queries.find(query => query.sql.includes('INSERT INTO audit_log'));

    expect(response.status).toBe(200);
    expect(audit?.binds.slice(1)).toEqual([
      'tenant-1',
      'admin-2',
      'Admin Two',
      'admin',
      'user_deactivated',
      'user',
      'resident-1',
      JSON.stringify({ reason: 'duplicate' }),
      '192.0.2.10',
    ]);
  });
});
