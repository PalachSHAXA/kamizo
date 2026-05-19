// Announcements: Create, Update, Delete, View routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId, isManagement, sanitizeAttachmentUrl, sanitizeFilename } from '../../utils/helpers';
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

  // Handle attachments (JSON array of {name, url, type, size}).
  //
  // Sprint 78 P0/F1: was JSON.stringify(body.attachments) verbatim. The
  // `url` field was rendered as `<a href={url}>` / `<img src={url}>`
  // throughout the resident PWA — `javascript:...` and uncapped data-URL
  // bombs both made it through. Now: per-attachment URL allowlist
  // (http(s)/data:image|pdf only, no svg+xml, no javascript:), MIME
  // whitelist, filename sanitization, hard cap on array length + total
  // payload size.
  const MAX_ATTACHMENTS = 10;
  const MAX_TOTAL_ATTACH_BYTES = 5 * 1024 * 1024;
  const ALLOWED_TYPES = new Set([
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
    'application/pdf',
  ]);
  const sanitizedAttachments: Array<{ name: string | null; url: string; type: string | null; size: number | null }> = [];
  if (Array.isArray(body.attachments)) {
    let totalBytes = 0;
    for (const raw of body.attachments) {
      if (sanitizedAttachments.length >= MAX_ATTACHMENTS) break;
      if (!raw || typeof raw !== 'object') continue;
      const url = sanitizeAttachmentUrl(raw.url);
      if (!url) continue;
      const type = typeof raw.type === 'string' && ALLOWED_TYPES.has(raw.type.toLowerCase()) ? raw.type.toLowerCase() : null;
      const name = sanitizeFilename(raw.name);
      const sizeBytes = url.startsWith('data:') ? url.length : 0;
      if (totalBytes + sizeBytes > MAX_TOTAL_ATTACH_BYTES) break;
      totalBytes += sizeBytes;
      sanitizedAttachments.push({ name, url, type, size: typeof raw.size === 'number' && raw.size > 0 ? Math.floor(raw.size) : null });
    }
  }
  const attachments = sanitizedAttachments.length > 0 ? JSON.stringify(sanitizedAttachments) : null;
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

  // Sprint 67 P0 #3: normalise target_logins. The list endpoint binds
  // `'%,${apartment},%'` against this stored value. If the FE sent
  // a string with stray empty entries (trailing comma, double comma)
  // and a viewer with no apartment is matched, every announcement
  // with such a value matched. Trim, dedupe, drop empties, store
  // canonical `,login1,login2,` form.
  let normalizedLogins: string | null = null;
  if (typeof body.target_logins === 'string' && body.target_logins.trim()) {
    const list = Array.from(new Set(
      body.target_logins
        .split(',')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0 && s.length <= 100)
    ));
    if (list.length > 0) {
      normalizedLogins = ',' + list.join(',') + ',';
    }
  }

  await env.DB.prepare(`
    INSERT INTO announcements (id, title, content, type, target_type, target_branch, target_building_id, target_entrance, target_floor, target_logins, priority, expires_at, attachments, personalized_data, created_by, created_at, updated_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
  `).bind(
    id, body.title, body.content, body.type || 'residents',
    body.target_type || 'all', body.target_branch || null, body.target_building_id || null,
    body.target_entrance || null, body.target_floor || null,
    normalizedLogins, body.priority || 'normal',
    body.expires_at || null, attachments, personalizedData, authUser!.id, getTenantId(request)
  ).run();

  // Send push notifications to target users.
  //
  // Sprint 67 P0: require a non-null tenant for push fanout. On apex
  // domain (`getTenantId === null`) the previous code dropped the tenant
  // filter from the SELECT — a branch-scoped announcement would push
  // to every resident across ALL tenants who happened to share a
  // branch_code, and `type='all'` would push to every executor in
  // every tenant. Now: refuse to fan out without a tenant context.
  // (For super-admin global broadcasts a separate path is needed.)
  const isUrgent = body.priority === 'urgent';
  const icon = isUrgent ? '\u{1F6A8}' : '\u{1F4E2}';
  const targetType = body.target_type || 'all';
  const tenantIdForPush = getTenantId(request);
  let targetUsers: any[] = [];

  if (!tenantIdForPush) {
    log.warn('Announcement created on apex domain — push fanout skipped (no tenant context)', { announcementId: id });
  } else {
    if (body.type === 'residents' || body.type === 'all') {
      let query = `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND tenant_id = ?`;
      const params: any[] = [tenantIdForPush];

      if (targetType === 'branch' && body.target_branch) {
        // Sprint 67 P0 #1: branch query also tenant-scoped (was wiping params array).
        query = `SELECT u.id FROM users u
                 INNER JOIN buildings b ON u.building_id = b.id
                 WHERE u.role = 'resident' AND u.is_active = 1 AND b.branch_code = ?
                 AND u.tenant_id = ? AND b.tenant_id = ?`;
        params.length = 0;
        params.push(body.target_branch, tenantIdForPush, tenantIdForPush);
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

    // Sprint 67 P0 #2: employee fanout used to ignore targeting entirely
    // (every executor + department_head in the tenant got the push for an
    // `all`-type announcement scoped to a single building). Now: apply the
    // same building/branch/entrance/floor filter — fall back to the whole
    // staff list only when targetType === 'all' (no scoping requested).
    if (body.type === 'employees' || body.type === 'staff' || body.type === 'all') {
      let staffQuery = `SELECT id FROM users WHERE role IN ('executor', 'department_head') AND is_active = 1 AND tenant_id = ?`;
      const staffParams: any[] = [tenantIdForPush];

      if (targetType === 'branch' && body.target_branch) {
        staffQuery = `SELECT u.id FROM users u
                      INNER JOIN buildings b ON u.building_id = b.id
                      WHERE u.role IN ('executor', 'department_head') AND u.is_active = 1
                      AND b.branch_code = ? AND u.tenant_id = ? AND b.tenant_id = ?`;
        staffParams.length = 0;
        staffParams.push(body.target_branch, tenantIdForPush, tenantIdForPush);
      } else if (targetType === 'building' && body.target_building_id) {
        staffQuery += ' AND building_id = ?';
        staffParams.push(body.target_building_id);
      } else if (targetType === 'entrance' && body.target_building_id && body.target_entrance) {
        staffQuery += ' AND building_id = ? AND entrance = ?';
        staffParams.push(body.target_building_id, body.target_entrance);
      } else if (targetType === 'floor' && body.target_building_id && body.target_entrance && body.target_floor) {
        staffQuery += ' AND building_id = ? AND entrance = ? AND floor = ?';
        staffParams.push(body.target_building_id, body.target_entrance, body.target_floor);
      } else if (targetType === 'custom' && body.target_logins) {
        const logins = body.target_logins.split(',').map((l: string) => l.trim()).filter(Boolean);
        if (logins.length > 0) {
          const placeholders = logins.map(() => '?').join(',');
          staffQuery += ` AND login IN (${placeholders})`;
          staffParams.push(...logins);
        }
      }
      const { results } = await env.DB.prepare(staffQuery).bind(...staffParams).all();
      targetUsers = [...targetUsers, ...(results as any[])];
    }
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

  // Sprint 78 P0/F1: same sanitization on PUT path.
  let attachments: string | null | undefined;
  if (body.attachments === undefined) {
    attachments = undefined;
  } else if (!body.attachments) {
    attachments = null;
  } else {
    const MAX_ATTACHMENTS = 10;
    const MAX_TOTAL_ATTACH_BYTES = 5 * 1024 * 1024;
    const ALLOWED_TYPES = new Set([
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
      'application/pdf',
    ]);
    const out: Array<{ name: string | null; url: string; type: string | null; size: number | null }> = [];
    if (Array.isArray(body.attachments)) {
      let totalBytes = 0;
      for (const raw of body.attachments) {
        if (out.length >= MAX_ATTACHMENTS) break;
        if (!raw || typeof raw !== 'object') continue;
        const url = sanitizeAttachmentUrl(raw.url);
        if (!url) continue;
        const type = typeof raw.type === 'string' && ALLOWED_TYPES.has(raw.type.toLowerCase()) ? raw.type.toLowerCase() : null;
        const name = sanitizeFilename(raw.name);
        const sizeBytes = url.startsWith('data:') ? url.length : 0;
        if (totalBytes + sizeBytes > MAX_TOTAL_ATTACH_BYTES) break;
        totalBytes += sizeBytes;
        out.push({ name, url, type, size: typeof raw.size === 'number' && raw.size > 0 ? Math.floor(raw.size) : null });
      }
    }
    attachments = out.length > 0 ? JSON.stringify(out) : null;
  }

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
