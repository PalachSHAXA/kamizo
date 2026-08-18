// Request assignment and update
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import {
  canAssignRequests,
  canRateOwnedRequest,
  hasOnlyFields,
  hasTenantContext,
  isRequestOwnerRole,
  isValidOptionalText,
  isValidRequestId,
  isValidRequestRating,
  readPlainJsonBody,
} from './security';

export function registerAssignmentRoutes() {

// Requests: Assign executor
route('POST', '/api/requests/:id/assign', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!canAssignRequests(user.role)) return error('Not authorized to assign requests', 403);

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);
  if (user.role === 'department_head' && (typeof user.specialization !== 'string' || !user.specialization.trim())) {
    return error('Department head specialization is required', 403);
  }

  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await readPlainJsonBody(request);
  if (!body || !hasOnlyFields(body, ['executor_id']) || !isValidRequestId(body.executor_id)) {
    return error('executor_id must be a non-empty string', 400);
  }
  const executorId = body.executor_id;

  const executor = await env.DB.prepare(
    'SELECT id, name, phone, specialization FROM users WHERE id = ? AND role = ? AND tenant_id = ?'
  ).bind(executorId, 'executor', tenantId).first() as any;

  if (!executor) return error('Executor not found', 404);

  if (user.role === 'department_head' && executor.specialization !== user.specialization) {
    return error('Department head can only assign to executors in their department', 403);
  }

  const requestBefore = await env.DB.prepare(
    'SELECT * FROM requests WHERE id = ? AND tenant_id = ?'
  ).bind(params.id, tenantId).first() as any;

  if (!requestBefore) return error('Request not found', 404);

  // Sprint 60 P0: race-condition guard. Two executors / dispatchers can call
  // /assign on the same 'new' request simultaneously without this — last
  // writer wins, first executor silently loses the job. Restrict to
  // reassignable states + verify .changes === 1 so the second caller gets
  // a clear "already taken" error rather than a silent overwrite.
  const reassignableStates = ['new', 'pending', 'assigned', 'accepted'];
  const assignResult = await env.DB.prepare(`
    UPDATE requests SET executor_id = ?, status = 'assigned', assigned_by = ?, updated_at = datetime('now')
    WHERE id = ? AND status IN (${reassignableStates.map(() => '?').join(',')}) AND tenant_id = ?
  `).bind(executorId, user.id, params.id, ...reassignableStates, tenantId).run();

  if (!assignResult.meta || assignResult.meta.changes === 0) {
    return error('Request can no longer be assigned (already in progress, completed, or cancelled)', 409);
  }

  const updated = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address,
           eu.name as executor_name, eu.phone as executor_phone
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id AND u.tenant_id = r.tenant_id
    LEFT JOIN users eu ON r.executor_id = eu.id AND eu.tenant_id = r.tenant_id
    WHERE r.id = ? AND r.tenant_id = ?
  `).bind(params.id, tenantId).first() as any;

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

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await readPlainJsonBody(request);
  if (!body || !hasOnlyFields(body, ['rating', 'feedback'])) return error('Invalid request body', 400);
  if (!isValidRequestRating(body.rating)) return error('rating must be an integer 1-5', 400);
  if (!isValidOptionalText(body.feedback, 2000)) return error('feedback must be a string up to 2000 characters', 400);
  if (!isRequestOwnerRole(user.role)) return error('Forbidden', 403);

  const requestBefore = await env.DB.prepare(
    'SELECT resident_id, status FROM requests WHERE id = ? AND tenant_id = ?'
  ).bind(params.id, tenantId).first() as { resident_id: string; status: string } | null;

  if (!requestBefore) return error('Request not found', 404);
  if (requestBefore.resident_id !== user.id) return error('Forbidden', 403);
  if (!canRateOwnedRequest(requestBefore.status)) return error('Cannot rate request in this status', 400);

  const updateResult = await env.DB.prepare(`
    UPDATE requests SET rating = ?, feedback = ?, updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? AND status IN ('pending_approval', 'completed') AND tenant_id = ?
  `).bind(body.rating, body.feedback || null, params.id, user.id, tenantId).run();

  if (!updateResult.meta || updateResult.meta.changes === 0) {
    return error('Request state changed while rating', 409);
  }

  invalidateCache('requests:');
  invalidateCache('requests:' + params.id);
  return json({ success: true });
});

} // end registerAssignmentRoutes
