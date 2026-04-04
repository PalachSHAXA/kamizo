// POST /api/meetings/:id/close-voting, POST /api/meetings/:id/publish-results

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error,
  sendPushNotification, getMeetingWithDetails
} from './helpers';

export function registerCloseVotingRoutes() {

// Close voting
route('POST', '/api/meetings/:id/close-voting', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting || meeting.status !== 'voting_open') return error('Meeting not found or voting not open', 400);

  const [votedAreaResult, participatedCount] = await Promise.all([
    env.DB.prepare('SELECT COALESCE(SUM(weight), 0) as voted_area FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id)').bind(params.id).first(),
    env.DB.prepare('SELECT COUNT(DISTINCT voter_id) as count FROM meeting_vote_records WHERE meeting_id = ?').bind(params.id).first()
  ]) as any[];

  const votedArea = votedAreaResult?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participated = participatedCount?.count || 0;
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= meeting.quorum_percent;

  const { results: agendaItems } = await env.DB.prepare('SELECT * FROM meeting_agenda_items WHERE meeting_id = ?').bind(params.id).all();

  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'for' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'against' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'abstain' AND is_revote = 0").bind(i.id).first()
    ]) as any[];

    const forWeight = votesFor?.weight || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotedWeight = forWeight + againstWeight + abstainWeight;
    let isApproved = 0;

    if (quorumReached && totalVotedWeight > 0) {
      if (i.threshold === 'qualified_majority' || i.threshold === 'two_thirds') {
        isApproved = forWeight >= (totalArea * 2 / 3) ? 1 : 0;
      } else if (i.threshold === 'three_quarters') {
        isApproved = forWeight >= (totalArea * 3 / 4) ? 1 : 0;
      } else if (i.threshold === 'unanimous') {
        isApproved = (againstWeight === 0 && abstainWeight === 0 && forWeight > 0) ? 1 : 0;
      } else {
        isApproved = forWeight > (totalVotedWeight / 2) ? 1 : 0;
      }
    }

    await env.DB.prepare(`UPDATE meeting_agenda_items SET is_approved = ?, votes_for_area = ?, votes_against_area = ?, votes_abstain_area = ? WHERE id = ?`)
      .bind(isApproved, forWeight, againstWeight, abstainWeight, i.id).run();
  }

  await env.DB.prepare(`UPDATE meetings SET status = 'voting_closed', voting_closed_at = datetime('now'), participated_count = ?, voted_area = ?, participation_percent = ?, quorum_reached = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(participated, votedArea, participationPercent, quorumReached ? 1 : 0, params.id).run();

  await env.DB.prepare(`UPDATE meeting_vote_reconsideration_requests SET status = 'expired', expired_at = datetime('now') WHERE meeting_id = ? AND status IN ('pending', 'viewed')`).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare('SELECT id FROM users WHERE role = ? AND building_id = ?').bind('resident', meeting.building_id).all();
    const quorumStatus = quorumReached ? 'Кворум достигнут!' : 'Кворум не достигнут.';
    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, { title: '\u{1F5F3}\u{FE0F} Голосование завершено', body: `Голосование по собранию жильцов завершено. ${quorumStatus} Участие: ${participationPercent.toFixed(1)}%`, type: 'meeting', tag: `meeting-closed-${params.id}`, data: { meetingId: params.id, url: '/meetings' }, requireInteraction: false }).catch(() => {});
    }
  }
  return json({ meeting: updated });
});

// Publish results
route('POST', '/api/meetings/:id/publish-results', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  await env.DB.prepare(`UPDATE meetings SET status = 'results_published', results_published_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'voting_closed'`).bind(params.id).run();
  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare('SELECT id FROM users WHERE role = ? AND building_id = ?').bind('resident', meeting.building_id).all();
    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, { title: '\u{1F4CA} Результаты голосования опубликованы', body: `Результаты собрания жильцов ${meeting.building_address || ''} доступны для просмотра.`, type: 'meeting', tag: `meeting-results-${params.id}`, data: { meetingId: params.id, url: '/meetings' }, requireInteraction: false }).catch(() => {});
    }
  }
  return json({ meeting: updated });
});

} // end registerCloseVotingRoutes
