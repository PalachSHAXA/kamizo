// Agenda comments CRUD

import {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId
} from './helpers';

export function registerCommentRoutes() {

// Sprint 61 P0: every endpoint here was referencing `user_id` and `comment`
// columns that don't exist on `meeting_agenda_comments` (actual columns:
// `resident_id`, `content`). POST 500'd silently and DELETE/GET returned
// wrong rows. All three endpoints rewritten against the real schema.

// Get comments for agenda item
route('GET', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(
    `SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY created_at DESC`
  ).bind(params.agendaItemId, ...(tenantId ? [tenantId] : [])).all();
  return json({ comments: results });
});

// Add comment to agenda item
route('POST', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const content = typeof body.content === 'string' ? body.content.trim() : (typeof body.comment === 'string' ? body.comment.trim() : '');
  if (!content) return error('Comment content is required', 400);

  const agendaItem = await env.DB.prepare(
    `SELECT meeting_id FROM meeting_agenda_items WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.agendaItemId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!agendaItem) return error('Agenda item not found', 404);

  const meeting = await env.DB.prepare(
    `SELECT status FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(agendaItem.meeting_id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) return error('Comments are only allowed during voting', 400);

  // Resolve apartment_number from users table (used in protocol).
  const userInfo = await env.DB.prepare('SELECT apartment FROM users WHERE id = ?').bind(authUser.id).first() as any;

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_agenda_comments (id, agenda_item_id, meeting_id, resident_id, resident_name, apartment_number, content, comment_type, include_in_protocol, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'comment', 1, ?)
  `).bind(id, params.agendaItemId, agendaItem.meeting_id, authUser.id, authUser.name, userInfo?.apartment || null, content.slice(0, 2000), tenantId).run();

  const created = await env.DB.prepare('SELECT * FROM meeting_agenda_comments WHERE id = ?').bind(id).first();
  return json({ comment: created }, 201);
});

// Delete own comment
route('DELETE', '/api/comments/:commentId', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const comment = await env.DB.prepare(
    `SELECT resident_id, agenda_item_id FROM meeting_agenda_comments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.commentId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!comment) return error('Comment not found', 404);
  if (comment.resident_id !== authUser.id && authUser.role !== 'admin') return error('Not authorized to delete this comment', 403);

  const agendaItem = await env.DB.prepare('SELECT meeting_id FROM meeting_agenda_items WHERE id = ?').bind(comment.agenda_item_id).first() as any;
  if (agendaItem) {
    const meeting = await env.DB.prepare('SELECT status FROM meetings WHERE id = ?').bind(agendaItem.meeting_id).first() as any;
    if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) return error('Cannot delete comments after voting ends', 400);
  }

  await env.DB.prepare('DELETE FROM meeting_agenda_comments WHERE id = ?').bind(params.commentId).run();
  return json({ success: true });
});

} // end registerCommentRoutes
