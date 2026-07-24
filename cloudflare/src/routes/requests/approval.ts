// Request approval: approve, reject, cancel, rate

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId, bilingualError } from '../../utils/helpers';
import { sendPushNotification } from '../../index';

export function registerApprovalRoutes() {

// Requests: Approve (resident confirms work is done)
route('POST', '/api/requests/:id/approve', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { feedback } = body;

  // Sprint 60 P1: clamp rating 1-5. Was accepting any number from FE.
  let rating: number | null = null;
  if (body.rating !== undefined && body.rating !== null && body.rating !== '') {
    const n = Number(body.rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) return error('rating must be an integer 1-5', 400);
    rating = n;
  }

  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found or not pending approval', 404);

  await env.DB.prepare(`
    UPDATE requests SET status = 'completed', rating = ?, feedback = ?,
      is_paused = 0, paused_at = NULL, pause_reason = NULL, updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(rating, feedback || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (requestData.executor_id) {
    const ratingText = rating ? ` Оценка: ${'⭐'.repeat(rating)}` : '';
    const approveBody = `Житель подтвердил выполнение заявки #${requestData.request_number}.${ratingText}`;
    sendPushNotification(env, requestData.executor_id, {
      title: '🎉 Работа подтверждена!', body: approveBody, type: 'request_approved',
      tag: `request-approved-${params.id}`, data: { requestId: params.id, rating, url: '/' }, requireInteraction: false
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '🎉 Работа подтверждена!', approveBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(requestData.executor_id).first() as any;
    const { results: deptHeads } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all();

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
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { reason } = body;
  if (!reason || reason.trim().length === 0) return error('Reason is required', 400);

  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found or not pending approval', 404);

  const currentCount = requestData.rejection_count || 0;
  await env.DB.prepare(`
    UPDATE requests SET status = 'in_progress', rejection_reason = ?, rejection_count = ?, updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reason, currentCount + 1, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (requestData.executor_id) {
    const rejectBody = `Житель отклонил работу по заявке #${requestData.request_number}. Причина: ${reason}`;
    sendPushNotification(env, requestData.executor_id, {
      title: '❌ Работа отклонена', body: rejectBody, type: 'request_rejected',
      tag: `request-rejected-${params.id}`, data: { requestId: params.id, reason, url: '/' }, requireInteraction: true
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '❌ Работа отклонена', rejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?').bind(requestData.executor_id).first() as any;
    const { results: deptHeadsReject } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all();

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
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const reason = body.reason || 'Без причины';

  const requestData = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!requestData) return error('Request not found', 404);

  const isResident = user.role === 'resident';
  const canResidentCancel = ['new', 'assigned', 'accepted'].includes(requestData.status as string);
  const canManagerCancel = requestData.status !== 'completed';

  if (isResident && requestData.resident_id !== user.id) return error('Forbidden', 403);
  // v118.164 — bilingualError so the frontend's pickErrorMessage() shows
  // localized text (RU/UZ) instead of the raw English fallback. Ownership
  // check above stays as English `error()` because it's a security-tier
  // failure users shouldn't see friendly copy for (403 shouldn't leak a
  // human-facing message that hints at cross-tenant access surfaces).
  if (isResident && !canResidentCancel) return bilingualError(
    'Заявку нельзя отменить в этом статусе',
    "Ushbu holatda arizani bekor qilib bo'lmaydi",
    400,
  );
  if (!isResident && !canManagerCancel) return bilingualError(
    'Нельзя отменить завершённую заявку',
    "Yakunlangan arizani bekor qilib bo'lmaydi",
    400,
  );

  const cancelledBy = isResident ? 'resident' : user.role;

  // v118.168 — request_history schema fix + transaction.
  //
  // The production DB was seeded from an older schema variant whose
  // columns are `changed_by` / `changed_at` (not `user_id` / `created_at`
  // as declared in the repo's schema.sql). The mismatch has existed
  // since the initial commit; it never blew up because until v118.161
  // fixed the sheet-button pointer-capture bug, no user could actually
  // trigger the cancel that fires this INSERT. With the button working,
  // the INSERT would throw "table request_history has no column named
  // user_id", leaving the request in a half-cancelled state (UPDATE had
  // already committed above the failed INSERT — no transaction).
  //
  // Fix: (1) use the ACTUAL column names on the production table;
  //      (2) wrap the two writes in a transaction so either both land
  //          or neither does. shim-sqlite exposes BEGIN/COMMIT/ROLLBACK
  //          via prepare().run() like any other statement.
  //
  // schema.sql + schema_no_fk.sql are updated in the same commit so any
  // new tenant DB provisioned from them gets the correct shape.
  try {
    await env.DB.prepare('BEGIN').run();
    await env.DB.prepare(`
      UPDATE requests SET status = 'cancelled', updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

    await env.DB.prepare(`
      INSERT INTO request_history (id, request_id, changed_by, action, old_status, new_status, comment, changed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(generateId(), params.id, user.id, 'cancelled', requestData.status, 'cancelled', `Отменена (${cancelledBy}): ${reason}`).run();
    await env.DB.prepare('COMMIT').run();
  } catch (err) {
    await env.DB.prepare('ROLLBACK').run().catch(() => {});
    console.error(JSON.stringify({ level: 'error', message: 'cancel-request tx failed', requestId: params.id, error: String(err) }));
    return bilingualError(
      'Не удалось отменить заявку. Попробуйте ещё раз.',
      "Arizani bekor qilib bo'lmadi. Qayta urinib ko'ring.",
      500,
    );
  }

  // Notify executor + resident when manager/admin cancels.
  // Previously we only inserted into the notifications table — pushes were
  // missing, so the resident only saw the cancellation on the next sync.
  // Audit P1 fix: also send a push so they see it immediately.
  const cancelTitle = 'Заявка отменена';
  const cancelBody = `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`;

  if (requestData.executor_id && !isResident) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(generateId(), requestData.executor_id, cancelTitle, cancelBody, getTenantId(request)).run();
    sendPushNotification(env, requestData.executor_id as string, {
      title: cancelTitle, body: cancelBody, type: 'request_cancelled',
      tag: `request-cancelled-${params.id}`, data: { requestId: params.id },
    }).catch((err) => { console.error('fire-and-forget failed:', err); });
  }

  if (!isResident && requestData.resident_id) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(generateId(), requestData.resident_id, cancelTitle, cancelBody, getTenantId(request)).run();
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
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE requests SET rating = ?, feedback = ?, status = 'completed', updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.rating, body.feedback || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

} // end registerApprovalRoutes
