// Chat messages routes — list and send messages

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
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

  // Get messages with read_by info - with pagination support
  let query = `
    SELECT m.*, u.name as sender_name, u.role as sender_role,
      (SELECT GROUP_CONCAT(user_id) FROM chat_message_reads WHERE message_id = m.id) as read_by_str
    FROM chat_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.channel_id = ?`;

  const bindParams: any[] = [channelId];

  // If 'before' is provided, get messages before that message ID
  if (before) {
    query += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)`;
    bindParams.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT ?`;
  bindParams.push(limit);

  const { results: messages } = await env.DB.prepare(query).bind(...bindParams).all();

  // Reverse to get chronological order (newest last)
  const orderedMessages = (messages || []).reverse();

  // Convert read_by_str to array
  const messagesWithReadBy = orderedMessages.map((m: any) => ({
    ...m,
    read_by: m.read_by_str ? m.read_by_str.split(',') : []
  }));

  // Mark as read (exclude own messages)
  // For management users: mark as read for ALL management users (shared read status)
  if (isManagement(user)) {
    const channel = await env.DB.prepare('SELECT type FROM chat_channels WHERE id = ?').bind(channelId).first() as { type: string } | null;

    if (channel?.type === 'private_support') {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT m.id, u.id
        FROM chat_messages m
        CROSS JOIN users u
        WHERE m.channel_id = ?
          AND u.role IN ('admin', 'director', 'manager', 'department_head')
          ${tenantId ? 'AND u.tenant_id = ?' : ''}
          AND m.sender_id NOT IN (SELECT id FROM users WHERE role IN ('admin', 'director', 'manager', 'department_head'))
      `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();
    } else {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
      `).bind(user.id, channelId, user.id).run();
    }
  } else {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
      SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
    `).bind(user.id, channelId, user.id).run();
  }

  return json({ messages: messagesWithReadBy });
});

// Chat messages: Send
route('POST', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { content } = await request.json() as { content: string };
  if (!content) return error('Content required');
  if (content.length > 5000) return error('Message too long (max 5000 characters)');

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
