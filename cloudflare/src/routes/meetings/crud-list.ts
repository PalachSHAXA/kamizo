// GET /api/meetings — list meetings with caching

import {
  route, getUser, getTenantId, requireFeature,
  getCached, setCache,
  json, error
} from './helpers';

export function registerMeetingListRoutes() {

route('GET', '/api/meetings', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const url = new URL(request.url);
  let buildingId = url.searchParams.get('building_id');
  const status = url.searchParams.get('status');
  const organizerId = url.searchParams.get('organizer_id');
  const onlyActive = url.searchParams.get('only_active') === 'true';
  const tenantId = getTenantId(request);

  const authUser = await getUser(request, env);
  if (authUser?.role === 'resident' && authUser.building_id) {
    buildingId = authUser.building_id;
  }

  const cacheKey = `meetings:${buildingId || 'all'}:${status || 'all'}:${organizerId || 'all'}:${onlyActive ? 'active' : 'all'}:${tenantId || 'no-tenant'}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return json({ meetings: cached });
  }

  let query = 'SELECT * FROM meetings WHERE 1=1';
  const params: any[] = [];

  if (tenantId) { query += ' AND tenant_id = ?'; params.push(tenantId); }
  if (buildingId) { query += ' AND building_id = ?'; params.push(buildingId); }
  if (status) { query += ' AND status = ?'; params.push(status); }
  if (organizerId) { query += ' AND organizer_id = ?'; params.push(organizerId); }

  if (onlyActive) {
    query += ` AND status IN ('draft', 'pending_moderation', 'schedule_poll_open', 'schedule_confirmed', 'voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved')`;
  }

  const limit = onlyActive ? 20 : 50;
  query += ` ORDER BY created_at DESC LIMIT ${limit}`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  const meetingIds = results.map((m: any) => m.id);
  if (meetingIds.length === 0) return json({ meetings: [] });

  const [allOptions, allAgenda, allParticipation, allAgendaVotes] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meeting_schedule_options WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT * FROM meeting_agenda_items WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) ORDER BY item_order`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT meeting_id, COUNT(DISTINCT user_id) as count FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) GROUP BY meeting_id`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT meeting_id, agenda_item_id, choice, voter_id, vote_weight FROM meeting_vote_records WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) AND is_revote = 0`).bind(...meetingIds).all()
  ]);

  const optionIds = (allOptions.results as any[]).map(o => o.id);
  let allVotes: any[] = [];
  if (optionIds.length > 0) {
    const votesResult = await env.DB.prepare(
      `SELECT option_id, user_id, vote_weight FROM meeting_schedule_votes WHERE option_id IN (${optionIds.map(() => '?').join(',')})`
    ).bind(...optionIds).all();
    allVotes = votesResult.results as any[];
  }

  const optionsMap = new Map<string, any[]>();
  for (const opt of allOptions.results as any[]) {
    if (!optionsMap.has(opt.meeting_id)) optionsMap.set(opt.meeting_id, []);
    const optionVotes = allVotes.filter(v => v.option_id === opt.id);
    const totalWeight = optionVotes.reduce((sum, v) => sum + (v.vote_weight || 0), 0);
    optionsMap.get(opt.meeting_id)!.push({
      ...opt, votes: optionVotes.map(v => v.user_id), voteWeight: totalWeight, voteCount: optionVotes.length
    });
  }

  const agendaVotesMap = new Map<string, Map<string, { for: string[], against: string[], abstain: string[] }>>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!agendaVotesMap.has(vote.meeting_id)) agendaVotesMap.set(vote.meeting_id, new Map());
    const meetingVotes = agendaVotesMap.get(vote.meeting_id)!;
    if (!meetingVotes.has(vote.agenda_item_id)) meetingVotes.set(vote.agenda_item_id, { for: [], against: [], abstain: [] });
    const itemVotes = meetingVotes.get(vote.agenda_item_id)!;
    if (vote.choice in itemVotes) itemVotes[vote.choice as 'for' | 'against' | 'abstain'].push(vote.voter_id);
  }

  const agendaMap = new Map<string, any[]>();
  for (const item of allAgenda.results as any[]) {
    if (!agendaMap.has(item.meeting_id)) agendaMap.set(item.meeting_id, []);
    const meetingVotes = agendaVotesMap.get(item.meeting_id);
    const itemVotes = meetingVotes?.get(item.id) || { for: [], against: [], abstain: [] };
    agendaMap.get(item.meeting_id)!.push({
      ...item, votes_for_area: itemVotes.for.length, votes_against_area: itemVotes.against.length, votes_abstain_area: itemVotes.abstain.length,
    });
  }

  const participationMap = new Map<string, number>();
  for (const p of allParticipation.results as any[]) participationMap.set(p.meeting_id, p.count);

  const participatedVotersResult = await env.DB.prepare(
    `SELECT DISTINCT meeting_id, user_id FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`
  ).bind(...meetingIds).all();

  const participatedVotersMap = new Map<string, string[]>();
  for (const p of participatedVotersResult.results as any[]) {
    if (!participatedVotersMap.has(p.meeting_id)) participatedVotersMap.set(p.meeting_id, []);
    participatedVotersMap.get(p.meeting_id)!.push(p.user_id);
  }

  const votedAreaMap = new Map<string, number>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!votedAreaMap.has(vote.meeting_id)) votedAreaMap.set(vote.meeting_id, 0);
    const voterKey = `__voter_${vote.meeting_id}:${vote.voter_id}`;
    if (!votedAreaMap.has(voterKey)) {
      votedAreaMap.set(voterKey, 1);
      votedAreaMap.set(vote.meeting_id, (votedAreaMap.get(vote.meeting_id) || 0) + (Number(vote.vote_weight) || 0));
    }
  }

  const meetingsWithDetails = results.map((m: any) => {
    const totalArea = Number(m.total_area) || 0;
    const votedArea = votedAreaMap.get(m.id) || 0;
    const realTimePercent = totalArea > 0 ? Math.min((votedArea / totalArea) * 100, 100) : 0;
    return {
      ...m,
      materials: m.materials ? JSON.parse(m.materials) : [],
      scheduleOptions: optionsMap.get(m.id) || [],
      agendaItems: agendaMap.get(m.id) || [],
      participated_count: participationMap.get(m.id) || 0,
      participated_voters: participatedVotersMap.get(m.id) || [],
      participation_percent: realTimePercent,
      quorum_reached: realTimePercent >= (Number(m.quorum_percent) || 50),
    };
  });

  setCache(cacheKey, meetingsWithDetails, 10000);
  return json({ meetings: meetingsWithDetails });
});

} // end registerMeetingListRoutes
