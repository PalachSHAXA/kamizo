// Request workflow: accept, decline, start, complete

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../../index';

export function registerWorkflowRoutes() {

// Requests: Accept (executor accepts assigned request)
route('POST', '/api/requests/:id/accept', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Only executors can accept requests', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found or not assigned to you', 404);

  await env.DB.prepare(`
    UPDATE requests SET status = 'accepted', updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (requestData.resident_id) {
    const acceptBody = `Исполнитель ${user.name} принял вашу заявку #${requestData.request_number}. Ожидайте начала работ.`;
    sendPushNotification(env, requestData.resident_id, {
      title: '✅ Заявка принята', body: acceptBody, type: 'request_status',
      tag: `request-accepted-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_accepted', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '✅ Заявка принята', acceptBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }
  return json({ success: true });
});

// Requests: Decline/Release
route('POST', '/api/requests/:id/decline', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Only executors can decline requests', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { reason } = body;
  if (!reason || reason.trim().length === 0) return error('Reason is required', 400);

  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found or not assigned to you', 404);
  if (!['assigned', 'accepted', 'in_progress'].includes(requestData.status)) return error('Cannot decline request in current status', 400);

  await env.DB.prepare(`
    UPDATE requests SET status = 'new', executor_id = NULL, assigned_by = NULL, started_at = NULL, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  if (requestData.resident_id) {
    const declineBodyRes = `Исполнитель ${user.name} освободил заявку #${requestData.request_number}. Причина: ${reason}. Заявка возвращена в очередь.`;
    sendPushNotification(env, requestData.resident_id, {
      title: '⚠️ Исполнитель освободил заявку', body: declineBodyRes, type: 'request_declined',
      tag: `request-declined-${params.id}`, data: { requestId: params.id, reason, url: '/' }, requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_declined', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '⚠️ Исполнитель освободил заявку', declineBodyRes, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'director', 'department_head') AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const declineBodyMgr = `${user.name} отказался от заявки #${requestData.request_number}. Причина: ${reason}`;
  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '⚠️ Исполнитель отказался от заявки', body: declineBodyMgr, type: 'request_declined',
      tag: `request-declined-manager-${params.id}`, data: { requestId: params.id, reason, url: '/requests' }, requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_declined', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), manager.id, '⚠️ Исполнитель отказался', declineBodyMgr, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }
  return json({ success: true });
});

// Requests: Start work
route('POST', '/api/requests/:id/start', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Only executors can start work', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found or not assigned to you', 404);

  await env.DB.prepare(`
    UPDATE requests SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (requestData.resident_id) {
    const startBody = `Исполнитель ${user.name} начал работу по заявке #${requestData.request_number}.`;
    sendPushNotification(env, requestData.resident_id, {
      title: '🔧 Работа началась', body: startBody, type: 'request_status',
      tag: `request-started-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_started', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '🔧 Работа началась', startBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  const { results: deptHeadsStart } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const startBodyHead = `${user.name} начал работу по заявке #${requestData.request_number}`;
  for (const head of (deptHeadsStart || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '🔧 Работа началась', body: startBodyHead, type: 'request_started',
      tag: `request-started-head-${params.id}`, data: { requestId: params.id, url: '/requests' }, requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_started', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), head.id, '🔧 Работа началась', startBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }
  return json({ success: true });
});

// Requests: Complete work
route('POST', '/api/requests/:id/complete', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Only executors can complete work', 403);
  const fc = await requireFeature('requests', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) return error('Request not found or not assigned to you', 404);

  await env.DB.prepare(`
    UPDATE requests SET status = 'pending_approval', completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (requestData.resident_id) {
    const completeBody = `Исполнитель ${user.name} завершил работу по заявке #${requestData.request_number}. Пожалуйста, подтвердите выполнение и оцените работу.`;
    sendPushNotification(env, requestData.resident_id, {
      title: '✅ Работа завершена!', body: completeBody, type: 'request_completed',
      tag: `request-completed-${params.id}`, data: { requestId: params.id, url: '/' }, requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_completed', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '✅ Работа завершена!', completeBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  const { results: deptHeads } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const completeBodyHead = `${user.name} завершил заявку #${requestData.request_number}. Ожидается подтверждение жителя.`;
  for (const head of (deptHeads || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '✅ Исполнитель завершил работу', body: completeBodyHead, type: 'request_completed',
      tag: `request-completed-head-${params.id}`, data: { requestId: params.id, url: '/requests' }, requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_completed', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), head.id, '✅ Исполнитель завершил работу', completeBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }
  return json({ success: true });
});

} // end registerWorkflowRoutes
