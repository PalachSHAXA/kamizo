import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (request: Request, env: any, params: Record<string, string>) => Promise<Response>>(),
  user: null as any,
  tenantId: 'tenant-1' as string | null,
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: any) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  getTenantSlug: vi.fn(() => null),
  setTenantForRequest: vi.fn(),
}));
vi.mock('../../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../../index', () => ({
  isExecutorRole: (role: string) => role === 'executor' || role === 'security',
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}));
vi.mock('../../../utils/logger', () => ({ createRequestLogger: () => ({ warn: vi.fn() }) }));

import { registerAuthRoutes } from '../auth';
import { registerExecutorRoutes } from '../executors';
import { registerTeamRoutes } from '../team';

type DbCall = { sql: string; params: unknown[]; method: 'first' | 'all' | 'run' };

function createDb() {
  const calls: DbCall[] = [];
  return {
    calls,
    prepare(sql: string) {
      let params: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        async first() {
          calls.push({ sql, params, method: 'first' });
          if (!sql.includes('SELECT COUNT') && sql.includes('FROM users')) {
            return params[0] === 'executor-1' && params[1] === 'tenant-1'
              ? { id: 'executor-1', name: 'Tenant One Executor', role: 'executor' }
              : null;
          }
          return { total: 1 };
        },
        async all() {
          calls.push({ sql, params, method: 'all' });
          const isTenantScoped = (sql.match(/tenant_id = \?/g) ?? []).length === 2
            && params[0] === 'tenant-1'
            && params[1] === 'tenant-1';
          return {
            results: isTenantScoped
              ? [{ id: 'executor-1', name: 'Tenant One Executor' }]
              : [
                  { id: 'executor-1', name: 'Tenant One Executor' },
                  { id: 'executor-2', name: 'Tenant Two Executor' },
                ],
          };
        },
        async run() {
          calls.push({ sql, params, method: 'run' });
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
}

function handler(method: string, path: string) {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'dispatcher-1', role: 'dispatcher', tenant_id: 'tenant-1' };
  mocks.tenantId = 'tenant-1';
  registerAuthRoutes();
  registerExecutorRoutes();
  registerTeamRoutes();
});

describe('executor route authorization', () => {
  it('allows a dispatcher to read a same-tenant executor', async () => {
    const db = createDb();

    const response = await handler('GET', '/api/executors/:id')(
      new Request('https://api.kamizo.uz/api/executors/executor-1'),
      { DB: db },
      { id: 'executor-1' },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      executor: { id: 'executor-1', name: 'Tenant One Executor', role: 'executor' },
    });
  });

  it('does not expose a cross-tenant executor to a dispatcher', async () => {
    const db = createDb();

    const response = await handler('GET', '/api/executors/:id')(
      new Request('https://api.kamizo.uz/api/executors/executor-2'),
      { DB: db },
      { id: 'executor-2' },
    );

    expect(response.status).toBe(404);
  });

  it('rejects dispatcher executor detail access without tenant context', async () => {
    mocks.user = { id: 'dispatcher-1', role: 'dispatcher', tenant_id: null };
    mocks.tenantId = null;
    const db = createDb();

    const response = await handler('GET', '/api/executors/:id')(
      new Request('https://api.kamizo.uz/api/executors/executor-1'),
      { DB: db },
      { id: 'executor-1' },
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('does not allow a dispatcher to mutate executor status', async () => {
    const db = createDb();

    const response = await handler('PATCH', '/api/executors/:id/status')(
      new Request('https://api.kamizo.uz/api/executors/executor-1/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'busy' }),
      }),
      { DB: db },
      { id: 'executor-1' },
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('returns only same-tenant executors to a dispatcher', async () => {
    const db = createDb();

    const response = await handler('GET', '/api/executors')(
      new Request('https://api.kamizo.uz/api/executors'),
      { DB: db },
      {},
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { executors: Array<{ id: string }> };
    expect(body.executors).toEqual([{ id: 'executor-1', name: 'Tenant One Executor' }]);
    expect(body.executors.some((executor) => executor.id === 'executor-2')).toBe(false);
  });

  it.each(['admin', 'director', 'manager', 'dispatcher', 'department_head', 'executor', 'resident', 'marketplace_manager'])(
    'rejects %s when tenant context is missing',
    async (role) => {
      mocks.user = { id: `${role}-1`, role, tenant_id: null };
      mocks.tenantId = null;
      const db = createDb();

      const response = await handler('GET', '/api/executors')(
        new Request('https://api.kamizo.uz/api/executors'),
        { DB: db },
        {},
      );

      expect(response.status).toBe(403);
      expect(db.calls).toHaveLength(0);
    },
  );

  it('allows a super admin to list executors without tenant context', async () => {
    mocks.user = { id: 'super-1', role: 'super_admin', tenant_id: null };
    mocks.tenantId = null;
    const db = createDb();

    const response = await handler('GET', '/api/executors')(
      new Request('https://api.kamizo.uz/api/executors'),
      { DB: db },
      {},
    );

    expect(response.status).toBe(200);
    const body = await response.json() as { executors: Array<{ id: string }> };
    expect(body.executors).toHaveLength(2);
  });

  it('does not allow a dispatcher to create an executor', async () => {
    const db = createDb();

    const response = await handler('POST', '/api/auth/register')(
      new Request('https://api.kamizo.uz/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ login: 'new-executor', password: 'secret', name: 'New Executor', role: 'executor' }),
      }),
      { DB: db },
      {},
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('does not allow a dispatcher to update an executor', async () => {
    const db = createDb();

    const response = await handler('PATCH', '/api/team/:id')(
      new Request('https://api.kamizo.uz/api/team/executor-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Changed' }),
      }),
      { DB: db },
      { id: 'executor-1' },
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });
});
