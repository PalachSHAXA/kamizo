// GET /api/meetings/:id — get meeting with full details

import {
  route, getUser, getTenantId, requireFeature,
  json, error
} from './helpers';

export function registerMeetingDetailRoutes() {

route('GET', '/api/meetings/:id', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) return error('Meeting not found', 404);

  const [scheduleOptions, agendaItems, eligibleVoters, participatedVoters, allScheduleVotes, allAgendaVotes, protocol] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meeting_schedule_options WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order`).bind(params.id).all(),
    env.DB.prepare(`SELECT user_id, apartment_id, ownership_share FROM meeting_eligible_voters WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT DISTINCT user_id, MIN(first_vote_at) as first_vote_at FROM meeting_participated_voters WHERE meeting_id = ? GROUP BY user_id`).bind(params.id).all(),
    env.DB.prepare(`SELECT option_id, user_id, voter_name, vote_weight FROM meeting_schedule_votes WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT agenda_item_id, choice, voter_id, vote_weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0`).bind(params.id).all(),
    meeting.protocol_id ? env.DB.prepare(`SELECT * FROM meeting_protocols WHERE id = ?`).bind(meeting.protocol_id).first() : null
  ]);

  const votesByOption = new Map<string, { voters: string[], totalWeight: number }>();
  for (const vote of allScheduleVotes.results as any[]) {
    if (!votesByOption.has(vote.option_id)) votesByOption.set(vote.option_id, { voters: [], totalWeight: 0 });
    const optVotes = votesByOption.get(vote.option_id)!;
    optVotes.voters.push(vote.user_id);
    optVotes.totalWeight += (vote.vote_weight || 0);
  }

  const votesByAgenda = new Map<string, {
    for: { voters: string[], weight: number },
    against: { voters: string[], weight: number },
    abstain: { voters: string[], weight: number }
  }>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!votesByAgenda.has(vote.agenda_item_id)) {
      votesByAgenda.set(vote.agenda_item_id, {
        for: { voters: [], weight: 0 }, against: { voters: [], weight: 0 }, abstain: { voters: [], weight: 0 }
      });
    }
    const agendaVotes = votesByAgenda.get(vote.agenda_item_id)!;
    const choice = vote.choice as 'for' | 'against' | 'abstain';
    if (choice in agendaVotes) {
      agendaVotes[choice].voters.push(vote.voter_id);
      agendaVotes[choice].weight += (vote.vote_weight || 0);
    }
  }

  const totalVotedWeight = Array.from(votesByAgenda.values()).reduce((max, v) => {
    const itemTotal = v.for.weight + v.against.weight + v.abstain.weight;
    return Math.max(max, itemTotal);
  }, 0);

  const optionsWithVotes = scheduleOptions.results.map((opt: any) => {
    const votes = votesByOption.get(opt.id) || { voters: [], totalWeight: 0 };
    return { ...opt, votes: votes.voters, voteWeight: votes.totalWeight, voteCount: votes.voters.length };
  });

  const agendaWithVotes = agendaItems.results.map((item: any) => {
    const votes = votesByAgenda.get(item.id) || {
      for: { voters: [], weight: 0 }, against: { voters: [], weight: 0 }, abstain: { voters: [], weight: 0 }
    };
    const totalItemWeight = votes.for.weight + votes.against.weight + votes.abstain.weight;
    return {
      ...item,
      attachments: item.attachments ? (() => { try { return JSON.parse(item.attachments); } catch { return []; } })() : [],
      votesFor: votes.for.weight, votesAgainst: votes.against.weight, votesAbstain: votes.abstain.weight,
      votesForCount: votes.for.voters.length, votesAgainstCount: votes.against.voters.length, votesAbstainCount: votes.abstain.voters.length,
      totalVotedWeight: totalItemWeight,
      votersFor: votes.for.voters, votersAgainst: votes.against.voters, votersAbstain: votes.abstain.voters
    };
  });

  const participationPercent = meeting.total_area > 0 ? (totalVotedWeight / meeting.total_area) * 100 : 0;
  const quorumReached = participationPercent >= (meeting.quorum_percent || 50);

  return json({
    meeting: {
      ...meeting,
      materials: meeting.materials ? JSON.parse(meeting.materials) : [],
      scheduleOptions: optionsWithVotes,
      agendaItems: agendaWithVotes,
      eligibleVoters: eligibleVoters.results.map((v: any) => v.user_id),
      participatedVoters: participatedVoters.results.map((v: any) => v.user_id),
      votedArea: totalVotedWeight,
      participationPercent,
      quorumReached,
      protocol
    }
  });
});

} // end registerMeetingDetailRoutes
