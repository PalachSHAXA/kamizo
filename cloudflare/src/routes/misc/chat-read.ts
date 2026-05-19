// Chat read status routes — mark as read, unread count

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerChatReadRoutes() {

// Chat: Mark channel as read
route('POST', '/api/chat/channels/:id/read', async (request, env, params) => {
  // Sprint 77 P0/F1: gate chat feature flag.
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const tenantId = getTenantId(request);

  // Sprint 64 P0: was zero-guarded. Any authenticated user could mark
  // ANY channel as read for themselves AND forge a `chat_read` WebSocket
  // broadcast with their name/role on `chat:channel:${id}` — spoofing
  // a "manager read" tick on victim conversations.
  const channel = await env.DB.prepare(
    `SELECT id, tenant_id, type, resident_id, building_id FROM chat_channels WHERE id = ?
     ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!channel) return error('Channel not found', 404);

  const allowed = isManagement(user)
    || (channel.type === 'private_support' && channel.resident_id === user.id)
    || (channel.type === 'building_general' && channel.building_id === user.building_id)
    || (channel.type === 'uk_general' && !!user.building_id);
  if (!allowed) {
    try {
      const member = await env.DB.prepare(
        'SELECT 1 FROM chat_participants WHERE channel_id = ? AND user_id = ?'
      ).bind(channelId, user.id).first();
      if (!member) return error('Forbidden', 403);
    } catch { return error('Forbidden', 403); }
  }

  // Mark channel as read for the current user
  await env.DB.prepare(`
    INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
  `).bind(channelId, user.id).run();

  // Mark all messages from others as read by current user.
  // Sprint 11 privacy fix: previously, when a manager opened a
  // private_support channel, this endpoint also CROSS JOIN-marked the
  // channel and every message as read for every other manager in the
  // tenant. That cleared colleague notification badges and exposed
  // "Anna opened Boris's ticket at 10:42" via the read-events stream.
  // Each manager now tracks their own reads.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
    SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
  `).bind(user.id, channelId, user.id).run();

  // Send read receipt via WebSocket
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);

    // Sprint 76 P0/F2: internal secret required by DO.
    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      headers: { 'x-internal-secret': (env as any).INTERNAL_RPC_SECRET || env.JWT_SECRET || '' },
      body: JSON.stringify({
        type: 'chat_read',
        data: {
          channel_id: channelId,
          user_id: user.id,
          user_name: user.name,
          // Sprint 11: surface the reader's role so the client can flip
          // the aggregated management_read flag without exposing the
          // specific colleague ID.
          user_role: user.role,
        },
        channels: [`chat:channel:${channelId}`],
        tenantId: tenantId || undefined,
      })
    });
  } catch (e) {
    createRequestLogger(request).error('Failed to send read receipt', e);
  }

  return json({ success: true });
});

// Chat: Get unread count for sidebar badge
route('GET', '/api/chat/unread-count', async (request, env) => {
  // Sprint 77 P0/F1: gate chat feature flag. Return 0 if feature off
  // (UI badge silently empty rather than throwing).
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return json({ unread_count: 0 });
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  let count = 0;

  if (isManagement(user)) {
    // Count unread in private_support channels (management sees resident support requests)
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE c.type = 'private_support'
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        ${tenantId ? 'AND c.tenant_id = ?' : ''}
    `).bind(user.id, user.id, ...(tenantId ? [tenantId] : [])).first();
    count = (result as any)?.count || 0;
  } else if (user.role === 'resident' || user.role === 'tenant') {
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE c.type = 'private_support'
        AND c.resident_id = ?
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        ${tenantId ? 'AND c.tenant_id = ?' : ''}
    `).bind(user.id, user.id, user.id, ...(tenantId ? [tenantId] : [])).first();
    count = (result as any)?.count || 0;
  }

  return json({ unread_count: count });
});

} // end registerChatReadRoutes
