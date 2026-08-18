import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error Tests run in Node, while the Worker tsconfig intentionally omits Node types.
import { execFileSync } from 'node:child_process';

type Handler = (request: Request, env: any, params: Record<string, string>) => Promise<Response>;
type Method = 'first' | 'all' | 'run';
type DbCall = { sql: string; params: unknown[]; method: Method };
type BatchCall = { sql: string; params: unknown[] };

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
vi.mock('../notifications', () => ({ sendPushNotification: vi.fn(async () => undefined) }));
vi.mock('../../utils/helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/helpers')>();
  return { ...actual, generateId: vi.fn(() => mocks.ids.shift() || 'generated-id') };
});

import { registerFinanceRoutes } from '../finance';
import { loadEstimateInput, registerFinanceV2Routes } from '../finance-v2';
import {
  allocationBindings,
  allocationRecomputeSql,
  affectedAllocationBindings,
  affectedAllocationSql,
  derivePaymentId,
  enterpriseIncomeId,
  financeChargeId,
  normalizeBreakdown,
} from '../../lib/finance/accounting';

function createDb(
  resolve: (call: DbCall) => unknown = () => null,
  batchResolve: (calls: BatchCall[]) => unknown[] = calls => calls.map(() => ({ success: true, meta: { changes: 1 } })),
) {
  const calls: DbCall[] = [];
  const batches: BatchCall[][] = [];
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
      sql,
      get params() { return params; },
      bind(...values: unknown[]) { params = values; return this; },
      first: () => execute('first'),
      all: () => execute('all'),
      run: () => execute('run'),
    };
  };
  return {
    calls,
    batches,
    prepare,
    async batch(statements: Array<ReturnType<typeof prepare>>) {
      const batch = statements.map(statement => ({ sql: statement.sql, params: statement.params }));
      batches.push(batch);
      return batchResolve(batch);
    },
  };
}

function handler(method: string, path: string): Handler {
  const value = mocks.handlers.get(`${method} ${path}`);
  if (!value) throw new Error(`Missing route ${method} ${path}`);
  return value;
}

function request(path: string, body?: unknown, method = 'POST', headers: Record<string, string> = {}) {
  return new Request(`https://api.kamizo.uz${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function paymentRequest(bodyValue: unknown, key = 'payment-key-001') {
  return request('/api/finance/payments', bodyValue, 'POST', { 'Idempotency-Key': key });
}

async function body(response: Response) {
  return await response.json() as Record<string, any>;
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'admin-1', role: 'admin' };
  mocks.tenantId = 'tenant-1';
  mocks.ids = ['payment-id'];
});

describe('POST /api/finance/payments', () => {
  it('requires a safe idempotency key before SQL', async () => {
    registerFinanceRoutes();
    const db = createDb(() => { throw new Error('SQL must not run'); });
    const missing = await handler('POST', '/api/finance/payments')(
      request('/api/finance/payments', { apartment_id: 'apt-1', amount: 1 }), { DB: db }, {},
    );
    const unsafe = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 1 }, 'bad key!'), { DB: db }, {},
    );
    expect(missing.status).toBe(400);
    expect(unsafe.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it.each([null, '__no_tenant__'])('fails closed without a tenant (%s)', async tenantId => {
    registerFinanceRoutes();
    mocks.tenantId = tenantId;
    const db = createDb(() => { throw new Error('SQL must not run'); });

    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 100, payment_type: 'cash' }),
      { DB: db }, {},
    );

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    [null, 'plain object'],
    [[], 'plain object'],
    [{ apartment_id: 'apt-1', amount: 1, payment_type: 'cash', extra: true }, 'unexpected'],
    [{ apartment_id: 42, amount: 1, payment_type: 'cash' }, 'apartment'],
    [{ apartment_id: 'apt-1', amount: '1', payment_type: 'cash' }, 'amount'],
    [{ apartment_id: 'apt-1', amount: Number.POSITIVE_INFINITY, payment_type: 'cash' }, 'amount'],
    [{ apartment_id: 'apt-1', amount: 0.001, payment_type: 'cash' }, 'decimal'],
    [{ apartment_id: 'apt-1', amount: 100_000_001, payment_type: 'cash' }, '100 000 000'],
    [{ apartment_id: 'apt-1', amount: 1, payment_type: 'overpayment' }, 'payment_type'],
    [{ apartment_id: 'apt-1', amount: 1, payment_type: 'cash', receipt_number: 'x'.repeat(129) }, 'receipt'],
    [{ apartment_id: 'apt-1', amount: 1, payment_type: 'cash', description: 'x'.repeat(1001) }, 'description'],
  ])('rejects malformed payment body %#', async (payload, message) => {
    registerFinanceRoutes();
    const db = createDb(() => { throw new Error('SQL must not run'); });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest(payload), { DB: db }, {},
    );

    expect(response.status).toBe(400);
    expect((await body(response)).error).toMatch(new RegExp(String(message), 'i'));
    expect(db.calls).toHaveLength(0);
  });

  it('stores one real receipt and recomputes FIFO allocation from transaction-visible aggregates', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 100, total_received: 150 };
      return null;
    });

    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({
        apartment_id: 'apt-1', amount: 150, payment_type: 'transfer', description: 'Bank',
      }), { DB: db }, {},
    );
    const result = await body(response);

    expect(response.status).toBe(201);
    expect(result.payment.remaining_overpay).toBe(50);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(2);
    const [insert, recompute] = db.batches[0];
    expect(insert.sql).toContain('INSERT INTO finance_payments');
    expect(insert.params).toEqual([
      'fp:4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b', null, 'apt-1', 150, 'transfer',
      'FIN-4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b', 'Bank', 'admin-1', 'tenant-1',
      'tenant-1', 'FIN-4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
    ]);
    expect(recompute.sql).toMatch(/UPDATE finance_charges/i);
    expect(recompute.sql).toMatch(/SUM\(.*finance_payments|FROM finance_payments/is);
    expect(recompute.sql).toMatch(/ORDER BY[^)]*period[^)]*created_at[^)]*id/is);
    expect(recompute.sql).toContain("payment_type != 'overpayment'");
    expect(recompute.sql).toMatch(/tenant_id = \?/g);
    expect(recompute.sql).toMatch(/apartment_id = \?/g);
    expect(recompute.params).toContain('tenant-1');
    expect(recompute.params).toContain('apt-1');
    expect(db.calls.some(call => call.sql.includes('paid_amount FROM finance_charges'))).toBe(false);
  });

  it('synchronizes the paid apartment account after recording and allocating a receipt', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 100, total_received: 40 };
      if (method === 'run' && sql.includes('UPDATE personal_accounts')) return { success: true, meta: { changes: 1 } };
      return null;
    });

    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 40 }), { DB: db }, {},
    );

    expect(response.status).toBe(201);
    const sync = db.calls.find(call => call.method === 'run' && call.sql.includes('UPDATE personal_accounts'))!;
    expect(sync.sql).toContain('SUM(c.amount)');
    expect(sync.sql).toContain("p.payment_type != 'overpayment'");
    expect(sync.sql).toContain('c.tenant_id = pa.tenant_id');
    expect(sync.sql).toContain('p.tenant_id = pa.tenant_id');
    expect(sync.sql).toMatch(/pa\.apartment_id\s*=\s*\?/);
    expect(sync.params).toEqual(['tenant-1', 'apt-1']);
  });

  it('returns an existing same-payload payment as an idempotent replay', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('SELECT id, apartment_id')) return {
        id: 'fp:existing', apartment_id: 'apt-1', amount: 10, payment_type: 'card',
        receipt_number: 'receipt-1', description: '', tenant_id: 'tenant-1',
      };
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 10, total_received: 10 };
      return null;
    });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10, payment_type: 'card', receipt_number: 'receipt-1', description: '' }),
      { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect(db.batches).toHaveLength(0);
  });

  it('repairs personal-account synchronization on replay without recording a second receipt', async () => {
    registerFinanceRoutes();
    let committed = false;
    let syncAttempts = 0;
    const existing = {
      id: 'fp:4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
      apartment_id: 'apt-1', amount: 10, payment_type: 'cash',
      receipt_number: 'FIN-4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
      description: null, tenant_id: 'tenant-1',
    };
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('SELECT id, apartment_id')) return committed ? existing : null;
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 10, total_received: 10 };
      if (method === 'run' && sql.includes('UPDATE personal_accounts')) {
        syncAttempts++;
        if (syncAttempts === 1) throw new Error('temporary personal-account sync failure');
        return { success: true, meta: { changes: 1 } };
      }
      return null;
    }, calls => {
      committed = true;
      return calls.map(() => ({ success: true, meta: { changes: 1 } }));
    });

    await expect(handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10, payment_type: 'cash' }), { DB: db }, {},
    )).rejects.toThrow('temporary personal-account sync failure');

    const replay = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10, payment_type: 'cash' }), { DB: db }, {},
    );

    expect(replay.status).toBe(200);
    expect(syncAttempts).toBe(2);
    expect(db.batches).toHaveLength(1);
  });

  it('rejects an idempotency key replay with a different payload', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('SELECT id, apartment_id')) return {
        id: 'fp:existing', apartment_id: 'apt-1', amount: 10, payment_type: 'cash',
        receipt_number: 'receipt-1', description: null, tenant_id: 'tenant-1',
      };
      return null;
    });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 11, payment_type: 'cash', receipt_number: 'receipt-1' }),
      { DB: db }, {},
    );
    expect(response.status).toBe(409);
    expect(db.batches).toHaveLength(0);
  });

  it('re-reads a concurrent insert conflict and returns the matching payment', async () => {
    registerFinanceRoutes();
    let paymentReads = 0;
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('SELECT id, apartment_id')) {
        paymentReads++;
        return paymentReads === 1 ? null : {
          id: 'fp:4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
          apartment_id: 'apt-1', amount: 10, payment_type: 'cash',
          receipt_number: 'FIN-4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
          description: null, tenant_id: 'tenant-1',
        };
      }
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 10, total_received: 10 };
      return null;
    }, () => { throw new Error('UNIQUE constraint failed: finance_payments.id'); });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10, payment_type: 'cash' }), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect(paymentReads).toBe(2);
  });

  it('keeps unexpected database errors as generic 500 responses', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('FROM apartments') ? { id: 'apt-1' } : null,
      () => { throw new Error('disk I/O error'); });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10 }), { DB: db }, {},
    );
    expect(response.status).toBe(500);
    expect((await body(response)).error).not.toMatch(/conflict|receipt/i);
  });

  it('requires both insert and allocation batch results to succeed', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('FROM apartments') ? { id: 'apt-1' } : null,
      () => [{ success: true, meta: { changes: 1 } }, { success: false, meta: { changes: 0 } }]);
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10 }), { DB: db }, {},
    );
    expect(response.status).toBe(500);
  });

  it('rejects reuse of the same tenant idempotency key for another apartment', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-2' };
      if (method === 'first' && sql.includes('SELECT id, apartment_id')) return {
        id: 'fp:4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
        apartment_id: 'apt-1', amount: 10, payment_type: 'cash',
        receipt_number: 'FIN-4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
        description: null, tenant_id: 'tenant-1',
      };
      return null;
    });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-2', amount: 10 }), { DB: db }, {},
    );
    expect(response.status).toBe(409);
    const keyLookup = db.calls.find(call => call.sql.includes('SELECT id, apartment_id'))!;
    expect(keyLookup.params[0]).toBe('fp:4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b');
    expect(db.batches).toHaveLength(0);
  });

  it('uses an atomic tenant-scoped receipt guard for custom receipts', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 10, total_received: 10 };
      return null;
    });
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10, receipt_number: ' custom-001 ' }), { DB: db }, {},
    );
    expect(response.status).toBe(201);
    const insert = db.batches[0][0];
    expect(insert.sql).toMatch(/INSERT INTO finance_payments[\s\S]*SELECT[\s\S]*WHERE NOT EXISTS/i);
    expect(insert.sql).toMatch(/tenant_id = \? AND receipt_number = \?/i);
    expect(insert.params).toContain('custom-001');
  });

  it('returns 409 when another key concurrently claims the same tenant receipt', async () => {
    registerFinanceRoutes();
    let keyReads = 0;
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM apartments')) return { id: 'apt-1' };
      if (method === 'first' && sql.includes('WHERE id = ?')) { keyReads++; return null; }
      if (method === 'first' && sql.includes('WHERE tenant_id = ? AND receipt_number = ?')) return {
        id: 'fp:other', apartment_id: 'apt-9', amount: 10, payment_type: 'cash',
        receipt_number: 'shared-001', description: null, tenant_id: 'tenant-1',
      };
      return null;
    }, () => [{ success: true, meta: { changes: 0 } }, { success: true, meta: { changes: 1 } }]);
    const response = await handler('POST', '/api/finance/payments')(
      paymentRequest({ apartment_id: 'apt-1', amount: 10, receipt_number: 'shared-001' }, 'payment-key-002'),
      { DB: db }, {},
    );
    expect(response.status).toBe(409);
    expect(keyReads).toBeGreaterThanOrEqual(2);
  });
});

describe('deterministic finance identities', () => {
  it('derives a stable SHA-256 payment ID from tenant and key only', async () => {
    await expect(derivePaymentId('tenant-1', 'payment-key-001')).resolves.toBe(
      'fp:4df927090bb221de14fd3f0b2f2000289171f219f898090e98756359a5cf111b',
    );
  });

  it('creates an unambiguous deterministic charge ID', () => {
    expect(financeChargeId('tenant-1', 'est-1', '2026-08', 'apt-1')).toBe('fc:tenant-1:est-1:2026-08:apt-1');
  });

  it('creates a deterministic enterprise income ID', () => {
    expect(enterpriseIncomeId('tenant-1', 'est-1', '2026-08')).toBe('fi:tenant-1:est-1:2026-08:profit');
  });
});

describe('receipt-derived reads', () => {
  it.each([null, '__no_tenant__'])('fails closed for finance reads without tenant context (%s)', async tenantId => {
    registerFinanceRoutes();
    mocks.tenantId = tenantId;
    const db = createDb(() => { throw new Error('SQL must not run'); });
    const cases: Array<[string, string, string, Record<string, string>]> = [
      ['GET', '/api/finance/charges', '/api/finance/charges', {}],
      ['GET', '/api/finance/charges/summary', '/api/finance/charges/summary?building_id=b-1', {}],
      ['GET', '/api/finance/payments', '/api/finance/payments', {}],
      ['GET', '/api/finance/apartments/:apartmentId/balance', '/api/finance/apartments/apt-1/balance', { apartmentId: 'apt-1' }],
    ];

    for (const [method, routePath, url, params] of cases) {
      const response = await handler(method, routePath)(request(url, undefined, method), { DB: db }, params);
      expect(response.status, routePath).toBe(403);
    }
    expect(db.calls).toHaveLength(0);
  });

  it.each(['resident', 'tenant', 'commercial_owner'])('scopes %s finance lists to owned apartments within the tenant', async role => {
    registerFinanceRoutes();
    mocks.user = { id: `${role}-1`, role };
    const db = createDb(({ method }) => method === 'first' ? { total: 0 } : []);

    await handler('GET', '/api/finance/charges')(
      request('/api/finance/charges?building_id=b-1', undefined, 'GET'), { DB: db }, {},
    );
    await handler('GET', '/api/finance/payments')(
      request('/api/finance/payments', undefined, 'GET'), { DB: db }, {},
    );

    const chargeCalls = db.calls.filter(call => call.sql.includes('FROM finance_charges c'));
    const chargeList = chargeCalls.find(call => call.method === 'all')!;
    expect(chargeList.sql).toMatch(/a\.tenant_id\s*=\s*c\.tenant_id/);
    expect(chargeList.sql).toMatch(/b\.tenant_id\s*=\s*a\.tenant_id/);
    for (const call of chargeCalls) {
      expect(call.sql).toMatch(/SELECT id FROM apartments WHERE[^)]*tenant_id\s*=\s*c\.tenant_id/is);
      expect(call.params).toContain(`${role}-1`);
    }

    const paymentCalls = db.calls.filter(call => call.sql.includes('FROM finance_payments p'));
    const paymentList = paymentCalls.find(call => call.method === 'all')!;
    expect(paymentList.sql).toMatch(/a\.tenant_id\s*=\s*p\.tenant_id/);
    for (const call of paymentCalls) {
      expect(call.sql).toMatch(/SELECT id FROM apartments WHERE[^)]*tenant_id\s*=\s*p\.tenant_id/is);
      expect(call.params).toContain(`${role}-1`);
    }
  });

  it('excludes legacy synthetic rows from payment count and list queries', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method }) => method === 'first' ? { total: 0 } : []);
    await handler('GET', '/api/finance/payments')(
      request('/api/finance/payments', undefined, 'GET'), { DB: db }, {},
    );
    const paymentQueries = db.calls.filter(call => call.sql.includes('finance_payments'));
    expect(paymentQueries).toHaveLength(2);
    for (const call of paymentQueries) expect(call.sql).toContain("p.payment_type != 'overpayment'");
  });

  it('builds building summary from charges versus real receipts', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => method === 'first' && sql.includes('total_charged')
      ? { total_charged: 100, total_paid: 150, total_debt: 0, total_overpaid: 50 }
      : null);
    const response = await handler('GET', '/api/finance/charges/summary')(
      request('/api/finance/charges/summary?building_id=b-1', undefined, 'GET'), { DB: db }, {},
    );
    const query = db.calls.find(call => call.sql.includes('total_charged'))!;
    expect(response.status).toBe(200);
    expect(query.sql).toContain('finance_payments');
    expect(query.sql).toContain("payment_type != 'overpayment'");
    expect(query.params).toContain('tenant-1');
    expect(query.sql).toMatch(/c\.tenant_id\s*=\s*sa\.tenant_id/);
    expect(query.sql).toMatch(/p\.tenant_id\s*=\s*sa\.tenant_id/);
  });

  it('returns apartment credit from lifetime real receipts', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 100, total_paid: 150 };
      if (method === 'all') return [];
      return null;
    });
    const response = await handler('GET', '/api/finance/apartments/:apartmentId/balance')(
      request('/api/finance/apartments/apt-1/balance', undefined, 'GET'), { DB: db }, { apartmentId: 'apt-1' },
    );
    const result = await body(response);
    const query = db.calls.find(call => call.sql.includes('total_charged'))!;
    expect(result.balance).toMatchObject({ total_charged: 100, total_paid: 150, debt: 0, overpaid: 50 });
    expect(query.sql).toContain('finance_payments');
    expect(query.sql).toContain("payment_type != 'overpayment'");
    expect(query.sql).toMatch(/tenant_id\s*=\s*\?/g);
    expect(query.params).toEqual(['apt-1', 'tenant-1', 'apt-1', 'tenant-1']);
  });

  it('computes my-charges lifetime totals independently of the 200-row display list', async () => {
    registerFinanceV2Routes();
    const displayed = Array.from({ length: 200 }, (_, i) => ({ id: `c-${i}`, amount: 1, paid_amount: 1 }));
    const db = createDb(({ method, sql }) => {
      if (method === 'all' && sql.includes('FROM apartments')) return [{ id: 'apt-1', number: '1' }];
      if (method === 'all' && sql.includes('FROM finance_charges c') && sql.includes('LIMIT 200')) return displayed;
      if (method === 'all' && sql.includes('FROM finance_penalties')) return [];
      if (method === 'first' && sql.includes('total_charged')) return { total_charged: 300, total_paid: 350 };
      return null;
    });
    const response = await handler('GET', '/api/finance/my-charges')(
      request('/api/finance/my-charges', undefined, 'GET'), { DB: db }, {},
    );
    const result = await body(response);
    expect(result.charges).toHaveLength(200);
    expect(result.balance).toMatchObject({ total_charged: 300, total_paid: 350, debt: 0, overpaid: 50 });
    const totalsQuery = db.calls.find(call => call.method === 'first' && call.sql.includes('total_charged'))!;
    expect(totalsQuery.sql).toContain('finance_payments');
    expect(totalsQuery.sql).toContain("payment_type != 'overpayment'");
  });

  it('syncs personal-account debt and credit from charges versus real receipts', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => method === 'run' && sql.includes('UPDATE personal_accounts')
      ? { success: true, meta: { changes: 2 } }
      : null);
    const response = await handler('POST', '/api/finance/sync-accounts')(
      request('/api/finance/sync-accounts?building_id=b-1'), { DB: db }, {},
    );
    const update = db.calls.find(call => call.sql.includes('UPDATE personal_accounts'))!;
    expect(response.status).toBe(200);
    expect(update.sql).toContain('SUM(c.amount)');
    expect(update.sql).not.toContain('SUM(c.amount) - SUM(c.paid_amount)');
    expect(update.sql).toContain("p.payment_type != 'overpayment'");
    expect(update.sql).toMatch(/balance\s*=\s*COALESCE\([\s\S]*SUM\(p.amount\)[\s\S]*SUM\(c.amount\)/);
    expect(update.sql).toMatch(/pa\.apartment_id IN\s*\([\s\S]*FROM apartments a[\s\S]*a\.building_id = \?/);
    expect(update.params).toEqual(['tenant-1', 'b-1']);
  });

  it('syncs only columns present in the verified production personal_accounts contract', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => method === 'run' && sql.includes('UPDATE personal_accounts')
      ? { success: true, meta: { changes: 1 } }
      : null);
    await handler('POST', '/api/finance/sync-accounts')(
      request('/api/finance/sync-accounts?building_id=b-1'), { DB: db }, {},
    );
    const update = db.calls.find(call => call.sql.includes('UPDATE personal_accounts'))!;
    expect(update.sql).not.toContain('current_debt');
    expect(update.sql).not.toContain('updated_at');
    expect(update.sql).toContain('last_payment_amount');
  });
});

describe('breakdown normalization', () => {
  it('appends a positive remainder when parsed items are below the charge', () => {
    expect(normalizeBreakdown({ items: [{ name: 'A', share: 60 }, { name: 'B', share: 39 }] }, 100)).toEqual([
      { name: 'A', amount: 60, legal_code: null },
      { name: 'B', amount: 39, legal_code: null },
      { name: 'Прочие услуги', amount: 1, legal_code: null },
    ]);
  });

  it('scales oversized items proportionally without producing negative amounts', () => {
    const result = normalizeBreakdown([{ name: 'A', amount: 80 }, { name: 'B', amount: 80 }], 100);
    expect(result).toEqual([
      { name: 'A', amount: 50, legal_code: null },
      { name: 'B', amount: 50, legal_code: null },
    ]);
    expect(result.every(item => item.amount >= 0)).toBe(true);
  });

  it('rounds deterministically to exact charge cents and ignores malformed huge values', () => {
    expect(normalizeBreakdown([{ name: 'A', amount: 1 }, { name: 'B', amount: 1 }, { name: 'C', amount: 1 }], 0.02))
      .toEqual([
        { name: 'A', amount: 0.01, legal_code: null },
        { name: 'B', amount: 0.01, legal_code: null },
        { name: 'C', amount: 0, legal_code: null },
      ]);
    expect(normalizeBreakdown({ items: [null, { share: Number.POSITIVE_INFINITY }, { share: Number.MAX_VALUE }] }, 12.34))
      .toEqual([{ name: 'Прочие услуги', amount: 12.34, legal_code: null }]);
  });

  it('rounds finite sub-cent breakdown values instead of discarding them', () => {
    expect(normalizeBreakdown([{ name: 'A', amount: 0.005 }, { name: 'B', amount: 0.005 }], 0.01)).toEqual([
      { name: 'A', amount: 0.01, legal_code: null },
      { name: 'B', amount: 0, legal_code: null },
    ]);
  });
});

describe('deterministic allocation SQL', () => {
  function executeAllocation(charges: Array<{ id: string; amount: number; period: string; created: string }>, receipts: number[]) {
    const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
    const bindings = allocationBindings('tenant-1', 'apt-1');
    let index = 0;
    const sql = allocationRecomputeSql().replace(/\?/g, () => quote(bindings[index++]));
    const setup = [
      'CREATE TABLE finance_charges (id TEXT, apartment_id TEXT, amount REAL, paid_amount REAL DEFAULT 0, status TEXT, period TEXT, created_at TEXT, tenant_id TEXT);',
      'CREATE TABLE finance_payments (id TEXT, apartment_id TEXT, amount REAL, payment_type TEXT, tenant_id TEXT);',
      ...charges.map(c => `INSERT INTO finance_charges VALUES (${quote(c.id)},'apt-1',${c.amount},0,'pending',${quote(c.period)},${quote(c.created)},'tenant-1');`),
      ...receipts.map((amount, i) => `INSERT INTO finance_payments VALUES ('p-${i}','apt-1',${amount},'cash','tenant-1');`),
      sql + ';',
      ".mode json",
      "SELECT id, paid_amount, status FROM finance_charges ORDER BY period, created_at, id;",
    ].join('\n');
    const output = execFileSync('sqlite3', [':memory:'], { input: setup, encoding: 'utf8' }).trim();
    return output ? JSON.parse(output) : [];
  }

  const charges = [
    { id: 'c-1', amount: 100, period: '2026-01', created: '2026-01-01' },
    { id: 'c-2', amount: 100, period: '2026-02', created: '2026-02-01' },
  ];

  it.each([
    ['partial', [150], [{ id: 'c-1', paid_amount: 100, status: 'paid' }, { id: 'c-2', paid_amount: 50, status: 'partial' }]],
    ['exact', [200], [{ id: 'c-1', paid_amount: 100, status: 'paid' }, { id: 'c-2', paid_amount: 100, status: 'paid' }]],
    ['overpay', [250], [{ id: 'c-1', paid_amount: 100, status: 'paid' }, { id: 'c-2', paid_amount: 100, status: 'paid' }]],
  ])('allocates %s receipts without exceeding charges', (_name, receipts, expected) => {
    expect(executeAllocation(charges, receipts as number[])).toEqual(expected);
  });

  it('keeps a no-charge receipt entirely as credit', () => {
    expect(executeAllocation([], [50])).toEqual([]);
  });

  it('uses period, created_at, and id as the complete FIFO order', () => {
    const samePeriod = [
      { id: 'c-b', amount: 40, period: '2026-01', created: '2026-01-01' },
      { id: 'c-a', amount: 40, period: '2026-01', created: '2026-01-01' },
      { id: 'c-old', amount: 40, period: '2025-12', created: '2026-02-01' },
    ];
    expect(executeAllocation(samePeriod, [60])).toEqual([
      { id: 'c-old', paid_amount: 40, status: 'paid' },
      { id: 'c-a', paid_amount: 20, status: 'partial' },
      { id: 'c-b', paid_amount: 0, status: 'pending' },
    ]);
  });

  it('applies current credit when a later charge is generated', () => {
    expect(executeAllocation([
      { id: 'new-charge', amount: 30, period: '2026-08', created: '2026-08-01' },
    ], [50])).toEqual([{ id: 'new-charge', paid_amount: 30, status: 'paid' }]);
  });

  it('allocates fractional values in integer cents without floating residue', () => {
    expect(executeAllocation([
      { id: 'c-1', amount: 0.1, period: '2026-01', created: '2026-01-01' },
      { id: 'c-2', amount: 0.7, period: '2026-02', created: '2026-02-01' },
    ], [0.1, 0.7])).toEqual([
      { id: 'c-1', paid_amount: 0.1, status: 'paid' },
      { id: 'c-2', paid_amount: 0.7, status: 'paid' },
    ]);
    expect(allocationRecomputeSql()).toMatch(/ROUND\([^)]*\*\s*100/i);
    expect(allocationRecomputeSql()).toMatch(/INTEGER/i);
  });

  it('builds an affected-apartment allocation strategy with explicit scope bindings', () => {
    const sql = affectedAllocationSql(2);
    expect(sql).toMatch(/PARTITION BY apartment_id/i);
    expect(sql).toMatch(/apartment_id IN \(\?,\?\)/i);
    expect(affectedAllocationBindings('tenant-1', ['apt-1', 'apt-2'])).toEqual([
      'tenant-1', 'apt-1', 'apt-2',
      'tenant-1', 'apt-1', 'apt-2',
      'tenant-1', 'apt-1', 'apt-2',
    ]);
  });

  it('executes conflict-specific duplicate insertion and affected allocation in sqlite', () => {
    const chargeId = 'fc:tenant-1:est-1:2026-08:apt-1';
    const bindings = affectedAllocationBindings('tenant-1', ['apt-1']);
    let bindingIndex = 0;
    const affectedSql = affectedAllocationSql(1).replace(/\?/g, () => `'${bindings[bindingIndex++]}'`);
    const script = [
      'CREATE TABLE finance_charges (id TEXT PRIMARY KEY, apartment_id TEXT, estimate_id TEXT, period TEXT, amount REAL, paid_amount REAL DEFAULT 0, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, tenant_id TEXT);',
      'CREATE TABLE finance_payments (id TEXT PRIMARY KEY, apartment_id TEXT, amount REAL, payment_type TEXT, tenant_id TEXT);',
      "INSERT INTO finance_payments VALUES ('p-1','apt-1',0.1,'cash','tenant-1');",
      "INSERT INTO finance_charges VALUES ('unaffected','apt-2','est-old','2026-01',7,3,'partial','2026-01-01','tenant-1');",
      'BEGIN;',
      `INSERT INTO finance_charges (id,apartment_id,estimate_id,period,amount,status,tenant_id) VALUES ('${chargeId}','apt-1','est-1','2026-08',0.1,'pending','tenant-1') ON CONFLICT(id) DO NOTHING;`,
      affectedSql + ';',
      'COMMIT;',
      'BEGIN;',
      `INSERT INTO finance_charges (id,apartment_id,estimate_id,period,amount,status,tenant_id) VALUES ('${chargeId}','apt-1','est-1','2026-08',0.1,'pending','tenant-1') ON CONFLICT(id) DO NOTHING;`,
      affectedSql + ';',
      'COMMIT;',
      '.mode json',
      "SELECT id, paid_amount, status FROM finance_charges ORDER BY id;",
    ].join('\n');
    const output = execFileSync('sqlite3', [':memory:'], { input: script, encoding: 'utf8' }).trim();
    expect(JSON.parse(output)).toEqual([
      { id: chargeId, paid_amount: 0.1, status: 'paid' },
      { id: 'unaffected', paid_amount: 3, status: 'partial' },
    ]);
  });
});

describe('charge generation allocation', () => {
  it.each([null, '__no_tenant__'])('fails closed before generating charges without a tenant (%s)', async tenantId => {
    registerFinanceRoutes();
    mocks.tenantId = tenantId;
    const db = createDb(() => { throw new Error('SQL must not run'); });
    const response = await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    );
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('uses deterministic ignored inserts and recomputes allocation inside the same batch', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM finance_estimates')) return {
        id: 'est-1', building_id: 'b-1', period: '2026-08', status: 'active', total_amount: 200,
        commercial_rate_per_sqm: 1, enterprise_profit_percent: 0,
      };
      if (method === 'all' && sql.includes('finance_estimate_items')) return [{ name: 'Service', amount: 200 }];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) return [
        { id: 'apt-1', total_area: 100 }, { id: 'apt-2', total_area: 100 },
      ];
      if (method === 'all' && sql.includes('SELECT apartment_id FROM finance_charges')) return [];
      if (method === 'all' && sql.includes('primary_owner_id')) return [];
      return null;
    });
    const response = await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect((await body(response)).generated).toBe(2);
    expect(db.batches).toHaveLength(1);
    expect(db.batches[0]).toHaveLength(3);
    const [first, second, allocation] = db.batches[0];
    expect(first.sql).toMatch(/INSERT INTO finance_charges[\s\S]*ON CONFLICT\(id\) DO NOTHING/i);
    expect(first.sql).not.toMatch(/INSERT OR IGNORE/i);
    expect(first.params[0]).toBe('fc:tenant-1:est-1:2026-08:apt-1');
    expect(second.params[0]).toBe('fc:tenant-1:est-1:2026-08:apt-2');
    expect(allocation.sql).toMatch(/apartment_id IN \(\?,\?\)/i);
    expect(allocation.params).toContain('apt-1');
    expect(allocation.params).toContain('apt-2');
  });

  it('bills every building in a complex estimate and synchronizes each scoped building', async () => {
    registerFinanceRoutes();
    const estimate = {
      id: 'est-complex', tenant_id: 'tenant-1', building_id: 'b-primary', period: '2026-08', status: 'active',
      scope_level: 'complex', model: 'TARIFF_MANUAL', tariff_approved: 2, uk_profit_percent: 0,
      payroll_tax_rate: 0.24, residential_area: 100,
    };
    const db = createDb(({ method, sql, params }) => {
      if (method === 'first' && sql.includes('FROM finance_estimates')) return estimate;
      if (method === 'first' && sql.includes('FROM buildings')) return { residential_area: 100 };
      if (method === 'all' && sql.includes('finance_estimate_staff')) return [];
      if (method === 'all' && sql.includes('finance_estimate_items')) return [
        { name: 'Common', amount: 2400, monthly_amount: 200, kind: 'expense', building_id: null },
        { name: 'Building 1', amount: 2400, monthly_amount: 200, kind: 'expense', building_id: 'b-1' },
        { name: 'Building 2', amount: 7200, monthly_amount: 600, kind: 'expense', building_id: 'b-2' },
      ];
      if (method === 'all' && sql.includes('finance_estimate_buildings')) return [
        { building_id: 'b-1', residential_area: 100 },
        { building_id: 'b-2', residential_area: 200 },
      ];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) {
        return params[0] === 'b-1'
          ? [{ id: 'apt-1', total_area: 50.005, property_type: 'non_commercial', is_commercial: 0, is_basement: 0, is_parking: 0 }]
          : params[0] === 'b-2' ? [{ id: 'apt-2', total_area: 80.005, property_type: 'non_commercial', is_commercial: 0, is_basement: 0, is_parking: 0 }] : [];
      }
      if (method === 'all' && sql.includes('primary_owner_id')) return [];
      if (method === 'run' && sql.includes('UPDATE personal_accounts')) return { success: true, meta: { changes: 1 } };
      return null;
    });

    const response = await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-complex' }), { DB: db }, {},
    );
    const result = await body(response);

    expect(response.status).toBe(200);
    expect(result.generated).toBe(2);
    expect(result.total_apartments).toBe(2);
    const apartmentReads = db.calls.filter(call => call.method === 'all' && call.sql.includes('FROM apartments WHERE'));
    expect(apartmentReads.map(call => call.params.slice(0, 2))).toEqual([
      ['b-1', 'tenant-1'], ['b-2', 'tenant-1'],
    ]);
    const inserts = db.batches.flat().filter(call => call.sql.includes('INSERT INTO finance_charges'));
    expect(inserts.map(call => call.params[0])).toEqual([
      'fc:tenant-1:est-complex:2026-08:apt-1',
      'fc:tenant-1:est-complex:2026-08:apt-2',
    ]);
    expect(inserts.map(call => {
      const breakdown = JSON.parse(String(call.params[5]));
      return {
        amount: call.params[4],
        items: breakdown.items,
        itemTotal: Math.round(breakdown.items.reduce((sum: number, item: { share: number }) => sum + item.share, 0) * 100) / 100,
      };
    })).toEqual([
      {
        amount: 100.01,
        items: [{ name: 'Common', share: 50.01 }, { name: 'Building 1', share: 50 }],
        itemTotal: 100.01,
      },
      {
        amount: 160.01,
        items: [{ name: 'Common', share: 40 }, { name: 'Building 2', share: 120.01 }],
        itemTotal: 160.01,
      },
    ]);
    expect(inserts.map(call => call.params[6])).toEqual(['non_commercial', 'non_commercial']);
    for (const insert of inserts) expect(insert.sql).toMatch(/ON CONFLICT\(id\) DO NOTHING/i);
    const syncs = db.calls.filter(call => call.method === 'run' && call.sql.includes('UPDATE personal_accounts'));
    expect(syncs.map(call => call.params)).toEqual([
      ['tenant-1', 'b-1'], ['tenant-1', 'b-2'],
    ]);
  });

  it('reports zero generated rows when deterministic charge inserts already exist', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM finance_estimates')) return {
        id: 'est-1', building_id: 'b-1', period: '2026-08', status: 'active', total_amount: 100,
        commercial_rate_per_sqm: 1, enterprise_profit_percent: 10,
      };
      if (method === 'first' && sql.includes('SUM(amount)')) return { total: 100 };
      if (method === 'all' && sql.includes('finance_estimate_items')) return [{ name: 'Service', amount: 100 }];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) return [{ id: 'apt-1', total_area: 100 }];
      if (method === 'all' && sql.includes('primary_owner_id')) return [];
      return null;
    }, calls => calls.map(call => call.sql.includes('ON CONFLICT(id) DO NOTHING')
      ? { success: true, meta: { changes: 0 } }
      : { success: true, meta: { changes: 1 } }));
    const response = await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    expect((await body(response)).generated).toBe(0);
    const income = db.calls.find(call => call.method === 'run' && call.sql.includes('INSERT INTO finance_income'))!;
    expect(income).toBeDefined();
    expect(income.params[4]).toBe('Доход предприятия от сметы за 2026-08 (10%)');
    expect(String(income.params[4])).not.toContain('0 квартир');
  });

  it('retries personal-account synchronization when charge replay generates zero rows', async () => {
    registerFinanceRoutes();
    let syncAttempts = 0;
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM finance_estimates')) return {
        id: 'est-1', building_id: 'b-1', period: '2026-08', status: 'active', total_amount: 100,
        commercial_rate_per_sqm: 1, enterprise_profit_percent: 0,
      };
      if (method === 'all' && sql.includes('finance_estimate_items')) return [{ name: 'Service', amount: 100 }];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) return [{ id: 'apt-1', total_area: 100 }];
      if (method === 'all' && sql.includes('primary_owner_id')) return [];
      if (method === 'run' && sql.includes('UPDATE personal_accounts')) {
        syncAttempts++;
        if (syncAttempts === 1) throw new Error('temporary personal-account sync failure');
        return { success: true, meta: { changes: 1 } };
      }
      return null;
    }, calls => calls.map(call => call.sql.includes('ON CONFLICT(id) DO NOTHING')
      ? { success: true, meta: { changes: 0 } }
      : { success: true, meta: { changes: 1 } }));

    await expect(handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    )).rejects.toThrow('temporary personal-account sync failure');

    const retry = await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    );

    expect(retry.status).toBe(200);
    expect((await body(retry)).generated).toBe(0);
    expect(syncAttempts).toBe(2);
  });

  it('keeps every charge chunk and its allocation statement under the 100-statement batch limit', async () => {
    registerFinanceRoutes();
    const apartments = Array.from({ length: 100 }, (_, index) => ({ id: `apt-${index}`, total_area: 1 }));
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM finance_estimates')) return {
        id: 'est-1', building_id: 'b-1', period: '2026-08', status: 'active', total_amount: 100,
        commercial_rate_per_sqm: 1, enterprise_profit_percent: 0,
      };
      if (method === 'all' && sql.includes('finance_estimate_items')) return [{ name: 'Service', amount: 100 }];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) return apartments;
      if (method === 'all' && sql.includes('primary_owner_id')) return [];
      return null;
    });
    await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    );
    expect(db.batches.map(batch => batch.length)).toEqual([100, 2]);
    expect(db.batches[0].at(-1)?.sql).toContain('apartment_id IN (' + Array(99).fill('?').join(',') + ')');
    expect(db.batches[1].at(-1)?.sql).toContain('apartment_id IN (?)');
  });

  it('uses deterministic ignored charge inserts in the v2 monthly generator', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'all' && sql.includes('FROM finance_estimates') && sql.includes("status = 'active'")) {
        return [{ id: 'est-1', tenant_id: 'tenant-1', building_id: 'b-1', model: 'TARIFF_FLAT' }];
      }
      if (method === 'first' && sql.includes('SELECT * FROM finance_estimates')) return {
        id: 'est-1', tenant_id: 'tenant-1', building_id: 'b-1', tariff_resident: 1, scope_level: 'building',
      };
      if (method === 'all' && sql.includes('finance_estimate_items')) return [{ name: 'Service', amount: 100, kind: 'expense' }];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) return [{
        id: 'apt-1', total_area: 10, property_type: 'non_commercial',
        is_commercial: 0, is_basement: 0, is_parking: 0,
      }];
      if (method === 'run' && sql.includes('UPDATE personal_accounts')) return { success: true, meta: { changes: 0 } };
      return null;
    });
    const response = await handler('POST', '/api/finance/cron/generate-monthly')(
      request('/api/finance/cron/generate-monthly?period=2026-08', undefined, 'POST', { 'X-Cron-Secret': 'secret' }),
      { DB: db, CRON_SECRET: 'secret' }, {},
    );
    expect(response.status).toBe(200);
    const chargeBatch = db.batches.find(batch => batch.some(statement => statement.sql.includes('finance_charges'))) !;
    expect(chargeBatch).toHaveLength(2);
    expect(chargeBatch[0].sql).toMatch(/ON CONFLICT\(id\) DO NOTHING/i);
    expect(chargeBatch[0].params[0]).toBe('fc:tenant-1:est-1:2026-08:apt-1');
    expect(chargeBatch[0].params[4]).toBe(10);
    expect(chargeBatch[0].params[6]).toBe('non_commercial');
    expect(chargeBatch[0].params[8]).toBe(1);
    expect(chargeBatch[1].sql).toContain('apartment_id IN (?)');
  });

  it('keeps cron complex breakdown expenses scoped to their building with exact totals', async () => {
    registerFinanceV2Routes();
    const estimate = {
      id: 'est-complex', tenant_id: 'tenant-1', building_id: 'b-primary', period: '2026-08', status: 'active',
      scope_level: 'complex', model: 'TARIFF_MANUAL', tariff_approved: 2, uk_profit_percent: 0,
      payroll_tax_rate: 0.24, residential_area: 100,
    };
    const db = createDb(({ method, sql, params }) => {
      if (method === 'all' && sql.includes('FROM finance_estimates') && sql.includes("status = 'active'")) {
        return [{ id: 'est-complex', tenant_id: 'tenant-1', building_id: 'b-primary', model: 'TARIFF_MANUAL' }];
      }
      if (method === 'first' && sql.includes('FROM finance_estimates')) return estimate;
      if (method === 'first' && sql.includes('FROM buildings')) return { residential_area: 100 };
      if (method === 'all' && sql.includes('finance_estimate_staff')) return [];
      if (method === 'all' && sql.includes('finance_estimate_items')) return [
        { name: 'Common', amount: 2400, monthly_amount: 200, kind: 'expense', building_id: null },
        { name: 'Building 1', amount: 2400, monthly_amount: 200, kind: 'expense', building_id: 'b-1' },
        { name: 'Building 2', amount: 7200, monthly_amount: 600, kind: 'expense', building_id: 'b-2' },
      ];
      if (method === 'all' && sql.includes('finance_estimate_buildings')) return [
        { building_id: 'b-1', residential_area: 100 },
        { building_id: 'b-2', residential_area: 200 },
      ];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) {
        return params[0] === 'b-1'
          ? [{ id: 'apt-1', total_area: 50.005 }]
          : params[0] === 'b-2' ? [{ id: 'apt-2', total_area: 80.005 }] : [];
      }
      if (method === 'run' && sql.includes('UPDATE personal_accounts')) return { success: true, meta: { changes: 2 } };
      return null;
    });

    const response = await handler('POST', '/api/finance/cron/generate-monthly')(
      request('/api/finance/cron/generate-monthly?period=2026-08', undefined, 'POST', { 'X-Cron-Secret': 'secret' }),
      { DB: db, CRON_SECRET: 'secret' }, {},
    );

    expect(response.status).toBe(200);
    const itemRead = db.calls.find(call => call.method === 'all'
      && call.sql.includes('SELECT name, amount, kind')
      && call.sql.includes('finance_estimate_items'))!;
    expect(itemRead.sql).toMatch(/SELECT name, amount, kind, building_id/i);
    const inserts = db.batches.flat().filter(call => call.sql.includes('INSERT INTO finance_charges'));
    expect(inserts.map(call => {
      const breakdown = JSON.parse(String(call.params[5]));
      return {
        amount: call.params[4],
        items: breakdown.items,
        itemTotal: Math.round(breakdown.items.reduce((sum: number, item: { share: number }) => sum + item.share, 0) * 100) / 100,
      };
    })).toEqual([
      {
        amount: 100.01,
        items: [{ name: 'Common', share: 50.01 }, { name: 'Building 1', share: 50 }],
        itemTotal: 100.01,
      },
      {
        amount: 160.01,
        items: [{ name: 'Common', share: 40 }, { name: 'Building 2', share: 120.01 }],
        itemTotal: 160.01,
      },
    ]);
  });

  it('upserts deterministic enterprise income for the tenant estimate period', async () => {
    registerFinanceRoutes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('SUM(amount)')) return { total: 100 };
      if (method === 'first' && sql.includes('FROM finance_estimates')) return {
        id: 'est-1', building_id: 'b-1', period: '2026-08', status: 'active', total_amount: 100,
        commercial_rate_per_sqm: 1, enterprise_profit_percent: 10,
      };
      if (method === 'all' && sql.includes('finance_estimate_items')) return [{ name: 'Service', amount: 100 }];
      if (method === 'all' && sql.includes('FROM apartments WHERE')) return [{ id: 'apt-1', total_area: 100 }];
      if (method === 'all' && sql.includes('primary_owner_id')) return [];
      return null;
    });
    const response = await handler('POST', '/api/finance/charges/generate')(
      request('/api/finance/charges/generate', { estimate_id: 'est-1' }), { DB: db }, {},
    );
    expect(response.status).toBe(200);
    const income = db.calls.find(call => call.method === 'run' && call.sql.includes('INSERT INTO finance_income'))!;
    expect(income.params[0]).toBe('fi:tenant-1:est-1:2026-08:profit');
    expect(income.params).toContain('est-1');
    expect(income.params).toContain('tenant-1');
    expect(income.sql).toMatch(/ON CONFLICT\(id\) DO UPDATE/i);
    expect(income.sql).toMatch(/finance_income\.tenant_id\s*=\s*excluded\.tenant_id/i);
  });
});

describe('fact report accounting', () => {
  it.each([
    ['2026-13', '2026-13'],
    ['2026-00', '2026-01'],
    ['2026-08', '2026-07'],
  ])('rejects invalid or reversed month range %s..%s', async (periodFrom, periodTo) => {
    registerFinanceV2Routes();
    const db = createDb(() => { throw new Error('SQL must not run'); });
    const response = await handler('GET', '/api/finance/fact-reports/preview')(
      request(`/api/finance/fact-reports/preview?building_id=b-1&period_from=${periodFrom}&period_to=${periodTo}`, undefined, 'GET'),
      { DB: db }, {},
    );
    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('pays an explicit historical debt row before current breakdown articles', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM buildings')) return { id: 'b-1', name: 'Building' };
      if (method === 'all' && sql.includes('FROM finance_charges c')) return [
        { id: 'c1', amount: 100, amount_breakdown: JSON.stringify({ items: [{ name: 'A', share: 60 }, { name: 'B', share: 39 }] }) },
        { id: 'c2', amount: 50, amount_breakdown: JSON.stringify([{ name: 'A', amount: 30 }, { name: 'B', amount: 20 }]) },
      ];
      if (method === 'first' && sql.includes('prior_debt')) return { prior_debt: 150 };
      if (method === 'first' && sql.includes('AS paid')) return { paid: 70 };
      if (method === 'first' && sql.includes('COUNT(*) AS n')) return { n: 1 };
      if (method === 'first' && sql.includes('FROM finance_estimates')) return null;
      return null;
    });
    const response = await handler('GET', '/api/finance/fact-reports/preview')(
      request('/api/finance/fact-reports/preview?building_id=b-1&period_from=2026-01&period_to=2026-01', undefined, 'GET'),
      { DB: db }, {},
    );
    const result = await body(response);
    expect(result.totals).toEqual({ prior_debt: 150, accrued: 150, paid: 70, arrears: 230 });
    expect(Object.fromEntries(result.rows.map((row: any) => [row.name, row]))).toMatchObject({
      'Задолженность прошлых периодов': { prior_debt: 150, accrued: 0, paid: 70, arrears: 80 },
      A: { prior_debt: 0, accrued: 90, paid: 0, arrears: 90 },
      B: { prior_debt: 0, accrued: 59, paid: 0, arrears: 59 },
      'Прочие услуги': { prior_debt: 0, accrued: 1, paid: 0, arrears: 1 },
    });
    expect(result.rows.reduce((sum: number, row: any) => sum + row.paid, 0)).toBe(70);
    expect(result.rows.reduce((sum: number, row: any) => sum + row.arrears, 0)).toBe(230);
    expect(result.payments_count).toBe(1);
    const prior = db.calls.find(call => call.sql.includes('prior_debt'))!;
    expect(prior.sql).toContain('finance_payments');
    expect(prior.sql).toContain("payment_type != 'overpayment'");
    for (const call of db.calls.filter(call => call.sql.includes('finance_payments'))) {
      expect(call.sql).toContain("payment_type != 'overpayment'");
      expect(call.params).toContain('tenant-1');
    }
    for (const call of db.calls.filter(call => call.sql.includes('JOIN apartments'))) {
      expect(call.sql).toMatch(/a\.tenant_id\s*=\s*[cp]\.tenant_id/);
    }
  });

  it('reports opening debt even when there are no current-period charges', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM buildings')) return { id: 'b-1' };
      if (method === 'all' && sql.includes('FROM finance_charges c')) return [];
      if (method === 'first' && sql.includes('prior_debt')) return { prior_debt: 100 };
      if (method === 'first' && sql.includes('AS paid')) return { paid: 40 };
      if (method === 'first' && sql.includes('COUNT(*) AS n')) return { n: 1 };
      return null;
    });
    const response = await handler('GET', '/api/finance/fact-reports/preview')(
      request('/api/finance/fact-reports/preview?building_id=b-1&period_from=2026-01&period_to=2026-01', undefined, 'GET'),
      { DB: db }, {},
    );
    const result = await body(response);
    expect(result.rows).toEqual([{
      name: 'Задолженность прошлых периодов', legal_code: null,
      prior_debt: 100, accrued: 0, paid: 40, arrears: 60,
    }]);
    expect(result.totals).toEqual({ prior_debt: 100, accrued: 0, paid: 40, arrears: 60 });
  });

  it('distributes only cash remaining after opening debt across current articles', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM buildings')) return { id: 'b-1' };
      if (method === 'all' && sql.includes('FROM finance_charges c')) return [{
        id: 'c-1', amount: 100,
        amount_breakdown: JSON.stringify({ items: [{ name: 'A', share: 60 }, { name: 'B', share: 40 }] }),
      }];
      if (method === 'first' && sql.includes('prior_debt')) return { prior_debt: 20 };
      if (method === 'first' && sql.includes('AS paid')) return { paid: 70 };
      if (method === 'first' && sql.includes('COUNT(*) AS n')) return { n: 1 };
      return null;
    });
    const response = await handler('GET', '/api/finance/fact-reports/preview')(
      request('/api/finance/fact-reports/preview?building_id=b-1&period_from=2026-01&period_to=2026-01', undefined, 'GET'),
      { DB: db }, {},
    );
    const rows = Object.fromEntries((await body(response)).rows.map((row: any) => [row.name, row]));
    expect(rows['Задолженность прошлых периодов'].paid).toBe(20);
    expect(rows.A.paid).toBe(30);
    expect(rows.B.paid).toBe(20);
  });

  it('represents an opening credit without a negative debt label', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM buildings')) return { id: 'b-1' };
      if (method === 'all' && sql.includes('FROM finance_charges c')) return [];
      if (method === 'first' && sql.includes('prior_debt')) return { prior_debt: -25 };
      if (method === 'first' && sql.includes('AS paid')) return { paid: 0 };
      if (method === 'first' && sql.includes('COUNT(*) AS n')) return { n: 0 };
      return null;
    });
    const response = await handler('GET', '/api/finance/fact-reports/preview')(
      request('/api/finance/fact-reports/preview?building_id=b-1&period_from=2026-01&period_to=2026-01', undefined, 'GET'),
      { DB: db }, {},
    );
    expect((await body(response)).rows).toEqual([{
      name: 'Переплата прошлых периодов', legal_code: null,
      prior_debt: -25, accrued: 0, paid: 0, arrears: -25,
    }]);
  });

  it('round-trips exact saved totals and counts while reading legacy row arrays', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM finance_fact_reports')) return {
        id: 'r-1', building_id: 'b-1', rows_json: JSON.stringify({
          rows: [{ name: 'A', prior_debt: 1, accrued: 2, paid: 3, arrears: 0 }],
          totals: { prior_debt: 7, accrued: 11, paid: 5, arrears: 13 },
          charges_count: 9, payments_count: 4,
        }),
        uk_income_plan: 0, uk_income_fact: 0,
      };
      return null;
    });
    const response = await handler('GET', '/api/finance/fact-reports/:id')(
      request('/api/finance/fact-reports/r-1', undefined, 'GET'), { DB: db }, { id: 'r-1' },
    );
    const result = await body(response);
    expect(result.totals).toEqual({ prior_debt: 7, accrued: 11, paid: 5, arrears: 13 });
    expect(result).toMatchObject({ charges_count: 9, payments_count: 4 });
    expect(db.calls.find(call => call.sql.includes('FROM finance_fact_reports'))?.sql)
      .toContain('b.tenant_id = r.tenant_id');

    const legacyDb = createDb(({ method, sql }) => method === 'first' && sql.includes('FROM finance_fact_reports') ? {
      id: 'legacy', building_id: 'b-1', rows_json: JSON.stringify([{ name: 'A', prior_debt: 1, accrued: 2, paid: 1, arrears: 2 }]),
    } : null);
    const legacyResponse = await handler('GET', '/api/finance/fact-reports/:id')(
      request('/api/finance/fact-reports/legacy', undefined, 'GET'), { DB: legacyDb }, { id: 'legacy' },
    );
    const legacy = await body(legacyResponse);
    expect(legacy.totals).toEqual({ prior_debt: 1, accrued: 2, paid: 1, arrears: 2 });
    expect(legacy).toMatchObject({ charges_count: null, payments_count: null });
  });

  it('stores exact report totals and counts inside rows_json without a schema change', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM buildings')) return { id: 'b-1' };
      if (method === 'all' && sql.includes('FROM finance_charges c')) return [];
      if (method === 'first' && sql.includes('prior_debt')) return { prior_debt: 0 };
      if (method === 'first' && sql.includes('AS paid')) return { paid: 0 };
      if (method === 'first' && sql.includes('COUNT(*) AS n')) return { n: 0 };
      return null;
    });
    const response = await handler('POST', '/api/finance/fact-reports')(
      request('/api/finance/fact-reports', { building_id: 'b-1', period_from: '2026-01', period_to: '2026-01' }),
      { DB: db }, {},
    );
    const insert = db.calls.find(call => call.method === 'run' && call.sql.includes('INSERT INTO finance_fact_reports'))!;
    const snapshot = JSON.parse(String(insert.params[4]));
    expect(response.status).toBe(201);
    expect(snapshot).toEqual({
      rows: [], totals: { prior_debt: 0, accrued: 0, paid: 0, arrears: 0 }, charges_count: 0, payments_count: 0,
    });
  });
});

describe('finance-v2 tenant boundary', () => {
  it.each([null, '__no_tenant__'])('loadEstimateInput rejects invalid tenant before SQL (%s)', async tenantId => {
    const db = createDb(() => { throw new Error('SQL must not run'); });
    await expect(loadEstimateInput({ DB: db } as any, 'est-1', tenantId as any)).resolves.toBeNull();
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    ['POST', '/api/finance/sync-accounts', '/api/finance/sync-accounts', undefined, {}],
    ['GET', '/api/finance/my-charges', '/api/finance/my-charges', undefined, {}],
    ['GET', '/api/finance/fact-reports/preview', '/api/finance/fact-reports/preview?building_id=b-1&period_from=2026-01&period_to=2026-01', undefined, {}],
    ['POST', '/api/finance/fact-reports', '/api/finance/fact-reports', { building_id: 'b-1', period_from: '2026-01', period_to: '2026-01' }, {}],
    ['GET', '/api/finance/fact-reports', '/api/finance/fact-reports', undefined, {}],
    ['GET', '/api/finance/fact-reports/:id', '/api/finance/fact-reports/r-1', undefined, { id: 'r-1' }],
    ['GET', '/api/finance/estimates/:id/compute', '/api/finance/estimates/est-1/compute', undefined, { id: 'est-1' }],
    ['GET', '/api/finance/estimates/:id/validate', '/api/finance/estimates/est-1/validate', undefined, { id: 'est-1' }],
    ['GET', '/api/finance/estimates/:id/full', '/api/finance/estimates/est-1/full', undefined, { id: 'est-1' }],
  ])('fails closed for %s %s without tenant context', async (method, routePath, url, payload, params) => {
    registerFinanceV2Routes();
    mocks.tenantId = null;
    const db = createDb(() => { throw new Error('SQL must not run'); });
    const response = await handler(method, routePath)(request(url, payload, method), { DB: db }, params);
    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('uses unconditional tenant equality in personal-account sync SQL', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => method === 'run' && sql.includes('UPDATE personal_accounts')
      ? { success: true, meta: { changes: 1 } }
      : null);
    await handler('POST', '/api/finance/sync-accounts')(
      request('/api/finance/sync-accounts'), { DB: db }, {},
    );
    const update = db.calls.find(call => call.sql.includes('UPDATE personal_accounts'))!;
    expect(update.sql).toContain('c.tenant_id = pa.tenant_id');
    expect(update.sql).toContain('p.tenant_id = pa.tenant_id');
    expect(update.sql).toMatch(/WHERE pa\.tenant_id = \?/);
    expect(update.params).toEqual(['tenant-1']);
  });

  it('loads every estimate input table through unconditional tenant filters', async () => {
    registerFinanceV2Routes();
    const db = createDb(({ method, sql }) => {
      if (method === 'first' && sql.includes('FROM finance_estimates')) return {
        id: 'est-1', tenant_id: 'tenant-1', building_id: 'b-1', model: 'TARIFF_FLAT',
        residential_area: 100, uk_profit_percent: 0, payroll_tax_rate: 0.24,
      };
      if (method === 'first' && sql.includes('FROM buildings')) return { residential_area: 100 };
      if (method === 'all') return [];
      return null;
    });
    const response = await handler('GET', '/api/finance/estimates/:id/validate')(
      request('/api/finance/estimates/est-1/validate', undefined, 'GET'), { DB: db }, { id: 'est-1' },
    );
    expect(response.status).toBe(200);
    for (const table of ['finance_estimates', 'buildings', 'finance_estimate_staff', 'finance_estimate_items', 'finance_estimate_buildings']) {
      const call = db.calls.find(item => item.sql.includes(`FROM ${table}`))!;
      expect(call.sql).toMatch(/tenant_id = \?/);
      expect(call.params).toContain('tenant-1');
    }
  });
});
