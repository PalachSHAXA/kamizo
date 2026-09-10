// PR-9 (feat/smeta-write-endpoints): тесты новых write-эндпоинтов.
//
// 1. PUT /:id/expenses: category_id теперь записывается в INSERT.
// 2. POST /:id/revenue-sources: happy path + tenant isolation + валидация.
// 3. PUT /:id/revenue-sources/:sourceId: partial update + 404 если не найдено.
// 4. DELETE /:id/revenue-sources/:sourceId: happy path + 404.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertInsertParity } from '../../utils/__tests__/sql-parity';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;
type Method = 'first' | 'all' | 'run';
type DbCall = { sql: string; params: unknown[]; method: Method };

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, Handler>(),
  user: { id: 'admin-1', role: 'admin' } as any,
  tenantId: 'tenant-1' as string | null,
  ids: [] as string[],
}));

vi.mock('../../router', () => ({
  route: (method: string, path: string, handler: Handler) => mocks.handlers.set(`${method} ${path}`, handler),
}));
vi.mock('../../middleware/auth', () => ({ getUser: vi.fn(async () => mocks.user) }));
vi.mock('../../middleware/tenant', () => ({
  getTenantId: vi.fn(() => mocks.tenantId),
  requireFeature: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('../../utils/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/helpers')>();
  return { ...actual, generateId: vi.fn(() => mocks.ids.shift() || 'generated-id') };
});

import { registerFinanceV2Routes } from '../finance-v2';
import { registerFinanceRevenueSourcesRoutes } from '../finance-revenue-sources';

function createDb(resolve: (call: DbCall) => unknown = () => null) {
  const calls: DbCall[] = [];
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const execute = async (method: Method) => {
      const call = { sql, params, method };
      calls.push(call);
      const result = resolve(call);
      if (method === 'all') return { results: result ?? [] };
      if (method === 'run') return result ?? { success: true, meta: { changes: 1 } };
      return result ?? null;
    };
    return {
      bind: (...args: unknown[]) => { params = args; return { first: () => execute('first'), all: () => execute('all'), run: () => execute('run') }; },
      first: () => execute('first'),
      all: () => execute('all'),
      run: () => execute('run'),
    };
  };
  return { db: { prepare }, calls };
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'admin-1', role: 'admin' };
  mocks.tenantId = 'tenant-1';
  mocks.ids = [];
  registerFinanceV2Routes();
  registerFinanceRevenueSourcesRoutes();
});

function req(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ────────────────────────────────────────────────────────────
// PR-2 fix: category_id round-trip в PUT /:id/expenses
// ────────────────────────────────────────────────────────────

describe('PUT /:id/expenses — category_id round-trip', () => {
  it('category_id из body попадает в INSERT-параметры', async () => {
    mocks.ids = ['item-abc'];
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      return null;
    });
    const handler = mocks.handlers.get('PUT /api/finance/estimates/:id/expenses')!;
    const res = await handler(
      req('PUT', '/api/finance/estimates/est-1/expenses', {
        items: [
          { name: 'Уборка МОП', monthly: 500_000, category_id: 'cat-cleaning' },
        ],
      }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(200);

    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO finance_estimate_items'))!;
    expect(insert).toBeDefined();
    // Position 4 in bind() is category_id (после id/estimate_id/name); проверим наличие 'cat-cleaning' в параметрах
    expect(insert.params).toContain('cat-cleaning');
    // Legacy текстовое поле category продолжает жить (hard-coded 'maintenance' в SQL — не в params)
    expect(insert.sql).toContain("category,");
    expect(insert.sql).toContain('category_id,');
    // РЕГРЕСС hotfix 5165ca25: SQL-parity — columns == placeholders + literals,
    // и placeholders == bind params. До hotfix'а SQL имел 22 values для 21
    // колонки; unit-тест этого не ловил, SQLite ронял в проде.
    assertInsertParity(insert.sql, insert.params);
  });

  it('items без category_id → NULL в БД (не падает)', async () => {
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      return null;
    });
    const handler = mocks.handlers.get('PUT /api/finance/estimates/:id/expenses')!;
    const res = await handler(
      req('PUT', '/api/finance/estimates/est-1/expenses', {
        items: [{ name: 'Прочее', monthly: 100_000 }],
      }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(200);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO finance_estimate_items'))!;
    // category_id должен передаться как null
    expect(insert.params).toContain(null);
    // Regression на hotfix 5165ca25 — parity должна держаться
    assertInsertParity(insert.sql, insert.params);
  });
});

// ────────────────────────────────────────────────────────────
// PR-5: revenue_sources CRUD
// ────────────────────────────────────────────────────────────

describe('POST /:id/revenue-sources — создание', () => {
  it('happy path: 201 + возвращает созданную запись', async () => {
    mocks.ids = ['rs-1'];
    const created = { id: 'rs-1', estimate_id: 'est-1', source_type: 'parking', amount: 2_000_000 };
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      if (c.sql.startsWith('SELECT * FROM revenue_sources')) return created;
      return null;
    });
    const handler = mocks.handlers.get('POST /api/finance/estimates/:id/revenue-sources')!;
    const res = await handler(
      req('POST', '/api/finance/estimates/est-1/revenue-sources', {
        source_type: 'parking',
        description: 'Подземный паркинг 40 мест',
        amount: 2_000_000,
        contract_ref: '№П-2026-15',
        legal_classification: true,
      }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.revenue_source).toEqual(created);
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO revenue_sources'))!;
    expect(insert.params).toContain('parking');
    expect(insert.params).toContain(2_000_000);
    expect(insert.params).toContain(1); // legal_classification=true → 1
    assertInsertParity(insert.sql, insert.params);
  });

  it('невалидный source_type → 400', async () => {
    const { db } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      return null;
    });
    const handler = mocks.handlers.get('POST /api/finance/estimates/:id/revenue-sources')!;
    const res = await handler(
      req('POST', '/api/finance/estimates/est-1/revenue-sources', {
        source_type: 'illegal-type',
        amount: 100,
      }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error).toMatch(/Invalid source_type/);
  });

  it('amount отрицательный → 400', async () => {
    const { db } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      return null;
    });
    const handler = mocks.handlers.get('POST /api/finance/estimates/:id/revenue-sources')!;
    const res = await handler(
      req('POST', '/api/finance/estimates/est-1/revenue-sources', { source_type: 'commercial', amount: -5 }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(400);
  });

  it('tenant isolation: смета не найдена в текущем tenant → 404', async () => {
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return null; // не нашли — чужой tenant
      return null;
    });
    const handler = mocks.handlers.get('POST /api/finance/estimates/:id/revenue-sources')!;
    const res = await handler(
      req('POST', '/api/finance/estimates/foreign-est/revenue-sources', {
        source_type: 'commercial', amount: 100_000,
      }),
      { DB: db },
      { id: 'foreign-est' }
    );
    expect(res.status).toBe(404);
    // Убедимся что SELECT был с фильтром tenant_id
    const sel = calls.find((c) => c.sql.startsWith('SELECT id, status'))!;
    expect(sel.sql).toContain('AND tenant_id = ?');
    expect(sel.params).toContain('tenant-1');
    // INSERT не должен был выполниться
    expect(calls.find((c) => c.sql.startsWith('INSERT INTO revenue_sources'))).toBeUndefined();
  });

  it('редактирование заблокировано (approval_status=pending) → 409', async () => {
    const { db } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'pending', scope_level: 'building' };
      return null;
    });
    const handler = mocks.handlers.get('POST /api/finance/estimates/:id/revenue-sources')!;
    const res = await handler(
      req('POST', '/api/finance/estimates/est-1/revenue-sources', { source_type: 'commercial', amount: 100 }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(409);
  });

  it('нет прав редактировать смету → 403', async () => {
    mocks.user = { id: 'resident-1', role: 'resident' };
    const { db } = createDb();
    const handler = mocks.handlers.get('POST /api/finance/estimates/:id/revenue-sources')!;
    const res = await handler(
      req('POST', '/api/finance/estimates/est-1/revenue-sources', { source_type: 'commercial', amount: 100 }),
      { DB: db },
      { id: 'est-1' }
    );
    expect(res.status).toBe(403);
  });
});

describe('PUT /:id/revenue-sources/:sourceId — обновление', () => {
  it('partial update: меняем только amount, остальные поля остаются', async () => {
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      if (c.sql.includes('FROM revenue_sources') && c.sql.includes('AND estimate_id')) return { id: 'rs-1' };
      if (c.sql === 'SELECT * FROM revenue_sources WHERE id = ?') return { id: 'rs-1', amount: 3_000_000 };
      return null;
    });
    const handler = mocks.handlers.get('PUT /api/finance/estimates/:id/revenue-sources/:sourceId')!;
    const res = await handler(
      req('PUT', '/api/finance/estimates/est-1/revenue-sources/rs-1', { amount: 3_000_000 }),
      { DB: db },
      { id: 'est-1', sourceId: 'rs-1' }
    );
    expect(res.status).toBe(200);
    const update = calls.find((c) => c.sql.startsWith('UPDATE revenue_sources'))!;
    expect(update.sql).toContain('amount = ?');
    expect(update.sql).not.toContain('source_type = ?'); // не трогали
    expect(update.params[0]).toBe(3_000_000);
  });

  it('невалидный source_type в update → 400', async () => {
    const { db } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      if (c.sql.includes('FROM revenue_sources') && c.sql.includes('AND estimate_id')) return { id: 'rs-1' };
      return null;
    });
    const handler = mocks.handlers.get('PUT /api/finance/estimates/:id/revenue-sources/:sourceId')!;
    const res = await handler(
      req('PUT', '/api/finance/estimates/est-1/revenue-sources/rs-1', { source_type: 'unknown' }),
      { DB: db },
      { id: 'est-1', sourceId: 'rs-1' }
    );
    expect(res.status).toBe(400);
  });

  it('revenue_source чужой (другая смета/тенант) → 404', async () => {
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      if (c.sql.includes('FROM revenue_sources') && c.sql.includes('AND estimate_id')) return null;
      return null;
    });
    const handler = mocks.handlers.get('PUT /api/finance/estimates/:id/revenue-sources/:sourceId')!;
    const res = await handler(
      req('PUT', '/api/finance/estimates/est-1/revenue-sources/foreign-rs', { amount: 100 }),
      { DB: db },
      { id: 'est-1', sourceId: 'foreign-rs' }
    );
    expect(res.status).toBe(404);
    const sel = calls.find((c) => c.sql.includes('FROM revenue_sources') && c.sql.includes('AND estimate_id'))!;
    expect(sel.sql).toContain('AND tenant_id = ?');
    expect(calls.find((c) => c.sql.startsWith('UPDATE revenue_sources'))).toBeUndefined();
  });
});

describe('DELETE /:id/revenue-sources/:sourceId — удаление', () => {
  it('happy path: 200 + DELETE выполняется', async () => {
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      if (c.sql.includes('FROM revenue_sources') && c.sql.includes('AND estimate_id')) return { id: 'rs-1' };
      return null;
    });
    const handler = mocks.handlers.get('DELETE /api/finance/estimates/:id/revenue-sources/:sourceId')!;
    const res = await handler(
      req('DELETE', '/api/finance/estimates/est-1/revenue-sources/rs-1'),
      { DB: db },
      { id: 'est-1', sourceId: 'rs-1' }
    );
    expect(res.status).toBe(200);
    const del = calls.find((c) => c.sql.startsWith('DELETE FROM revenue_sources'))!;
    expect(del.params).toContain('rs-1');
  });

  it('404 если не найден — DELETE не выполняется', async () => {
    const { db, calls } = createDb((c) => {
      if (c.sql.startsWith('SELECT id, status')) return { id: 'est-1', status: 'draft', approval_status: 'draft', scope_level: 'building' };
      if (c.sql.includes('FROM revenue_sources')) return null;
      return null;
    });
    const handler = mocks.handlers.get('DELETE /api/finance/estimates/:id/revenue-sources/:sourceId')!;
    const res = await handler(
      req('DELETE', '/api/finance/estimates/est-1/revenue-sources/rs-x'),
      { DB: db },
      { id: 'est-1', sourceId: 'rs-x' }
    );
    expect(res.status).toBe(404);
    expect(calls.find((c) => c.sql.startsWith('DELETE FROM revenue_sources'))).toBeUndefined();
  });
});
