// Request lifecycle routes — extracted from index.ts
// Contains: requests CRUD, assign/accept/decline/start/complete/pause/resume/approve/reject/cancel/rate,
//   reschedule-requests, work-orders, categories

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { invalidateCache } from '../middleware/cache-local';
import { cachedQuery, CacheTTL, CachePrefix } from '../cache';
import { json, error, generateId, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../index';

export function registerRequestRoutes() {

// ==================== REQUESTS ROUTES ====================

// Requests: List
route('GET', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const pagination = getPaginationParams(url);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND r.tenant_id = ?';
    params.push(tenantId);
  }

  // Filter by role
  if (user.role === 'resident') {
    whereClause += ' AND r.resident_id = ?';
    params.push(user.id);
  } else if (isExecutorRole(user.role)) {
    whereClause += ` AND (r.executor_id = ? OR (r.status = 'new' AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)))`;
    params.push(user.id);
    params.push(user.specialization || 'security');
  } else if (user.role === 'department_head' && user.specialization) {
    // SECURITY: Department heads only see requests in their department (by category specialization)
    whereClause += ` AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)`;
    params.push(user.specialization);
  }

  if (status && status !== 'all') {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }

  if (category) {
    whereClause += ' AND r.category_id = ?';
    params.push(category);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM requests r ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
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

  const body = await request.json() as any;
  const id = generateId();

  // Determine the resident ID - managers/admins can create requests on behalf of residents
  let residentId = user.id;
  let residentData: any = null;

  // If manager/admin/director is creating request on behalf of a resident
  if (['manager', 'admin', 'director', 'department_head'].includes(user.role) && body.resident_id) {
    residentId = body.resident_id;
    // Get the actual resident's data for branch code and address
    residentData = await env.DB.prepare(
      'SELECT id, branch, building_id, address, name, phone, apartment FROM users WHERE id = ?'
    ).bind(body.resident_id).first() as any;
  }

  // Get branch code from address or building
  let branchCode = 'UK'; // Default branch code

  // Check resident or current user for branch info
  const userForBranch = residentData || await env.DB.prepare(
    'SELECT branch, building_id, address FROM users WHERE id = ?'
  ).bind(residentId).first() as any;

  if (userForBranch?.branch) {
    branchCode = userForBranch.branch.toUpperCase();
  } else if (userForBranch?.address) {
    // Try to extract branch from address
    const address = userForBranch.address.toLowerCase();
    if (address.includes('юнусобод') || address.includes('yunusobod') || address.includes('юнусота')) {
      branchCode = 'YS';
    } else if (address.includes('чиланзар') || address.includes('chilanzar')) {
      branchCode = 'CH';
    } else if (address.includes('сергели') || address.includes('sergeli')) {
      branchCode = 'SR';
    } else if (address.includes('мирзо') || address.includes('mirzo')) {
      branchCode = 'MU';
    }
  }

  // Get category code for unique numbering per service type
  // S=Сантехника, E=Электрика, L=Лифт, D=Домофон, C=Уборка, O=Охрана, X=Другое
  const categoryCodeMap: Record<string, string> = {
    'plumber': 'S',      // Сантехника
    'electrician': 'E',  // Электрика
    'elevator': 'L',     // Лифт
    'intercom': 'D',     // Домофон
    'cleaning': 'C',     // Уборка (Cleaning)
    'security': 'O',     // Охрана
    'trash': 'M',        // Мусор (Trash)
    'boiler': 'B',       // Котёл (Boiler)
    'ac': 'A',           // Кондиционер (AC)
    'gardener': 'G',     // Садовник (Gardener)
    'other': 'X',        // Другое
  };
  const categoryCode = categoryCodeMap[body.category_id] || 'X';

  // Get next request number for this branch + category combination
  // e.g., YS-L-% for all elevator requests in Yunusabad
  const prefix = `${branchCode}-${categoryCode}`;
  const tenantIdReqNum = getTenantId(request);
  const maxNum = await env.DB.prepare(
    `SELECT COALESCE(MAX(number), 1000) as max_num FROM requests WHERE request_number LIKE ? ${tenantIdReqNum ? 'AND tenant_id = ?' : ''}`
  ).bind(prefix + '-%', ...(tenantIdReqNum ? [tenantIdReqNum] : [])).first() as any;
  const number = (maxNum?.max_num || 1000) + 1;

  // Create request number with branch + category prefix (e.g., YS-L-1001)
  const requestNumber = `${prefix}-${number}`;

  await env.DB.prepare(`
    INSERT INTO requests (id, number, request_number, resident_id, category_id, title, description, priority, access_info, scheduled_at, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, number, requestNumber, residentId, body.category_id, body.title,
    body.description || null, body.priority || 'medium',
    body.access_info || null, body.scheduled_at || null, getTenantId(request)
  ).run();

  // Return the created request with user info
  const created = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? ${tenantIdReqNum ? 'AND r.tenant_id = ?' : ''}
  `).bind(id, ...(tenantIdReqNum ? [tenantIdReqNum] : [])).first() as any;

  // Notify managers and department heads about new request
  const categoryLabels: Record<string, string> = {
    'plumber': 'Сантехника', 'electrician': 'Электрика', 'elevator': 'Лифт',
    'intercom': 'Домофон', 'cleaning': 'Уборка', 'security': 'Охрана',
    'trash': 'Мусор', 'boiler': 'Котёл', 'ac': 'Кондиционер', 'courier': 'Курьер', 'gardener': 'Садовник', 'other': 'Другое'
  };
  const categoryLabel = categoryLabels[body.category_id] || body.category_id;

  // Get managers and department heads to notify
  const tenantIdForNotify = getTenantId(request);
  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'department_head') AND is_active = 1 ${tenantIdForNotify ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantIdForNotify ? [tenantIdForNotify] : [])).all();

  // Send notification to each manager (push + save to DB for bell icon)
  const reqNotifBody = `#${requestNumber} - ${body.title}. ${categoryLabel}. От: ${created?.resident_name || 'Житель'}`;
  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '📝 Новая заявка',
      body: reqNotifBody,
      type: 'request_created',
      tag: `request-new-${id}`,
      data: { requestId: id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_created', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), manager.id, '📝 Новая заявка', reqNotifBody, JSON.stringify({ request_id: id }), tenantIdForNotify).run().catch(() => {});
  }

  return json({ request: created }, 201);
});

// Requests: Update
route('PATCH', '/api/requests/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request before update for notifications
  const requestBefore = await env.DB.prepare(
    `SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.status) {
    updates.push('status = ?');
    values.push(body.status);

    if (body.status === 'in_progress') updates.push('started_at = datetime("now")');
    if (body.status === 'completed') updates.push('completed_at = datetime("now")');
  }

  if (body.executor_id !== undefined) {
    updates.push('executor_id = ?');
    values.push(body.executor_id);
  }

  if (body.rating) {
    updates.push('rating = ?');
    values.push(body.rating);
  }

  if (body.feedback) {
    updates.push('feedback = ?');
    values.push(body.feedback);
  }

  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  // Send notifications on status change (push + DB)
  if (body.status && requestBefore && body.status !== requestBefore.status) {
    const reqNum = requestBefore.request_number || params.id.slice(0, 8);

    // Notify resident on important status changes
    if (requestBefore.resident_id && ['in_progress', 'completed', 'pending_approval'].includes(body.status)) {
      const statusLabels: Record<string, string> = {
        in_progress: 'Работа началась',
        completed: 'Работа выполнена',
        pending_approval: 'Ожидает подтверждения'
      };
      const patchStatusBody = statusLabels[body.status] || body.status;
      sendPushNotification(env, requestBefore.resident_id, {
        title: `📋 Заявка #${reqNum}`,
        body: patchStatusBody,
        type: 'request_status',
        tag: `request-status-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: body.status === 'pending_approval'
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_status', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), requestBefore.resident_id, `📋 Заявка #${reqNum}`, patchStatusBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }

    // Notify executor when request rejected back to them
    if (requestBefore.executor_id && body.status === 'in_progress' && requestBefore.status === 'pending_approval') {
      const patchRejectBody = `Житель отклонил выполнение. Требуется доработка.`;
      sendPushNotification(env, requestBefore.executor_id, {
        title: `⚠️ Заявка #${reqNum} отклонена`,
        body: patchRejectBody,
        type: 'request_rejected',
        tag: `request-rejected-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: true
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), requestBefore.executor_id, `⚠️ Заявка #${reqNum} отклонена`, patchRejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Assign executor
route('POST', '/api/requests/:id/assign', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || (user.role !== 'admin' && user.role !== 'director' && user.role !== 'manager' && user.role !== 'dispatcher' && !isExecutorRole(user.role) && user.role !== 'department_head')) {
    return error('Not authorized to assign requests', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const executorId = body.executor_id;

  // Get executor info
  const executor = await env.DB.prepare(
    `SELECT id, name, phone, specialization FROM users WHERE id = ? AND role = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(executorId, 'executor', ...(tenantId ? [tenantId] : [])).first() as any;

  if (!executor) {
    return error('Executor not found', 404);
  }

  // SECURITY: Department head can only assign to executors in their department
  if (user.role === 'department_head' && user.specialization && executor.specialization !== user.specialization) {
    return error('Department head can only assign to executors in their department', 403);
  }

  // Get request info before update
  const requestBefore = await env.DB.prepare(
    `SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  await env.DB.prepare(`
    UPDATE requests SET executor_id = ?, status = 'assigned', assigned_by = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(executorId, user.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Get updated request
  const updated = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address,
           eu.name as executor_name, eu.phone as executor_phone
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Send push + DB notification to executor - new request assigned
  const assignBodyExec = `Заявка #${updated?.request_number || requestBefore?.request_number}: ${updated?.title || requestBefore?.title}. Адрес: ${updated?.address || 'не указан'}`;
  await sendPushNotification(env, executorId, {
    title: '📋 Новая заявка назначена',
    body: assignBodyExec,
    type: 'request_assigned',
    tag: `request-assigned-${params.id}`,
    data: { requestId: params.id, url: '/' },
    requireInteraction: true
  });
  env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_assigned', ?, ?, ?, 0, datetime('now'), ?)`)
    .bind(generateId(), executorId, '📋 Новая заявка назначена', assignBodyExec, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

  // Send push + DB notification to resident - executor assigned
  if (requestBefore?.resident_id) {
    const assignBodyRes = `На вашу заявку #${updated?.request_number || requestBefore?.request_number} назначен исполнитель: ${executor.name}`;
    await sendPushNotification(env, requestBefore.resident_id, {
      title: '👷 Исполнитель назначен',
      body: assignBodyRes,
      type: 'request_status',
      tag: `request-executor-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_assigned', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestBefore.resident_id, '👷 Исполнитель назначен', assignBodyRes, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ request: updated });
});

// Requests: Accept (executor accepts assigned request)
route('POST', '/api/requests/:id/accept', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can accept requests', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request info before update
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  await env.DB.prepare(`
    UPDATE requests SET status = 'accepted', updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to resident - executor accepted
  if (requestData.resident_id) {
    const acceptBody = `Исполнитель ${user.name} принял вашу заявку #${requestData.request_number}. Ожидайте начала работ.`;
    await sendPushNotification(env, requestData.resident_id, {
      title: '✅ Заявка принята',
      body: acceptBody,
      type: 'request_status',
      tag: `request-accepted-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_accepted', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '✅ Заявка принята', acceptBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// Requests: Decline/Release (executor declines or releases request - returns to 'new' status)
route('POST', '/api/requests/:id/decline', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can decline requests', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { reason } = body;

  if (!reason || reason.trim().length === 0) {
    return error('Reason is required', 400);
  }

  // Get request info - must be assigned to this executor and in appropriate status
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  // Can only decline if assigned, accepted, or in_progress
  if (!['assigned', 'accepted', 'in_progress'].includes(requestData.status)) {
    return error('Cannot decline request in current status', 400);
  }

  // Update request: clear executor and return to 'new' status
  // Note: Table doesn't have assigned_at, accepted_at, decline_reason columns
  // Only: started_at, completed_at, closed_at exist
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'new',
      executor_id = NULL,
      assigned_by = NULL,
      started_at = NULL,
      updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to resident (non-blocking)
  if (requestData.resident_id) {
    const declineBodyRes = `Исполнитель ${user.name} освободил заявку #${requestData.request_number}. Причина: ${reason}. Заявка возвращена в очередь.`;
    sendPushNotification(env, requestData.resident_id, {
      title: '⚠️ Исполнитель освободил заявку',
      body: declineBodyRes,
      type: 'request_declined',
      tag: `request-declined-${params.id}`,
      data: { requestId: params.id, reason, url: '/' },
      requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_declined', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '⚠️ Исполнитель освободил заявку', declineBodyRes, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  // Notify managers and department heads
  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'director', 'department_head') AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const declineBodyMgr = `${user.name} отказался от заявки #${requestData.request_number}. Причина: ${reason}`;
  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '⚠️ Исполнитель отказался от заявки',
      body: declineBodyMgr,
      type: 'request_declined',
      tag: `request-declined-manager-${params.id}`,
      data: { requestId: params.id, reason, url: '/requests' },
      requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_declined', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), manager.id, '⚠️ Исполнитель отказался', declineBodyMgr, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// ==================== RESCHEDULE REQUESTS ====================

// Create reschedule request (перенос времени)
route('POST', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only residents and executors can create reschedule requests
  if (!['resident', 'executor', 'security'].includes(user.role)) {
    return error('Only residents and executors can request reschedule', 403);
  }

  const body = await request.json() as any;
  const { proposed_date, proposed_time, reason, reason_text } = body;

  if (!proposed_date || !proposed_time || !reason) {
    return error('Missing required fields: proposed_date, proposed_time, reason', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantIdResc = getTenantId(request);

  // Get request info
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, eu.name as executor_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ? ${tenantIdResc ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdResc ? [tenantIdResc] : [])).first() as any;

  if (!requestData) {
    return error('Request not found', 404);
  }

  // Verify user is involved in this request
  const isResident = user.role === 'resident' && requestData.resident_id === user.id;
  const isExecutor = isExecutorRole(user.role) && requestData.executor_id === user.id;

  if (!isResident && !isExecutor) {
    return error('You are not involved in this request', 403);
  }

  // Check for existing pending reschedule
  const existingPending = await env.DB.prepare(`
    SELECT rr.id FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.request_id = ? AND rr.status = 'pending' ${tenantIdResc ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdResc ? [tenantIdResc] : [])).first();

  if (existingPending) {
    return error('There is already a pending reschedule request', 400);
  }

  const initiator = user.role as 'resident' | 'executor';
  const recipientId = isResident ? requestData.executor_id : requestData.resident_id;
  const recipientName = isResident ? requestData.executor_name : requestData.resident_name;
  const recipientRole = isResident ? 'executor' : 'resident';

  if (!recipientId) {
    return error('No recipient found for reschedule request', 400);
  }

  const id = generateId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await env.DB.prepare(`
    INSERT INTO reschedule_requests (
      id, request_id, initiator, initiator_id, initiator_name,
      recipient_id, recipient_name, recipient_role,
      current_date, current_time, proposed_date, proposed_time,
      reason, reason_text, status, expires_at, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    id, params.id, initiator, user.id, user.name,
    recipientId, recipientName, recipientRole,
    requestData.scheduled_at?.split('T')[0] || null,
    requestData.scheduled_at?.split('T')[1]?.substring(0, 5) || null,
    proposed_date, proposed_time,
    reason, reason_text || null, expiresAt, getTenantId(request)
  ).run();

  const reschedule = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ?
  `).bind(id).first();

  // Send push notification to recipient
  await sendPushNotification(env, recipientId, {
    title: '⏰ Запрос на перенос времени',
    body: `${user.name} просит перенести заявку на ${proposed_date} ${proposed_time}`,
    type: 'reschedule_requested',
    tag: `reschedule-${id}`,
    data: { rescheduleId: id, requestId: params.id },
    requireInteraction: true
  }).catch(() => {});

  return json({ reschedule }, 201);
});

// Get reschedule requests for current user (both as recipient and initiator)
route('GET', '/api/reschedule-requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id via requests table
  const tenantId = getTenantId(request);

  // Get pending reschedules where user is recipient OR initiator
  const { results } = await env.DB.prepare(`
    SELECT rr.*, r.title as request_title, r.status as request_status, r.number as request_number
    FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE (rr.recipient_id = ? OR rr.initiator_id = ?) AND rr.status = 'pending'
    ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY rr.created_at DESC
  `).bind(user.id, user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ reschedules: results });
});

// Get reschedule requests for a specific request
route('GET', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id via requests table
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT rr.* FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.request_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY rr.created_at DESC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ reschedules: results });
});

// Respond to reschedule request (accept/reject)
route('POST', '/api/reschedule-requests/:id/respond', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { accepted, response_note } = body;

  if (typeof accepted !== 'boolean') {
    return error('Missing required field: accepted (boolean)', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id via requests table
  const tenantId = getTenantId(request);

  // Get reschedule request
  const reschedule = await env.DB.prepare(`
    SELECT rr.* FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!reschedule) {
    return error('Reschedule request not found', 404);
  }

  if (reschedule.status !== 'pending') {
    return error('Reschedule request is not pending', 400);
  }

  // Verify user is the recipient
  if (reschedule.recipient_id !== user.id) {
    return error('You are not the recipient of this reschedule request', 403);
  }

  const newStatus = accepted ? 'accepted' : 'rejected';

  // Update reschedule status
  await env.DB.prepare(`
    UPDATE reschedule_requests
    SET status = ?, response_note = ?, responded_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newStatus, response_note || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  // If accepted, update the request's scheduled time
  if (accepted) {
    await env.DB.prepare(`
      UPDATE requests
      SET scheduled_at = datetime(? || 'T' || ? || ':00'),
          updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(reschedule.proposed_date, reschedule.proposed_time, reschedule.request_id, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  // Get request info for notification message
  const requestInfo = await env.DB.prepare(`
    SELECT number FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reschedule.request_id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Create notification in database
  const notificationId = generateId();
  const notificationTitle = accepted ? '✅ Перенос согласован' : '❌ Перенос отклонён';
  const notificationBody = accepted
    ? `${user.name} принял ваш запрос на перенос заявки #${requestInfo?.number || ''} на ${reschedule.proposed_date} ${reschedule.proposed_time}`
    : `${user.name} отклонил ваш запрос на перенос заявки #${requestInfo?.number || ''}${response_note ? '. Причина: ' + response_note : ''}`;

  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, request_id, created_at${tenantId ? ', tenant_id' : ''})
    VALUES (?, ?, ?, ?, ?, ?, datetime('now')${tenantId ? ', ?' : ''})
  `).bind(
    notificationId,
    reschedule.initiator_id,
    accepted ? 'reschedule_accepted' : 'reschedule_rejected',
    notificationTitle,
    notificationBody,
    reschedule.request_id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  // Send real-time notification via WebSocket
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);
    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'notification',
        userId: reschedule.initiator_id,
        data: {
          id: notificationId,
          type: accepted ? 'reschedule_accepted' : 'reschedule_rejected',
          title: notificationTitle,
          message: notificationBody,
          requestId: reschedule.request_id,
          createdAt: new Date().toISOString()
        }
      })
    });
  } catch (e) {
    // WebSocket broadcast is non-critical
  }

  // Send push notification to initiator
  sendPushNotification(env, reschedule.initiator_id, {
    title: notificationTitle,
    body: notificationBody,
    type: 'reschedule_responded',
    tag: `reschedule-response-${params.id}`,
    data: { rescheduleId: params.id, requestId: reschedule.request_id }
  }).catch(() => {});

  return json({ reschedule: updated });
});

// Requests: Start work
route('POST', '/api/requests/:id/start', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can start work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request info before update
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  await env.DB.prepare(`
    UPDATE requests SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to resident - work started
  if (requestData.resident_id) {
    const startBody = `Исполнитель ${user.name} начал работу по заявке #${requestData.request_number}.`;
    await sendPushNotification(env, requestData.resident_id, {
      title: '🔧 Работа началась',
      body: startBody,
      type: 'request_status',
      tag: `request-started-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_started', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '🔧 Работа началась', startBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  // Notify department heads about work started
  const { results: deptHeadsStart } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const startBodyHead = `${user.name} начал работу по заявке #${requestData.request_number}`;
  for (const head of (deptHeadsStart || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '🔧 Работа началась',
      body: startBodyHead,
      type: 'request_started',
      tag: `request-started-head-${params.id}`,
      data: { requestId: params.id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_started', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), head.id, '🔧 Работа началась', startBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// Requests: Complete work (executor marks work as done, waiting for resident approval)
route('POST', '/api/requests/:id/complete', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can complete work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request info for notification
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  // Update status to pending_approval (waiting for resident confirmation)
  await env.DB.prepare(`
    UPDATE requests SET status = 'pending_approval', completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push notification to resident - work completed, please approve
  if (requestData.resident_id) {
    const completeBody = `Исполнитель ${user.name} завершил работу по заявке #${requestData.request_number}. Пожалуйста, подтвердите выполнение и оцените работу.`;
    await sendPushNotification(env, requestData.resident_id, {
      title: '✅ Работа завершена!',
      body: completeBody,
      type: 'request_completed',
      tag: `request-completed-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: true
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_completed', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '✅ Работа завершена!', completeBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  // Notify department heads about completed work
  const { results: deptHeads } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const completeBodyHead = `${user.name} завершил заявку #${requestData.request_number}. Ожидается подтверждение жителя.`;
  for (const head of (deptHeads || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '✅ Исполнитель завершил работу',
      body: completeBodyHead,
      type: 'request_completed',
      tag: `request-completed-head-${params.id}`,
      data: { requestId: params.id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_completed', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), head.id, '✅ Исполнитель завершил работу', completeBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// Requests: Pause work
route('POST', '/api/requests/:id/pause', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can pause work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { reason } = body;

  // Check request exists and is in_progress
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found, not assigned to you, or not in progress', 404);
  }

  // Check if already paused
  if (requestData.is_paused) {
    return error('Request is already paused', 400);
  }

  // Update request to paused state
  await env.DB.prepare(`
    UPDATE requests
    SET is_paused = 1, paused_at = datetime('now'), pause_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Get updated request
  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ success: true, request: updated });
});

// Requests: Resume work
route('POST', '/api/requests/:id/resume', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can resume work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check request exists and is paused
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' AND is_paused = 1 ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found, not assigned to you, or not paused', 404);
  }

  // Calculate paused duration in seconds
  const pausedAt = new Date(requestData.paused_at).getTime();
  const now = Date.now();
  const pausedDuration = Math.floor((now - pausedAt) / 1000);
  const newTotalPausedTime = (requestData.total_paused_time || 0) + pausedDuration;

  // Update request - resume work
  await env.DB.prepare(`
    UPDATE requests
    SET is_paused = 0, paused_at = NULL, pause_reason = NULL, total_paused_time = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newTotalPausedTime, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Get updated request
  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ success: true, request: updated, pausedDuration, totalPausedTime: newTotalPausedTime });
});

// Requests: Approve (resident confirms work is done)
route('POST', '/api/requests/:id/approve', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { rating, feedback } = body;

  // Verify request belongs to this resident and is pending approval
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not pending approval', 404);
  }

  // Update status to completed (also reset any pause state)
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'completed',
      rating = ?,
      feedback = ?,
      is_paused = 0,
      paused_at = NULL,
      pause_reason = NULL,
      updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(rating || null, feedback || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to executor - work approved
  if (requestData.executor_id) {
    const ratingText = rating ? ` Оценка: ${'⭐'.repeat(rating)}` : '';
    const approveBody = `Житель подтвердил выполнение заявки #${requestData.request_number}.${ratingText}`;
    await sendPushNotification(env, requestData.executor_id, {
      title: '🎉 Работа подтверждена!',
      body: approveBody,
      type: 'request_approved',
      tag: `request-approved-${params.id}`,
      data: { requestId: params.id, rating, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '🎉 Работа подтверждена!', approveBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    // Get executor name for notification
    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(requestData.executor_id).first() as any;

    // Notify department heads about approved work with rating
    const { results: deptHeads } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all();

    const ratingStars = rating ? '⭐'.repeat(rating) : 'без оценки';
    const approveBodyHead = `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number} подтверждена. ${ratingStars}`;
    for (const head of (deptHeads || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '✅ Заявка закрыта',
        body: approveBodyHead,
        type: 'request_approved',
        tag: `request-approved-head-${params.id}`,
        data: { requestId: params.id, rating, url: '/requests' },
        requireInteraction: false
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), head.id, '✅ Заявка закрыта', approveBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Reject (resident rejects work, sends back to executor)
route('POST', '/api/requests/:id/reject', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { reason } = body;

  if (!reason || reason.trim().length === 0) {
    return error('Reason is required', 400);
  }

  // Verify request belongs to this resident and is pending approval
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not pending approval', 404);
  }

  // Get current rejection count
  const currentCount = requestData.rejection_count || 0;

  // Update status back to in_progress
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'in_progress',
      rejection_reason = ?,
      rejection_count = ?,
      updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reason, currentCount + 1, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to executor - work rejected
  if (requestData.executor_id) {
    const rejectBody = `Житель отклонил работу по заявке #${requestData.request_number}. Причина: ${reason}`;
    await sendPushNotification(env, requestData.executor_id, {
      title: '❌ Работа отклонена',
      body: rejectBody,
      type: 'request_rejected',
      tag: `request-rejected-${params.id}`,
      data: { requestId: params.id, reason, url: '/' },
      requireInteraction: true
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '❌ Работа отклонена', rejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    // Get executor name for notification to department heads
    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(requestData.executor_id).first() as any;

    // Notify department heads about rejected work
    const { results: deptHeadsReject } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all();

    const rejectBodyHead = `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number}. Причина: ${reason}`;
    for (const head of (deptHeadsReject || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '❌ Работа отклонена жителем',
        body: rejectBodyHead,
        type: 'request_rejected',
        tag: `request-rejected-head-${params.id}`,
        data: { requestId: params.id, reason, url: '/requests' },
        requireInteraction: true
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), head.id, '❌ Работа отклонена жителем', rejectBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Cancel
route('POST', '/api/requests/:id/cancel', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const reason = body.reason || 'Без причины';

  // Get request data
  const requestData = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!requestData) return error('Request not found', 404);

  // Check permissions
  // Residents can cancel only before work starts (new, assigned, accepted)
  // Managers/Admins can cancel any request not completed
  const isResident = user.role === 'resident';
  const canResidentCancel = ['new', 'assigned', 'accepted'].includes(requestData.status as string);
  const canManagerCancel = requestData.status !== 'completed';

  if (isResident && requestData.resident_id !== user.id) {
    return error('Forbidden', 403);
  }

  if (isResident && !canResidentCancel) {
    return error('Cannot cancel request in this status', 400);
  }

  if (!isResident && !canManagerCancel) {
    return error('Cannot cancel completed request', 400);
  }

  const cancelledBy = isResident ? 'resident' : user.role;

  await env.DB.prepare(`
    UPDATE requests
    SET status = 'cancelled',
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Add to history
  await env.DB.prepare(`
    INSERT INTO request_history (id, request_id, user_id, action, old_status, new_status, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    params.id,
    user.id,
    'cancelled',
    requestData.status,
    'cancelled',
    `Отменена (${cancelledBy}): ${reason}`
  ).run();

  // Send notification to executor if assigned
  if (requestData.executor_id && !isResident) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(
      generateId(),
      requestData.executor_id,
      'Заявка отменена',
      `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`,
      getTenantId(request)
    ).run();
  }

  // Send notification to resident if cancelled by manager/admin
  if (!isResident && requestData.resident_id) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(
      generateId(),
      requestData.resident_id,
      'Заявка отменена',
      `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`,
      getTenantId(request)
    ).run();
  }

  invalidateCache('requests');

  return json({ success: true });
});

// Requests: Rate (legacy endpoint, now uses approve)
route('POST', '/api/requests/:id/rate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE requests SET rating = ?, feedback = ?, status = 'completed', updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.rating, body.feedback || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== WORK ORDERS ROUTES ====================

// Work Orders: List
route('GET', '/api/work-orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const priority = url.searchParams.get('priority');
  const buildingId = url.searchParams.get('building_id');

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND wo.tenant_id = ?';
    params.push(tenantId);
  }

  if (status && status !== 'all') {
    whereClause += ' AND wo.status = ?';
    params.push(status);
  }

  if (type && type !== 'all') {
    whereClause += ' AND wo.type = ?';
    params.push(type);
  }

  if (priority && priority !== 'all') {
    whereClause += ' AND wo.priority = ?';
    params.push(priority);
  }

  if (buildingId) {
    whereClause += ' AND wo.building_id = ?';
    params.push(buildingId);
  }

  const { results } = await env.DB.prepare(`
    SELECT wo.*,
           b.name as building_name,
           u.name as assigned_to_name, u.phone as assigned_to_phone,
           cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id
    LEFT JOIN users cu ON wo.created_by = cu.id
    ${whereClause}
    ORDER BY wo.created_at DESC
  `).bind(...params).all();

  return json({ workOrders: results });
});

// Work Orders: Create
route('POST', '/api/work-orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY
  const tenantId = getTenantId(request);

  // Auto-generate work order number: НР-YYYY-NNN
  const year = new Date().getFullYear();
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM work_orders WHERE tenant_id = ?`
  ).bind(tenantId).first() as any;
  const count = (countResult?.count || 0) + 1;
  const number = `НР-${year}-${String(count).padStart(3, '0')}`;

  await env.DB.prepare(`
    INSERT INTO work_orders (id, tenant_id, number, title, description, type, priority, status, building_id, apartment_id, assigned_to, scheduled_date, scheduled_time, estimated_duration, materials, checklist, notes, request_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, tenantId, number, body.title, body.description || null,
    body.type || 'planned', body.priority || 'medium', body.status || 'pending',
    body.building_id || null, body.apartment_id || null, body.assigned_to || null,
    body.scheduled_date || null, body.scheduled_time || null,
    body.estimated_duration || 60,
    body.materials ? JSON.stringify(body.materials) : null,
    body.checklist ? JSON.stringify(body.checklist) : null,
    body.notes || null, body.request_id || null, user.id
  ).run();

  const created = await env.DB.prepare(`
    SELECT wo.*, b.name as building_name, u.name as assigned_to_name, cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id
    LEFT JOIN users cu ON wo.created_by = cu.id
    WHERE wo.id = ? ${tenantId ? 'AND wo.tenant_id = ?' : ''}
  `).bind(id, ...(tenantId ? [tenantId] : [])).first();

  return json({ workOrder: created }, 201);
});

// Work Orders: Update
route('PATCH', '/api/work-orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }
  if (body.priority !== undefined) { updates.push('priority = ?'); values.push(body.priority); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.building_id !== undefined) { updates.push('building_id = ?'); values.push(body.building_id); }
  if (body.apartment_id !== undefined) { updates.push('apartment_id = ?'); values.push(body.apartment_id); }
  if (body.assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(body.assigned_to); }
  if (body.scheduled_date !== undefined) { updates.push('scheduled_date = ?'); values.push(body.scheduled_date); }
  if (body.scheduled_time !== undefined) { updates.push('scheduled_time = ?'); values.push(body.scheduled_time); }
  if (body.estimated_duration !== undefined) { updates.push('estimated_duration = ?'); values.push(body.estimated_duration); }
  if (body.actual_duration !== undefined) { updates.push('actual_duration = ?'); values.push(body.actual_duration); }
  if (body.materials !== undefined) { updates.push('materials = ?'); values.push(JSON.stringify(body.materials)); }
  if (body.checklist !== undefined) { updates.push('checklist = ?'); values.push(JSON.stringify(body.checklist)); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
  if (body.request_id !== undefined) { updates.push('request_id = ?'); values.push(body.request_id); }

  if (updates.length === 0) return error('No fields to update', 400);

  updates.push('updated_at = datetime("now")');
  values.push(params!.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  const updated = await env.DB.prepare(`
    SELECT wo.*, b.name as building_name, u.name as assigned_to_name, cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id
    LEFT JOIN users cu ON wo.created_by = cu.id
    WHERE wo.id = ? ${tenantId ? 'AND wo.tenant_id = ?' : ''}
  `).bind(params!.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ workOrder: updated });
});

// Work Orders: Change status (with auto-timestamps)
route('POST', '/api/work-orders/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const newStatus = body.status;

  if (!newStatus || !['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'].includes(newStatus)) {
    return error('Invalid status', 400);
  }

  const updates: string[] = ['status = ?', 'updated_at = datetime("now")'];
  const values: any[] = [newStatus];

  // Auto-set timestamps based on status transition
  if (newStatus === 'in_progress') {
    updates.push('started_at = datetime("now")');
  }
  if (newStatus === 'completed') {
    updates.push('completed_at = datetime("now")');
    // Calculate actual_duration if started_at exists
    const wo = await env.DB.prepare(
      `SELECT started_at FROM work_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params!.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (wo?.started_at) {
      const startedAt = new Date(wo.started_at).getTime();
      const now = Date.now();
      const durationMinutes = Math.round((now - startedAt) / 60000);
      updates.push('actual_duration = ?');
      values.push(durationMinutes);
    }
  }

  values.push(params!.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  return json({ success: true });
});

// Work Orders: Delete
route('DELETE', '/api/work-orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  await env.DB.prepare(
    `DELETE FROM work_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params!.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== CATEGORIES ROUTES ====================

route('GET', '/api/categories', async (request, env) => {
  const tenantId = getTenantId(request);
  // Кэшируем категории на 24 часа (статические данные)
  const cacheKey = `${CachePrefix.CATEGORIES_ALL}:${tenantId || 'global'}`;
  const results = await cachedQuery(
    cacheKey,
    CacheTTL.CATEGORIES,
    async () => {
      const { results } = await env.DB.prepare(`SELECT * FROM categories WHERE is_active = 1 ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`).bind(...(tenantId ? [tenantId] : [])).all();
      return results;
    },
    env.RATE_LIMITER
  );

  return json(results, 200, 'public, max-age=86400'); // 24 hours
});

} // end registerRequestRoutes
