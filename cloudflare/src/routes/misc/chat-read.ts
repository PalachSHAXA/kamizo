// Chat read status routes — mark as read, unread count

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerChatReadRoutes() {

// Chat: Mark channel as read
route('POST', '/api/chat/channels/:id/read', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const tenantId = getTenantId(request);

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

    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
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
