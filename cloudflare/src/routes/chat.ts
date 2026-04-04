// Chat routes: channels, messages, read receipts
import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, requireFeature } from '../middleware/tenant';
import { json, error, generateId, isManagement } from '../utils/helpers';
import { createRequestLogger } from '../utils/logger';

// Helper function for sending push notifications
async function sendPushNotification(env: Env, userId: string, options: any) {
  // Placeholder - imported from main index.ts in production
  return Promise.resolve();
}

// ==================== CHAT ROUTES ====================

export function registerChatRoutes(env: Env) {
  // Chat channels: List for user
  route('GET', '/api/chat/channels', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const tenantId = getTenantId(request);

    let query: string;
    let params: any[];

    if (isManagement(user)) {
      // Admins see all channels with unread count
      query = `
        SELECT c.*,
          COALESCE(stats.message_count, 0) as message_count,
          lm.content as last_message,
          lm.created_at as last_message_at,
          lm.sender_id as last_sender_id,
          COALESCE(unread.cnt, 0) as unread_count,
          ru.apartment as resident_apartment,
          rb.name as resident_building_name,
          rbr.name as resident_branch_name
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
          lm.created_at as last_message_at
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
        WHERE (c.type = 'uk_general'
          OR c.resident_id = ?
          OR c.building_id = ?
          OR c.id IN (SELECT channel_id FROM chat_participants WHERE user_id = ?))
        ${tenantId ? 'AND c.tenant_id = ?' : ''}
        ORDER BY lm.created_at DESC NULLS LAST
        LIMIT 50
      `;
      params = [user.id, user.building_id, user.id, ...(tenantId ? [tenantId] : [])];
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return json({ channels: results });
  });

  // Chat: Get or create private support channel
  route('POST', '/api/chat/channels/support', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    // Only residents can create support channels
    if (user.role !== 'resident') {
      return error('Only residents can create support channels', 403);
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

  // Chat messages: List for channel
  route('GET', '/api/chat/channels/:id/messages', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const channelId = params.id;
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    const before = url.searchParams.get('before');

    const tenantId = getTenantId(request);
    if (tenantId) {
      const ch = await env.DB.prepare('SELECT id FROM chat_channels WHERE id = ? AND tenant_id = ?').bind(channelId, tenantId).first();
      if (!ch) return error('Channel not found', 404);
    }

    let query = `
      SELECT m.*, u.name as sender_name, u.role as sender_role,
        (SELECT GROUP_CONCAT(user_id) FROM chat_message_reads WHERE message_id = m.id) as read_by_str
      FROM chat_messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.channel_id = ?`;

    const bindParams: any[] = [channelId];

    if (before) {
      query += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)`;
      bindParams.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT ?`;
    bindParams.push(limit);

    const { results: messages } = await env.DB.prepare(query).bind(...bindParams).all();
    const orderedMessages = (messages || []).reverse();

    const messagesWithReadBy = orderedMessages.map((m: any) => ({
      ...m,
      read_by: m.read_by_str ? m.read_by_str.split(',') : []
    }));

    // Mark as read
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
  route('POST', '/api/chat/channels/:id/messages', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

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
      const log = createRequestLogger(request);
      log.error('Failed to insert chat message', e);
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

    // Send WebSocket notification
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

          // Send push notifications
          if (['manager', 'admin', 'department_head'].includes(user.role) && channel.resident_id) {
            sendPushNotification(env, channel.resident_id, {
              title: '💬 Ответ от УК',
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
                title: '💬 Новое сообщение от жителя',
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
                  title: `💬 ${channel.name || 'Чат дома'}`,
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

  // Chat: Create channel (general)
  route('POST', '/api/chat/channels', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const body = await request.json() as any;
    const { type, name, description, building_id } = body;

    if (!type || !name) {
      return error('Type and name required');
    }

    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO chat_channels (id, type, name, description, building_id, created_by, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(id, type, name, description || null, building_id || null, user.id, getTenantId(request)).run();

    const channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
    return json({ channel }, 201);
  });

  // Chat: Mark channel as read
  route('POST', '/api/chat/channels/:id/read', async (request, _env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const channelId = params.id;
    const tenantId = getTenantId(request);

    const channel = await env.DB.prepare(`SELECT type FROM chat_channels WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as { type: string } | null;

    if (isManagement(user) && channel?.type === 'private_support') {
      await env.DB.prepare(`
        INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
        SELECT ?, id, datetime('now') FROM users WHERE role IN ('admin', 'director', 'manager') ${tenantId ? 'AND tenant_id = ?' : ''}
        ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
      `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();

      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT m.id, u.id
        FROM chat_messages m
        CROSS JOIN users u
        WHERE m.channel_id = ?
          AND u.role IN ('admin', 'director', 'manager')
          ${tenantId ? 'AND u.tenant_id = ?' : ''}
          AND m.sender_id NOT IN (SELECT id FROM users WHERE role IN ('admin', 'director', 'manager'))
      `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
      `).bind(channelId, user.id).run();

      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
      `).bind(user.id, channelId, user.id).run();
    }

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
            user_name: user.name
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
  route('GET', '/api/chat/unread-count', async (request) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    const fc = await requireFeature('chat', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const tenantId = getTenantId(request);
    let count = 0;

    if (isManagement(user)) {
      const result = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM chat_messages m
        JOIN chat_channels c ON m.channel_id = c.id
        WHERE c.type = 'private_support'
          AND m.sender_id != ?
          AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
          ${tenantId ? 'AND c.tenant_id = ?' : ''}
      `).bind(user.id, user.id, ...(tenantId ? [tenantId] : [])).first();
      count = (result as any)?.count || 0;
    } else if (user.role === 'resident') {
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
}
