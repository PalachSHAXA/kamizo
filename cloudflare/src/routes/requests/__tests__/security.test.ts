import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canAssignRequests,
  canManagementCancel,
  canOwnerCancel,
  canRateOwnedRequest,
  hasForbiddenWorkflowFields,
  isRequestOwnerRole,
  isValidRequestRating,
} from '../security';

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
  requireFeature: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('../../../middleware/cache-local', () => ({ invalidateCache: vi.fn() }));
vi.mock('../../../utils/helpers', () => ({
  json: (data: unknown, status = 200) => Response.json(data, { status }),
  error: (message: string, status = 400) => Response.json({ error: message }, { status }),
  generateId: vi.fn(() => 'generated-id'),
}));
vi.mock('../../../index', () => ({
  isExecutorRole: (role: string) => role === 'executor',
  sendPushNotification: vi.fn(async () => undefined),
}));

import { registerApprovalRoutes } from '../approval';
import { registerAssignmentRoutes } from '../assignment';

type DbMethod = 'first' | 'all' | 'run';
type DbCall = { sql: string; params: unknown[]; method: DbMethod; batched: boolean };
type DbResult = Record<string, any> | null | undefined;

function createDb(resolve: (call: DbCall) => DbResult = () => null) {
  const calls: DbCall[] = [];
  let batchCount = 0;
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const execute = async (method: DbMethod, batched = false) => {
      const call = { sql, params, method, batched };
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
      executeBatch: () => execute('run', true),
    };
  };
  return {
    calls,
    get batchCount() { return batchCount; },
    prepare,
    async batch(statements: Array<{ executeBatch: () => Promise<any> }>) {
      batchCount += 1;
      const results = [];
      for (const statement of statements) results.push(await statement.executeBatch());
      return results;
    },
  };
}

function handler(method: string, path: string) {
  const registered = mocks.handlers.get(`${method} ${path}`);
  if (!registered) throw new Error(`Missing route ${method} ${path}`);
  return registered;
}

function request(method: string, path: string, body?: unknown, rawBody?: string) {
  return new Request(`https://api.kamizo.uz${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
}

function requestRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    resident_id: 'owner-1',
    executor_id: 'executor-1',
    status: 'pending_approval',
    request_number: 'REQ-1',
    title: 'Leak',
    ...overrides,
  };
}

function routeDb(options: { row?: Record<string, unknown> | null; updateChanges?: number } = {}) {
  const { row = requestRow(), updateChanges = 1 } = options;
  return createDb(({ sql, method }) => {
    if (method === 'first' && sql.includes('FROM users') && sql.includes("role = ?")) {
      return { id: 'executor-1', name: 'Executor', phone: '1', specialization: 'plumbing' };
    }
    if (method === 'first' && sql.includes('FROM requests')) return row;
    if (method === 'run' && sql.includes('UPDATE requests')) {
      return { success: true, meta: { changes: updateChanges } };
    }
    if (method === 'all') return [];
    return null;
  });
}

beforeEach(() => {
  mocks.handlers.clear();
  mocks.user = { id: 'owner-1', role: 'resident', specialization: null };
  mocks.tenantId = 'tenant-1';
});

describe('request assignment policy', () => {
  it.each(['admin', 'director', 'manager', 'dispatcher', 'department_head'])(
    'allows %s to assign requests',
    (role) => {
      expect(canAssignRequests(role)).toBe(true);
    },
  );

  it.each(['executor', 'resident', 'tenant', 'commercial_owner', 'security', 'advertiser', 'marketplace'])(
    'denies %s from assigning requests',
    (role) => {
      expect(canAssignRequests(role)).toBe(false);
    },
  );
});

describe('generic request update policy', () => {
  it.each([
    { status: 'completed' },
    { status: '' },
    { status: null },
    { executor_id: 'executor-1' },
    { executor_id: '' },
    { executor_id: null },
  ])('rejects workflow fields when present: %j', (body) => {
    expect(hasForbiddenWorkflowFields(body)).toBe(true);
  });

  it('allows metadata fields', () => {
    expect(hasForbiddenWorkflowFields({ rating: 5, feedback: 'Good work' })).toBe(false);
  });
});

describe('request cancellation policy', () => {
  it.each(['resident', 'tenant', 'commercial_owner'])('treats %s as a request owner', (role) => {
    expect(isRequestOwnerRole(role)).toBe(true);
  });

  it.each(['new', 'assigned', 'accepted'])('allows owners to cancel %s requests', (status) => {
    expect(canOwnerCancel(status)).toBe(true);
  });

  it.each(['pending', 'in_progress', 'pending_approval', 'completed', 'cancelled'])(
    'denies owners from cancelling %s requests',
    (status) => {
      expect(canOwnerCancel(status)).toBe(false);
    },
  );

  it.each(['admin', 'director', 'manager', 'dispatcher', 'department_head'])(
    'allows %s to use management cancellation',
    (role) => {
      expect(canManagementCancel(role)).toBe(true);
    },
  );

  it.each(['executor', 'security', 'advertiser', 'marketplace', 'resident', 'tenant', 'commercial_owner'])(
    'denies %s from using management cancellation',
    (role) => {
      expect(canManagementCancel(role)).toBe(false);
    },
  );
});

describe('legacy request rating policy', () => {
  it.each(['pending_approval', 'completed'])('allows rating an owned %s request', (status) => {
    expect(canRateOwnedRequest(status)).toBe(true);
  });

  it.each(['new', 'assigned', 'accepted', 'pending', 'in_progress', 'cancelled'])(
    'denies rating an owned %s request',
    (status) => {
      expect(canRateOwnedRequest(status)).toBe(false);
    },
  );

  it.each([1, 2, 3, 4, 5])('accepts integer rating %s', (rating) => {
    expect(isValidRequestRating(rating)).toBe(true);
  });

  it.each([0, 6, 1.5, '5', null, undefined])('rejects invalid rating %s', (rating) => {
    expect(isValidRequestRating(rating)).toBe(false);
  });
});

describe('request assignment route security', () => {
  const path = '/api/requests/:id/assign';
  const params = { id: 'request-1' };

  it('returns 401 for anonymous assignment', async () => {
    registerAssignmentRoutes();
    mocks.user = null;
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', { executor_id: 'executor-1' }), { DB: db }, params);

    expect(response.status).toBe(401);
    expect(db.calls).toHaveLength(0);
  });

  it('returns 403 for a disallowed assignment role', async () => {
    registerAssignmentRoutes();
    mocks.user = { id: 'executor-2', role: 'executor' };
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', { executor_id: 'executor-1' }), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([null, '__no_tenant__'])('rejects assignment tenant context %s before SQL', async (tenantId) => {
    registerAssignmentRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    mocks.tenantId = tenantId;
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', { executor_id: 'executor-1' }), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    { name: 'malformed JSON', rawBody: '{', body: undefined },
    { name: 'array body', body: [] },
    { name: 'unknown field', body: { executor_id: 'executor-1', role: 'admin' } },
    { name: 'missing executor_id', body: {} },
    { name: 'non-string executor_id', body: { executor_id: 7 } },
    { name: 'empty executor_id', body: { executor_id: '' } },
    { name: 'oversized executor_id', body: { executor_id: 'x'.repeat(129) } },
  ])('returns 400 for $name', async ({ body, rawBody }) => {
    registerAssignmentRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', body, rawBody), { DB: db }, params);

    expect(response.status).toBe(400);
    expect(db.calls).toHaveLength(0);
  });

  it('rejects a department head without specialization before SQL', async () => {
    registerAssignmentRoutes();
    mocks.user = { id: 'head-1', role: 'department_head', specialization: null };
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', { executor_id: 'executor-1' }), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('requires an exact department specialization match', async () => {
    registerAssignmentRoutes();
    mocks.user = { id: 'head-1', role: 'department_head', specialization: 'electrical' };
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', { executor_id: 'executor-1' }), { DB: db }, params);

    expect(response.status).toBe(403);
  });

  it('tenant-scopes every assignment read and write including joined users', async () => {
    registerAssignmentRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    const db = routeDb({ row: requestRow({ status: 'new' }) });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/assign', { executor_id: 'executor-1' }), { DB: db }, params);

    expect(response.status).toBe(200);
    const executorLookup = db.calls.find((call) => call.sql.includes('FROM users') && call.sql.includes('role = ?'));
    expect(executorLookup?.sql).toContain('AND tenant_id = ?');
    expect(executorLookup?.params).toEqual(['executor-1', 'executor', 'tenant-1']);
    const requestLookup = db.calls.find((call) => call.sql.includes('SELECT * FROM requests'));
    expect(requestLookup?.sql).toContain('AND tenant_id = ?');
    expect(requestLookup?.params).toEqual(['request-1', 'tenant-1']);
    const update = db.calls.find((call) => call.sql.includes('UPDATE requests'));
    expect(update?.sql).toContain('AND tenant_id = ?');
    expect(update?.params.at(-1)).toBe('tenant-1');
    const joinedRead = db.calls.find((call) => call.sql.includes('FROM requests r'));
    expect(joinedRead?.sql).toContain('u.tenant_id = r.tenant_id');
    expect(joinedRead?.sql).toContain('eu.tenant_id = r.tenant_id');
    expect(joinedRead?.sql).toContain('AND r.tenant_id = ?');
  });
});

describe('generic request PATCH route security', () => {
  const path = '/api/requests/:id';
  const params = { id: 'request-1' };

  it.each([null, '__no_tenant__'])('rejects PATCH tenant context %s before SQL', async (tenantId) => {
    registerAssignmentRoutes();
    mocks.tenantId = tenantId;
    const db = routeDb();

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    { name: 'malformed JSON', rawBody: '{', body: undefined },
    { name: 'null body', body: null },
    { name: 'array body', body: [] },
    { name: 'unknown field', body: { rating: 5, priority: 'high' } },
    { name: 'string rating', body: { rating: '5' } },
    { name: 'missing rating', body: { feedback: 'Only feedback' } },
    { name: 'non-string feedback', body: { rating: 5, feedback: 7 } },
    { name: 'oversized feedback', body: { rating: 5, feedback: 'x'.repeat(2001) } },
  ])('returns 400 for $name', async ({ body, rawBody }) => {
    registerAssignmentRoutes();
    const db = routeDb();

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', body, rawBody), { DB: db }, params);

    expect(response.status).toBe(400);
  });

  it('denies management from rating another owner request', async () => {
    registerAssignmentRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    const db = routeDb();

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(403);
  });

  it('denies an assigned or unassigned executor from rating', async () => {
    registerAssignmentRoutes();
    mocks.user = { id: 'executor-1', role: 'executor' };
    const db = routeDb();

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(403);
  });

  it('rejects rating an owned request in a disallowed state', async () => {
    registerAssignmentRoutes();
    const db = routeDb({ row: requestRow({ status: 'in_progress' }) });

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(400);
  });

  it('atomically scopes an owner rating to tenant, owner, and allowed states', async () => {
    registerAssignmentRoutes();
    const db = routeDb();

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', { rating: 5, feedback: 'Fixed' }), { DB: db }, params);

    expect(response.status).toBe(200);
    const update = db.calls.find((call) => call.sql.includes('UPDATE requests'));
    expect(update?.sql).toContain('resident_id = ?');
    expect(update?.sql).toContain("status IN ('pending_approval', 'completed')");
    expect(update?.sql).toContain('tenant_id = ?');
    expect(update?.params).toEqual([5, 'Fixed', 'request-1', 'owner-1', 'tenant-1']);
  });

  it('returns 409 when the PATCH rating state changes concurrently', async () => {
    registerAssignmentRoutes();
    const db = routeDb({ updateChanges: 0 });

    const response = await handler('PATCH', path)(request('PATCH', '/api/requests/request-1', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(409);
  });
});

describe('request cancellation route security', () => {
  const path = '/api/requests/:id/cancel';
  const params = { id: 'request-1' };

  it.each([null, '__no_tenant__'])('rejects cancellation tenant context %s before SQL', async (tenantId) => {
    registerApprovalRoutes();
    mocks.tenantId = tenantId;
    const db = routeDb({ row: requestRow({ status: 'new' }) });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/cancel', {}), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    { name: 'malformed JSON', rawBody: '{', body: undefined },
    { name: 'array body', body: [] },
    { name: 'unknown field', body: { reason: 'No longer needed', status: 'cancelled' } },
    { name: 'non-string reason', body: { reason: 7 } },
    { name: 'oversized reason', body: { reason: 'x'.repeat(1001) } },
  ])('returns 400 for $name', async ({ body, rawBody }) => {
    registerApprovalRoutes();
    const db = routeDb({ row: requestRow({ status: 'new' }) });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/cancel', body, rawBody), { DB: db }, params);

    expect(response.status).toBe(400);
  });

  it('does not allow repeated cancellation', async () => {
    registerApprovalRoutes();
    mocks.user = { id: 'manager-1', role: 'manager' };
    const db = routeDb({ row: requestRow({ status: 'cancelled' }) });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/cancel', {}), { DB: db }, params);

    expect(response.status).toBe(400);
    expect(db.calls.some((call) => call.sql.includes('UPDATE requests'))).toBe(false);
  });

  it('batches owner cancellation with conditional history and tenant predicates', async () => {
    registerApprovalRoutes();
    const db = routeDb({ row: requestRow({ status: 'new' }) });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/cancel', { reason: 'Duplicate' }), { DB: db }, params);

    expect(response.status).toBe(200);
    expect(db.batchCount).toBe(1);
    const update = db.calls.find((call) => call.batched && call.sql.includes('UPDATE requests'));
    expect(update?.sql).toContain("status IN ('new', 'assigned', 'accepted')");
    expect(update?.sql).toContain('resident_id = ?');
    expect(update?.sql).toContain('tenant_id = ?');
    const history = db.calls.find((call) => call.batched && call.sql.includes('INSERT INTO request_history'));
    expect(history?.sql).toContain('WHERE changes() = 1');
    expect(history?.params.at(-1)).toBe('tenant-1');
  });

  it('returns 409 when cancellation loses a concurrent state race', async () => {
    registerApprovalRoutes();
    const db = routeDb({ row: requestRow({ status: 'new' }), updateChanges: 0 });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/cancel', {}), { DB: db }, params);

    expect(response.status).toBe(409);
    expect(db.batchCount).toBe(1);
    const history = db.calls.find((call) => call.sql.includes('INSERT INTO request_history'));
    expect(history?.sql).toContain('WHERE changes() = 1');
  });
});

describe('legacy rating route security', () => {
  const path = '/api/requests/:id/rate';
  const params = { id: 'request-1' };

  it.each([null, '__no_tenant__'])('rejects rating tenant context %s before SQL', async (tenantId) => {
    registerApprovalRoutes();
    mocks.tenantId = tenantId;
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/rate', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it.each([
    { name: 'malformed JSON', rawBody: '{', body: undefined },
    { name: 'null body', body: null },
    { name: 'unknown field', body: { rating: 5, status: 'completed' } },
    { name: 'string rating', body: { rating: '5' } },
    { name: 'non-string feedback', body: { rating: 5, feedback: {} } },
    { name: 'oversized feedback', body: { rating: 5, feedback: 'x'.repeat(2001) } },
  ])('returns 400 for $name', async ({ body, rawBody }) => {
    registerApprovalRoutes();
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/rate', body, rawBody), { DB: db }, params);

    expect(response.status).toBe(400);
  });

  it('denies executors before request SQL', async () => {
    registerApprovalRoutes();
    mocks.user = { id: 'executor-1', role: 'executor' };
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/rate', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(403);
    expect(db.calls).toHaveLength(0);
  });

  it('updates only rating metadata with owner, state, and tenant predicates', async () => {
    registerApprovalRoutes();
    const db = routeDb();

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/rate', { rating: 4, feedback: 'Good' }), { DB: db }, params);

    expect(response.status).toBe(200);
    const update = db.calls.find((call) => call.sql.includes('UPDATE requests'));
    expect(update?.sql).not.toContain("status = 'completed'");
    expect(update?.sql).toContain('resident_id = ?');
    expect(update?.sql).toContain("status IN ('pending_approval', 'completed')");
    expect(update?.sql).toContain('tenant_id = ?');
    expect(update?.params).toEqual([4, 'Good', 'request-1', 'owner-1', 'tenant-1']);
  });

  it('returns 409 when rating loses a concurrent state race', async () => {
    registerApprovalRoutes();
    const db = routeDb({ updateChanges: 0 });

    const response = await handler('POST', path)(request('POST', '/api/requests/request-1/rate', { rating: 5 }), { DB: db }, params);

    expect(response.status).toBe(409);
  });
});

describe('approval and rejection user lookups', () => {
  it.each([
    { routePath: '/api/requests/:id/approve', action: 'approve', body: { rating: 5, feedback: 'Done' } },
    { routePath: '/api/requests/:id/reject', action: 'reject', body: { reason: 'Needs work' } },
  ])('tenant-scopes executor name lookup for $action', async ({ routePath, action, body }) => {
    registerApprovalRoutes();
    const db = routeDb();

    const response = await handler('POST', routePath)(request('POST', `/api/requests/request-1/${action}`, body), { DB: db }, { id: 'request-1' });

    expect(response.status).toBe(200);
    const executorLookup = db.calls.find((call) => call.sql.includes('SELECT name FROM users'));
    expect(executorLookup?.sql).toContain('tenant_id = ?');
    expect(executorLookup?.params).toEqual(['executor-1', 'tenant-1']);
  });

  it.each([
    { routePath: '/api/requests/:id/approve', action: 'approve', body: { rating: 5, feedback: 'Done' } },
    { routePath: '/api/requests/:id/reject', action: 'reject', body: { reason: 'Needs work' } },
  ])('returns 409 without follow-up work when $action loses its status race', async ({ routePath, action, body }) => {
    registerApprovalRoutes();
    const db = routeDb({ updateChanges: 0 });

    const response = await handler('POST', routePath)(request('POST', `/api/requests/request-1/${action}`, body), { DB: db }, { id: 'request-1' });

    const updateIndex = db.calls.findIndex((call) => call.sql.includes('UPDATE requests'));
    const followUpCalls = db.calls.slice(updateIndex + 1);
    expect.soft(response.status).toBe(409);
    expect.soft(followUpCalls.some((call) => call.sql.includes('INSERT INTO notifications'))).toBe(false);
    expect.soft(followUpCalls.some((call) => call.sql.includes('FROM users'))).toBe(false);
    expect(followUpCalls.some((call) => call.method === 'all')).toBe(false);
  });
});
