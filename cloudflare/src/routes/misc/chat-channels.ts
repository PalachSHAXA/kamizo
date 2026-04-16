// Chat channels routes — list, create, support channel

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';

export function registerChatChannelRoutes() {

// Chat channels: List for user
// Optimized: uses LEFT JOIN instead of multiple subqueries
route('GET', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  let query: string;
  let params: any[];

  if (isManagement(user)) {
    // Admins/directors/managers see all channels with unread count
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
route('POST', '/api/chat/channels/support', async (request, env) => {
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
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

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

} // end registerChatChannelRoutes
