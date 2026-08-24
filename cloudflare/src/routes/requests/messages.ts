// Per-request chat: resident (owner) <-> assigned executor.
// Writable only while the executor is on the job (status accepted/in_progress);
// read-only history otherwise. Management may read.

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { isExecutorRole, sendPushNotification } from '../../index';

const WRITABLE_STATUSES = ['accepted', 'in_progress'];
const MANAGEMENT = ['admin', 'director', 'manager', 'dispatcher', 'department_head', 'super_admin'];

interface RequestRow {
  id: string;
  resident_id: string;
  executor_id: string | null;
  status: string;
  request_number: string | null;
}

async function loadRequest(env: any, tenantId: string | null, id: string): Promise<RequestRow | null> {
  return env.DB.prepare(
    `SELECT id, resident_id, executor_id, status, request_number FROM requests
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(id, ...(tenantId ? [tenantId] : [])).first() as Promise<RequestRow | null>;
}

export function registerRequestMessageRoutes() {
  // List messages (participants + management can read; history stays readable
  // after completion).
  route('GET', '/api/requests/:id/messages', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('requests', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const tenantId = getTenantId(request);
    const req = await loadRequest(env, tenantId, params.id);
    if (!req) return error('Request not found', 404);

    const isOwner = user.id === req.resident_id;
    const isAssignedExecutor = user.id === req.executor_id;
    const isMgmt = MANAGEMENT.includes(user.role);
    if (!isOwner && !isAssignedExecutor && !isMgmt) return error('Forbidden', 403);

    const { results } = await env.DB.prepare(
      `SELECT id, sender_id, sender_role, sender_name, body, created_at
       FROM request_messages
       WHERE request_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
       ORDER BY created_at ASC LIMIT 500`
    ).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

    return json({
      messages: results || [],
      writable: WRITABLE_STATUSES.includes(req.status) && (isOwner || isAssignedExecutor),
      status: req.status,
    });
  });

  // Send a message. Only the resident owner or the assigned executor, and only
  // while the request is accepted/in_progress.
  route('POST', '/api/requests/:id/messages', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('requests', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const tenantId = getTenantId(request);
    const req = await loadRequest(env, tenantId, params.id);
    if (!req) return error('Request not found', 404);

    const isOwner = user.id === req.resident_id;
    const isAssignedExecutor = user.id === req.executor_id && isExecutorRole(user.role);
    if (!isOwner && !isAssignedExecutor) {
      return error('Писать в чат могут только житель и исполнитель заявки', 403);
    }
    if (!WRITABLE_STATUSES.includes(req.status)) {
      return error('Чат доступен только пока исполнитель работает над заявкой', 403);
    }

    const parsed = await request.json() as { body?: unknown };
    const text = typeof parsed.body === 'string' ? parsed.body.trim() : '';
    if (!text) return error('Пустое сообщение', 400);
    if (text.length > 2000) return error('Слишком длинное сообщение', 400);

    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO request_messages (id, request_id, sender_id, sender_role, sender_name, body, created_at, tenant_id)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)`
    ).bind(id, params.id, user.id, user.role, user.name || null, text, tenantId).run();

    // Notify the other party (best-effort).
    const recipientId = isOwner ? req.executor_id : req.resident_id;
    if (recipientId) {
      sendPushNotification(env, recipientId, {
        title: `💬 Сообщение по заявке #${req.request_number}`,
        body: text.slice(0, 120),
        type: 'request_message',
        tag: `request-message-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: false,
      }).catch(() => {});
    }

    return json({
      message: {
        id,
        sender_id: user.id,
        sender_role: user.role,
        sender_name: user.name,
        body: text,
        created_at: new Date().toISOString(),
      },
    });
  });
}
