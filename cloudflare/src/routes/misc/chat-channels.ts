// Chat channels routes — list, create, support channel, detail, assign/resolve

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature, recordBelongsToCaller, auditCrossTenantAttempt } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

// v200 — admin actions on a chat channel.
//
// chat-spec.md §4.6 (manager assigns responsible) finally has backend
// state: chat_channels.assigned_to + resolved_at + resolved_by columns
// land in migration 050. The four endpoints below own writes to those
// columns. The same security pattern as v93 (cross-tenant denied) and
// v109 (audit log + 403) applies: caller AND channel AND target staff
// must all be on the same tenant; everything else is logged and
// rejected. Super-admin (no tenant on JWT) bypasses isolation per
// recordBelongsToCaller().
//
// WebSocket: every mutating endpoint pushes `chat:channel:updated`
// through the existing CONNECTION_MANAGER DO so a director on one
// device sees the dispatcher's assign action live on another. Channels
// list: [chat:channel:${id}, chat:all] scoped to the channel's tenant.

const STAFF_ROLES = ['director', 'admin', 'manager', 'department_head', 'dispatcher', 'executor', 'security'] as const;

/**
 * Push `chat:channel:updated` to the connection manager so subscribed
 * admin sessions can re-fetch the channel without polling. Best-effort:
 * any failure is logged but does not block the response.
 */
async function broadcastChannelUpdated(
  env: any,
  request: Request,
  channelId: string,
  channelTenantId: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);
    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'x-internal-secret': (env as any).INTERNAL_RPC_SECRET || env.JWT_SECRET || '' },
      body: JSON.stringify({
        type: 'chat_channel_updated',
        data: { channel_id: channelId, ...patch },
        channels: [`chat:channel:${channelId}`, 'chat:all'],
        tenantId: channelTenantId || undefined,
      }),
    });
  } catch (e) {
    createRequestLogger(request).error('Failed to broadcast chat:channel:updated', e);
  }
}

// Columns the admin endpoints read on the channel row plus the joined
// staff name/role. Keep this in sync with the list/detail SELECT below.
const CHANNEL_DETAIL_SELECT = `
  SELECT c.*,
    ru.apartment as resident_apartment,
    ru.phone as resident_phone,
    rb.name as resident_building_name,
    rbr.name as resident_branch_name,
    au.name as assigned_to_name,
    au.role as assigned_to_role,
    rbu.name as resolved_by_name
  FROM chat_channels c
  LEFT JOIN users ru ON c.resident_id = ru.id
  LEFT JOIN buildings rb ON ru.building_id = rb.id
  LEFT JOIN branches rbr ON rb.branch_id = rbr.id
  LEFT JOIN users au ON c.assigned_to = au.id
  LEFT JOIN users rbu ON c.resolved_by = rbu.id
`;

export function registerChatChannelRoutes() {

// Chat channels: List for user
// Optimized: uses LEFT JOIN instead of multiple subqueries
route('GET', '/api/chat/channels', async (request, env) => {
  // Sprint 77 P0/F1: gate chat behind the 'chat' feature flag. Was
  // ungated — a tenant with chat turned off in their plan still got
  // full chat traffic.
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const requestTenant = getTenantId(request);
  // Sprint 64 P0: on main-domain (requestTenant === null) management
  // queries previously returned channels from ALL tenants — full cross-
  // tenant chat exposure including resident names + apartments. Default
  // to the user's own tenant so each manager only sees their tenant.
  // Super-admin separate endpoint exists; this listing must be tenant-
  // scoped.
  const tenantId = requestTenant || (user.tenant_id as string | null) || null;

  let query: string;
  let params: any[];

  if (isManagement(user)) {
    // Admins/directors/managers see all channels with unread count.
    // v200: added LEFT JOINs on users (au, rbu) so the list response
    // includes the assigned dispatcher's name+role and the resolver's
    // name. New chat_channels columns (assigned_to / resolved_at /
    // resolved_by / updated_at) flow through c.* automatically.
    query = `
      SELECT c.*,
        COALESCE(stats.message_count, 0) as message_count,
        lm.content as last_message,
        lm.created_at as last_message_at,
        lm.sender_id as last_sender_id,
        COALESCE(unread.cnt, 0) as unread_count,
        ru.apartment as resident_apartment,
        rb.name as resident_building_name,
        rbr.name as resident_branch_name,
        au.name as assigned_to_name,
        au.role as assigned_to_role,
        rbu.name as resolved_by_name
      FROM chat_channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as message_count FROM chat_messages GROUP BY channel_id
      ) stats ON stats.channel_id = c.id
      LEFT JOIN (
        SELECT m1.* FROM chat_messages m1
        INNER JOIN (
          SELECT channel_id, MAX(created_at) as max_date FROM chat_messages GROUP BY channel_id
        ) m2 ON m1.channel_id = m2.channel_id AND m1.created_at = m2.max_date
      ) lm ON lm.channel_id = c.id
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as cnt FROM chat_messages
        WHERE sender_id != ? AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        GROUP BY channel_id
      ) unread ON unread.channel_id = c.id
      LEFT JOIN users ru ON c.resident_id = ru.id
      LEFT JOIN buildings rb ON ru.building_id = rb.id
      LEFT JOIN branches rbr ON rb.branch_id = rbr.id
      LEFT JOIN users au ON c.assigned_to = au.id
      LEFT JOIN users rbu ON c.resolved_by = rbu.id
      ${tenantId ? 'WHERE c.tenant_id = ?' : ''}
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 100
    `;
    params = [user.id, user.id, ...(tenantId ? [tenantId] : [])];
  } else {
    // Regular users see their channels
    query = `
      SELECT c.*,
        COALESCE(stats.message_count, 0) as message_count,
        lm.content as last_message,
        lm.created_at as last_message_at,
        lm.sender_id as last_sender_id,
        COALESCE(unread.cnt, 0) as unread_count
      FROM chat_channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as message_count FROM chat_messages GROUP BY channel_id
      ) stats ON stats.channel_id = c.id
      LEFT JOIN (
        SELECT m1.* FROM chat_messages m1
        INNER JOIN (
          SELECT channel_id, MAX(created_at) as max_date FROM chat_messages GROUP BY channel_id
        ) m2 ON m1.channel_id = m2.channel_id AND m1.created_at = m2.max_date
      ) lm ON lm.channel_id = c.id
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as cnt FROM chat_messages
        WHERE sender_id != ? AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        GROUP BY channel_id
      ) unread ON unread.channel_id = c.id
      WHERE (c.type = 'uk_general'
        OR c.resident_id = ?
        OR c.building_id = ?
        OR c.id IN (SELECT channel_id FROM chat_participants WHERE user_id = ?))
      ${tenantId ? 'AND c.tenant_id = ?' : ''}
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 50
    `;
    // Audit P1: user.building_id can legitimately be undefined for fresh
    // tenants/commercial_owners who haven't been linked to a building yet.
    // Passing undefined to .bind() throws or matches the literal string
    // 'undefined' in the query. Pass an empty string instead — no row
    // has building_id = '', so the OR clause just degrades to ignoring
    // that branch.
    params = [user.id, user.id, user.id, user.building_id || '', user.id, ...(tenantId ? [tenantId] : [])];
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ channels: results });
});

// Chat: Get or create private support channel
route('POST', '/api/chat/channels/support', async (request, env) => {
  // Sprint 77 P0/F1: gate behind chat feature flag.
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Residents, tenants, and commercial_owners can all have a private support channel
  // with the management company. Was previously only 'resident', causing tenants to
  // see "Ошибка загрузки" on /chat.
  if (!['resident', 'tenant', 'commercial_owner'].includes(user.role)) {
    return error('Only residents/tenants can create support channels', 403);
  }

  const tenantId = getTenantId(request);

  // Check if channel exists
  let channel = await env.DB.prepare(
    `SELECT * FROM chat_channels WHERE type = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind('private_support', user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!channel) {
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO chat_channels (id, type, name, description, resident_id, tenant_id)
      VALUES (?, 'private_support', ?, ?, ?, ?)
    `).bind(id, user.name, user.apartment ? `кв. ${user.apartment}` : 'Личный чат', user.id, getTenantId(request)).run();

    channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  }

  return json(channel);
});

// Chat: Create channel (general)
route('POST', '/api/chat/channels', async (request, env) => {
  // Sprint 77 P0/F1: gate behind chat feature flag.
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Sprint 64 P0: management-only. Was wide open — any resident could
  // POST {type:"private_support", name:"...", building_id:"<any>"} and
  // create channels. Combined with the missing membership checks on
  // GET/POST messages, this was a write-anywhere + read-anywhere combo.
  if (!isManagement(user)) return error('Admin/Manager access required', 403);

  const body = await request.json() as any;
  const { type, name, description, building_id } = body;

  if (!type || !name) {
    return error('Type and name required');
  }
  // Whitelist channel types — schema may have a CHECK already but app-level
  // rejection gives a clean 400 instead of a 500.
  const allowedTypes = ['private_support', 'uk_general', 'building_general', 'group'];
  if (!allowedTypes.includes(type)) return error(`Invalid channel type: ${type}`, 400);

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO chat_channels (id, type, name, description, building_id, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, type, name, description || null, building_id || null, user.id, getTenantId(request)).run();

  const channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  return json({ channel }, 201);
});

// v200 — GET single channel detail. Frontend's InfoDropdown reads
// assigned_to_name + resolved_at to render the current state without a
// second fetch. Tenant-isolation enforced: caller must be on the
// channel's tenant or the request returns 404 (don't leak existence).
route('GET', '/api/chat/channels/:id', async (request, env, params) => {
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  if (!channelId) return error('Channel id required', 400);

  const row = await env.DB.prepare(
    `${CHANNEL_DETAIL_SELECT} WHERE c.id = ?`
  ).bind(channelId).first() as any;

  if (!row) return error('Channel not found', 404);

  const callerTenant = (user.tenant_id as string | null) || null;
  if (!recordBelongsToCaller(row, callerTenant)) {
    await auditCrossTenantAttempt(env, {
      staffId: user.id as string,
      staffName: (user.name as string) || null,
      staffRole: user.role as string,
      staffTenantId: callerTenant,
      resourceType: 'chat_channel',
      resourceId: channelId,
      resourceTenantId: (row.tenant_id as string | null) || null,
    });
    // Don't leak existence; 404 is what /api/chat/channels (list) would have returned.
    return error('Channel not found', 404);
  }

  // Residents shouldn't see who handles UK internally — strip the
  // assigned-to fields when the caller isn't management. They CAN
  // see resolved_at (matters for the resident: "your case was closed").
  if (!isManagement(user)) {
    row.assigned_to = null;
    row.assigned_to_name = null;
    row.assigned_to_role = null;
    row.resolved_by = null;
    row.resolved_by_name = null;
  }

  return json(row);
});

// v200 — PATCH /assign — assign a staff member to handle this channel.
// Body: { assigned_to: "<user-uuid>" } or { assigned_to: null } to unassign.
route('PATCH', '/api/admin/chat/channels/:id/assign', async (request, env, params) => {
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Management role required', 403);

  const channelId = params.id;
  if (!channelId) return error('Channel id required', 400);

  let body: any;
  try { body = await request.json(); } catch { body = {}; }
  const assignedTo: string | null = body && Object.prototype.hasOwnProperty.call(body, 'assigned_to')
    ? (body.assigned_to || null)
    : null;

  const callerTenant = (user.tenant_id as string | null) || null;

  const channel = await env.DB.prepare(
    'SELECT id, tenant_id FROM chat_channels WHERE id = ?'
  ).bind(channelId).first() as any;
  if (!channel) return error('Channel not found', 404);

  if (!recordBelongsToCaller(channel, callerTenant)) {
    await auditCrossTenantAttempt(env, {
      staffId: user.id as string,
      staffName: (user.name as string) || null,
      staffRole: user.role as string,
      staffTenantId: callerTenant,
      resourceType: 'chat_channel_assign',
      resourceId: channelId,
      resourceTenantId: (channel.tenant_id as string | null) || null,
    });
    return error('Channel not found', 404);
  }

  // Validate the target staff member when assigning (vs. unassign).
  if (assignedTo) {
    const staff = await env.DB.prepare(
      'SELECT id, role, tenant_id, is_active FROM users WHERE id = ?'
    ).bind(assignedTo).first() as any;
    if (!staff) return error('Staff member not found', 400);
    if (!staff.is_active) return error('Staff member is inactive', 400);
    if (!(STAFF_ROLES as readonly string[]).includes((staff.role as string) || '')) {
      return error('Target user is not a staff role', 400);
    }
    if (!recordBelongsToCaller(staff, callerTenant)) {
      await auditCrossTenantAttempt(env, {
        staffId: user.id as string,
        staffName: (user.name as string) || null,
        staffRole: user.role as string,
        staffTenantId: callerTenant,
        resourceType: 'chat_channel_assign_target',
        resourceId: assignedTo,
        resourceTenantId: (staff.tenant_id as string | null) || null,
      });
      return error('Staff member not found', 400);
    }
  }

  await env.DB.prepare(
    "UPDATE chat_channels SET assigned_to = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(assignedTo, channelId).run();

  const updated = await env.DB.prepare(
    `${CHANNEL_DETAIL_SELECT} WHERE c.id = ?`
  ).bind(channelId).first() as any;

  await broadcastChannelUpdated(env, request, channelId, (channel.tenant_id as string | null) || null, {
    assigned_to: updated?.assigned_to ?? null,
    assigned_to_name: updated?.assigned_to_name ?? null,
    assigned_to_role: updated?.assigned_to_role ?? null,
  });

  return json(updated);
});

// v200 — PATCH /resolve — mark channel as resolved. Stamps resolved_at +
// resolved_by from the caller. Idempotent: re-resolving returns the
// current state, no error.
route('PATCH', '/api/admin/chat/channels/:id/resolve', async (request, env, params) => {
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Management role required', 403);

  const channelId = params.id;
  if (!channelId) return error('Channel id required', 400);

  const callerTenant = (user.tenant_id as string | null) || null;
  const channel = await env.DB.prepare(
    'SELECT id, tenant_id, resolved_at FROM chat_channels WHERE id = ?'
  ).bind(channelId).first() as any;
  if (!channel) return error('Channel not found', 404);

  if (!recordBelongsToCaller(channel, callerTenant)) {
    await auditCrossTenantAttempt(env, {
      staffId: user.id as string,
      staffName: (user.name as string) || null,
      staffRole: user.role as string,
      staffTenantId: callerTenant,
      resourceType: 'chat_channel_resolve',
      resourceId: channelId,
      resourceTenantId: (channel.tenant_id as string | null) || null,
    });
    return error('Channel not found', 404);
  }

  // Idempotency — if already resolved, return the current row without
  // updating resolved_at/resolved_by (preserving the original
  // dispatcher who closed it). Still broadcast so any UI that missed
  // the prior event can sync.
  if (!channel.resolved_at) {
    await env.DB.prepare(
      "UPDATE chat_channels SET resolved_at = datetime('now'), resolved_by = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(user.id, channelId).run();
  }

  const updated = await env.DB.prepare(
    `${CHANNEL_DETAIL_SELECT} WHERE c.id = ?`
  ).bind(channelId).first() as any;

  await broadcastChannelUpdated(env, request, channelId, (channel.tenant_id as string | null) || null, {
    resolved_at: updated?.resolved_at ?? null,
    resolved_by: updated?.resolved_by ?? null,
    resolved_by_name: updated?.resolved_by_name ?? null,
  });

  return json(updated);
});

// v200 — PATCH /unresolve — re-open a previously-resolved channel.
// Not surfaced in commit-2 UI yet but ships now so the future "Reopen"
// action doesn't need another migration cycle. Clears resolved_at AND
// resolved_by (so the next /resolve stamps a fresh pair).
route('PATCH', '/api/admin/chat/channels/:id/unresolve', async (request, env, params) => {
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Management role required', 403);

  const channelId = params.id;
  if (!channelId) return error('Channel id required', 400);

  const callerTenant = (user.tenant_id as string | null) || null;
  const channel = await env.DB.prepare(
    'SELECT id, tenant_id FROM chat_channels WHERE id = ?'
  ).bind(channelId).first() as any;
  if (!channel) return error('Channel not found', 404);

  if (!recordBelongsToCaller(channel, callerTenant)) {
    await auditCrossTenantAttempt(env, {
      staffId: user.id as string,
      staffName: (user.name as string) || null,
      staffRole: user.role as string,
      staffTenantId: callerTenant,
      resourceType: 'chat_channel_unresolve',
      resourceId: channelId,
      resourceTenantId: (channel.tenant_id as string | null) || null,
    });
    return error('Channel not found', 404);
  }

  await env.DB.prepare(
    "UPDATE chat_channels SET resolved_at = NULL, resolved_by = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(channelId).run();

  const updated = await env.DB.prepare(
    `${CHANNEL_DETAIL_SELECT} WHERE c.id = ?`
  ).bind(channelId).first() as any;

  await broadcastChannelUpdated(env, request, channelId, (channel.tenant_id as string | null) || null, {
    resolved_at: null,
    resolved_by: null,
    resolved_by_name: null,
  });

  return json(updated);
});

} // end registerChatChannelRoutes
