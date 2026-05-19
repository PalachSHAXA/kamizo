// Chat messages routes — list and send messages

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';

// Sprint 64 P0: shared membership/tenant check for chat endpoints. Previously
// GET/POST messages and POST /read all skipped this check, letting any
// authenticated user read or write any channel by ID — across tenants too,
// since on main-domain `tenantId` was null and the tenant guard was wrapped
// in `if (tenantId)`. Now: load the channel (force tenant scope or fail),
// then verify the user is allowed in.
//
// Allowed when:
//   - user is management AND in same tenant as channel
//   - private_support: user is the resident_id on that channel
//   - building_general: user.building_id matches channel.building_id
//   - uk_general: user has a building in the same tenant (i.e. is a resident
//     of this UK)
//   - generic membership via chat_participants table (future-proof)
async function getAccessibleChannel(env: any, channelId: string, user: any, tenantId: string | null) {
  const channel = await env.DB.prepare(
    `SELECT id, tenant_id, type, resident_id, building_id, name FROM chat_channels WHERE id = ?
     ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!channel) return null;

  // On main-domain (tenantId === null) require channel.tenant_id matches user.tenant_id
  // — otherwise super-admins across tenants would leak into each other.
  if (!tenantId && channel.tenant_id && user.tenant_id && channel.tenant_id !== user.tenant_id) {
    return null;
  }

  if (isManagement(user)) return channel;
  if (channel.type === 'private_support' && channel.resident_id === user.id) return channel;
  if (channel.type === 'building_general' && channel.building_id && channel.building_id === user.building_id) return channel;
  if (channel.type === 'uk_general') {
    // Resident in any building of this tenant — same UK
    if (user.building_id) return channel;
  }
  // Membership table fallback (if schema has chat_participants)
  try {
    const member = await env.DB.prepare(
      'SELECT 1 FROM chat_participants WHERE channel_id = ? AND user_id = ?'
    ).bind(channelId, user.id).first();
    if (member) return channel;
  } catch { /* table may not exist; ignore */ }

  return null;
}

export function registerChatMessageRoutes() {

// Chat messages: List for channel
route('GET', '/api/chat/channels/:id/messages', async (request, env, params) => {
  // Sprint 77 P0/F1: gate chat feature flag.
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const before = url.searchParams.get('before'); // message ID for pagination

  // Sprint 64 P0: full membership/tenant gate (was only checking tenant
  // when tenantId resolved, and never checking membership at all).
  const tenantId = getTenantId(request);
  const channel = await getAccessibleChannel(env, channelId, user, tenantId);
  if (!channel) return error('Channel not found', 404);

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
  // Sprint 77 P0/F1: gate chat feature flag.
  const fc = await requireFeature('chat', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const tenantId = getTenantId(request);

  // Sprint 64 P0: membership gate (was none — anyone could POST into any channel).
  const channel = await getAccessibleChannel(env, channelId, user, tenantId);
  if (!channel) return error('Channel not found', 404);

  const { content } = await request.json() as { content: string };
  if (!content) return error('Content required');
  // Sprint 64 P0: cap inline-image messages tighter — D1 row limit is ~1MB.
  // Was 2MB, also no MIME-type validation. Now: 1MB cap + strict image MIME.
  const PHOTO_PREFIX_RE = /^data:image\/(png|jpe?g|webp);base64,/i;
  if (content.startsWith('data:')) {
    if (!PHOTO_PREFIX_RE.test(content)) return error('Only PNG/JPEG/WebP inline images allowed', 400);
    if (content.length > 1_000_000) return error('Inline image too large (max 1MB)', 400);
  } else if (content.length > 5000) {
    return error('Message too long (max 5000 characters)', 400);
  }

  const id = generateId();

  try {
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_id, content, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, channelId, user.id, content, tenantId ?? channel.tenant_id ?? '').run();
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

    // We already verified channel membership above; reuse that row.
    const channelRow = channel;

    if (channelRow) {
      const channels: string[] = [`chat:channel:${channelId}`];
      // Sprint 64 P0: use channel.tenant_id as the source of truth for
      // recipient lookup. Previously the manager-recipient query had NO
      // tenant filter — a resident's message preview pushed to managers
      // across ALL tenants (cross-tenant PII leak). Also include director
      // and department_head (they were missed).
      const channelTenant = channelRow.tenant_id || null;
      const tenantFilter = channelTenant ? 'AND tenant_id = ?' : '';
      const tenantBind = channelTenant ? [channelTenant] : [];

      if (channelRow.type === 'private_support') {
        channels.push('chat:all');
        if (channelRow.resident_id) {
          channels.push(`chat:user:${channelRow.resident_id}`);
        }

        if (['manager', 'admin', 'department_head', 'director'].includes(user.role) && channelRow.resident_id) {
          sendPushNotification(env, channelRow.resident_id, {
            title: '\u{1F4AC} Ответ от УК',
            body: content.length > 100 ? content.substring(0, 100) + '...' : content,
            type: 'chat_message',
            tag: `chat-${channelId}`,
            data: { channelId, url: '/chat' },
            requireInteraction: false
          }).catch(() => {});
        } else if (user.role === 'resident') {
          const { results: managers } = await env.DB.prepare(
            `SELECT id FROM users WHERE role IN ('manager', 'admin', 'department_head', 'director') AND is_active = 1 ${tenantFilter}`
          ).bind(...tenantBind).all();

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

        if (channelRow.type === 'building_general' && channelRow.building_id) {
          const { results: residents } = await env.DB.prepare(
            `SELECT id FROM users WHERE building_id = ? AND id != ? AND role = 'resident' AND is_active = 1 ${tenantFilter} LIMIT 100`
          ).bind(channelRow.building_id, user.id, ...tenantBind).all();

          const BATCH = 10;
          for (let i = 0; i < (residents?.length || 0); i += BATCH) {
            const batch = (residents || []).slice(i, i + BATCH) as any[];
            Promise.all(batch.map(r =>
              sendPushNotification(env, r.id, {
                title: `\u{1F4AC} ${channelRow.name || 'Чат дома'}`,
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

      // Sprint 76 P0/F2: DO /broadcast now requires the internal secret.
      await connManager.fetch('http://internal/broadcast', {
        method: 'POST',
        headers: { 'x-internal-secret': (env as any).INTERNAL_RPC_SECRET || env.JWT_SECRET || '' },
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
