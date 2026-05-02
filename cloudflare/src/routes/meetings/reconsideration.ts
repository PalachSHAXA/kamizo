// Vote reconsideration request endpoints

import {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId, sendPushNotification
} from './helpers';

export function registerReconsiderationRoutes() {

// Get "against" votes for an agenda item (for management)
route('GET', '/api/meetings/:meetingId/agenda/:agendaItemId/votes/against', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!['manager', 'director', 'admin'].includes(authUser.role)) return error('Forbidden', 403);

  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT id, status FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  const { results: againstVotes } = await env.DB.prepare(`
    SELECT vr.id as vote_id, vr.voter_id, vr.voter_name, vr.apartment_number, vr.vote_weight, vr.voted_at, u.phone, u.total_area,
      (SELECT comment FROM meeting_agenda_comments WHERE agenda_item_id = ? AND user_id = vr.voter_id ORDER BY created_at DESC LIMIT 1) as comment,
      (SELECT COUNT(*) FROM meeting_vote_reconsideration_requests WHERE agenda_item_id = ? AND resident_id = vr.voter_id) as request_count
    FROM meeting_vote_records vr LEFT JOIN users u ON u.id = vr.voter_id
    WHERE vr.meeting_id = ? AND vr.agenda_item_id = ? AND vr.choice = 'against' AND vr.is_revote = 0 ORDER BY vr.vote_weight DESC
  `).bind(params.agendaItemId, params.agendaItemId, params.meetingId, params.agendaItemId).all();

  const votesWithFlags = (againstVotes || []).map((v: any) => ({ ...v, can_send_request: meeting.status === 'voting_open' && v.request_count < 2 }));
  return json({ votes: votesWithFlags });
});

// Send reconsideration request
route('POST', '/api/meetings/:meetingId/reconsideration-requests', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!['manager', 'director', 'admin'].includes(authUser.role)) return error('Forbidden', 403);

  const body = await request.json() as any;
  const { agenda_item_id, resident_id, reason, message_to_resident } = body;
  if (!agenda_item_id || !resident_id || !reason) return error('Missing required fields', 400);

  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT id, status, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting || meeting.status !== 'voting_open') return error('Voting is not open', 400);

  const currentVote = await env.DB.prepare(`SELECT vr.*, u.apartment FROM meeting_vote_records vr JOIN users u ON u.id = vr.voter_id WHERE vr.meeting_id = ? AND vr.agenda_item_id = ? AND vr.voter_id = ? AND vr.is_revote = 0`).bind(params.meetingId, agenda_item_id, resident_id).first() as any;
  if (!currentVote) return error('Resident has not voted on this item', 400);

  const existingRequests = await env.DB.prepare(`SELECT COUNT(*) as count FROM meeting_vote_reconsideration_requests WHERE agenda_item_id = ? AND resident_id = ?`).bind(agenda_item_id, resident_id).first() as any;
  if (existingRequests.count >= 2) return error('Maximum 2 requests per resident per agenda item', 400);

  const requestId = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_vote_reconsideration_requests (id, meeting_id, agenda_item_id, resident_id, apartment_id, requested_by_user_id, requested_by_role, reason, message_to_resident, vote_at_request_time, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(requestId, params.meetingId, agenda_item_id, resident_id, currentVote.apartment || currentVote.apartment_number || '', authUser.id, authUser.role, reason, message_to_resident || null, currentVote.choice).run();

  const agendaItem = await env.DB.prepare('SELECT title FROM meeting_agenda_items WHERE id = ?').bind(agenda_item_id).first() as any;

  sendPushNotification(env, resident_id, { title: '\u{1F5F3}\u{FE0F} Просьба пересмотреть голос', body: `УК просит вас пересмотреть голос по вопросу: "${agendaItem?.title || 'Голосование'}"`, type: 'meeting', tag: `reconsider-${requestId}`, data: { meetingId: params.meetingId, requestId, url: '/meetings' }, requireInteraction: true }).catch((err) => { console.error('fire-and-forget failed:', err); });

  const notificationId = generateId();
  await env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data) VALUES (?, ?, 'meeting', ?, ?, ?)`)
    .bind(notificationId, resident_id, 'Просьба пересмотреть голос', message_to_resident || `УК просит вас пересмотреть голос по вопросу собрания`, JSON.stringify({ meetingId: params.meetingId, agendaItemId: agenda_item_id, requestId })).run();

  return json({ success: true, requestId });
});

// Get resident's pending reconsideration requests
route('GET', '/api/meetings/reconsideration-requests/me', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results: requests } = await env.DB.prepare(`
    SELECT r.*, m.status as meeting_status, ai.title as agenda_item_title, ai.description as agenda_item_description, u.name as requested_by_name
    FROM meeting_vote_reconsideration_requests r JOIN meetings m ON m.id = r.meeting_id JOIN meeting_agenda_items ai ON ai.id = r.agenda_item_id LEFT JOIN users u ON u.id = r.requested_by_user_id
    WHERE r.resident_id = ? AND r.status IN ('pending', 'viewed') AND m.status = 'voting_open' ${tenantId ? 'AND m.tenant_id = ?' : ''} ORDER BY r.created_at DESC
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();
  return json({ requests: requests || [] });
});

// Mark reconsideration request as viewed
route('POST', '/api/meetings/reconsideration-requests/:requestId/view', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const request_record = await env.DB.prepare(`SELECT r.* FROM meeting_vote_reconsideration_requests r JOIN meetings m ON m.id = r.meeting_id WHERE r.id = ? AND r.resident_id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}`).bind(params.requestId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!request_record) return error('Request not found', 404);

  if (request_record.status === 'pending') {
    await env.DB.prepare(`UPDATE meeting_vote_reconsideration_requests SET status = 'viewed', viewed_at = datetime('now') WHERE id = ?`).bind(params.requestId).run();
  }
  return json({ success: true });
});

// Ignore reconsideration request
route('POST', '/api/meetings/reconsideration-requests/:requestId/ignore', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const request_record = await env.DB.prepare(`SELECT r.* FROM meeting_vote_reconsideration_requests r JOIN meetings m ON m.id = r.meeting_id WHERE r.id = ? AND r.resident_id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}`).bind(params.requestId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!request_record) return error('Request not found', 404);

  await env.DB.prepare(`UPDATE meeting_vote_reconsideration_requests SET status = 'ignored', responded_at = datetime('now') WHERE id = ?`).bind(params.requestId).run();
  return json({ success: true });
});

// Reconsideration request stats
route('GET', '/api/meetings/:meetingId/reconsideration-requests/stats', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!['manager', 'director', 'admin'].includes(authUser.role)) return error('Forbidden', 403);

  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const stats = await env.DB.prepare(`
    SELECT COUNT(*) as total, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending, SUM(CASE WHEN status = 'viewed' THEN 1 ELSE 0 END) as viewed,
      SUM(CASE WHEN status = 'vote_changed' THEN 1 ELSE 0 END) as vote_changed, SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) as ignored, SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
    FROM meeting_vote_reconsideration_requests WHERE meeting_id = ?
  `).bind(params.meetingId).first() as any;

  const conversionRate = stats.total > 0 ? ((stats.vote_changed || 0) / stats.total * 100).toFixed(1) : '0';
  return json({ stats: { ...stats, conversion_rate: conversionRate } });
});

} // end registerReconsiderationRoutes
