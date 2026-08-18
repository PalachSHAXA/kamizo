// Request approval: approve, reject, cancel, rate

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import {
  canManagementCancel,
  canOwnerCancel,
  canRateOwnedRequest,
  hasOnlyFields,
  hasTenantContext,
  isRequestOwnerRole,
  isValidOptionalText,
  isValidRequestRating,
  readPlainJsonBody,
} from './security';

export function registerApprovalRoutes() {

// Requests: Approve (resident confirms work is done)
route('POST', '/api/requests/:id/approve', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await readPlainJsonBody(request);
  if (!body || !hasOnlyFields(body, ['rating', 'feedback'])) return error('Invalid request body', 400);
  if (!isValidOptionalText(body.feedback, 2000)) return error('feedback must be a string up to 2000 characters', 400);
  const feedback = body.feedback;

  // Sprint 60 P1: clamp rating 1-5. Was accepting any number from FE.
  let rating: number | null = null;
  if (body.rating !== undefined) {
    if (!isValidRequestRating(body.rating)) return error('rating must be an integer 1-5', 400);
    rating = body.rating;
  }

  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' AND tenant_id = ?
  `).bind(params.id, user.id, tenantId).first() as any;

  if (!requestData) return error('Request not found or not pending approval', 404);

  const approveResult = await env.DB.prepare(`
    UPDATE requests SET status = 'completed', rating = ?, feedback = ?,
      is_paused = 0, paused_at = NULL, pause_reason = NULL, updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? AND status = 'pending_approval' AND tenant_id = ?
  `).bind(rating, feedback || null, params.id, user.id, tenantId).run();

  if (!approveResult.meta || approveResult.meta.changes === 0) {
    return error('Request state changed while approving', 409);
  }

  if (requestData.executor_id) {
    const ratingText = rating ? ` Оценка: ${'⭐'.repeat(rating)}` : '';
    const approveBody = `Житель подтвердил выполнение заявки #${requestData.request_number}.${ratingText}`;
    sendPushNotification(env, requestData.executor_id, {
      title: '🎉 Работа подтверждена!', body: approveBody, type: 'request_approved',
      tag: `request-approved-${params.id}`, data: { requestId: params.id, rating, url: '/' }, requireInteraction: false
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '🎉 Работа подтверждена!', approveBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ? AND tenant_id = ?').bind(requestData.executor_id, tenantId).first() as any;
    const { results: deptHeads } = await env.DB.prepare(
      "SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 AND tenant_id = ?"
    ).bind(tenantId).all();

    const ratingStars = rating ? '⭐'.repeat(rating) : 'без оценки';
    const approveBodyHead = `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number} подтверждена. ${ratingStars}`;
    for (const head of (deptHeads || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '✅ Заявка закрыта', body: approveBodyHead, type: 'request_approved',
        tag: `request-approved-head-${params.id}`, data: { requestId: params.id, rating, url: '/requests' }, requireInteraction: false
      }).catch((err) => { console.error('fire-and-forget failed:', err); });
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), head.id, '✅ Заявка закрыта', approveBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }
  return json({ success: true });
});

// Requests: Reject (resident rejects work)
route('POST', '/api/requests/:id/reject', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await readPlainJsonBody(request);
  if (!body || !hasOnlyFields(body, ['reason']) || typeof body.reason !== 'string' || body.reason.trim().length === 0 || body.reason.length > 1000) {
    return error('Reason is required and must be at most 1000 characters', 400);
  }
  const reason = body.reason;

  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' AND tenant_id = ?
  `).bind(params.id, user.id, tenantId).first() as any;

  if (!requestData) return error('Request not found or not pending approval', 404);

  const currentCount = requestData.rejection_count || 0;
  const rejectResult = await env.DB.prepare(`
    UPDATE requests SET status = 'in_progress', rejection_reason = ?, rejection_count = ?, updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? AND status = 'pending_approval' AND tenant_id = ?
  `).bind(reason, currentCount + 1, params.id, user.id, tenantId).run();

  if (!rejectResult.meta || rejectResult.meta.changes === 0) {
    return error('Request state changed while rejecting', 409);
  }

  if (requestData.executor_id) {
    const rejectBody = `Житель отклонил работу по заявке #${requestData.request_number}. Причина: ${reason}`;
    sendPushNotification(env, requestData.executor_id, {
      title: '❌ Работа отклонена', body: rejectBody, type: 'request_rejected',
      tag: `request-rejected-${params.id}`, data: { requestId: params.id, reason, url: '/' }, requireInteraction: true
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '❌ Работа отклонена', rejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ? AND tenant_id = ?').bind(requestData.executor_id, tenantId).first() as any;
    const { results: deptHeadsReject } = await env.DB.prepare(
      "SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 AND tenant_id = ?"
    ).bind(tenantId).all();

    const rejectBodyHead = `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number}. Причина: ${reason}`;
    for (const head of (deptHeadsReject || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '❌ Работа отклонена жителем', body: rejectBodyHead, type: 'request_rejected',
        tag: `request-rejected-head-${params.id}`, data: { requestId: params.id, reason, url: '/requests' }, requireInteraction: true
      }).catch((err) => { console.error('fire-and-forget failed:', err); });
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

  const tenantId = getTenantId(request);
  if (!hasTenantContext(tenantId)) return error('Tenant context required', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const body = await readPlainJsonBody(request);
  if (!body || !hasOnlyFields(body, ['reason']) || !isValidOptionalText(body.reason, 1000)) {
    return error('reason must be a string up to 1000 characters', 400);
  }
  const reason = body.reason?.trim() || 'Без причины';

  const isOwner = isRequestOwnerRole(user.role);
  const isManagement = canManagementCancel(user.role);
  if (!isOwner && !isManagement) return error('Forbidden', 403);

  const requestData = await env.DB.prepare('SELECT * FROM requests WHERE id = ? AND tenant_id = ?').bind(params.id, tenantId).first();
  if (!requestData) return error('Request not found', 404);

  if (isOwner && requestData.resident_id !== user.id) return error('Forbidden', 403);
  if (isOwner && !canOwnerCancel(requestData.status as string)) return error('Cannot cancel request in this status', 400);
  if (isManagement && ['completed', 'cancelled'].includes(requestData.status as string)) return error('Cannot cancel request in this status', 400);

  const cancelledBy = user.role;
  const cancelStatement = isOwner
    ? env.DB.prepare(`
        UPDATE requests SET status = 'cancelled', updated_at = datetime('now')
        WHERE id = ? AND resident_id = ? AND status IN ('new', 'assigned', 'accepted') AND tenant_id = ?
      `).bind(params.id, user.id, tenantId)
    : env.DB.prepare(`
        UPDATE requests SET status = 'cancelled', updated_at = datetime('now')
        WHERE id = ? AND status NOT IN ('completed', 'cancelled') AND tenant_id = ?
      `).bind(params.id, tenantId);
  const historyStatement = env.DB.prepare(`
    INSERT INTO request_history (id, request_id, action, old_status, new_status, comment, changed_by, changed_at, tenant_id)
    SELECT ?, ?, ?, ?, ?, ?, ?, datetime('now'), ? WHERE changes() = 1
  `).bind(generateId(), params.id, 'cancelled', requestData.status, 'cancelled', `Отменена (${cancelledBy}): ${reason}`, user.id, tenantId);
  const [cancelResult] = await env.DB.batch([cancelStatement, historyStatement]);

  if (!cancelResult.meta || cancelResult.meta.changes === 0) {
    return error('Request state changed while cancelling', 409);
  }

  // Notify executor + resident when manager/admin cancels.
  // Previously we only inserted into the notifications table — pushes were
  // missing, so the resident only saw the cancellation on the next sync.
  // Audit P1 fix: also send a push so they see it immediately.
  const cancelTitle = 'Заявка отменена';
  const cancelBody = `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`;

  if (requestData.executor_id && isManagement) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(generateId(), requestData.executor_id, cancelTitle, cancelBody, tenantId).run();
    sendPushNotification(env, requestData.executor_id as string, {
      title: cancelTitle, body: cancelBody, type: 'request_cancelled',
      tag: `request-cancelled-${params.id}`, data: { requestId: params.id },
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
  }

  if (isManagement && requestData.resident_id) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(generateId(), requestData.resident_id, cancelTitle, cancelBody, tenantId).run();
    sendPushNotification(env, requestData.resident_id as string, {
      title: cancelTitle, body: cancelBody, type: 'request_cancelled',
      tag: `request-cancelled-${params.id}`, data: { requestId: params.id },
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
  }

  invalidateCache('requests');
  return json({ success: true });
});

// Requests: Rate (legacy endpoint)
route('POST', '/api/requests/:id/rate', async (request, env, params) => {
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

  const requestData = await env.DB.prepare(`
    SELECT status FROM requests WHERE id = ? AND resident_id = ? AND tenant_id = ?
  `).bind(params.id, user.id, tenantId).first() as { status: string } | null;

  if (!requestData) return error('Request not found', 404);
  if (!canRateOwnedRequest(requestData.status)) return error('Cannot rate request in this status', 400);

  const updateResult = await env.DB.prepare(`
    UPDATE requests SET rating = ?, feedback = ?, updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? AND status IN ('pending_approval', 'completed') AND tenant_id = ?
  `).bind(body.rating, body.feedback || null, params.id, user.id, tenantId).run();

  if (!updateResult.meta || updateResult.meta.changes === 0) {
    return error('Request state changed while rating', 409);
  }

  return json({ success: true });
});

} // end registerApprovalRoutes
