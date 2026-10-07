import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (request: Request, env: any, params: Record<string, string>) => Promise<Response>>(),
  user: null as any,
  tenantId: 'tenant-a' as string | null,
}));

vi.mock('../../../router', () => ({
  route: (method: string, path: string, handler: any) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../../middleware/tenant', () => ({ getTenantId: vi.fn(() => mocks.tenantId) }));
vi.mock('../../../cache', () => ({ invalidateOnChange: vi.fn(async () => undefined) }));
vi.mock('../../../utils/logger', () => ({ createRequestLogger: vi.fn(() => ({ error: vi.fn() })) }));
vi.mock('../../../utils/helpers', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../utils/helpers')>();
  return {
    ...original,
    generateId: vi.fn(() => 'report-id'),
    json: (data: unknown, status = 200) => Response.json(data, { status }),
    error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  };
});

import { registerUkReportRoutes } from '../uk-reports';

type DbCall = { sql: string; params: unknown[]; method: 'first' | 'all' | 'run' };

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
        bind(...values: unknown[]) {
          params = values;
          return this;
        },
        first: () => execute('first'),
        all: () => execute('all'),
        run: () => execute('run'),
      };
    },
  };
}

function bucket() {
  return {
    put: vi.fn(async () => undefined),
    get: vi.fn(async () => ({ body: new Blob(['%PDF-report']).stream() })),
    delete: vi.fn(async () => undefined),
  };
}

function handler(method: string, path: string) {
  const value = mocks.handlers.get(`${method} ${path}`);
  if (!value) throw new Error(`Missing route ${method} ${path}`);
  return value;
}

function get(path: string) {
  return new Request(`https://api.kamizo.uz${path}`);
}

function multipart(fields: Record<string, string>, file: { type: string; size: number; name: string; bytes: Uint8Array }) {
  const entries = new Map<string, unknown>(Object.entries(fields));
  entries.set('file', {
    type: file.type,
    size: file.size,
    name: file.name,
    arrayBuffer: async () => file.bytes.buffer,
  });
  return {
    url: 'https://api.kamizo.uz/api/admin/uk-reports',
    headers: new Headers({ 'content-type': 'multipart/form-data; boundary=test' }),
    formData: async () => ({ get: (key: string) => entries.get(key) ?? null }),
  } as unknown as Request;
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'resident-a', role: 'resident', tenant_id: 'tenant-a', building_id: 'building-a' };
  mocks.tenantId = 'tenant-a';
  registerUkReportRoutes();
});

describe('UK report authorization and isolation', () => {
  it.each(['executor', 'admin', 'super_admin'])('denies %s on the resident list', async (role) => {
    mocks.user = { id: 'user-a', role, tenant_id: role === 'super_admin' ? undefined : 'tenant-a' };
    const db = createDb();
    const response = await handler('GET', '/api/resident/uk-reports')(get('/api/resident/uk-reports'), { DB: db }, {});
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each(['resident', 'commercial_owner', 'super_admin'])('denies %s on the admin list', async (role) => {
    mocks.user = { id: 'user-a', role, tenant_id: role === 'super_admin' ? undefined : 'tenant-a' };
    const db = createDb();
    const response = await handler('GET', '/api/admin/uk-reports')(get('/api/admin/uk-reports'), { DB: db }, {});
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects a mismatched request and JWT tenant before SQL', async () => {
    mocks.tenantId = 'tenant-b';
    const db = createDb();
    const response = await handler('GET', '/api/resident/uk-reports')(get('/api/resident/uk-reports'), { DB: db }, {});
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('scopes resident lists to tenant, active state, and own building', async () => {
    const db = createDb(() => []);
    const response = await handler('GET', '/api/resident/uk-reports')(
      get('/api/resident/uk-reports?type=financial'), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect(db.calls[0].sql).toContain('tenant_id = ? AND is_active = 1');
    expect(db.calls[0].sql).toContain('(building_id IS NULL OR building_id = ?)');
    expect(db.calls[0].params).toEqual(['tenant-a', 'building-a', 'financial']);
  });

  it('scopes resident downloads to active reports in the same building', async () => {
    const db = createDb(() => null);
    const storage = bucket();
    const response = await handler('GET', '/api/uk-reports/:id/file')(
      get('/api/uk-reports/foreign/file'), { DB: db, CONTRACTS_BUCKET: storage }, { id: 'foreign' },
    );
    expect(response.status).toBe(404);
    expect(db.calls[0].sql).toContain('tenant_id = ? AND is_active = 1');
    expect(db.calls[0].sql).toContain('(building_id IS NULL OR building_id = ?)');
    expect(db.calls[0].params).toEqual(['foreign', 'tenant-a', 'building-a']);
    expect(storage.get).not.toHaveBeenCalled();
  });

  it('tenant-scopes admin list filters without accepting a tenant parameter', async () => {
    mocks.user = { id: 'manager-a', role: 'manager', tenant_id: 'tenant-a' };
    const db = createDb(() => []);
    const response = await handler('GET', '/api/admin/uk-reports')(
      get('/api/admin/uk-reports?type=completed_works&building_id=building-a&tenantId=tenant-b'), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect(db.calls[0].params).toEqual(['tenant-a', 'completed_works', 'building-a']);
  });

  it('denies super-admin report downloads before SQL', async () => {
    mocks.user = { id: 'super-1', role: 'super_admin' };
    mocks.tenantId = null;
    const db = createDb();
    const response = await handler('GET', '/api/uk-reports/:id/file')(
      get('/api/uk-reports/report-id/file'), { DB: db, CONTRACTS_BUCKET: bucket() }, { id: 'report-id' },
    );
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('tenant-scopes soft archive updates', async () => {
    mocks.user = { id: 'director-a', role: 'director', tenant_id: 'tenant-a' };
    const db = createDb(({ sql, method }) => {
      if (method === 'run' && sql.includes('UPDATE resident_uk_reports')) {
        return { success: true, meta: { changes: 1 } };
      }
      if (method === 'first') return { id: 'report-id', is_active: 0 };
      return null;
    });
    const request = new Request('https://api.kamizo.uz/api/admin/uk-reports/report-id', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_active: false }),
    });
    const response = await handler('PATCH', '/api/admin/uk-reports/:id')(request, { DB: db }, { id: 'report-id' });
    expect(response.status).toBe(200);
    const update = db.calls.find(call => call.sql.includes('UPDATE resident_uk_reports'));
    expect(update?.sql).toContain('WHERE id = ? AND tenant_id = ?');
    expect(update?.params).toEqual([0, 'report-id', 'tenant-a']);
  });
});

describe('UK works preview', () => {
  beforeEach(() => {
    mocks.user = { id: 'manager-a', role: 'manager', tenant_id: 'tenant-a' };
  });

  it('requires authentication before SQL', async () => {
    mocks.user = null;
    const db = createDb();
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(
      get('/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-01-01&date_to=2026-01-31'),
      { DB: db },
      {},
    );
    expect(response.status).toBe(401);
    expect(db.calls).toHaveLength(0);
  });

  it.each(['resident', 'executor', 'super_admin'])('denies %s before SQL', async (role) => {
    mocks.user = { id: 'user-a', role, tenant_id: role === 'super_admin' ? undefined : 'tenant-a' };
    const db = createDb();
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(
      get('/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-01-01&date_to=2026-01-31'),
      { DB: db },
      {},
    );
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each(['admin', 'director', 'manager'])('allows %s', async (role) => {
    mocks.user = { id: 'staff-a', role, tenant_id: 'tenant-a' };
    const db = createDb(({ sql }) => {
      if (sql.includes('FROM buildings')) return { id: 'building-a', name: 'A', address: 'Street 1' };
      if (sql.includes('SELECT\n        (SELECT COUNT(*)')) {
        return { requests_received: 0, requests_completed: 0, requests_cancelled: 0, work_orders_completed: 0 };
      }
      return [];
    });
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(
      get('/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-01-01&date_to=2026-01-31'),
      { DB: db },
      {},
    );
    expect(response.status).toBe(200);
  });

  it('rejects a mismatched request and JWT tenant before SQL', async () => {
    mocks.tenantId = 'tenant-b';
    const db = createDb();
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(
      get('/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-01-01&date_to=2026-01-31'),
      { DB: db },
      {},
    );
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    ['/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-02-29&date_to=2026-03-01', 'invalid calendar date'],
    ['/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-02-01&date_to=2026-01-31', 'reversed range'],
    ['/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2025-01-01&date_to=2026-01-02', 'more than 366 days'],
    ['/api/admin/uk-reports/works-preview?date_from=2026-01-01&date_to=2026-01-31', 'missing building'],
  ])('rejects %s (%s) before SQL', async (path) => {
    const db = createDb();
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(get(path), { DB: db }, {});
    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects a building outside the authenticated tenant', async () => {
    const db = createDb(() => null);
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(
      get('/api/admin/uk-reports/works-preview?building_id=building-b&date_from=2026-01-01&date_to=2026-01-31'),
      { DB: db },
      {},
    );
    expect(response.status).toBe(404);
    expect(db.calls).toHaveLength(1);
    expect(db.calls[0].sql).toContain('WHERE id = ? AND tenant_id = ?');
    expect(db.calls[0].params).toEqual(['building-b', 'tenant-a']);
  });

  it('scopes every data query and returns only report-safe fields', async () => {
    const db = createDb(({ sql }) => {
      if (sql.includes('FROM buildings')) return { id: 'building-a', name: 'House A', address: 'Street 1' };
      if (sql.includes('(SELECT COUNT(*) FROM requests')) {
        return { requests_received: 4, requests_completed: 2, requests_cancelled: 1, work_orders_completed: 1 };
      }
      if (sql.includes('FROM requests')) {
        return [{ id: 'request-1', number: 'R-1', title: 'Repair', category_id: 'cat-1', priority: 'high', completed_at: '2026-01-10 10:00:00' }];
      }
      if (sql.includes('FROM work_orders')) {
        return [{ id: 'work-1', number: 'W-1', title: 'Inspection', type: 'maintenance', priority: 'normal', completed_at: '2026-01-11 11:00:00' }];
      }
      return null;
    });
    const response = await handler('GET', '/api/admin/uk-reports/works-preview')(
      get('/api/admin/uk-reports/works-preview?building_id=building-a&date_from=2026-01-01&date_to=2026-01-31&tenant_id=tenant-b'),
      { DB: db },
      {},
    );
    expect(response.status).toBe(200);

    const dataCalls = db.calls.filter(call => /FROM (requests|work_orders)/.test(call.sql));
    expect(dataCalls).toHaveLength(3);
    for (const call of dataCalls) {
      expect(call.sql).toContain('tenant_id = ?');
      expect(call.sql).toContain('building_id = ?');
      expect(call.sql).not.toMatch(/resident_id|user_id|apartment_id|phone|email/);
      expect(call.params).not.toContain('tenant-b');
    }
    expect(dataCalls[1].params).toEqual(['tenant-a', 'building-a', '2026-01-01', '2026-02-01']);
    expect(dataCalls[2].params).toEqual(['tenant-a', 'building-a', '2026-01-01', '2026-02-01']);
    expect(dataCalls[1].sql).toContain('LIMIT 500');
    expect(dataCalls[2].sql).toContain('request_id IS NULL');
    expect(dataCalls[2].sql).toContain('LIMIT 500');

    const body = await response.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      building: { id: 'building-a', name: 'House A', address: 'Street 1' },
      period_from: '2026-01-01',
      date_to: '2026-01-31',
      summary: { requests_received: 4, requests_completed: 2, requests_cancelled: 1, work_orders_completed: 1 },
      completed_requests: [{ id: 'request-1', number: 'R-1', title: 'Repair', category_id: 'cat-1', priority: 'high', completed_at: '2026-01-10 10:00:00' }],
      completed_work_orders: [{ id: 'work-1', number: 'W-1', title: 'Inspection', type: 'maintenance', priority: 'normal', completed_at: '2026-01-11 11:00:00' }],
    });
    expect(body.generated_at).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toMatch(/resident_id|user_id|apartment_id|phone|email/);
  });
});

describe('UK report upload validation', () => {
  beforeEach(() => {
    mocks.user = { id: 'manager-a', role: 'manager', tenant_id: 'tenant-a' };
  });

  it.each([
    ['invalid type', { report_type: 'private', title: 'Report', period_label: '2026' }, 'application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), 400],
    ['missing title', { report_type: 'financial', title: '', period_label: '2026' }, 'application/pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]), 400],
    ['wrong MIME', { report_type: 'financial', title: 'Report', period_label: '2026' }, 'text/plain', new Uint8Array([0x25, 0x50, 0x44, 0x46]), 415],
    ['wrong magic', { report_type: 'financial', title: 'Report', period_label: '2026' }, 'application/pdf', new Uint8Array([1, 2, 3, 4]), 415],
  ])('rejects %s', async (_name, fields, type, bytes, status) => {
    const db = createDb();
    const storage = bucket();
    const request = multipart(fields, { type, size: bytes.byteLength, name: 'report.pdf', bytes });
    const response = await handler('POST', '/api/admin/uk-reports')(request, { DB: db, CONTRACTS_BUCKET: storage }, {});
    expect(response.status).toBe(status);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('rejects an oversized PDF before buffering it', async () => {
    const db = createDb();
    const storage = bucket();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const request = multipart(
      { report_type: 'financial', title: 'Report', period_label: '2026' },
      { type: 'application/pdf', size: 15 * 1024 * 1024 + 1, name: 'report.pdf', bytes },
    );
    const response = await handler('POST', '/api/admin/uk-reports')(request, { DB: db, CONTRACTS_BUCKET: storage }, {});
    expect(response.status).toBe(413);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('requires the selected building to belong to the exact tenant', async () => {
    const db = createDb(() => null);
    const storage = bucket();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const request = multipart(
      { report_type: 'financial', title: 'Report', period_label: '2026', building_id: 'building-b' },
      { type: 'application/pdf', size: bytes.byteLength, name: 'report.pdf', bytes },
    );
    const response = await handler('POST', '/api/admin/uk-reports')(request, { DB: db, CONTRACTS_BUCKET: storage }, {});
    expect(response.status).toBe(404);
    expect(db.calls[0].params).toEqual(['building-b', 'tenant-a']);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('stores and inserts a valid PDF only in the authenticated tenant namespace', async () => {
    const db = createDb(({ sql, method }) => {
      if (method === 'first' && sql.includes('FROM buildings')) return { id: 'building-a' };
      if (method === 'first' && sql.includes('FROM resident_uk_reports')) return { id: 'report-id' };
      return null;
    });
    const storage = bucket();
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 1]);
    const request = multipart(
      { report_type: 'financial', title: 'Annual report', period_label: '2026', building_id: 'building-a' },
      { type: 'application/pdf', size: bytes.byteLength, name: '../annual.pdf', bytes },
    );
    const response = await handler('POST', '/api/admin/uk-reports')(request, { DB: db, CONTRACTS_BUCKET: storage }, {});
    expect(response.status).toBe(201);
    expect(storage.put).toHaveBeenCalledWith(
      'tenants/tenant-a/resident-reports/report-id.pdf',
      expect.any(Uint8Array),
      { httpMetadata: { contentType: 'application/pdf' } },
    );
    const insert = db.calls.find(call => call.sql.includes('INSERT INTO resident_uk_reports'));
    expect(insert?.params.slice(0, 5)).toEqual(['report-id', 'tenant-a', 'building-a', 'financial', 'Annual report']);
    expect(insert?.params.at(-1)).toBe('manager-a');
  });
});
