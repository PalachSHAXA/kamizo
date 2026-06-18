// Schedule voting routes

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, bilingualError, generateId
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
  if (!meeting) return bilingualError('Собрание не найдено', 'Yig\'ilish topilmadi', 404);

  // Sprint 61 P0: schema column is `voter_id`, not `user_id`. The previous
  // DELETE matched 0 rows (silent no-op) and the INSERT either 500'd on
  // the missing user_id column or relied on a legacy patched schema.
  // Use the canonical column name everywhere. UNIQUE(meeting_id, voter_id)
  // means DELETE-then-INSERT is the correct re-vote pattern.
  const userInfo = await env.DB.prepare('SELECT total_area FROM users WHERE id = ?').bind(authUser.id).first() as any;
  const voteWeight = userInfo?.total_area || 50;

  await env.DB.prepare(
    `DELETE FROM meeting_schedule_votes WHERE meeting_id = ? AND voter_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, authUser.id, ...(tenantId ? [tenantId] : [])).run();

  const id = generateId();
  // IMPORTANT: write BOTH user_id and voter_id (same value = the voter's
  // user id). The live DB still carries a legacy `user_id TEXT NOT NULL`
  // column, so omitting it makes the INSERT fail with a NOT NULL
  // constraint — that silently dropped EVERY schedule vote. And the vote
  // COUNT/voter aggregation in crud-list.ts / crud-detail.ts reads
  // `user_id`, so it must stay populated for tallies to be correct. The
  // Sprint-61 move to voter_id was only half-applied; until those readers
  // also move to voter_id, both columns must be written.
  await env.DB.prepare(`
    INSERT INTO meeting_schedule_votes (id, meeting_id, option_id, user_id, voter_id, voter_name, vote_weight, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, params.meetingId, optionId, authUser.id, authUser.id, authUser.name, voteWeight, tenantId).run();

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
  const tenantId = getTenantId(request);

  // Sprint 61 P0: column is `voter_id`. Was always returning null.
  const vote = await env.DB.prepare(
    `SELECT option_id FROM meeting_schedule_votes WHERE meeting_id = ? AND voter_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;
  return json({ optionId: vote?.option_id || null });
});

} // end registerScheduleRoutes
