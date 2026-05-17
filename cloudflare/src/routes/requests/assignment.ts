// Request assignment and update
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../../index';

export function registerAssignmentRoutes() {

// Requests: Assign executor
route('POST', '/api/requests/:id/assign', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || (user.role !== 'admin' && user.role !== 'director' && user.role !== 'manager' && user.role !== 'dispatcher' && !isExecutorRole(user.role) && user.role !== 'department_head')) {
    return error('Not authorized to assign requests', 403);
  }
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const executorId = body.executor_id;

  const executor = await env.DB.prepare(
    `SELECT id, name, phone, specialization FROM users WHERE id = ? AND role = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(executorId, 'executor', ...(tenantId ? [tenantId] : [])).first() as any;

  if (!executor) return error('Executor not found', 404);

  if (user.role === 'department_head' && user.specialization && executor.specialization !== user.specialization) {
    return error('Department head can only assign to executors in their department', 403);
  }

  const requestBefore = await env.DB.prepare(
    `SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestBefore) return error('Request not found', 404);

  // Sprint 60 P0: race-condition guard. Two executors / dispatchers can call
  // /assign on the same 'new' request simultaneously without this — last
  // writer wins, first executor silently loses the job. Restrict to
  // reassignable states + verify .changes === 1 so the second caller gets
  // a clear "already taken" error rather than a silent overwrite.
  const reassignableStates = ['new', 'pending', 'assigned', 'accepted'];
  const assignResult = await env.DB.prepare(`
    UPDATE requests SET executor_id = ?, status = 'assigned', assigned_by = ?, updated_at = datetime('now')
    WHERE id = ? AND status IN (${reassignableStates.map(() => '?').join(',')}) ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(executorId, user.id, params.id, ...reassignableStates, ...(tenantId ? [tenantId] : [])).run();

  if (!assignResult.meta || assignResult.meta.changes === 0) {
    return error('Request can no longer be assigned (already in progress, completed, or cancelled)', 409);
  }

  const updated = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address,
           eu.name as executor_name, eu.phone as executor_phone
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  const assignBodyExec = `Заявка #${updated?.request_number || requestBefore?.request_number}: ${updated?.title || requestBefore?.title}. Адрес: ${updated?.address || 'не указан'}`;
  sendPushNotification(env, executorId, {
    title: '📋 Новая заявка назначена', body: assignBodyExec, type: 'request_assigned',
    tag: `request-assigned-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: true
  }).catch((err) => { console.error('push notification failed:', err); });
  env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_assigned', ?, ?, ?, 0, datetime('now'), ?)`)
    .bind(generateId(), executorId, '📋 Новая заявка назначена', assignBodyExec, JSON.stringify({ request_id: params.id }), tenantId).run().catch((err) => { console.error('notification insert failed:', err); });

  if (requestBefore?.resident_id) {
    const assignBodyRes = `На вашу заявку #${updated?.request_number || requestBefore?.request_number} назначен исполнитель: ${executor.name}`;
    sendPushNotification(env, requestBefore.resident_id, {
      title: '👷 Исполнитель назначен', body: assignBodyRes, type: 'request_status',
      tag: `request-executor-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: false
    }).catch((err) => { console.error('push notification failed:', err); });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_assigned', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestBefore.resident_id, '👷 Исполнитель назначен', assignBodyRes, JSON.stringify({ request_id: params.id }), tenantId).run().catch((err) => { console.error('notification insert failed:', err); });
  }

  invalidateCache('requests:');
  invalidateCache('requests:' + params.id);
  return json({ request: updated });
});

// Requests: Update (generic PATCH)
route('PATCH', '/api/requests/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const requestBefore = await env.DB.prepare(
    `SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestBefore) return error('Request not found', 404);

  // Sprint 60 P1: ownership + role check. Was authorising ANY logged-in
  // user — a malicious resident could PATCH another resident's request
  // (only tenant scoping protected). Now: staff roles can update any
  // request in their tenant; residents can only update their own.
  const isStaff = ['admin', 'manager', 'director', 'department_head', 'dispatcher'].includes(user.role) || isExecutorRole(user.role);
  const isOwner = requestBefore.resident_id === user.id;
  const isAssignedExecutor = requestBefore.executor_id === user.id;
  if (!isStaff && !isOwner && !isAssignedExecutor) {
    return error('Forbidden: you are not involved in this request', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.status) {
    updates.push('status = ?'); values.push(body.status);
    if (body.status === 'in_progress') updates.push('started_at = datetime("now")');
    if (body.status === 'completed') updates.push('completed_at = datetime("now")');
  }
  if (body.executor_id !== undefined) { updates.push('executor_id = ?'); values.push(body.executor_id); }
  // Sprint 60 P1: clamp rating 1-5 (FE could send arbitrary numbers, schema
  // CHECK only catches it as a 500-style error — better to 400 explicitly).
  if (body.rating !== undefined && body.rating !== null) {
    const n = Number(body.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) return error('rating must be an integer 1-5', 400);
    updates.push('rating = ?'); values.push(n);
  }
  if (body.feedback) { updates.push('feedback = ?'); values.push(body.feedback); }
  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  if (body.status && requestBefore && body.status !== requestBefore.status) {
    const reqNum = requestBefore.request_number || params.id.slice(0, 8);
    if (requestBefore.resident_id && ['in_progress', 'completed', 'pending_approval'].includes(body.status)) {
      const statusLabels: Record<string, string> = { in_progress: 'Работа началась', completed: 'Работа выполнена', pending_approval: 'Ожидает подтверждения' };
      const patchStatusBody = statusLabels[body.status] || body.status;
      sendPushNotification(env, requestBefore.resident_id, {
        title: `📋 Заявка #${reqNum}`, body: patchStatusBody, type: 'request_status',
        tag: `request-status-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: body.status === 'pending_approval'
      }).catch((err) => { console.error('push notification failed:', err); });
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_status', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), requestBefore.resident_id, `📋 Заявка #${reqNum}`, patchStatusBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch((err) => { console.error('notification insert failed:', err); });
    }
    if (requestBefore.executor_id && body.status === 'in_progress' && requestBefore.status === 'pending_approval') {
      const patchRejectBody = `Житель отклонил выполнение. Требуется доработка.`;
      sendPushNotification(env, requestBefore.executor_id, {
        title: `⚠️ Заявка #${reqNum} отклонена`, body: patchRejectBody, type: 'request_rejected',
        tag: `request-rejected-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: true
      }).catch((err) => { console.error('push notification failed:', err); });
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), requestBefore.executor_id, `⚠️ Заявка #${reqNum} отклонена`, patchRejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch((err) => { console.error('notification insert failed:', err); });
    }
  }

  invalidateCache('requests:');
  invalidateCache('requests:' + params.id);
  return json({ success: true });
});

} // end registerAssignmentRoutes
