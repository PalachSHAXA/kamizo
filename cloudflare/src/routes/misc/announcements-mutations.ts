// Announcements: Create, Update, Delete, View routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';

export function registerAnnouncementMutationRoutes() {

// Announcements: Create
route('POST', '/api/announcements', async (request, env) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const log = createRequestLogger(request);

  const body = await request.json() as any;
  const id = generateId();

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments ? JSON.stringify(body.attachments) : null;
  // Handle personalized data for debt-based announcements (JSON object)
  const personalizedData = body.personalized_data ? JSON.stringify(body.personalized_data) : null;

  // Validate target_building_id belongs to caller's tenant before inserting
  if (body.target_building_id) {
    const tenantIdValidate = getTenantId(request);
    if (!tenantIdValidate) return error('Tenant context required', 401);
    const buildingCheck = await env.DB.prepare(
      'SELECT id FROM buildings WHERE id = ? AND tenant_id = ?'
    ).bind(body.target_building_id, tenantIdValidate).first();
    if (!buildingCheck) return error('Building does not belong to your tenant', 403);
  }

  await env.DB.prepare(`
    INSERT INTO announcements (id, title, content, type, target_type, target_branch, target_building_id, target_entrance, target_floor, target_logins, priority, expires_at, attachments, personalized_data, created_by, created_at, updated_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
  `).bind(
    id, body.title, body.content, body.type || 'residents',
    body.target_type || 'all', body.target_branch || null, body.target_building_id || null,
    body.target_entrance || null, body.target_floor || null,
    body.target_logins || null, body.priority || 'normal',
    body.expires_at || null, attachments, personalizedData, authUser!.id, getTenantId(request)
  ).run();

  // Send push notifications to target users
  const isUrgent = body.priority === 'urgent';
  const icon = isUrgent ? '\u{1F6A8}' : '\u{1F4E2}';
  const targetType = body.target_type || 'all';

  // Get target users based on target_type and announcement type
  const tenantIdForPush = getTenantId(request);
  let targetUsers: any[] = [];

  if (body.type === 'residents' || body.type === 'all') {
    let query = `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 ${tenantIdForPush ? 'AND tenant_id = ?' : ''}`;
    const params: any[] = tenantIdForPush ? [tenantIdForPush] : [];

    if (targetType === 'branch' && body.target_branch) {
      query = `SELECT u.id FROM users u
               INNER JOIN buildings b ON u.building_id = b.id
               WHERE u.role = 'resident' AND u.is_active = 1 AND b.branch_code = ? ${tenantIdForPush ? 'AND u.tenant_id = ?' : ''}`;
      params.length = 0;
      params.push(body.target_branch);
      if (tenantIdForPush) params.push(tenantIdForPush);
    } else if (targetType === 'building' && body.target_building_id) {
      query += ' AND building_id = ?';
      params.push(body.target_building_id);
    } else if (targetType === 'entrance' && body.target_building_id && body.target_entrance) {
      query += ' AND building_id = ? AND entrance = ?';
      params.push(body.target_building_id, body.target_entrance);
    } else if (targetType === 'floor' && body.target_building_id && body.target_entrance && body.target_floor) {
      query += ' AND building_id = ? AND entrance = ? AND floor = ?';
      params.push(body.target_building_id, body.target_entrance, body.target_floor);
    } else if (targetType === 'custom' && body.target_logins) {
      const logins = body.target_logins.split(',').map((l: string) => l.trim()).filter(Boolean);
      if (logins.length > 0) {
        const placeholders = logins.map(() => '?').join(',');
        query += ` AND login IN (${placeholders})`;
        params.push(...logins);
      }
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    targetUsers = results as any[];
  }

  if (body.type === 'employees' || body.type === 'staff' || body.type === 'all') {
    const { results } = await env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('executor', 'department_head') AND is_active = 1 ${tenantIdForPush ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantIdForPush ? [tenantIdForPush] : [])).all();
    targetUsers = [...targetUsers, ...(results as any[])];
  }

  log.info('Announcement created', { announcementId: id, notifiedUsers: targetUsers.length });

  // Create in-app notifications for target users — batch DB inserts (up to 100 per call)
  const notificationId = generateId();
  const notificationTitle = `${icon} ${body.title}`;
  const notificationBody = body.content.substring(0, 200) + (body.content.length > 200 ? '...' : '');
  const notifDataJson = JSON.stringify({ announcementId: id, url: '/announcements' });
  const tenantIdNotif = getTenantId(request);

  const BATCH_SIZE = 100;
  for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
    const batch = targetUsers.slice(i, i + BATCH_SIZE);
    const stmts = batch.map(targetUser =>
      env.DB.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, data, tenant_id)
        VALUES (?, ?, ?, ?, 'announcement', ?, ?)
      `).bind(
        `${notificationId}-${targetUser.id}`,
        targetUser.id,
        notificationTitle,
        notificationBody,
        notifDataJson,
        tenantIdNotif
      )
    );
    await env.DB.batch(stmts);
  }

  // Send push notifications in parallel (non-blocking, don't await each batch sequentially)
  Promise.allSettled(
    targetUsers.map(targetUser =>
      sendPushNotification(env, targetUser.id, {
        title: `${icon} ${body.title}`,
        body: body.content.substring(0, 200) + (body.content.length > 200 ? '...' : ''),
        type: 'announcement',
        tag: `announcement-${id}`,
        data: {
          announcementId: id,
          priority: body.priority,
          targetType: targetType,
          url: '/announcements'
        },
        requireInteraction: isUrgent,
        skipInApp: true
      }).catch(err => createRequestLogger(request).error('Push failed for user', err, { userId: targetUser.id }))
    )
  ).catch(() => {});

  // Invalidate cache and broadcast WebSocket update
  invalidateCache('announcements:');

  try {
    const stub = env.CONNECTION_MANAGER.get(env.CONNECTION_MANAGER.idFromName('global'));
    await stub.fetch('https://internal/invalidate-cache', {
      method: 'POST',
      body: JSON.stringify({ prefix: 'announcements:' })
    });
  } catch (err) {
    createRequestLogger(request).error('Failed to broadcast announcement update', err);
  }

  return json({ id }, 201);
});

// Announcements: Update
route('PUT', '/api/announcements/:id', async (request, env, params) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  const attachments = body.attachments !== undefined
    ? (body.attachments ? JSON.stringify(body.attachments) : null)
    : undefined;

  const tenantIdUpd = getTenantId(request);
  if (body.target_building_id) {
    if (!tenantIdUpd) return error('Tenant context required', 401);
    const buildingCheck = await env.DB.prepare(
      'SELECT id FROM buildings WHERE id = ? AND tenant_id = ?'
    ).bind(body.target_building_id, tenantIdUpd).first();
    if (!buildingCheck) return error('Building does not belong to your tenant', 403);
  }
  await env.DB.prepare(`
    UPDATE announcements
    SET title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        priority = COALESCE(?, priority),
        target_type = ?,
        target_building_id = ?,
        target_logins = ?,
        expires_at = ?,
        attachments = COALESCE(?, attachments),
        updated_at = datetime('now')
    WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.title || null,
    body.content || null,
    body.type || null,
    body.priority || null,
    body.target_type || 'all',
    body.target_building_id || null,
    body.target_logins || null,
    body.expires_at || null,
    attachments,
    params.id,
    ...(tenantIdUpd ? [tenantIdUpd] : [])
  ).run();

  invalidateCache('announcements:');
  const updated = await env.DB.prepare(`SELECT * FROM announcements WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdUpd ? [tenantIdUpd] : [])).first();
  return json({ announcement: updated });
});

// Announcements: Delete
route('DELETE', '/api/announcements/:id', async (request, env, params) => {
  const fc = await requireFeature('announcements', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM announcements WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  invalidateCache('announcements:');
  return json({ success: true });
});

} // end registerAnnouncementMutationRoutes
