// Tests for admin/super-admin endpoints added in Этап 2:
//   • POST /api/super-admin/telegram/tenants/:id/activation-required (dry_run + confirm)
//   • POST /api/super-admin/telegram/users/:id/unlink
//   • POST /api/super-admin/telegram/users/:id/reset-activation
//   • POST /api/super-admin/telegram/users/:id/skip-activation
//   • POST /api/admin/telegram/users/:id/unlink              — tenant-scoped
//   • POST /api/admin/telegram/users/:id/reset-activation    — tenant-scoped
//
// Covers:
//   • super-admin dry_run returns affected users without changing state
//   • super-admin cannot enable on demo tenant
//   • admin UK cannot touch user in a foreign tenant (403)
//   • skip-activation accepts and persists the boolean
//   • audit_log INSERT fires for every mutation

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  actor: null as any,
  tenantId: 'tenant-1',
  tenantRows: {} as Record<string, any>,
  userRows: {} as Record<string, any>,
  affectedUsers: [] as any[],
  dbRuns: [] as Array<{ sql: string; params: unknown[] }>,
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/auth', () => ({
  getUser: vi.fn(async () => mocks.actor),
}));
vi.mock('../../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  clearFeatureCache: vi.fn(),
}));
vi.mock('../../../index', () => ({
  isSuperAdmin: (u: any) => u?.role === 'super_admin',
}));
vi.mock('../../../lib/features', () => ({
  TENANT_FEATURES: ['telegram'],
  normalizeFeatures: (x: any) => (Array.isArray(x) ? x : []),
}));
vi.mock('../../../utils/telegram', () => ({
  sendTelegramMessage: vi.fn(async () => ({ ok: true })),
  callTelegram: vi.fn(async () => ({ ok: true, result: {} })),
  escapeHtml: (s: string) => s,
}));

import { registerTelegramSuperAdminRoutes } from '../super-admin';

function fakeDb() {
  return {
    prepare(sql: string) {
      let binds: unknown[] = [];
      const stmt = {
        bind(...vs: unknown[]) { binds = vs; return stmt; },
        async first() {
          if (sql.includes('FROM tenants')) {
            return mocks.tenantRows[String(binds[0])] || null;
          }
          if (sql.includes('FROM users')) {
            return mocks.userRows[String(binds[0])] || null;
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM users')) {
            return { results: mocks.affectedUsers };
          }
          return { results: [] };
        },
        async run() {
          mocks.dbRuns.push({ sql, params: binds });
          return { success: true, meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
}

function callHandler(method: string, path: string, params: Record<string, string>, body: any): Promise<Response> {
  const h = mocks.handlers.get(`${method} ${path}`)!;
  const req = new Request(`https://api.kamizo.uz${path.replace(':id', params.id)}`, {
    method, headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4' },
    body: JSON.stringify(body),
  });
  return h(req, { DB: fakeDb() }, params);
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.actor = null;
  mocks.tenantId = 'tenant-1';
  mocks.tenantRows = {};
  mocks.userRows = {};
  mocks.affectedUsers = [];
  mocks.dbRuns = [];
  registerTelegramSuperAdminRoutes();
});

describe('super-admin: activation-required toggle', () => {
  it('super-admin dry_run returns affected list, no DB mutations', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.tenantRows['t-choko'] = {
      id: 't-choko', slug: 'choko', name: 'Choko', require_telegram_activation: 0, is_demo: 0,
    };
    mocks.affectedUsers = [
      { id: 'u1', login: 'r1', name: 'Resident One', role: 'resident', phone: '+998901' },
      { id: 'u2', login: 'r2', name: 'Resident Two', role: 'tenant', phone: '+998902' },
    ];

    const res = await callHandler('POST', '/api/super-admin/telegram/tenants/:id/activation-required',
      { id: 't-choko' }, { dry_run: true });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(body.affectedCount).toBe(2);
    expect(body.affected).toHaveLength(2);
    expect(body.tenant.currentlyEnabled).toBe(false);
    // No UPDATE on tenants
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE tenants'))).toBeUndefined();
  });

  it('rejects enabling on demo tenant (409)', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.tenantRows['t-demo'] = {
      id: 't-demo', slug: 'demo', name: 'Demo', require_telegram_activation: 0, is_demo: 1,
    };
    const res = await callHandler('POST', '/api/super-admin/telegram/tenants/:id/activation-required',
      { id: 't-demo' }, { confirm: true, enabled: true });
    expect(res.status).toBe(409);
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE tenants'))).toBeUndefined();
  });

  it('confirm=true toggles the switch + writes audit', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.tenantRows['t-choko'] = {
      id: 't-choko', slug: 'choko', name: 'Choko', require_telegram_activation: 0, is_demo: 0,
    };
    const res = await callHandler('POST', '/api/super-admin/telegram/tenants/:id/activation-required',
      { id: 't-choko' }, { confirm: true, enabled: true });
    const body = await res.json() as any;

    expect(res.status).toBe(200);
    expect(body.applied).toBe(true);
    expect(body.enabled).toBe(true);
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE tenants') && r.sql.includes('require_telegram_activation'))).toBeDefined();
    // Audit INSERT present
    expect(mocks.dbRuns.find(r => r.sql.includes('INSERT INTO audit_log'))).toBeDefined();
  });

  it('non-super-admin gets 403', async () => {
    mocks.actor = { id: 'd-1', role: 'director', name: 'Director' };
    const res = await callHandler('POST', '/api/super-admin/telegram/tenants/:id/activation-required',
      { id: 't-choko' }, { dry_run: true });
    expect(res.status).toBe(403);
  });
});

describe('super-admin: user actions', () => {
  it('unlink: writes revoked_at + audit', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1' };

    const res = await callHandler('POST', '/api/super-admin/telegram/users/:id/unlink',
      { id: 'user-1' }, {});
    expect(res.status).toBe(200);
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE telegram_users') && r.sql.includes('revoked_at'))).toBeDefined();
    expect(mocks.dbRuns.find(r => r.sql.includes('INSERT INTO audit_log'))).toBeDefined();
  });

  it('reset-activation: sets flag back + REVOKES live links + audit (counts revoked)', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1', role: 'resident' };

    const res = await callHandler('POST', '/api/super-admin/telegram/users/:id/reset-activation',
      { id: 'user-1' }, {});
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.revokedLinks).toBe('number');

    // Both operations fired in this order: revoke telegram_users, THEN flag reset
    const revokeIdx = mocks.dbRuns.findIndex(r => r.sql.includes('UPDATE telegram_users') && r.sql.includes('revoked_at'));
    const flagIdx = mocks.dbRuns.findIndex(r => r.sql.includes('UPDATE users') && r.sql.includes('telegram_activation_required = 1'));
    expect(revokeIdx).toBeGreaterThanOrEqual(0);
    expect(flagIdx).toBeGreaterThan(revokeIdx);

    // Audit payload has revokedLinks counter
    const audit = mocks.dbRuns.find(r => r.sql.includes('INSERT INTO audit_log'))!;
    const detailsJson = String(audit.params[8] ?? '');
    expect(detailsJson).toContain('revokedLinks');
  });

  it('reset-activation (admin UK): own tenant → OK + revokes links', async () => {
    mocks.actor = { id: 'adm-1', role: 'director', name: 'D', tenant_id: 't-choko' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1', role: 'resident' };

    const res = await callHandler('POST', '/api/admin/telegram/users/:id/reset-activation',
      { id: 'user-1' }, {});
    expect(res.status).toBe(200);
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE telegram_users') && r.sql.includes('revoked_at'))).toBeDefined();
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE users') && r.sql.includes('telegram_activation_required = 1'))).toBeDefined();
  });

  it('reset-activation (admin UK): foreign tenant → 403, NO revoke/flag changes', async () => {
    mocks.actor = { id: 'adm-1', role: 'director', name: 'D', tenant_id: 't-choko' };
    mocks.userRows['user-foreign'] = { id: 'user-foreign', tenant_id: 't-OTHER', name: 'X', login: 'foreign', role: 'resident' };

    const res = await callHandler('POST', '/api/admin/telegram/users/:id/reset-activation',
      { id: 'user-foreign' }, {});
    expect(res.status).toBe(403);
    // No DB mutations on foreign tenant
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE telegram_users') && r.sql.includes('revoked_at'))).toBeUndefined();
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE users') && r.sql.includes('telegram_activation_required = 1'))).toBeUndefined();
  });

  it('skip-activation: body { skip:true } persists 1 + audit', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1', role: 'resident' };

    const res = await callHandler('POST', '/api/super-admin/telegram/users/:id/skip-activation',
      { id: 'user-1' }, { skip: true });
    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.skip).toBe(true);
    const upd = mocks.dbRuns.find(r => r.sql.includes('UPDATE users') && r.sql.includes('skip_telegram_activation'));
    expect(upd).toBeDefined();
    expect(upd!.params[0]).toBe(1);
    expect(mocks.dbRuns.find(r => r.sql.includes('INSERT INTO audit_log'))).toBeDefined();
  });

  it('skip-activation: missing body → 400', async () => {
    mocks.actor = { id: 'sa-1', role: 'super_admin', name: 'SA' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1', role: 'resident' };

    const res = await callHandler('POST', '/api/super-admin/telegram/users/:id/skip-activation',
      { id: 'user-1' }, {});
    expect(res.status).toBe(400);
  });
});

describe('admin UK: tenant-scoped actions', () => {
  it('admin UK unlink: own tenant OK', async () => {
    mocks.actor = { id: 'adm-1', role: 'director', name: 'D', tenant_id: 't-choko' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1' };

    const res = await callHandler('POST', '/api/admin/telegram/users/:id/unlink',
      { id: 'user-1' }, {});
    expect(res.status).toBe(200);
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE telegram_users'))).toBeDefined();
  });

  it('admin UK unlink: foreign tenant → 403', async () => {
    mocks.actor = { id: 'adm-1', role: 'director', name: 'D', tenant_id: 't-choko' };
    mocks.userRows['user-foreign'] = { id: 'user-foreign', tenant_id: 't-OTHER', name: 'X', login: 'foreign' };

    const res = await callHandler('POST', '/api/admin/telegram/users/:id/unlink',
      { id: 'user-foreign' }, {});
    expect(res.status).toBe(403);
    expect(mocks.dbRuns.find(r => r.sql.includes('UPDATE telegram_users'))).toBeUndefined();
  });

  it('admin UK reset-activation: foreign tenant → 403', async () => {
    mocks.actor = { id: 'adm-1', role: 'manager', name: 'M', tenant_id: 't-choko' };
    mocks.userRows['user-foreign'] = { id: 'user-foreign', tenant_id: 't-OTHER', name: 'X', login: 'foreign', role: 'resident' };

    const res = await callHandler('POST', '/api/admin/telegram/users/:id/reset-activation',
      { id: 'user-foreign' }, {});
    expect(res.status).toBe(403);
    expect(mocks.dbRuns.find(r => r.sql.includes('telegram_activation_required = 1'))).toBeUndefined();
  });

  it('non-admin role (resident) → 403 on admin endpoint', async () => {
    mocks.actor = { id: 'r-1', role: 'resident', name: 'R', tenant_id: 't-choko' };
    mocks.userRows['user-1'] = { id: 'user-1', tenant_id: 't-choko', name: 'U', login: 'u1' };

    const res = await callHandler('POST', '/api/admin/telegram/users/:id/unlink',
      { id: 'user-1' }, {});
    expect(res.status).toBe(403);
  });
});
