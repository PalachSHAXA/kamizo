// Executor routes: list, get single, update status
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateOnChange } from '../../cache';
import { json, error, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';
import { isExecutorRole } from '../../index';
import { createRequestLogger } from '../../utils/logger';

export function registerExecutorRoutes() {

// Executors: List all (protected with role-based filtering)
route('GET', '/api/executors', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) {
    return error('Unauthorized - login required', 401);
  }

  const allowedRoles = ['admin', 'director', 'manager', 'department_head', 'executor', 'resident', 'marketplace_manager'];
  const userRole = (user.role || '').trim().toLowerCase();
  if (!allowedRoles.includes(userRole)) {
    createRequestLogger(request).warn('Access denied to executors list', { role: user.role, userId: user.id });
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const showAll = url.searchParams.get('all') === 'true';
  const pagination = getPaginationParams(url);
  const search = url.searchParams.get('search')?.toLowerCase();

  let whereClause = `WHERE u.role = 'executor'`;
  const bindValues: any[] = [];

  if (tenantId) {
    whereClause += ` AND u.tenant_id = ?`;
    bindValues.push(tenantId);
  }

  if (user.role === 'department_head' && user.specialization && !showAll) {
    whereClause += ` AND u.specialization = ?`;
    bindValues.push(user.specialization);
  }

  if (isExecutorRole(user.role) && user.specialization && !showAll) {
    whereClause += ` AND u.specialization = ?`;
    bindValues.push(user.specialization);
  }

  if (search) {
    whereClause += ` AND (LOWER(u.name) LIKE ? OR LOWER(u.phone) LIKE ? OR LOWER(u.specialization) LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindValues.push(searchPattern, searchPattern, searchPattern);
  }

  const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
  const countStmt = env.DB.prepare(countQuery);
  const { total } = bindValues.length > 0
    ? await countStmt.bind(...bindValues).first() as any
    : await countStmt.first() as any;

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);

  const dataQuery = `
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.status, u.is_active, u.created_at,
      COALESCE(stats.completed_count, 0) as completed_count,
      COALESCE(stats.active_requests, 0) as active_requests,
      COALESCE(stats.rating, 5.0) as rating,
      COALESCE(stats.avg_completion_time, 0) as avg_completion_time,
      0 as total_earnings
    FROM users u
    LEFT JOIN (
      SELECT
        executor_id,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as active_requests,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1) as rating,
        ROUND(AVG(CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60
          ELSE NULL END), 0) as avg_completion_time
      FROM requests
      ${tenantId ? 'WHERE tenant_id = ?' : ''}
      GROUP BY executor_id
    ) stats ON stats.executor_id = u.id
    ${whereClause}
    ORDER BY u.name
    LIMIT ? OFFSET ?
  `;

  const dataStmt = env.DB.prepare(dataQuery);
  const subqueryBinds = tenantId ? [tenantId] : [];
  const { results } = bindValues.length > 0
    ? await dataStmt.bind(...subqueryBinds, ...bindValues, pagination.limit, offset).all()
    : await dataStmt.bind(...subqueryBinds, pagination.limit, offset).all();

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ executors: response.data, pagination: response.pagination });
});

// Executors: Get single executor by ID
route('GET', '/api/executors/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const allowedRoles = ['admin', 'director', 'manager', 'department_head'];
  if (!allowedRoles.includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at
    FROM users
    WHERE id = ? AND role IN ('executor', 'department_head') ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!executor) {
    return error('Executor not found', 404);
  }

  return json({ executor });
});

// Executors: Update status (available/busy/offline)
route('PATCH', '/api/executors/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  if (user.id !== params.id && !['admin', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const status = body.status;

  if (!['available', 'busy', 'offline'].includes(status)) {
    return error('Invalid status. Must be: available, busy, or offline');
  }

  await env.DB.prepare(`
    UPDATE users SET status = ? WHERE id = ? AND role = 'executor' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ executor });
});

} // end registerExecutorRoutes
