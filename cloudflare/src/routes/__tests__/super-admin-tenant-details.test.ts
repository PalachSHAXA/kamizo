import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Tests run in Node, while the Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;
type DbMethod = 'first' | 'all' | 'run';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'super-admin-1', role: 'super_admin' } as any,
}));

vi.mock('../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../middleware/auth', () => ({
  getUser: vi.fn(async () => mocks.user),
  getAuditAttribution: vi.fn(),
}));
vi.mock('../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => null),
  clearFeatureCache: vi.fn(),
}));
vi.mock('../../index', () => ({
  isSuperAdmin: (user: any) => user?.role === 'super_admin',
}));
vi.mock('../../utils/logger', () => ({
  createRequestLogger: vi.fn(() => ({ error: vi.fn(), warn: vi.fn() })),
}));
vi.mock('../../utils/crypto', () => ({
  hashPassword: vi.fn(),
  createJWT: vi.fn(),
}));

import { registerSuperAdminRoutes } from '../super-admin';

function quote(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function executeRequestQuery(sql: string, params: unknown[]) {
  let bindingIndex = 0;
  const boundSql = sql.replace(/\?/g, () => quote(params[bindingIndex++]));
  const script = [
    'CREATE TABLE requests (id TEXT, title TEXT, status TEXT, priority TEXT, category_id TEXT, resident_id TEXT, executor_id TEXT, created_at TEXT, tenant_id TEXT);',
    'CREATE TABLE users (id TEXT, name TEXT, tenant_id TEXT);',
    "INSERT INTO requests VALUES ('request-target','Target leak','new','high','plumbing','resident-shared','executor-shared','2026-08-15T10:00:00Z','tenant-target');",
    "INSERT INTO requests VALUES ('request-other','Other leak','new','low','electrical','resident-shared','executor-shared','2026-08-15T11:00:00Z','tenant-other');",
    "INSERT INTO users VALUES ('resident-shared','Target Resident','tenant-target');",
    "INSERT INTO users VALUES ('resident-shared','Other Resident','tenant-other');",
    "INSERT INTO users VALUES ('executor-shared','Target Executor','tenant-target');",
    "INSERT INTO users VALUES ('executor-shared','Other Executor','tenant-other');",
    '.mode json',
    `${boundSql};`,
  ].join('\n');
  const output = execFileSync('sqlite3', [':memory:'], { input: script, encoding: 'utf8' }).trim();
  return output ? JSON.parse(output) : [];
}

function createDb() {
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const execute = async (method: DbMethod) => {
        if (method === 'first' && sql.includes('FROM tenants t')) {
          return { id: 'tenant-target', name: 'Target tenant' };
        }
        if (method === 'first' && sql.includes('COUNT(*)')) return { cnt: 0 };
        if (method === 'all' && sql.includes('FROM requests r')) {
          return { results: executeRequestQuery(sql, params) };
        }
        if (method === 'all') return { results: [] };
        return method === 'run' ? { success: true, meta: { changes: 1 } } : null;
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

function handler(method: string, path: string) {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'super-admin-1', role: 'super_admin' };
});

describe('GET /api/super-admin/tenants/:id/details', () => {
  it('loads production-shaped requests without leaking colliding users from another tenant', async () => {
    registerSuperAdminRoutes();
    const response = await handler('GET', '/api/super-admin/tenants/:id/details')(
      new Request('https://api.kamizo.uz/api/super-admin/tenants/tenant-target/details?tab=requests'),
      { DB: createDb() },
      { id: 'tenant-target' },
    );
    const body = await response.json() as Record<string, any>;

    expect(response.status).toBe(200);
    expect(body.tabData).toEqual([{
      id: 'request-target',
      title: 'Target leak',
      status: 'new',
      priority: 'high',
      category: 'plumbing',
      created_at: '2026-08-15T10:00:00Z',
      creator_name: 'Target Resident',
      executor_name: 'Target Executor',
    }]);
  });
});
