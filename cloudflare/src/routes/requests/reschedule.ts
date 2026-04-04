// Reschedule requests
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../../index';

export function registerRescheduleRoutes() {
// Create reschedule request
route('POST', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  if (!['resident', 'executor', 'security'].includes(user.role)) {
    return error('Only residents and executors can request reschedule', 403);
  }

  const body = await request.json() as any;
  const { proposed_date, proposed_time, reason, reason_text } = body;
  if (!proposed_date || !proposed_time || !reason) {
    return error('Missing required fields: proposed_date, proposed_time, reason', 400);
  }

  const tenantIdResc = getTenantId(request);

  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, eu.name as executor_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ? ${tenantIdResc ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdResc ? [tenantIdResc] : [])).first() as any;

  if (!requestData) return error('Request not found', 404);

  const isResident = user.role === 'resident' && requestData.resident_id === user.id;
  const isExecutor = isExecutorRole(user.role) && requestData.executor_id === user.id;
  if (!isResident && !isExecutor) return error('You are not involved in this request', 403);

  const existingPending = await env.DB.prepare(`
    SELECT rr.id FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.request_id = ? AND rr.status = 'pending' ${tenantIdResc ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdResc ? [tenantIdResc] : [])).first();

  if (existingPending) return error('There is already a pending reschedule request', 400);

  const initiator = user.role as 'resident' | 'executor';
  const recipientId = isResident ? requestData.executor_id : requestData.resident_id;
  const recipientName = isResident ? requestData.executor_name : requestData.resident_name;
  const recipientRole = isResident ? 'executor' : 'resident';
  if (!recipientId) return error('No recipient found for reschedule request', 400);

  const id = generateId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

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

  const reschedule = await env.DB.prepare(`SELECT * FROM reschedule_requests WHERE id = ?`).bind(id).first();

  sendPushNotification(env, recipientId, {
    title: '⏰ Запрос на перенос времени',
    body: `${user.name} просит перенести заявку на ${proposed_date} ${proposed_time}`,
    type: 'reschedule_requested', tag: `reschedule-${id}`,
    data: { rescheduleId: id, requestId: params.id }, requireInteraction: true
  }).catch(() => {});

  return json({ reschedule }, 201);
});
// Get reschedule requests for current user
route('GET', '/api/reschedule-requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT rr.*, r.title as request_title, r.status as request_status, r.number as request_number
    FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE (rr.recipient_id = ? OR rr.initiator_id = ?) AND rr.status = 'pending'
    ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY rr.created_at DESC LIMIT 500
  `).bind(user.id, user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ reschedules: results });
});
// Get reschedule requests for a specific request
route('GET', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

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
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await request.json() as any;
  const { accepted, response_note } = body;
  if (typeof accepted !== 'boolean') return error('Missing required field: accepted (boolean)', 400);

  const tenantId = getTenantId(request);
  const reschedule = await env.DB.prepare(`
    SELECT rr.* FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!reschedule) return error('Reschedule request not found', 404);
  if (reschedule.status !== 'pending') return error('Reschedule request is not pending', 400);
  if (reschedule.recipient_id !== user.id) return error('You are not the recipient of this reschedule request', 403);

  const newStatus = accepted ? 'accepted' : 'rejected';
  await env.DB.prepare(`
    UPDATE reschedule_requests SET status = ?, response_note = ?, responded_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newStatus, response_note || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  if (accepted) {
    await env.DB.prepare(`
      UPDATE requests SET scheduled_at = datetime(? || 'T' || ? || ':00'), updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(reschedule.proposed_date, reschedule.proposed_time, reschedule.request_id, ...(tenantId ? [tenantId] : [])).run();
  }
  const updated = await env.DB.prepare(`SELECT * FROM reschedule_requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  const requestInfo = await env.DB.prepare(`SELECT number FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(reschedule.request_id, ...(tenantId ? [tenantId] : [])).first() as any;
  const notificationId = generateId();
  const notificationTitle = accepted ? '✅ Перенос согласован' : '❌ Перенос отклонён';
  const notificationBody = accepted
    ? `${user.name} принял ваш запрос на перенос заявки #${requestInfo?.number || ''} на ${reschedule.proposed_date} ${reschedule.proposed_time}`
    : `${user.name} отклонил ваш запрос на перенос заявки #${requestInfo?.number || ''}${response_note ? '. Причина: ' + response_note : ''}`;

  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, request_id, created_at${tenantId ? ', tenant_id' : ''})
    VALUES (?, ?, ?, ?, ?, ?, datetime('now')${tenantId ? ', ?' : ''})
  `).bind(notificationId, reschedule.initiator_id,
    accepted ? 'reschedule_accepted' : 'reschedule_rejected',
    notificationTitle, notificationBody, reschedule.request_id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);
    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'notification', userId: reschedule.initiator_id,
        data: {
          id: notificationId, type: accepted ? 'reschedule_accepted' : 'reschedule_rejected',
          title: notificationTitle, message: notificationBody,
          requestId: reschedule.request_id, createdAt: new Date().toISOString()
        },
        tenantId: tenantId || undefined,
      })
    });
  } catch (e) { /* WebSocket broadcast is non-critical */ }

  sendPushNotification(env, reschedule.initiator_id, {
    title: notificationTitle, body: notificationBody, type: 'reschedule_responded',
    tag: `reschedule-response-${params.id}`, data: { rescheduleId: params.id, requestId: reschedule.request_id }
  }).catch(() => {});

  return json({ reschedule: updated });
});

} // end registerRescheduleRoutes
