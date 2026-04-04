// Schedule voting routes

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, generateId
} from './helpers';

export function registerScheduleRoutes() {

// Schedule voting
route('POST', '/api/meetings/:meetingId/schedule-votes', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const optionId = body.option_id || body.optionId;

  const meeting = await env.DB.prepare(
    `SELECT building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Собрание не найдено', 404);

  const userInfo = await env.DB.prepare('SELECT total_area FROM users WHERE id = ?').bind(authUser.id).first() as any;
  const voteWeight = userInfo?.total_area || 50;

  await env.DB.prepare('DELETE FROM meeting_schedule_votes WHERE meeting_id = ? AND user_id = ?').bind(params.meetingId, authUser.id).run();

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_schedule_votes (id, meeting_id, option_id, user_id, voter_id, voter_name, vote_weight, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, params.meetingId, optionId, authUser.id, authUser.id, authUser.name, voteWeight, getTenantId(request)).run();

  await env.DB.prepare(`UPDATE meetings SET updated_at = datetime('now') WHERE id = ?`).bind(params.meetingId).run();
  invalidateCache('meetings:');
  return json({ success: true, voteWeight });
});

// Get schedule vote by user
route('GET', '/api/meetings/:meetingId/schedule-votes/me', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const vote = await env.DB.prepare('SELECT option_id FROM meeting_schedule_votes WHERE meeting_id = ? AND user_id = ?').bind(params.meetingId, authUser.id).first() as any;
  return json({ optionId: vote?.option_id || null });
});

} // end registerScheduleRoutes
