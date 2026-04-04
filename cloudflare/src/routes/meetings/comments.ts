// Agenda comments CRUD

import {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId
} from './helpers';

export function registerCommentRoutes() {

// Get comments for agenda item
route('GET', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at DESC`).bind(params.agendaItemId).all();
  return json({ comments: results });
});

// Add comment to agenda item
route('POST', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const agendaItem = await env.DB.prepare('SELECT meeting_id FROM meeting_agenda_items WHERE id = ?').bind(params.agendaItemId).first() as any;
  if (!agendaItem) return error('Agenda item not found', 404);

  const meeting = await env.DB.prepare('SELECT status FROM meetings WHERE id = ?').bind(agendaItem.meeting_id).first() as any;
  if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) return error('Comments are only allowed during voting', 400);

  const id = generateId();
  await env.DB.prepare(`INSERT INTO meeting_agenda_comments (id, agenda_item_id, user_id, comment, tenant_id) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, params.agendaItemId, authUser.id, body.content || body.comment, getTenantId(request)).run();

  const created = await env.DB.prepare('SELECT * FROM meeting_agenda_comments WHERE id = ?').bind(id).first();
  return json({ comment: created }, 201);
});

// Delete own comment
route('DELETE', '/api/comments/:commentId', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const comment = await env.DB.prepare('SELECT user_id, agenda_item_id FROM meeting_agenda_comments WHERE id = ?').bind(params.commentId).first() as any;
  if (!comment) return error('Comment not found', 404);
  if (comment.user_id !== authUser.id && authUser.role !== 'admin') return error('Not authorized to delete this comment', 403);

  const agendaItem = await env.DB.prepare('SELECT meeting_id FROM meeting_agenda_items WHERE id = ?').bind(comment.agenda_item_id).first() as any;
  if (agendaItem) {
    const meeting = await env.DB.prepare('SELECT status FROM meetings WHERE id = ?').bind(agendaItem.meeting_id).first() as any;
    if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) return error('Cannot delete comments after voting ends', 400);
  }

  await env.DB.prepare('DELETE FROM meeting_agenda_comments WHERE id = ?').bind(params.commentId).run();
  return json({ success: true });
});

} // end registerCommentRoutes
