// Guest access codes: list, create, get, revoke, delete
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { getCurrentCorsOrigin } from '../../middleware/cors';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';

export function registerGuestRoutes() {
// Guest codes: List for user (with auto-expire check)
route('GET', '/api/guest-codes', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);
  const isManagementUser = ['admin', 'director', 'manager', 'security', 'executor', 'department_head'].includes(user.role);

  if (isManagementUser) {
    await env.DB.prepare(`
      UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND valid_until < datetime('now') AND tenant_id = ?
    `).bind(tenantId).run();
  } else {
    await env.DB.prepare(`
      UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now')
      WHERE user_id = ? AND status = 'active' AND valid_until < datetime('now') AND tenant_id = ?
    `).bind(user.id, tenantId).run();
  }

  let results;
  if (isManagementUser) {
    const response = await env.DB.prepare(`
      SELECT g.*, u.name as creator_name, u.apartment as creator_apartment, u.phone as creator_phone
      FROM guest_access_codes g
      LEFT JOIN users u ON u.id = g.user_id AND u.tenant_id = ?
      WHERE g.tenant_id = ?
      ORDER BY g.created_at DESC LIMIT 200
    `).bind(tenantId, tenantId).all();
    results = response.results;
  } else {
    const response = await env.DB.prepare(`
      SELECT * FROM guest_access_codes WHERE user_id = ? AND tenant_id = ?
      ORDER BY created_at DESC LIMIT 100
    `).bind(user.id, tenantId).all();
    results = response.results;
  }

  return new Response(JSON.stringify({ codes: results }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
});
// Guest codes: Create
route('POST', '/api/guest-codes', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  let validUntil: string;
  let maxUses = 1;
  const now = new Date();
  const validFrom = body.valid_from ? new Date(body.valid_from) : now;

  switch (body.access_type) {
    case 'single_use':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
      maxUses = 1; break;
    case 'day':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999; break;
    case 'week':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999; break;
    case 'month':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999; break;
    case 'custom':
      if (!body.valid_until) return error('valid_until is required for custom access type');
      validUntil = body.valid_until; maxUses = 999; break;
    default:
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  const tokenData = {
    i: id, rn: body.resident_name || user.name, rp: body.resident_phone || user.phone,
    ra: body.resident_apartment || user.apartment, rd: body.resident_address || user.address,
    vt: body.visitor_type || 'guest', at: body.access_type || 'single_use',
    vf: validFrom.getTime(), vu: new Date(validUntil).getTime(), mx: maxUses,
    vn: body.visitor_name || '', vp: body.visitor_phone || '', vv: body.visitor_vehicle_plate || '',
  };
  const qrToken = 'GAPASS:' + btoa(unescape(encodeURIComponent(JSON.stringify(tokenData))));

  await env.DB.prepare(`
    INSERT INTO guest_access_codes (
      id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
      access_type, valid_from, valid_until, max_uses, current_uses, status,
      resident_name, resident_phone, resident_apartment, resident_address, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, qrToken, body.visitor_type || 'guest',
    body.visitor_name || null, body.visitor_phone || null, body.visitor_vehicle_plate || null,
    body.access_type || 'single_use', validFrom.toISOString(), validUntil, maxUses,
    body.resident_name || user.name, body.resident_phone || user.phone,
    body.resident_apartment || user.apartment, body.resident_address || user.address,
    body.notes || null, getTenantId(request)
  ).run();
  const tenantId = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ code: created }, 201);
});
// Guest codes: Get single code
route('GET', '/api/guest-codes/:id', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  const code = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first();
  if (!code) return error('Not found', 404);
  return json({ code });
});
// Guest codes: Revoke
route('POST', '/api/guest-codes/:id/revoke', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const log = createRequestLogger(request);
  const body = await request.json() as any;
  const tenantId = getTenantId(request);
  const isManagementUser = ['admin', 'director', 'manager'].includes(user.role);

  const guestCode = await env.DB.prepare(
    `SELECT id, user_id, visitor_name, visitor_type FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (isManagementUser) {
    await env.DB.prepare(`
      UPDATE guest_access_codes SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(user.id, body.reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();
    log.info('Guest code revoked', { codeId: params.id });

    if (guestCode && guestCode.user_id && guestCode.user_id !== user.id) {
      const visitorTypeLabels: Record<string, string> = { 'guest': 'гостя', 'courier': 'курьера', 'taxi': 'такси', 'other': 'посетителя' };
      const visitorLabel = visitorTypeLabels[guestCode.visitor_type] || 'посетителя';
      const visitorName = guestCode.visitor_name ? ` (${guestCode.visitor_name})` : '';
      const reasonText = body.reason ? ` Причина: ${body.reason}` : '';
      const notificationTitle = '🚫 Пропуск отменён';
      const notificationBody = `Ваш пропуск для ${visitorLabel}${visitorName} был отменён управляющей компанией.${reasonText}`;

      try {
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at) VALUES (?, ?, 'guest_pass_revoked', ?, ?, ?, 0, datetime('now'))
        `).bind(generateId(), guestCode.user_id, notificationTitle, notificationBody,
          JSON.stringify({ guestCodeId: params.id, reason: body.reason, url: '/guest-access' })).run();
      } catch (notifError) { log.error('Failed to create in-app notification', notifError); }

      sendPushNotification(env, guestCode.user_id, {
        title: notificationTitle, body: notificationBody, type: 'guest_pass_revoked',
        tag: `guest-pass-revoked-${params.id}`,
        data: { guestCodeId: params.id, reason: body.reason, url: '/guest-access' }, requireInteraction: true
      }).catch(err => { log.error('Failed to send push notification', err); });
    }
  } else {
    await env.DB.prepare(`
      UPDATE guest_access_codes SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(user.id, body.reason || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();
  }
  return json({ success: true });
});
// Guest codes: Delete
route('DELETE', '/api/guest-codes/:id', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM guest_access_codes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

} // end registerGuestRoutes
