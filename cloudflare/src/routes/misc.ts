// Miscellaneous routes — extracted from index.ts
// Contains: websocket, chat, notes, announcements, ratings, uk-ratings, stats, settings,
//   health/monitoring, admin metrics, payments, apartment balance

import type { Env, User } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, getCurrentTenant } from '../middleware/tenant';
import { invalidateCache } from '../middleware/cache-local';
import { invalidateOnChange, getCacheStats } from '../cache';
import { metricsAggregator, healthCheck, AlertManager, logAnalyticsEvent } from '../monitoring';
import { json, error, generateId, isManagement, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { sendPushNotification, isExecutorRole, isSuperAdmin } from '../index';

export function registerMiscRoutes() {

// ==================== WEBSOCKET (DURABLE OBJECTS) ====================

// PUBLIC: no auth required
route('GET', '/api/ws', async (request, env) => {
  const url = new URL(request.url);
  const upgradeHeader = request.headers.get('Upgrade');

  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return error('Expected WebSocket upgrade', 400);
  }

  // Authenticate user
  const tokenFromQuery = url.searchParams.get('token');
  let user: User | null = null;

  if (tokenFromQuery) {
    const result = await env.DB.prepare(
      'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
    ).bind(tokenFromQuery).first();
    user = result as User | null;
  } else {
    user = await getUser(request, env);
  }

  if (!user) {
    return error('Unauthorized', 401);
  }

  // Single global DO shard — all connections in one instance for reliable broadcasts
  const id = env.CONNECTION_MANAGER.idFromName('global');
  const stub = env.CONNECTION_MANAGER.get(id);

  // Forward request to Durable Object with user info
  const doUrl = new URL(request.url);
  doUrl.searchParams.set('userId', user.id);
  doUrl.searchParams.set('userName', user.name);
  doUrl.searchParams.set('role', user.role);
  if (user.building_id) {
    doUrl.searchParams.set('buildingId', user.building_id);
  }

  return stub.fetch(doUrl.toString(), request);
});

// ==================== CHAT ROUTES ====================

// Chat channels: List for user
// Оптимизировано: использует LEFT JOIN вместо множественных subqueries
route('GET', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query: string;
  let params: any[];

  if (isManagement(user)) {
    // Admins/directors/managers see all channels with unread count
    // Оптимизировано: один JOIN для last_message вместо 4 subqueries
    // Добавлен JOIN с users, buildings и branches для получения информации о жителе
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

// ==================== Notes API ====================

// Notes: Get all notes for current user
route('GET', '/api/notes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT id, title, content, created_at, updated_at
    FROM notes
    WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    ORDER BY updated_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ notes: results });
});

// Notes: Create a new note
route('POST', '/api/notes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as { title: string; content?: string };

  if (!body.title?.trim()) {
    return error('Title is required');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO notes (id, user_id, title, content, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, body.title.trim(), body.content || '', getTenantId(request), now, now).run();

  return json({
    note: {
      id,
      title: body.title.trim(),
      content: body.content || '',
      created_at: now,
      updated_at: now
    }
  });
});

// Notes: Update a note
route('PUT', '/api/notes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const noteId = params?.id;
  if (!noteId) return error('Note ID required');

  // Check ownership
  const existing = await env.DB.prepare(
    `SELECT id FROM notes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(noteId, user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existing) {
    return error('Note not found or access denied', 404);
  }

  const body = await request.json() as { title?: string; content?: string };

  if (!body.title?.trim()) {
    return error('Title is required');
  }

  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE notes SET title = ?, content = ?, updated_at = ?
    WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.title.trim(), body.content || '', now, noteId, user.id, ...(tenantId ? [tenantId] : [])).run();

  return json({
    note: {
      id: noteId,
      title: body.title.trim(),
      content: body.content || '',
      updated_at: now
    }
  });
});

// Notes: Delete a note
route('DELETE', '/api/notes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const noteId = params?.id;
  if (!noteId) return error('Note ID required');

  // Check ownership and delete
  const result = await env.DB.prepare(
    `DELETE FROM notes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(noteId, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (result.meta.changes === 0) {
    return error('Note not found or access denied', 404);
  }

  return json({ success: true });
});

// Chat: Get or create private support channel
route('POST', '/api/chat/channels/support', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only residents can create support channels
  if (user.role !== 'resident') {
    return error('Only residents can create support channels', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if channel exists
  let channel = await env.DB.prepare(
    `SELECT * FROM chat_channels WHERE type = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind('private_support', user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!channel) {
    const id = generateId();
    // MULTI-TENANCY: Add tenant_id on creation
    await env.DB.prepare(`
      INSERT INTO chat_channels (id, type, name, description, resident_id, tenant_id)
      VALUES (?, 'private_support', ?, ?, ?, ?)
    `).bind(id, user.name, user.apartment ? `кв. ${user.apartment}` : 'Личный чат', user.id, getTenantId(request)).run();

    channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  }

  return json(channel);
});

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
    // Get the channel to check if it's private_support
    const channel = await env.DB.prepare('SELECT type FROM chat_channels WHERE id = ?').bind(channelId).first() as { type: string } | null;

    if (channel?.type === 'private_support') {
      // Mark messages as read for ALL management users at once (optimized single query)
      // Uses CROSS JOIN to create all combinations of messages x management users
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
      // Regular marking for non-support channels
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
      `).bind(user.id, channelId, user.id).run();
    }
  } else {
    // Regular user: mark only for themselves
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
    // MULTI-TENANCY: Add tenant_id on creation
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_id, content, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, channelId, user.id, content, getTenantId(request)).run();
  } catch (e: any) {
    console.error('Failed to insert chat message:', e);
    return error(`Failed to send message: ${e.message || 'Database error'}`, 500);
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

    // Get channel info to determine recipient
    const channel = await env.DB.prepare(
      `SELECT * FROM chat_channels WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
    ).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as any;

    if (channel) {
      // Build channels list for WebSocket routing
      const channels: string[] = [`chat:channel:${channelId}`];

      if (channel.type === 'private_support') {
        // Notify admin/managers and the resident
        channels.push('chat:all'); // admins/managers
        if (channel.resident_id) {
          channels.push(`chat:user:${channel.resident_id}`);
        }

        // Send push notification to recipient (resident or manager)
        // If sender is manager/admin, notify resident
        // If sender is resident, notify managers
        if (['manager', 'admin', 'department_head'].includes(user.role) && channel.resident_id) {
          // UK отвечает жителю
          sendPushNotification(env, channel.resident_id, {
            title: '💬 Ответ от УК',
            body: content.length > 100 ? content.substring(0, 100) + '...' : content,
            type: 'chat_message',
            tag: `chat-${channelId}`,
            data: { channelId, url: '/chat' },
            requireInteraction: false
          }).catch(() => {});
        } else if (user.role === 'resident') {
          // Житель пишет в УК - уведомляем менеджеров
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
        // Group chat - notify all subscribers via WebSocket
        channels.push('chat:all');

        // Send push notifications to group chat participants (except sender)
        // For building_general, notify residents of that building
        if (channel.type === 'building_general' && channel.building_id) {
          const { results: residents } = await env.DB.prepare(
            `SELECT id FROM users WHERE building_id = ? AND id != ? AND role = 'resident' AND is_active = 1 LIMIT 100`
          ).bind(channel.building_id, user.id).all();

          // Send in batches to avoid blocking
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
          channels
        })
      });
    }
  } catch (e) {
    console.error('Failed to send chat WebSocket notification:', e);
  }

  return json({ message }, 201);
});

// Chat: Create channel (general)
route('POST', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { type, name, description, building_id } = body;

  if (!type || !name) {
    return error('Type and name required');
  }

  const id = generateId();
  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO chat_channels (id, type, name, description, building_id, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, type, name, description || null, building_id || null, user.id, getTenantId(request)).run();

  const channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  return json({ channel }, 201);
});

// Chat: Mark channel as read
route('POST', '/api/chat/channels/:id/read', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const tenantId = getTenantId(request);

  // Get the channel to check if it's private_support (with tenant filter)
  const channel = await env.DB.prepare(`SELECT type FROM chat_channels WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as { type: string } | null;

  if (isManagement(user) && channel?.type === 'private_support') {
    // For management users reading private_support: mark as read for ALL management users
    // Optimized: use single queries with CROSS JOIN instead of loop

    // Update last_read_at for all management users at once
    await env.DB.prepare(`
      INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
      SELECT ?, id, datetime('now') FROM users WHERE role IN ('admin', 'director', 'manager') ${tenantId ? 'AND tenant_id = ?' : ''}
      ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
    `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();

    // Mark all messages as read for all management users at once
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
    // Regular user or non-support channel: mark only for themselves
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
        channels: [`chat:channel:${channelId}`]
      })
    });
  } catch (e) {
    console.error('Failed to send read receipt:', e);
  }

  return json({ success: true });
});

// Chat: Get unread count for sidebar badge
route('GET', '/api/chat/unread-count', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let count = 0;

  if (isManagement(user)) {
    // Count unread messages from all private_support channels
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
    // Count unread messages in resident's support channel
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

// ==================== ANNOUNCEMENTS ROUTES ====================

// Announcements: List
route('GET', '/api/announcements', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const pagination = getPaginationParams(url);
  const tenantId = getTenantId(request);

  let whereClause: string;
  let params: any[] = [];

  if (isManagement(user)) {
    // Admins/directors/managers see all
    whereClause = `WHERE 1=1 ${tenantId ? 'AND tenant_id = ?' : ''}`;
    if (tenantId) params.push(tenantId);
  } else if (user.role === 'resident') {
    // Residents see announcements targeted to them
    // Logic:
    // 1. Show ALL announcements with target_type = NULL, '', 'all' (universal announcements)
    // 2. Show BRANCH-specific if user's building is in that branch
    // 3. Show BUILDING-specific if user has building_id and it matches
    // 4. Show ENTRANCE-specific if user's building AND entrance match
    // 5. Show FLOOR-specific if user's building, entrance AND floor match
    // 6. Show CUSTOM if user's login is in the list (exact match with delimiters)

    const hasBuilding = user.building_id !== null && user.building_id !== undefined;
    const userEntrance = user.entrance || null;
    const userFloor = user.floor || null;

    // Get user's branch code from their building
    let userBranchCode: string | null = null;
    if (hasBuilding) {
      const buildingInfo = await env.DB.prepare(
        `SELECT branch_code FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(user.building_id, ...(tenantId ? [tenantId] : [])).first() as any;
      userBranchCode = buildingInfo?.branch_code || null;
    }

    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'residents' OR type = 'all')
        ${tenantId ? 'AND tenant_id = ?' : ''}
        AND (
          target_type IS NULL
          OR target_type = ''
          OR target_type = 'all'
          ${userBranchCode ? `OR (target_type = 'branch' AND target_branch = ?)` : ''}
          ${hasBuilding ? `OR (target_type = 'building' AND target_building_id = ?)` : ''}
          ${hasBuilding && userEntrance ? `OR (target_type = 'entrance' AND target_building_id = ? AND target_entrance = ?)` : ''}
          ${hasBuilding && userEntrance && userFloor ? `OR (target_type = 'floor' AND target_building_id = ? AND target_entrance = ? AND target_floor = ?)` : ''}
          OR (target_type = 'custom' AND ((',' || target_logins || ',') LIKE ? OR (',' || target_logins || ',') LIKE ?))
        )
    `;

    params = [];
    if (tenantId) params.push(tenantId);
    if (userBranchCode) params.push(userBranchCode);
    if (hasBuilding) params.push(user.building_id);
    if (hasBuilding && userEntrance) {
      params.push(user.building_id, userEntrance);
    }
    if (hasBuilding && userEntrance && userFloor) {
      params.push(user.building_id, userEntrance, userFloor);
    }
    // For target_type = 'custom' - match by login OR apartment number
    params.push(`%,${user.login || ''},%`);
    params.push(`%,${user.apartment || ''},%`);
  } else {
    // Employees (executors, department_heads) see employee announcements
    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'employees' OR type = 'staff' OR type = 'all')
        ${tenantId ? 'AND tenant_id = ?' : ''}
    `;
    if (tenantId) params.push(tenantId);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM announcements ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data with view counts
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT a.*,
      (SELECT COUNT(*) FROM announcement_views WHERE announcement_id = a.id ${tenantId ? 'AND tenant_id = ?' : ''}) as view_count,
      (SELECT name FROM users WHERE id = a.created_by ${tenantId ? 'AND tenant_id = ?' : ''}) as author_name
    FROM announcements a
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const subqueryTenantIds = tenantId ? [tenantId, tenantId] : [];
  // IMPORTANT: subquery ?s appear in SELECT (before WHERE), so they must be bound FIRST
  const { results } = await env.DB.prepare(dataQuery).bind(...subqueryTenantIds, ...params, pagination.limit, offset).all();

  // For current user, check which announcements they've viewed
  const announcementIds = (results as any[]).map(a => a.id);
  let viewedByUser: Set<string> = new Set();

  if (announcementIds.length > 0) {
    const placeholders = announcementIds.map(() => '?').join(',');
    const { results: views } = await env.DB.prepare(
      `SELECT announcement_id FROM announcement_views WHERE user_id = ? AND announcement_id IN (${placeholders}) ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(user.id, ...announcementIds, ...(tenantId ? [tenantId] : [])).all();
    viewedByUser = new Set((views as any[]).map(v => v.announcement_id));
  }

  // Add viewed_by_user flag to each announcement and apply personalized content for residents
  const enrichedResults = (results as any[]).map(a => {
    let content = a.content;

    // For residents, apply personalized content if available
    if (user.role === 'resident' && a.personalized_data) {
      try {
        const personalizedData = typeof a.personalized_data === 'string'
          ? JSON.parse(a.personalized_data)
          : a.personalized_data;

        const userData = personalizedData[user.login];
        if (userData) {
          content = content
            .replace(/\{name\}/g, userData.name || user.name || '')
            .replace(/\{debt\}/g, (userData.debt || 0).toLocaleString('ru-RU'));
        }
      } catch (e) {
        console.error('Error parsing personalized_data:', e);
      }
    }

    return {
      ...a,
      content,
      viewed_by_user: viewedByUser.has(a.id),
      personalized_data: user.role === 'resident' ? undefined : a.personalized_data
    };
  });

  const response = createPaginatedResponse(enrichedResults, total || 0, pagination);

  return json({ announcements: response.data, pagination: response.pagination });
});

// Announcements: Create
route('POST', '/api/announcements', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments ? JSON.stringify(body.attachments) : null;
  // Handle personalized data for debt-based announcements (JSON object)
  const personalizedData = body.personalized_data ? JSON.stringify(body.personalized_data) : null;

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
  const icon = isUrgent ? '🚨' : '📢';
  const targetType = body.target_type || 'all';

  // Get target users based on target_type and announcement type
  const tenantIdForPush = getTenantId(request);
  let targetUsers: any[] = [];

  if (body.type === 'residents' || body.type === 'all') {
    // Build query based on target_type
    let query = `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 ${tenantIdForPush ? 'AND tenant_id = ?' : ''}`;
    const params: any[] = tenantIdForPush ? [tenantIdForPush] : [];

    if (targetType === 'branch' && body.target_branch) {
      // Get all buildings in this branch, then get residents in those buildings
      query = `SELECT u.id FROM users u
               INNER JOIN buildings b ON u.building_id = b.id
               WHERE u.role = 'resident' AND u.is_active = 1 AND b.branch_code = ? ${tenantIdForPush ? 'AND u.tenant_id = ?' : ''}`;
      // Reset params for the new query
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
      // Custom targeting by specific logins
      const logins = body.target_logins.split(',').map((l: string) => l.trim()).filter(Boolean);
      if (logins.length > 0) {
        const placeholders = logins.map(() => '?').join(',');
        query += ` AND login IN (${placeholders})`;
        params.push(...logins);
      }
    }
    // For 'all' - no additional filters

    const { results } = await env.DB.prepare(query).bind(...params).all();
    targetUsers = results as any[];
  }

  if (body.type === 'employees' || body.type === 'staff' || body.type === 'all') {
    // Get active staff members (executors, department_heads)
    const { results } = await env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('executor', 'department_head') AND is_active = 1 ${tenantIdForPush ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantIdForPush ? [tenantIdForPush] : [])).all();
    targetUsers = [...targetUsers, ...(results as any[])];
  }

  // Send push to all target users (in parallel batches for performance)
  const BATCH_SIZE = 10;
  for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
    const batch = targetUsers.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(targetUser =>
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
        skipInApp: true // In-app notifications created below with proper tenant_id
      }).catch(err => console.error(`[Push] Failed for user ${targetUser.id}:`, err))
    ));
  }

  console.log(`[Announcement] Created announcement ${id}, sent push to ${targetUsers.length} users`);

  // Create in-app notifications for target users
  const notificationId = generateId();
  const notificationTitle = `${icon} ${body.title}`;
  const notificationBody = body.content.substring(0, 200) + (body.content.length > 200 ? '...' : '');

  for (const targetUser of targetUsers) {
    try {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, data, tenant_id)
        VALUES (?, ?, ?, ?, 'announcement', ?, ?)
      `).bind(
        `${notificationId}-${targetUser.id}`,
        targetUser.id,
        notificationTitle,
        notificationBody,
        JSON.stringify({ announcementId: id, url: '/announcements' }),
        getTenantId(request)
      ).run();
    } catch (err) {
      console.error(`[Notification] Failed to create for user ${targetUser.id}:`, err);
    }
  }

  // Invalidate cache and broadcast WebSocket update
  invalidateCache('announcements:');

  try {
    const stub = env.CONNECTION_MANAGER.get(env.CONNECTION_MANAGER.idFromName('global'));
    await stub.fetch('https://internal/invalidate-cache', {
      method: 'POST',
      body: JSON.stringify({ prefix: 'announcements:' })
    });
  } catch (err) {
    console.error('[WebSocket] Failed to broadcast announcement update:', err);
  }

  return json({ id }, 201);
});

// Announcements: Update
route('PUT', '/api/announcements/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments !== undefined
    ? (body.attachments ? JSON.stringify(body.attachments) : null)
    : undefined;

  const tenantIdUpd = getTenantId(request);
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
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM announcements WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  invalidateCache('announcements:');
  return json({ success: true });
});

// Announcements: Mark as viewed
route('POST', '/api/announcements/:id/view', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdView = getTenantId(request);

  // Check if already viewed
  const existing = await env.DB.prepare(
    `SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ? ${tenantIdView ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, user.id, ...(tenantIdView ? [tenantIdView] : [])).first();

  if (!existing) {
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO announcement_views (id, announcement_id, user_id, tenant_id) VALUES (?, ?, ?, ?)'
    ).bind(id, announcementId, user.id, getTenantId(request)).run();
  }

  return json({ success: true });
});

// Announcements: Get view count and viewers list with statistics
route('GET', '/api/announcements/:id/views', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdViews = getTenantId(request);

  // Get announcement details for targeting
  const announcement = await env.DB.prepare(
    `SELECT * FROM announcements WHERE id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).first() as any;

  if (!announcement) {
    return error('Announcement not found', 404);
  }

  // Get total view count
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM announcement_views WHERE announcement_id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).first() as any;

  const viewCount = countResult?.count || 0;

  // Calculate target audience size based on targeting
  let targetAudienceSize = 0;
  let targetAudienceQuery = `SELECT COUNT(*) as count FROM users WHERE role = 'resident' ${tenantIdViews ? 'AND tenant_id = ?' : ''}`;
  const queryParams: any[] = tenantIdViews ? [tenantIdViews] : [];

  if (announcement.target_type === 'building' && announcement.target_building_id) {
    targetAudienceQuery += ' AND building_id = ?';
    queryParams.push(announcement.target_building_id);
  } else if (announcement.target_type === 'custom' && announcement.target_logins) {
    const logins = announcement.target_logins.split(',').filter(Boolean);
    if (logins.length > 0) {
      const placeholders = logins.map(() => '?').join(',');
      targetAudienceQuery += ` AND login IN (${placeholders})`;
      queryParams.push(...logins);
    }
  }
  // For 'all' or no targeting - count all residents in this tenant

  const audienceResult = await env.DB.prepare(targetAudienceQuery).bind(...queryParams).first() as any;
  targetAudienceSize = audienceResult?.count || 0;

  // Calculate percentage
  const viewPercentage = targetAudienceSize > 0 ? Math.round((viewCount / targetAudienceSize) * 100) : 0;

  // For admin/director/manager - also get list of viewers
  let viewers: any[] = [];
  if (isManagement(user)) {
    const { results } = await env.DB.prepare(`
      SELECT u.id, u.name, u.login, u.apartment, u.address, av.viewed_at
      FROM announcement_views av
      JOIN users u ON av.user_id = u.id
      WHERE av.announcement_id = ? ${tenantIdViews ? 'AND av.tenant_id = ?' : ''}
      ORDER BY av.viewed_at DESC
      LIMIT 100
    `).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).all();
    viewers = results as any[];
  }

  // Check if current user has viewed
  const userViewed = await env.DB.prepare(
    `SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, user.id, ...(tenantIdViews ? [tenantIdViews] : [])).first();

  return json({
    count: viewCount,
    targetAudienceSize,
    viewPercentage,
    viewers,
    userViewed: !!userViewed
  });
});



// ==================== RATINGS ROUTES ====================

// Ratings: Create
route('POST', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO employee_ratings (id, executor_id, resident_id, quality, speed, politeness, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.executor_id, user.id, body.quality, body.speed, body.politeness, body.comment || null).run();

  return json({ id }, 201);
});

// Ratings: Get for user
route('GET', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM employee_ratings WHERE resident_id = ?
  `).bind(user.id).all();

  return json(results);
});

// ==================== UK SATISFACTION RATINGS ====================

// Submit monthly UK satisfaction rating
route('POST', '/api/uk-ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { overall, cleanliness, responsiveness, communication, comment } = body;

  if (!overall || overall < 1 || overall > 5) {
    return error('Invalid overall rating', 400);
  }

  const tenantId = getTenantId(request) || 'default';
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO uk_satisfaction_ratings (id, resident_id, tenant_id, period, overall, cleanliness, responsiveness, communication, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(resident_id, tenant_id, period) DO UPDATE SET
        overall = excluded.overall,
        cleanliness = excluded.cleanliness,
        responsiveness = excluded.responsiveness,
        communication = excluded.communication,
        comment = excluded.comment,
        created_at = datetime('now')
    `).bind(id, user.id, tenantId, period, overall, cleanliness || null, responsiveness || null, communication || null, comment || null).run();

    return json({ success: true, period });
  } catch (e: any) {
    return error('Failed to submit rating: ' + e.message, 500);
  }
});

// Get current user's UK rating for current month
route('GET', '/api/uk-ratings/my', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request) || 'default';
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result = await env.DB.prepare(`
    SELECT * FROM uk_satisfaction_ratings WHERE resident_id = ? AND tenant_id = ? AND period = ?
  `).bind(user.id, tenantId, period).first();

  return json({ rating: result || null, period });
});

// Get UK rating summary (admin/director/manager)
route('GET', '/api/uk-ratings/summary', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'manager', 'director', 'department_head'].includes(user.role)) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request) || 'default';
  const url = new URL(request.url);
  const months = parseInt(url.searchParams.get('months') || '6');

  // Get monthly averages for the last N months
  const { results: monthlyData } = await env.DB.prepare(`
    SELECT
      period,
      COUNT(*) as total_votes,
      ROUND(AVG(overall), 2) as avg_overall,
      ROUND(AVG(cleanliness), 2) as avg_cleanliness,
      ROUND(AVG(responsiveness), 2) as avg_responsiveness,
      ROUND(AVG(communication), 2) as avg_communication
    FROM uk_satisfaction_ratings
    WHERE tenant_id = ?
    GROUP BY period
    ORDER BY period DESC
    LIMIT ?
  `).bind(tenantId, months).all();

  // Get current month stats
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  const prevPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  const currentMonth = monthlyData.find((m: any) => m.period === currentPeriod);
  const previousMonth = monthlyData.find((m: any) => m.period === prevPeriod);

  // Calculate trend
  let trend = 0;
  if (currentMonth && previousMonth) {
    trend = Math.round(((currentMonth as any).avg_overall - (previousMonth as any).avg_overall) / (previousMonth as any).avg_overall * 100);
  }

  // Get recent comments
  const { results: recentComments } = await env.DB.prepare(`
    SELECT r.comment, r.overall, r.period, r.created_at, u.name as resident_name
    FROM uk_satisfaction_ratings r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.tenant_id = ? AND r.comment IS NOT NULL AND r.comment != ''
    ORDER BY r.created_at DESC
    LIMIT 10
  `).bind(tenantId).all();

  return json({
    monthly: monthlyData,
    current: currentMonth || null,
    previous: previousMonth || null,
    trend,
    recentComments,
    currentPeriod,
  });
});


// ==================== STATS ROUTES ====================

// Stats helper function
async function getStats(env: Env, request: Request) {
  const tenantId = getTenantId(request);
  const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tenantWhere = tenantId ? ' WHERE tenant_id = ?' : '';
  const bind = tenantId ? [tenantId] : [];

  const stats = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'new'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status IN ('assigned', 'in_progress')${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'completed'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'resident'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'executor'${tenantFilter}`).bind(...bind).first(),
  ]);

  return {
    new_requests: (stats[0] as any)?.count || 0,
    in_progress: (stats[1] as any)?.count || 0,
    completed: (stats[2] as any)?.count || 0,
    total_residents: (stats[3] as any)?.count || 0,
    total_executors: (stats[4] as any)?.count || 0,
  };
}

// PUBLIC: no auth required
route('GET', '/api/stats', async (request, env) => {
  return json(await getStats(env, request));
});

// Alias for /api/stats/dashboard (frontend compatibility)
route('GET', '/api/stats/dashboard', async (request, env) => {
  return json(await getStats(env, request));
});

// ==================== SETTINGS ROUTES ====================

// Get all settings
route('GET', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { results } = await env.DB.prepare('SELECT key, value, updated_at FROM settings').all();

  // Convert to key-value object
  const settings: Record<string, any> = {};
  for (const row of results as any[]) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return json({ settings });
});

// Get single setting
// PUBLIC: no auth required
route('GET', '/api/settings/:key', async (request, env, params) => {
  const setting = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(params.key).first();

  if (!setting) {
    return json({ value: null });
  }

  try {
    return json({ value: JSON.parse((setting as any).value) });
  } catch {
    return json({ value: (setting as any).value });
  }
});

// Set/update setting
route('PUT', '/api/settings/:key', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);

  await env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).bind(params.key, value, value).run();

  return json({ success: true, key: params.key });
});

// Bulk update settings
route('POST', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as Record<string, any>;

  const statements = Object.entries(body).map(([key, val]) => {
    const value = typeof val === 'string' ? val : JSON.stringify(val);
    return env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).bind(key, value, value);
  });

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return json({ success: true });
});


// ==================== MAIN HANDLER ====================

// ==================== MONITORING & HEALTH ENDPOINTS ====================

// Health Check
// PUBLIC: no auth required
route('GET', '/api/health', async (request, env) => {
  const health = await healthCheck(env);
  const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 503;
  return json(health, status);
});


// Tenant Config (returns current tenant's configuration)
// PUBLIC: no auth required
route('GET', '/api/tenant/config', async (request, env) => {
  const tenant = getCurrentTenant();
  if (!tenant) {
    return json({ tenant: null, features: [] });
  }

  try {
    const features = JSON.parse(tenant.features || '[]');
    return json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        color: tenant.color,
        color_secondary: tenant.color_secondary,
        plan: tenant.plan,
        logo: tenant.logo || null,
        is_demo: tenant.is_demo === 1 || tenant.is_demo === true,
        show_useful_contacts_banner: tenant.show_useful_contacts_banner !== 0 ? 1 : 0,
        show_marketplace_banner: tenant.show_marketplace_banner !== 0 ? 1 : 0,
      },
      features
    });
  } catch (error) {
    console.error('Error parsing tenant features:', error);
    return json({ tenant: null, features: [] });
  }
});

// Metrics Dashboard (Admin only)
route('GET', '/api/admin/metrics', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const stats = metricsAggregator.getAggregatedStats();
  const cacheStats = getCacheStats();

  // Check thresholds and send alerts if needed
  AlertManager.checkThresholds(stats);

  return json({
    performance: stats,
    cache: cacheStats,
    health: await healthCheck(env),
  });
});

// Performance Metrics (detailed)
route('GET', '/api/admin/metrics/performance', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');

  const perfMetrics = endpoint
    ? metricsAggregator.getPerformanceMetrics(endpoint)
    : metricsAggregator.getPerformanceMetrics();

  return json({
    metrics: perfMetrics,
    aggregated: metricsAggregator.getAggregatedStats(),
  });
});

// Error Logs (Admin only)
route('GET', '/api/admin/metrics/errors', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const errors = metricsAggregator.getErrors();

  return json({
    total: errors.length,
    errors: errors.slice(-50), // Last 50 errors
  });
});

// Clear metrics (Admin only)
route('POST', '/api/admin/metrics/clear', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  metricsAggregator.clear();

  return json({ message: 'Metrics cleared successfully' });
});

// Reset/Clear all requests (Admin only)
route('POST', '/api/admin/requests/reset', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  try {
    // Delete request history first (FK constraint)
    await env.DB.prepare('DELETE FROM request_history').run();

    // Delete messages related to requests
    await env.DB.prepare('DELETE FROM messages').run();

    // Delete all requests
    await env.DB.prepare('DELETE FROM requests').run();

    // Reset request number sequence
    await env.DB.prepare(`
      UPDATE settings SET value = '0' WHERE key = 'last_request_number'
    `).run();

    // Invalidate caches
    await invalidateOnChange('requests', env.RATE_LIMITER);

    return json({ message: 'All requests have been deleted successfully' });
  } catch (err: any) {
    console.error('Error resetting requests:', err);
    return error('Failed to reset requests: ' + err.message, 500);
  }
});

// Frontend Error Reporting (Public - errors from React)
// PUBLIC: no auth required
route('POST', '/api/admin/monitoring/frontend-error', async (request, env) => {
  try {
    const body = await request.json() as any;

    // Log frontend error
    console.error('🔴 Frontend Error:', {
      timestamp: body.timestamp,
      error: body.error?.message,
      url: body.url,
      userId: body.userId,
      userAgent: body.userAgent,
    });

    // Store in metrics aggregator
    metricsAggregator.logError({
      message: `[Frontend] ${body.error?.message || 'Unknown error'}`,
      endpoint: body.url || 'unknown',
      method: 'FRONTEND',
      timestamp: Date.now(),
      stack: body.error?.stack,
      userAgent: body.userAgent,
      userId: body.userId,
    });

    // Send to Cloudflare Analytics if available
    if (env.ENVIRONMENT === 'production') {
      logAnalyticsEvent(request, 'frontend_error', {
        error_name: body.error?.name || 'UnknownError',
        error_message: body.error?.message || 'Unknown error',
        url: body.url,
        userId: body.userId,
      });
    }

    return json({ message: 'Error logged successfully' });
  } catch (err) {
    console.error('Failed to log frontend error:', err);
    return error('Failed to log error', 500);
  }
});

// GET /api/payments/:id — single payment details
route('GET', '/api/payments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const payment = await env.DB.prepare(
    `SELECT * FROM payments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!payment) return error('Payment not found', 404);
  return json({ payment });
});

// GET /api/apartments/:apartmentId/balance — apartment balance summary
route('GET', '/api/apartments/:apartmentId/balance', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  let where = 'WHERE apartment_id = ?';
  const bindParams: any[] = [params.apartmentId];
  if (tenantId) { where += ' AND tenant_id = ?'; bindParams.push(tenantId); }

  const result = await env.DB.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as total_charged,
      COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_paid
    FROM payments ${where}
  `).bind(...bindParams).first() as any;

  const totalCharged = Number(result?.total_charged || 0);
  const totalPaid = Number(result?.total_paid || 0);

  return json({
    apartment_id: params.apartmentId,
    total_charged: totalCharged,
    total_paid: totalPaid,
    balance: totalPaid - totalCharged,
  });
});

} // end registerMiscRoutes
