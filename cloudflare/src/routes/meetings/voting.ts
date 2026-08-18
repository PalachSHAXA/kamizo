// Agenda voting: POST vote, GET user votes, GET stats

import {
  route, getUser, getTenantId, requireFeature,
  json, error, bilingualError, generateId, generateVoteHash
} from './helpers';
import { hasMeetingTenantContext, isMeetingVoterRole, readMeetingVoteBody } from './security';

export function registerVotingRoutes() {

// Agenda voting
route('POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  if (!hasMeetingTenantContext(tenantId)) return error('Forbidden', 403);
  const body = await readMeetingVoteBody(request);
  if (!body) return error('Invalid vote body', 400);
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  if (!isMeetingVoterRole(authUser.role)) return error('Forbidden', 403);
  const { choice } = body;

  const meeting = await env.DB.prepare('SELECT status, require_otp, building_id, allow_revote FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first() as any;
  if (!meeting) return error('Meeting not found', 404);
  if (meeting.status !== 'voting_open') return error('Voting is not open', 400);

  const agendaItem = await env.DB.prepare('SELECT id FROM meeting_agenda_items WHERE id = ? AND meeting_id = ? AND tenant_id = ?').bind(params.agendaItemId, params.meetingId, tenantId).first();
  if (!agendaItem) return error('Agenda item not found', 404);

  const eligibleVoter = await env.DB.prepare(`SELECT ev.*, u.apartment, u.total_area FROM meeting_eligible_voters ev JOIN users u ON u.id = ev.user_id WHERE ev.meeting_id = ? AND ev.user_id = ? AND ev.tenant_id = ? AND u.tenant_id = ?`).bind(params.meetingId, authUser.id, tenantId, tenantId).first() as any;

  // Sprint 61 P0: voting fraud guard. Was reading `body.ownership_share`
  // as vote weight, letting any resident post `ownership_share: 99999` and
  // dominate the building's vote. ALWAYS read total_area from users table
  // server-side. Body values for area/apartment are now ignored.
  let apartmentArea: number | null = null;
  let apartmentNumber: string | null = null;

  if (!eligibleVoter) {
    const userBuilding = await env.DB.prepare('SELECT apartment, total_area FROM users WHERE id = ? AND building_id = ? AND role = ? AND tenant_id = ?').bind(authUser.id, meeting.building_id, authUser.role, tenantId).first() as any;
    if (!userBuilding) return error('You are not eligible to vote in this meeting', 403);
    apartmentArea = Number(userBuilding.total_area) || null;
    apartmentNumber = userBuilding.apartment || null;
  } else {
    apartmentArea = Number(eligibleVoter.total_area) || null;
    apartmentNumber = eligibleVoter.apartment || null;
  }

  if (!apartmentArea || apartmentArea <= 0) {
    return bilingualError(
      'Площадь квартиры не указана. Обратитесь к администратору для обновления данных.',
      "Xonadon maydoni ko'rsatilmagan. Ma'lumotlarni yangilash uchun administratorga murojaat qiling.",
      400,
    );
  }

  const existingVote = await env.DB.prepare('SELECT id, choice FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ? AND voter_id = ? AND is_revote = 0 AND tenant_id = ?').bind(params.meetingId, params.agendaItemId, authUser.id, tenantId).first() as any;

  const voteHash = generateVoteHash({ meetingId: params.meetingId, agendaItemId: params.agendaItemId, voterId: authUser.id, choice, votedAt: new Date().toISOString() });

  let voteMutation;
  if (existingVote) {
    if (!meeting.allow_revote) return error('Revoting is not allowed for this meeting', 400);
    voteMutation = env.DB.prepare(`UPDATE meeting_vote_records SET choice = ?, vote = ?, vote_hash = ?, voted_at = datetime('now'), vote_weight = ?, verification_method = ?, otp_verified = ? WHERE id = ? AND tenant_id = ? AND choice = ? AND EXISTS (SELECT 1 FROM meetings m WHERE m.id = ? AND m.tenant_id = ? AND m.status = 'voting_open')`)
      .bind(choice, choice, voteHash, apartmentArea, 'login', 0, existingVote.id, tenantId, existingVote.choice, params.meetingId, tenantId);
  } else {
    const id = generateId();
    voteMutation = env.DB.prepare(`
      INSERT INTO meeting_vote_records (id, meeting_id, agenda_item_id, user_id, vote, voter_id, voter_name, apartment_id, apartment_number, ownership_share, vote_weight, choice, verification_method, otp_verified, vote_hash, tenant_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (SELECT 1 FROM meetings m WHERE m.id = ? AND m.tenant_id = ? AND m.status = 'voting_open')
        AND NOT EXISTS (SELECT 1 FROM meeting_vote_records vr WHERE vr.meeting_id = ? AND vr.agenda_item_id = ? AND vr.voter_id = ? AND vr.is_revote = 0 AND vr.tenant_id = ?)
    `).bind(id, params.meetingId, params.agendaItemId, authUser.id, choice, authUser.id, authUser.name, eligibleVoter?.apartment_id || null, apartmentNumber, apartmentArea, apartmentArea, choice, 'login', 0, voteHash, tenantId, params.meetingId, tenantId, params.meetingId, params.agendaItemId, authUser.id, tenantId);
  }

  const comment = body.comment;
  const counterProposal = choice === 'against' ? (body.counterProposal || null) : null;
  const commentType = choice === 'against' ? 'objection' : 'comment';

  const participationMutation = env.DB.prepare(`
    INSERT OR IGNORE INTO meeting_participated_voters (meeting_id, user_id, tenant_id)
    SELECT ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM meeting_vote_records vr
      WHERE vr.meeting_id = ? AND vr.agenda_item_id = ? AND vr.voter_id = ?
        AND vr.vote_hash = ? AND vr.tenant_id = ? AND vr.is_revote = 0
    )
  `).bind(params.meetingId, authUser.id, tenantId, params.meetingId, params.agendaItemId, authUser.id, voteHash, tenantId);
  const statements = [voteMutation, participationMutation];

  // Side writes prove this transaction's exact vote won before mutating.
  if ((comment && comment.length > 0) || (counterProposal && counterProposal.length > 0)) {
    const commentId = generateId();
    statements.push(env.DB.prepare(`
      INSERT INTO meeting_agenda_comments (id, agenda_item_id, meeting_id, resident_id, resident_name, apartment_number, content, comment_type, counter_proposal, include_in_protocol, tenant_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ? WHERE EXISTS (
        SELECT 1 FROM meeting_vote_records vr
        WHERE vr.meeting_id = ? AND vr.agenda_item_id = ? AND vr.voter_id = ?
          AND vr.vote_hash = ? AND vr.tenant_id = ? AND vr.is_revote = 0
      )
    `).bind(commentId, params.agendaItemId, params.meetingId, authUser.id, authUser.name, apartmentNumber, comment || 'Голосовал(а) ПРОТИВ', commentType, counterProposal, tenantId, params.meetingId, params.agendaItemId, authUser.id, voteHash, tenantId));
  }

  if (existingVote && existingVote.choice !== choice) {
    statements.push(env.DB.prepare(`
      UPDATE meeting_vote_reconsideration_requests
      SET status = 'vote_changed', responded_at = datetime('now'), new_vote = ?
      WHERE meeting_id = ? AND agenda_item_id = ? AND resident_id = ? AND status IN ('pending', 'viewed')
        AND EXISTS (SELECT 1 FROM meetings m WHERE m.id = meeting_vote_reconsideration_requests.meeting_id AND m.tenant_id = ?)
        AND EXISTS (
          SELECT 1 FROM meeting_vote_records vr
          WHERE vr.meeting_id = meeting_vote_reconsideration_requests.meeting_id
            AND vr.agenda_item_id = meeting_vote_reconsideration_requests.agenda_item_id
            AND vr.voter_id = meeting_vote_reconsideration_requests.resident_id
            AND vr.vote_hash = ? AND vr.tenant_id = ? AND vr.is_revote = 0
        )
    `).bind(choice, params.meetingId, params.agendaItemId, authUser.id, tenantId, voteHash, tenantId));
  }

  try {
    const [voteResult] = await env.DB.batch(statements);
    if (!voteResult.meta?.changes) return error('Vote changed concurrently', 409);
  } catch (err) {
    if (err instanceof Error && /constraint failed:\s*meeting_vote_records\b/i.test(err.message)) {
      return error('Vote changed concurrently', 409);
    }
    return error('Vote failed', 500);
  }

  return json({ success: true, voteHash, voteWeight: apartmentArea });
});

// Get user's votes for meeting
route('GET', '/api/meetings/:meetingId/votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  if (!hasMeetingTenantContext(tenantId)) return error('Forbidden', 403);
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
  if (!m) return error('Meeting not found', 404);

  const { results } = await env.DB.prepare('SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND voter_id = ? AND tenant_id = ?').bind(params.meetingId, authUser.id, tenantId).all();
  return json({ votes: results });
});

// Real-time voting stats
route('GET', '/api/meetings/:meetingId/stats', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  if (!hasMeetingTenantContext(tenantId)) return error('Forbidden', 403);
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const meeting = await env.DB.prepare('SELECT id, status, total_area, quorum_percent, voted_area, participation_percent, quorum_reached FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  const [votedAreaResult, participantCount, agendaStats] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(weight), 0) as voted_area FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND tenant_id = ? AND is_revote = 0 GROUP BY voter_id)`).bind(params.meetingId, tenantId).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT voter_id) as count FROM meeting_vote_records WHERE meeting_id = ? AND tenant_id = ?`).bind(params.meetingId, tenantId).first(),
    env.DB.prepare(`
      SELECT ai.id, ai.title, ai.threshold,
        COALESCE(SUM(CASE WHEN vr.choice = 'for' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_for,
        COALESCE(SUM(CASE WHEN vr.choice = 'against' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_against,
        COALESCE(SUM(CASE WHEN vr.choice = 'abstain' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_abstain,
        COUNT(DISTINCT CASE WHEN vr.is_revote = 0 THEN vr.voter_id END) as voter_count
      FROM meeting_agenda_items ai LEFT JOIN meeting_vote_records vr ON vr.agenda_item_id = ai.id AND vr.tenant_id = ?
      WHERE ai.meeting_id = ? AND ai.tenant_id = ? GROUP BY ai.id ORDER BY ai.item_order
    `).bind(tenantId, params.meetingId, tenantId).all()
  ]) as any[];

  const votedArea = (votedAreaResult as any)?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;

  return json({
    meetingId: params.meetingId, status: meeting.status, totalArea, votedArea,
    participationPercent: Math.round(participationPercent * 100) / 100,
    quorumPercent: meeting.quorum_percent || 50,
    quorumReached: participationPercent >= (meeting.quorum_percent || 50),
    participantCount: (participantCount as any)?.count || 0,
    agendaItems: (agendaStats.results || []).map((item: any) => ({
      id: item.id, title: item.title, threshold: item.threshold,
      votesFor: item.votes_for || 0, votesAgainst: item.votes_against || 0, votesAbstain: item.votes_abstain || 0,
      voterCount: item.voter_count || 0, totalVoted: (item.votes_for || 0) + (item.votes_against || 0) + (item.votes_abstain || 0)
    })),
    timestamp: new Date().toISOString()
  });
});

} // end registerVotingRoutes
