// Requests CRUD: list, create, update
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, getPaginationParams, createPaginatedResponse } from '../../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../../index';
import { validateBody } from '../../validation/validate';
import { createRequestSchema } from '../../validation/schemas';
import { notifyManagers } from '../../utils/notifications';

export function registerRequestCrudRoutes() {
// Requests: List
route('GET', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const pagination = getPaginationParams(url);

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND r.tenant_id = ?';
    params.push(tenantId);
  }

  // Role-based row filter. Whitelist roles that can see all requests in tenant;
  // any other role defaults to "see only your own" to prevent data leaks.
  const MANAGEMENT_ROLES = ['admin', 'director', 'manager', 'dispatcher', 'super_admin'];
  const OWN_REQUESTS_ROLES = ['resident', 'tenant', 'commercial_owner'];

  if (OWN_REQUESTS_ROLES.includes(user.role)) {
    whereClause += ' AND r.resident_id = ?';
    params.push(user.id);
  } else if (isExecutorRole(user.role)) {
    whereClause += ` AND (r.executor_id = ? OR (r.status = 'new' AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)))`;
    params.push(user.id);
    params.push(user.specialization || 'security');
  } else if (user.role === 'department_head') {
    // department_head MUST have specialization — otherwise deny (prevents cross-department leak)
    if (!user.specialization) {
      whereClause += ' AND 1=0';
    } else {
      whereClause += ` AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)`;
      params.push(user.specialization);
    }
  } else if (!MANAGEMENT_ROLES.includes(user.role)) {
    // Unknown or non-management role (e.g., advertiser, marketplace_manager):
    // safest default is "see only own requests"
    whereClause += ' AND r.resident_id = ?';
    params.push(user.id);
  }

  if (status && status !== 'all') {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }

  if (category) {
    whereClause += ' AND r.category_id = ?';
    params.push(category);
  }

  const countQuery = `SELECT COUNT(*) as total FROM requests r ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address, u.building_id,
           eu.name as executor_name, eu.phone as executor_phone, eu.specialization as executor_specialization,
           b.name as building_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    LEFT JOIN buildings b ON u.building_id = b.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ requests: response.data, pagination: response.pagination });
});

// Requests: Create
route('POST', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const { data: body, errors: validationErrors } = await validateBody<any>(request, createRequestSchema);
  if (validationErrors) return error(validationErrors, 400);
  const id = generateId();

  let residentId = user.id;
  let residentData: any = null;

  if (['manager', 'admin', 'director', 'department_head'].includes(user.role) && body.resident_id) {
    residentId = body.resident_id;
    residentData = await env.DB.prepare(
      'SELECT id, branch, building_id, address, name, phone, apartment FROM users WHERE id = ?'
    ).bind(body.resident_id).first() as any;
  }

  let branchCode = 'UK';
  // Reuse already-fetched user object to avoid redundant DB query (N+1 fix)
  const userForBranch = residentData || user as any;

  if (userForBranch?.branch) {
    branchCode = userForBranch.branch.toUpperCase();
  } else if (userForBranch?.address) {
    const address = userForBranch.address.toLowerCase();
    if (address.includes('юнусобод') || address.includes('yunusobod') || address.includes('юнусота')) branchCode = 'YS';
    else if (address.includes('чиланзар') || address.includes('chilanzar')) branchCode = 'CH';
    else if (address.includes('сергели') || address.includes('sergeli')) branchCode = 'SR';
    else if (address.includes('мирзо') || address.includes('mirzo')) branchCode = 'MU';
  }

  const categoryCodeMap: Record<string, string> = {
    'plumber': 'S', 'electrician': 'E', 'elevator': 'L', 'intercom': 'D',
    'cleaning': 'C', 'security': 'O', 'trash': 'M', 'boiler': 'B',
    'ac': 'A', 'gardener': 'G', 'other': 'X',
  };
  const categoryCode = categoryCodeMap[body.category_id] || 'X';

  const prefix = `${branchCode}-${categoryCode}`;
  const tenantIdReqNum = getTenantId(request);
  const maxNum = await env.DB.prepare(
    `SELECT COALESCE(MAX(number), 1000) as max_num FROM requests WHERE request_number LIKE ? ${tenantIdReqNum ? 'AND tenant_id = ?' : ''}`
  ).bind(prefix + '-%', ...(tenantIdReqNum ? [tenantIdReqNum] : [])).first() as any;
  const number = (maxNum?.max_num || 1000) + 1;
  const requestNumber = `${prefix}-${number}`;

  await env.DB.prepare(`
    INSERT INTO requests (id, number, request_number, resident_id, category_id, title, description, priority, access_info, scheduled_at, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, number, requestNumber, residentId, body.category_id, body.title,
    body.description || null, body.priority || 'medium',
    body.access_info || null, body.scheduled_at || null, getTenantId(request)
  ).run();

  const created = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address
    FROM requests r LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? ${tenantIdReqNum ? 'AND r.tenant_id = ?' : ''}
  `).bind(id, ...(tenantIdReqNum ? [tenantIdReqNum] : [])).first() as any;

  const categoryLabels: Record<string, string> = {
    'plumber': 'Сантехника', 'electrician': 'Электрика', 'elevator': 'Лифт',
    'intercom': 'Домофон', 'cleaning': 'Уборка', 'security': 'Охрана',
    'trash': 'Мусор', 'boiler': 'Котёл', 'ac': 'Кондиционер', 'courier': 'Курьер',
    'gardener': 'Садовник', 'other': 'Другое'
  };
  const categoryLabel = categoryLabels[body.category_id] || body.category_id;

  const tenantIdForNotify = getTenantId(request);
  const reqNotifBody = `#${requestNumber} - ${body.title}. ${categoryLabel}. От: ${created?.resident_name || 'Житель'}`;
  notifyManagers(env, tenantIdForNotify, {
    title: '📝 Новая заявка',
    body: reqNotifBody,
    type: 'request_created',
    tag: `request-new-${id}`,
    data: { request_id: id, requestId: id, url: '/requests' },
    requireInteraction: false,
  }).catch(() => {});

  return json({ request: created }, 201);
});

} // end registerRequestCrudRoutes
