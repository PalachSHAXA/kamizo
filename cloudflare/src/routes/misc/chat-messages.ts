// Chat messages routes — list and send messages

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';

export function registerChatMessageRoutes() {

// Chat messages: List for channel
route('GET', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const before = url.searchParams.get('before'); // message ID for pagination

  // MULTI-TENANCY: Verify channel belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const ch = await env.DB.prepare('SELECT id FROM chat_channels WHERE id = ? AND tenant_id = ?').bind(channelId, tenantId).first();
    if (!ch) return error('Channel not found', 404);
  }

  // Audit P0: previous version had a correlated GROUP_CONCAT sub-query
  // executed once per row (`SELECT GROUP_CONCAT(user_id) FROM chat_message_reads
  // WHERE message_id = m.id`). 100-message page = 100 extra reads against
  // chat_message_reads. Rewrote as a single LEFT JOIN + GROUP BY m.id —
  // SQLite is fine grouping by a PK column and exposing the other m.*
  // fields as bare references.
  //
  // Sprint 11 privacy fix: read_by_str now only carries non-management reader
  // IDs (the resident in a private_support thread). Management read-state is
  // collapsed into the management_read boolean so the API never exposes which
  // specific colleague opened a ticket.
  let query = `
    SELECT m.*, u.name as sender_name, u.role as sender_role,
      GROUP_CONCAT(
        CASE
          WHEN ru.role NOT IN ('admin','director','manager','department_head','super_admin')
          THEN r.user_id
        END
      ) as read_by_str,
      MAX(CASE
        WHEN ru.role IN ('admin','director','manager','department_head','super_admin')
        THEN 1 ELSE 0
      END) as management_read_int
    FROM chat_messages m
    JOIN users u ON m.sender_id = u.id
    LEFT JOIN chat_message_reads r ON r.message_id = m.id
    LEFT JOIN users ru ON ru.id = r.user_id
    WHERE m.channel_id = ?`;

  const bindParams: any[] = [channelId];

  // If 'before' is provided, get messages before that message ID
  if (before) {
    query += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)`;
    bindParams.push(before);
  }

  query += ` GROUP BY m.id ORDER BY m.created_at DESC LIMIT ?`;
  bindParams.push(limit);

  const { results: messages } = await env.DB.prepare(query).bind(...bindParams).all();

  // Reverse to get chronological order (newest last)
  const orderedMessages = (messages || []).reverse();

  // Convert read_by_str to array. Strip out the helper columns so the
  // client never sees the GROUP_CONCAT or MAX intermediate fields.
  const messagesWithReadBy = orderedMessages.map((m: any) => {
    const { read_by_str, management_read_int, ...rest } = m;
    return {
      ...rest,
      read_by: read_by_str ? read_by_str.split(',') : [],
      management_read: management_read_int === 1,
    };
  });

  // Mark as read (exclude own messages). Sprint 11 privacy fix: every user
  // now marks only their own read row. Previously, a manager opening a
  // private_support thread would CROSS JOIN to mark all colleagues read,
  // which (a) cleared every manager's notification badge at once and
  // (b) leaked colleague activity timestamps into the API. The shared
  // "team has seen it" UX for the resident is preserved via the new
  // `management_read` aggregate field computed in the SELECT above.
  await env.DB.prepare(`
    INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
    SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
  `).bind(user.id, channelId, user.id).run();

  return json({ messages: messagesWithReadBy });
});

// Chat messages: Send
route('POST', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { content } = await request.json() as { content: string };
  if (!content) return error('Content required');
  // Allow larger messages when they contain inline images (data:image base64)
  const maxLen = content.includes('data:image/') ? 2_000_000 : 5000;
  if (content.length > maxLen) return error(`Message too long (max ${maxLen} characters)`);

  const tenantId = getTenantId(request);
  const id = generateId();
  const channelId = params.id;

  try {
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_id, content, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, channelId, user.id, content, getTenantId(request)).run();
  } catch (e: any) {
    createRequestLogger(request).error('Failed to insert chat message', e);
    return error('Failed to send message', 500);
  }

  const created_at = new Date().toISOString();
  const message = {
    id,
    channel_id: channelId,
    sender_id: user.id,
    sender_name: user.name,
    sender_role: user.role,
    content,
    created_at
  };

  // Send WebSocket notification for real-time chat
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);

    const channel = await env.DB.prepare(
      `SELECT * FROM chat_channels WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
    ).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as any;

    if (channel) {
      const channels: string[] = [`chat:channel:${channelId}`];

      if (channel.type === 'private_support') {
        channels.push('chat:all');
        if (channel.resident_id) {
          channels.push(`chat:user:${channel.resident_id}`);
        }

        if (['manager', 'admin', 'department_head'].includes(user.role) && channel.resident_id) {
          sendPushNotification(env, channel.resident_id, {
            title: '\u{1F4AC} Ответ от УК',
            body: content.length > 100 ? content.substring(0, 100) + '...' : content,
            type: 'chat_message',
            tag: `chat-${channelId}`,
            data: { channelId, url: '/chat' },
            requireInteraction: false
          }).catch(() => {});
        } else if (user.role === 'resident') {
          const { results: managers } = await env.DB.prepare(
            `SELECT id FROM users WHERE role IN ('manager', 'admin') AND is_active = 1`
          ).all();

          for (const mgr of (managers || []) as any[]) {
            sendPushNotification(env, mgr.id, {
              title: '\u{1F4AC} Новое сообщение от жителя',
              body: `${user.name}: ${content.length > 80 ? content.substring(0, 80) + '...' : content}`,
              type: 'chat_message',
              tag: `chat-${channelId}`,
              data: { channelId, url: '/chat' },
              requireInteraction: false
            }).catch(() => {});
          }
        }
      } else {
        channels.push('chat:all');

        if (channel.type === 'building_general' && channel.building_id) {
          const { results: residents } = await env.DB.prepare(
            `SELECT id FROM users WHERE building_id = ? AND id != ? AND role = 'resident' AND is_active = 1 LIMIT 100`
          ).bind(channel.building_id, user.id).all();

          const BATCH = 10;
          for (let i = 0; i < (residents?.length || 0); i += BATCH) {
            const batch = (residents || []).slice(i, i + BATCH) as any[];
            Promise.all(batch.map(r =>
              sendPushNotification(env, r.id, {
                title: `\u{1F4AC} ${channel.name || 'Чат дома'}`,
                body: `${user.name}: ${content.length > 60 ? content.substring(0, 60) + '...' : content}`,
                type: 'chat_message',
                tag: `chat-group-${channelId}`,
                data: { channelId, url: '/chat' },
                requireInteraction: false
              }).catch(() => {})
            ));
          }
        }
      }

      await connManager.fetch('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'chat_message',
          data: { message },
          channels,
          tenantId: tenantId || undefined,
        })
      });
    }
  } catch (e) {
    createRequestLogger(request).error('Failed to send chat WebSocket notification', e);
  }

  return json({ message }, 201);
});

} // end registerChatMessageRoutes
