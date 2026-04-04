// Agenda voting: POST vote, GET user votes, GET stats

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, generateId, generateVoteHash
} from './helpers';

export function registerVotingRoutes() {

// Agenda voting
route('POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  const meeting = await env.DB.prepare(`SELECT status, require_otp, building_id, allow_revote FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting || meeting.status !== 'voting_open') return error('Voting is not open', 400);

  const eligibleVoter = await env.DB.prepare(`SELECT ev.*, u.apartment, u.total_area FROM meeting_eligible_voters ev JOIN users u ON u.id = ev.user_id WHERE ev.meeting_id = ? AND ev.user_id = ?`).bind(params.meetingId, authUser.id).first() as any;

  let apartmentArea = body.ownership_share || body.ownershipShare || null;
  let apartmentNumber = body.apartment_number || body.apartmentNumber || null;

  if (!eligibleVoter) {
    const userBuilding = await env.DB.prepare('SELECT apartment, total_area FROM users WHERE id = ? AND building_id = ? AND role = ?').bind(authUser.id, meeting.building_id, 'resident').first() as any;
    if (!userBuilding) return error('You are not eligible to vote in this meeting', 403);
    apartmentArea = apartmentArea || userBuilding.total_area;
    if (!apartmentArea || apartmentArea <= 0) return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    apartmentNumber = apartmentNumber || userBuilding.apartment;
  } else {
    apartmentArea = apartmentArea || eligibleVoter.total_area;
    if (!apartmentArea || apartmentArea <= 0) return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    apartmentNumber = apartmentNumber || eligibleVoter.apartment;
  }

  const existingVote = await env.DB.prepare('SELECT id, choice FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ? AND voter_id = ? AND is_revote = 0').bind(params.meetingId, params.agendaItemId, authUser.id).first() as any;

  const voteHash = generateVoteHash({ meetingId: params.meetingId, agendaItemId: params.agendaItemId, voterId: authUser.id, choice: body.choice, votedAt: new Date().toISOString() });

  if (existingVote) {
    if (!meeting.allow_revote) return error('Revoting is not allowed for this meeting', 400);
    await env.DB.prepare(`UPDATE meeting_vote_records SET choice = ?, vote = ?, vote_hash = ?, voted_at = datetime('now'), vote_weight = ?, verification_method = ?, otp_verified = ? WHERE id = ?`)
      .bind(body.choice, body.choice, voteHash, apartmentArea, body.verification_method || body.verificationMethod || 'login', body.otp_verified || body.otpVerified ? 1 : 0, existingVote.id).run();
  } else {
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_vote_records (id, meeting_id, agenda_item_id, user_id, vote, voter_id, voter_name, apartment_id, apartment_number, ownership_share, vote_weight, choice, verification_method, otp_verified, vote_hash, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, params.meetingId, params.agendaItemId, authUser.id, body.choice, authUser.id, authUser.name, body.apartment_id || body.apartmentId || null, apartmentNumber, apartmentArea, apartmentArea, body.choice, body.verification_method || body.verificationMethod || 'login', body.otp_verified || body.otpVerified ? 1 : 0, voteHash, getTenantId(request)).run();

    const alreadyParticipated = await env.DB.prepare(`SELECT 1 FROM meeting_participated_voters WHERE meeting_id = ? AND user_id = ? LIMIT 1`).bind(params.meetingId, authUser.id).first();
    if (!alreadyParticipated) {
      await env.DB.prepare(`INSERT INTO meeting_participated_voters (meeting_id, user_id, tenant_id) VALUES (?, ?, ?)`).bind(params.meetingId, authUser.id, getTenantId(request)).run();
    }
  }

  // Save comment/objection if provided
  const comment = body.comment?.trim();
  const counterProposal = body.counter_proposal?.trim() || null;
  const commentType = body.comment_type || (body.choice === 'against' ? 'objection' : 'comment');
  if ((comment && comment.length > 0) || (counterProposal && counterProposal.length > 0)) {
    const commentId = generateId();
    const voterData = eligibleVoter || await env.DB.prepare('SELECT apartment FROM users WHERE id = ?').bind(authUser.id).first() as any;
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_comments (id, agenda_item_id, meeting_id, resident_id, resident_name, apartment_number, content, comment_type, counter_proposal, include_in_protocol, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(commentId, params.agendaItemId, params.meetingId, authUser.id, authUser.name, apartmentNumber || voterData?.apartment || null, comment || 'Голосовал(а) ПРОТИВ', commentType, counterProposal, getTenantId(request)).run();
  }

  // Update reconsideration requests if vote changed
  if (existingVote && existingVote.choice !== body.choice) {
    await env.DB.prepare(`UPDATE meeting_vote_reconsideration_requests SET status = 'vote_changed', responded_at = datetime('now'), new_vote = ? WHERE meeting_id = ? AND agenda_item_id = ? AND resident_id = ? AND status IN ('pending', 'viewed')`)
      .bind(body.choice, params.meetingId, params.agendaItemId, authUser.id).run();
  }

  return json({ success: true, voteHash, voteWeight: apartmentArea });
});

// Get user's votes for meeting
route('GET', '/api/meetings/:meetingId/votes/me', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const { results } = await env.DB.prepare('SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND voter_id = ?').bind(params.meetingId, authUser.id).all();
  return json({ votes: results });
});

// Real-time voting stats
route('GET', '/api/meetings/:meetingId/stats', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT id, status, total_area, quorum_percent, voted_area, participation_percent, quorum_reached FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  const [votedAreaResult, participantCount, agendaStats] = await Promise.all([
    env.DB.prepare(`SELECT COALESCE(SUM(weight), 0) as voted_area FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id)`).bind(params.meetingId).first(),
    env.DB.prepare(`SELECT COUNT(DISTINCT voter_id) as count FROM meeting_vote_records WHERE meeting_id = ?`).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT ai.id, ai.title, ai.threshold,
        COALESCE(SUM(CASE WHEN vr.choice = 'for' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_for,
        COALESCE(SUM(CASE WHEN vr.choice = 'against' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_against,
        COALESCE(SUM(CASE WHEN vr.choice = 'abstain' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_abstain,
        COUNT(DISTINCT CASE WHEN vr.is_revote = 0 THEN vr.voter_id END) as voter_count
      FROM meeting_agenda_items ai LEFT JOIN meeting_vote_records vr ON vr.agenda_item_id = ai.id
      WHERE ai.meeting_id = ? GROUP BY ai.id ORDER BY ai.item_order
    `).bind(params.meetingId).all()
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
