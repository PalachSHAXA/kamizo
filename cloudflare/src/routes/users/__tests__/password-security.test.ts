import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Tests run in Node, while the Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';
// @ts-expect-error Tests run in Node, while the Worker tsconfig intentionally omits Node types.
import { mkdtempSync, rmSync } from 'node:fs';
// @ts-expect-error Tests run in Node, while the Worker tsconfig intentionally omits Node types.
import { tmpdir } from 'node:os';
// @ts-expect-error Tests run in Node, while the Worker tsconfig intentionally omits Node types.
import { join } from 'node:path';

// @ts-expect-error Vitest/Vite resolves raw source imports in tests.
import indexSource from '../../../index.ts?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports in tests.
import typesSource from '../../../types.ts?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports in tests.
import cryptoSource from '../../../utils/crypto.ts?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports in tests.
import utilsIndexSource from '../../../utils/index.ts?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports outside src in tests.
import wranglerSource from '../../../../wrangler.toml?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports outside src in tests.
import wranglerStagingSource from '../../../../wrangler.staging.toml?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports outside src in tests.
import envExampleSource from '../../../../.env.example?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports outside src in tests.
import schemaSource from '../../../../schema.sql?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports outside src in tests.
import schemaNoFkSource from '../../../../schema_no_fk.sql?raw';
// @ts-expect-error Vitest/Vite resolves raw source imports outside src in tests.
import migrationSource from '../../../../migrations/064_drop_password_plain.sql?raw';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;
type DbCall = { sql: string; params: unknown[]; method: 'first' | 'all' | 'run' };

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: null as any,
  tenantId: 'tenant-1' as string | null,
  ids: [] as string[],
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));

vi.mock('../../../middleware/auth', () => ({
  getUser: vi.fn(async () => mocks.user),
}));

vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  setTenantForRequest: vi.fn(),
  getTenantSlug: vi.fn(() => null),
  clearFeatureCache: vi.fn(),
}));

vi.mock('../../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../../middleware/cache-local', () => ({ invalidateCache: vi.fn() }));
vi.mock('../../../middleware/rateLimit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../middleware/rateLimit')>();
  return {
    ...actual,
    checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 })),
    getClientIdentifier: vi.fn(() => 'test-client'),
  };
});
vi.mock('../../../middleware/cors', () => ({ getCurrentCorsOrigin: vi.fn(() => 'https://app.kamizo.uz') }));
vi.mock('../../../utils/logger', () => ({ createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })) }));
vi.mock('../../../validation/validate', () => ({ validateBody: vi.fn() }));
vi.mock('../../../validation/schemas', () => ({ loginSchema: {} }));

vi.mock('../../../utils/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/helpers')>();
  return {
    ...actual,
    generateId: vi.fn(() => mocks.ids.shift() || 'generated-id'),
  };
});

vi.mock('../../../utils/crypto', () => ({
  hashPassword: vi.fn(async (password: string) => `hash:${password}`),
  verifyPassword: vi.fn(async (password: string, hash: string) => password === 'current-password' && hash === 'stored-hash'),
  verifyPasswordTolerant: vi.fn(),
  createJWT: vi.fn(async () => 'jwt'),
}));

vi.mock('../../../index', () => ({
  isExecutorRole: (role: string) => ['executor', 'security'].includes(role),
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}));

import { registerAuthRoutes } from '../auth';
import { registerChangesRoutes } from '../changes';
import { registerPasswordRoutes } from '../password';
import { registerTeamRoutes } from '../team';
import { registerSuperAdminRoutes } from '../../super-admin';
import { RATE_LIMITS } from '../../../middleware/rateLimit';

function createDb(resolve: (call: DbCall) => unknown = () => null) {
  const calls: DbCall[] = [];
  return {
    calls,
    prepare(sql: string) {
      let params: unknown[] = [];
      const execute = async (method: DbCall['method']) => {
        const call = { sql, params, method };
        calls.push(call);
        const result = resolve(call);
        if (method === 'all') return { results: result ?? [] };
        if (method === 'run') return result ?? { success: true, meta: { changes: 1 } };
        return result ?? null;
      };
      return {
        bind(...values: unknown[]) { params = values; return this; },
        first: () => execute('first'),
        all: () => execute('all'),
        run: () => execute('run'),
      };
    },
  };
}

function handler(method: string, path: string): Handler {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

function jsonRequest(path: string, body: unknown, method = 'POST') {
  return new Request(`https://api.kamizo.uz${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function responseJson(response: Response) {
  return await response.json() as Record<string, any>;
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'admin-1', name: 'Admin', role: 'admin', tenant_id: 'tenant-1' };
  mocks.tenantId = 'tenant-1';
  mocks.ids = ['tenant-new', 'director-new', 'admin-new'];
});

describe('team password confidentiality', () => {
  it('lists staff without selecting or returning reversible password fields', async () => {
    registerTeamRoutes();
    const db = createDb(({ method, sql }) => method === 'all' && sql.includes('FROM users u')
      ? [{ id: 'staff-1', login: 'staff', name: 'Staff', role: 'manager', phone: null, specialization: null, is_active: 1, created_at: 'now' }]
      : null);

    const response = await handler('GET', '/api/team')(
      new Request('https://api.kamizo.uz/api/team'), { DB: db }, {},
    );
    const body = await responseJson(response);
    const select = db.calls.find(call => call.method === 'all')!;

    expect(response.status).toBe(200);
    expect(select.sql).not.toMatch(/password(?:_plain|_hash)?/i);
    expect(JSON.stringify(body)).not.toMatch(/password|reversible-secret|plaintext-secret/i);
  });

  it('returns staff detail without selecting or returning reversible password fields', async () => {
    registerTeamRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('FROM users')
      ? { id: 'staff-1', login: 'staff', name: 'Staff', role: 'manager', status: 'active', created_at: 'now' }
      : null);

    const response = await handler('GET', '/api/team/:id')(
      new Request('https://api.kamizo.uz/api/team/staff-1'), { DB: db }, { id: 'staff-1' },
    );
    const body = await responseJson(response);

    expect(response.status).toBe(200);
    expect(db.calls[0].sql).not.toMatch(/password(?:_plain|_hash)?/i);
    expect(JSON.stringify(body)).not.toMatch(/password|reversible-secret|plaintext-secret/i);
  });

  it('rejects password in team PATCH and directs callers to the password endpoint', async () => {
    registerTeamRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('SELECT id, role')
      ? { id: 'staff-1', role: 'manager' }
      : null);

    const response = await handler('PATCH', '/api/team/:id')(
      jsonRequest('/api/team/staff-1', { password: 'new-password' }, 'PATCH'), { DB: db }, { id: 'staff-1' },
    );
    const body = await responseJson(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/\/api\/users\/:id\/password/);
    expect(db.calls.some(call => call.method === 'run')).toBe(false);
  });
});

describe('hash-only user creation', () => {
  it('registers a user with password_hash and no reversible password column', async () => {
    registerAuthRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('SELECT id FROM users')) return null;
      return null;
    });

    const response = await handler('POST', '/api/auth/register')(
      jsonRequest('/api/auth/register', { login: 'resident-1', password: 'secret-123', name: 'Resident', role: 'resident' }),
      { DB: db }, {},
    );
    const insert = db.calls.find(call => call.method === 'run' && call.sql.includes('INSERT INTO users'))!;

    expect(response.status).toBe(201);
    expect(insert.sql).toContain('password_hash');
    expect(insert.sql).not.toContain('password_plain');
    expect(insert.params).toContain('hash:secret-123');
    expect(insert.params).not.toContain('secret-123');
    expect(insert.params).not.toContain('reversible-secret');
  });

  it('creates tenant director/admin users with hashes only', async () => {
    registerSuperAdminRoutes();
    mocks.user = { id: 'sa-1', name: 'Super Admin', role: 'super_admin' };
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('SELECT id FROM tenants')) return null;
      if (method === 'first' && sql.includes('SELECT * FROM tenants')) return { id: 'tenant-new', slug: 'secure-uk' };
      return null;
    });

    const response = await handler('POST', '/api/tenants')(
      jsonRequest('/api/tenants', {
        name: 'Secure UK', slug: 'secure-uk', url: 'https://secure-uk.kamizo.uz',
        director_login: 'director', director_password: 'director-secret', director_name: 'Director',
        admin_login: 'admin', admin_password: 'admin-secret', admin_name: 'Admin',
      }),
      { DB: db }, {},
    );
    const userInserts = db.calls.filter(call => call.method === 'run' && call.sql.includes('INSERT INTO users'));

    expect(response.status).toBe(201);
    expect(userInserts).toHaveLength(2);
    for (const insert of userInserts) {
      expect(insert.sql).toContain('password_hash');
      expect(insert.sql).not.toContain('password_plain');
      expect(insert.params).not.toContain('reversible-secret');
    }
  });
});

describe('self password change', () => {
  it.each([null, [], 'invalid'])('rejects non-object body %j before SQL', async (body) => {
    registerPasswordRoutes();
    mocks.user = { id: 'resident-1', role: 'resident' };
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/me/password')(
      jsonRequest('/api/users/me/password', body), { DB: db }, {},
    );

    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    [{ current_password: '', new_password: 'new-password' }, /current/i],
    [{ current_password: 'current-password', new_password: 'short' }, /at least 6/i],
    [{ current_password: 'current-password', new_password: 'abc   ' }, /at least 6/i],
    [{ current_password: 'current-password', new_password: '      ' }, /at least 6/i],
    [{ current_password: 'x'.repeat(129), new_password: 'new-password' }, /at most 128/i],
    [{ current_password: 'current-password', new_password: 'x'.repeat(129) }, /at most 128/i],
  ])('validates password limits for %j', async (body, message) => {
    registerPasswordRoutes();
    mocks.user = { id: 'resident-1', role: 'resident' };
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/me/password')(
      jsonRequest('/api/users/me/password', body), { DB: db }, {},
    );

    expect(response.status).toBe(400);
    expect((await responseJson(response)).error).toMatch(message);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects unexpected self-change fields before SQL', async () => {
    registerPasswordRoutes();
    mocks.user = { id: 'resident-1', role: 'resident' };
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/me/password')(
      jsonRequest('/api/users/me/password', {
        current_password: 'current-password', new_password: 'new-password', target_id: 'other-user',
      }),
      { DB: db }, {},
    );

    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it.each([null, '__no_tenant__'])('fails closed without a valid tenant (%s)', async (tenantId) => {
    registerPasswordRoutes();
    mocks.user = { id: 'resident-1', role: 'resident' };
    mocks.tenantId = tenantId;
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/me/password')(
      jsonRequest('/api/users/me/password', { current_password: '  current-password  ', new_password: '  new-password  ' }),
      { DB: db }, {},
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('selects and updates by tenant, stores only a hash, and marks the password changed', async () => {
    registerPasswordRoutes();
    mocks.user = { id: 'resident-1', role: 'resident' };
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('SELECT password_hash')
      ? { password_hash: 'stored-hash' }
      : null);

    const response = await handler('POST', '/api/users/me/password')(
      jsonRequest('/api/users/me/password', { current_password: 'current-password', new_password: 'new-password' }),
      { DB: db }, {},
    );
    const select = db.calls.find(call => call.method === 'first')!;
    const update = db.calls.find(call => call.method === 'run')!;

    expect(response.status).toBe(200);
    expect(select.sql).toMatch(/WHERE id = \? AND tenant_id = \?/);
    expect(select.params).toEqual(['resident-1', 'tenant-1']);
    expect(update.sql).toContain('password_changed_at = datetime(\'now\')');
    expect(update.sql).toMatch(/WHERE id = \? AND tenant_id = \?/);
    expect(update.sql).not.toMatch(/password_plain|password\s*=/);
    expect(update.params).toEqual(['hash:new-password', 'resident-1', 'tenant-1']);
  });
});

describe('privileged custom password change', () => {
  it.each(['abc   ', '      '])('rejects trimmed invalid password %j before target SQL', async (newPassword) => {
    registerPasswordRoutes();
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', { new_password: newPassword }), { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(400);
    expect((await responseJson(response)).error).toMatch(/at least 6/i);
    expect(db.calls).toHaveLength(0);
  });

  it.each([null, '__no_tenant__'])('fails closed without a valid tenant (%s)', async (tenantId) => {
    registerPasswordRoutes();
    mocks.tenantId = tenantId;
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', { new_password: '  new-password  ' }), { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects malformed password bodies before target SQL', async () => {
    registerPasswordRoutes();
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', []), { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects unexpected privileged-change fields before target SQL', async () => {
    registerPasswordRoutes();
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', { new_password: 'new-password', role: 'admin' }),
      { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('denies changing a peer password without writing', async () => {
    registerPasswordRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('SELECT id, role')
      ? { id: 'target', role: 'director' }
      : null);

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', { new_password: 'new-password' }), { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(403);
    expect(db.calls.some(call => call.method === 'run')).toBe(false);
  });

  it('uses a tenant/rank CAS update, stores only a hash, and forces target password change', async () => {
    registerPasswordRoutes();
    mocks.user = { id: 'admin-1', role: 'admin' };
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('SELECT id, role')
      ? { id: 'target', role: 'resident' }
      : null);

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', { new_password: 'new-password' }), { DB: db }, { id: 'target' },
    );
    const update = db.calls.find(call => call.method === 'run')!;

    expect(response.status).toBe(200);
    expect(update.sql).toContain('password_changed_at = NULL');
    expect(update.sql).toMatch(/WHERE id = \? AND tenant_id = \? AND role = \?/);
    expect(update.sql).not.toMatch(/password_plain|password\s*=/);
    expect(update.params).toEqual(['hash:new-password', 'target', 'tenant-1', 'resident']);
  });

  it('reports a conflict when the CAS update changes no row', async () => {
    registerPasswordRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('SELECT id, role')) return { id: 'target', role: 'resident' };
      if (method === 'run' && sql.includes('UPDATE users')) return { success: true, meta: { changes: 0 } };
      return null;
    });

    const response = await handler('POST', '/api/users/:id/password')(
      jsonRequest('/api/users/target/password', { new_password: 'new-password' }), { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(409);
  });
});

describe('generated temporary password reset', () => {
  it.each([null, '__no_tenant__'])('fails closed without a valid tenant (%s)', async (tenantId) => {
    registerPasswordRoutes();
    mocks.tenantId = tenantId;
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/:id/reset-password')(
      new Request('https://api.kamizo.uz/api/users/target/reset-password', { method: 'POST' }),
      { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('denies resetting a peer password without writing', async () => {
    registerPasswordRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('SELECT id, login')
      ? { id: 'target', login: 'director', name: 'Director', role: 'director' }
      : null);

    const response = await handler('POST', '/api/users/:id/reset-password')(
      new Request('https://api.kamizo.uz/api/users/target/reset-password', { method: 'POST' }),
      { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(403);
    expect(db.calls.some(call => call.method === 'run')).toBe(false);
  });

  it('returns a non-deterministic Web-Crypto temporary password only in reset responses', async () => {
    registerPasswordRoutes();
    const makeDb = () => createDb(({ method, sql }) => method === 'first' && sql.includes('SELECT id, login')
      ? { id: 'target', login: 'resident', name: 'Resident', role: 'resident' }
      : null);
    const db1 = makeDb();
    const db2 = makeDb();

    const invoke = (db: ReturnType<typeof createDb>) => handler('POST', '/api/users/:id/reset-password')(
      new Request('https://api.kamizo.uz/api/users/target/reset-password', { method: 'POST' }),
      { DB: db }, { id: 'target' },
    );
    const response1 = await invoke(db1);
    const response2 = await invoke(db2);
    const body1 = await responseJson(response1);
    const body2 = await responseJson(response2);
    const update = db1.calls.find(call => call.method === 'run')!;

    expect(response1.status).toBe(200);
    expect(body1.temporaryPassword).toMatch(/^resident_[A-Za-z0-9_-]{16}$/);
    expect(body2.temporaryPassword).toMatch(/^resident_[A-Za-z0-9_-]{16}$/);
    expect(body1.temporaryPassword).not.toBe(body2.temporaryPassword);
    expect(update.sql).toContain('password_changed_at = NULL');
    expect(update.sql).toMatch(/WHERE id = \? AND tenant_id = \? AND role = \?/);
    expect(update.sql).not.toMatch(/password_plain|password\s*=/);
    expect(update.params).toEqual([`hash:${body1.temporaryPassword}`, 'target', 'tenant-1', 'resident']);
    expect(JSON.stringify(body1)).not.toContain('hash:');
    expect(response1.headers.get('Cache-Control')).toBe('no-store');
    expect(response1.headers.get('Pragma')).toBe('no-cache');
  });

  it('reports a conflict when the conditional reset changes no row', async () => {
    registerPasswordRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('SELECT id, login')) return { id: 'target', login: 'resident', name: 'Resident', role: 'resident' };
      if (method === 'run' && sql.includes('UPDATE users')) return { success: true, meta: { changes: 0 } };
      return null;
    });

    const response = await handler('POST', '/api/users/:id/reset-password')(
      new Request('https://api.kamizo.uz/api/users/target/reset-password', { method: 'POST' }),
      { DB: db }, { id: 'target' },
    );

    expect(response.status).toBe(409);
  });
});

describe('change-with-reason password boundary', () => {
  it.each([
    { changes: [{ field: 'password', value: 'new-password' }], reason: 'Requested' },
    { changes: [{ field: 'new_password', value: 'new-password' }], reason: 'Requested' },
    { changes: [{ field: 'name', value: 'Resident' }], reason: 'Requested', password: 'new-password' },
    { changes: [{ field: 'name', value: 'Resident' }], reason: 'Requested', new_password: 'new-password' },
  ])('rejects password-bearing payload %j before SQL', async (body) => {
    registerChangesRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    const db = createDb(() => { throw new Error('SQL must not execute'); });

    const response = await handler('POST', '/api/users/:id/change-with-reason')(
      jsonRequest('/api/users/resident-1/change-with-reason', body),
      { DB: db }, { id: 'resident-1' },
    );

    expect(response.status).toBe(400);
    expect((await responseJson(response)).error).toMatch(/\/api\/users\/:id\/password/);
    expect(db.calls).toHaveLength(0);
  });

  it('preserves non-password resident changes for management roles', async () => {
    registerChangesRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    const db = createDb(({ method }) => method === 'first'
      ? { id: 'resident-1', login: 'resident', name: 'Resident', status: 'active' }
      : null);

    const response = await handler('POST', '/api/users/:id/change-with-reason')(
      jsonRequest('/api/users/resident-1/change-with-reason', {
        changes: [{ field: 'name', value: 'Updated Resident' }], reason: 'Documented correction',
      }),
      { DB: db }, { id: 'resident-1' },
    );
    const update = db.calls.find(call => call.method === 'run' && call.sql.includes('UPDATE users'))!;

    expect(response.status).toBe(200);
    expect(update.sql).toContain('name = ?');
    expect(update.sql).not.toMatch(/password/i);
    expect(update.params).toContain('Updated Resident');
  });
});

describe('obsolete routes and rate limits', () => {
  it('does not register any removed password reset route', () => {
    registerPasswordRoutes();
    registerTeamRoutes();

    expect(mocks.handlers.has('POST /api/team/reset-all-passwords')).toBe(false);
    expect(mocks.handlers.has('POST /api/admin/reset-password')).toBe(false);
    expect(mocks.handlers.has('POST /api/_emergency-reset')).toBe(false);
  });

  it('uses exact tight limits for every retained password mutation and none for removed routes', () => {
    expect(RATE_LIMITS['POST:/api/users/me/password']).toEqual({ maxRequests: 5, windowSeconds: 60 });
    expect(RATE_LIMITS['POST:/api/users/:id/password']).toEqual({ maxRequests: 10, windowSeconds: 60 });
    expect(RATE_LIMITS['POST:/api/users/:id/reset-password']).toEqual({ maxRequests: 10, windowSeconds: 60 });
    expect(RATE_LIMITS['POST:/api/admin/reset-password']).toBeUndefined();
    expect(RATE_LIMITS['POST:/api/team/reset-all-passwords']).toBeUndefined();
    expect(RATE_LIMITS['POST:/api/_emergency-reset']).toBeUndefined();
    expect(RATE_LIMITS['POST:/api/users/:id/change-with-reason']).toBeUndefined();
  });
});

describe('runtime and configuration regression', () => {
  it('does not re-add password_plain at runtime', () => {
    expect(indexSource).not.toContain('password_plain');
  });

  it('removes reversible-password configuration from backend runtime files', () => {
    for (const source of [typesSource, cryptoSource, utilsIndexSource, wranglerSource, wranglerStagingSource, envExampleSource]) {
      expect(source).not.toMatch(/ENCRYPTION_KEY|encryptPassword|decryptPassword/);
    }
  });

  it('keeps schema snapshots free of password_plain', () => {
    for (const source of [schemaSource, schemaNoFkSource]) {
      expect(source).not.toContain('password_plain');
    }
  });

  it('provides a transactional backend-first unapplied drop migration', () => {
    expect(migrationSource).toContain('backend-first');
    expect(migrationSource).toMatch(/\.bail on\s+\.timeout 30000\s+BEGIN IMMEDIATE;\s+DROP INDEX IF EXISTS idx_users_password_plain;\s+ALTER TABLE users DROP COLUMN password_plain;\s+COMMIT;/);
  });

  it('drops the legacy indexed column while preserving 18 users and unrelated indexes in SQLite', () => {
    const script = [
      'CREATE TABLE users (id TEXT PRIMARY KEY, login TEXT NOT NULL, password_hash TEXT NOT NULL, password_plain TEXT, tenant_id TEXT NOT NULL);',
      'CREATE UNIQUE INDEX idx_users_login ON users(login);',
      'CREATE INDEX idx_users_tenant ON users(tenant_id);',
      'CREATE INDEX idx_users_password_plain ON users(id) WHERE password_plain IS NOT NULL;',
      "WITH RECURSIVE rows(n) AS (VALUES(1) UNION ALL SELECT n + 1 FROM rows WHERE n < 18) INSERT INTO users SELECT printf('user-%02d', n), printf('login-%02d', n), printf('hash-%02d', n), printf('plain-%02d', n), 'tenant-1' FROM rows;",
      migrationSource,
      '.mode json',
      "SELECT COUNT(*) AS row_count, (SELECT COUNT(*) FROM pragma_table_info('users') WHERE name = 'password_plain') AS legacy_columns, (SELECT group_concat(name, ',') FROM (SELECT name FROM pragma_index_list('users') ORDER BY name)) AS indexes FROM users;",
    ].join('\n');

    const output = execFileSync('sqlite3', [':memory:'], { input: script, encoding: 'utf8' }).trim();
    expect(JSON.parse(output)).toEqual([{
      row_count: 18,
      legacy_columns: 0,
      indexes: 'idx_users_login,idx_users_tenant,sqlite_autoindex_users_1',
    }]);
  });

  it('rolls back the index drop when the column drop fails', () => {
    const testDir = mkdtempSync(join(tmpdir(), 'kamizo-migration-064-'));
    const databasePath = join(testDir, 'rollback.db');

    try {
      execFileSync('sqlite3', [databasePath], {
        input: [
          'CREATE TABLE users (id TEXT PRIMARY KEY, password_hash TEXT NOT NULL);',
          'CREATE INDEX idx_users_password_plain ON users(id);',
        ].join('\n'),
      });

      expect(() => execFileSync('sqlite3', [databasePath], { input: migrationSource, stdio: 'pipe' })).toThrow();

      const indexCount = execFileSync('sqlite3', [databasePath], {
        input: "SELECT COUNT(*) FROM pragma_index_list('users') WHERE name = 'idx_users_password_plain';",
        encoding: 'utf8',
      }).trim();
      expect(indexCount).toBe('1');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
