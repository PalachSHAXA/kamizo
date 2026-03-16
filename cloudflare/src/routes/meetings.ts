// Meetings routes — extracted from index.ts
// Contains all meeting routes (CRUD, workflow transitions, voting, protocols, OTP, reconsideration, agenda comments)

import type { Env, User } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { getCurrentCorsOrigin } from '../middleware/cors';
import { getCached, setCache, invalidateCache } from '../middleware/cache-local';
import { json, error, generateId, isManagement } from '../utils/helpers';
import { sendPushNotification } from '../index';

// Helper: Fetch meeting with agenda items and schedule options
export async function getMeetingWithDetails(env: Env, meetingId: string, tenantId?: string | null): Promise<any> {
  const meeting = await env.DB.prepare(
    `SELECT * FROM meetings WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return null;

  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY order_index ASC'
  ).bind(meetingId).all();

  // Fetch vote results for each agenda item
  for (const item of (agendaItems || []) as any[]) {
    const { results: votes } = await env.DB.prepare(
      'SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ?'
    ).bind(meetingId, item.id).all();
    item.votes = votes || [];

    // Parse attachments JSON if present
    if (item.attachments && typeof item.attachments === 'string') {
      try { item.attachments = JSON.parse(item.attachments); } catch { item.attachments = []; }
    }
  }

  const { results: scheduleOptions } = await env.DB.prepare(
    'SELECT * FROM meeting_schedule_options WHERE meeting_id = ? ORDER BY proposed_date ASC'
  ).bind(meetingId).all();

  meeting.agenda_items = agendaItems || [];
  meeting.schedule_options = scheduleOptions || [];

  return meeting;
}

// Helper: Generate vote hash
export const generateVoteHash = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
};

// Helper: Generate OTP code
export const generateOTPCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export function registerMeetingRoutes() {

// Meetings: List (with caching for performance)
route('GET', '/api/meetings', async (request, env) => {
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

  if (tenantId) {
    query += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  if (buildingId) {
    query += ' AND building_id = ?';
    params.push(buildingId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (organizerId) {
    query += ' AND organizer_id = ?';
    params.push(organizerId);
  }

  if (onlyActive) {
    query += ` AND status IN ('draft', 'pending_moderation', 'schedule_poll_open', 'schedule_confirmed', 'voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved')`;
  }

  const limit = onlyActive ? 20 : 50;
  query += ` ORDER BY created_at DESC LIMIT ${limit}`;

  const { results } = await env.DB.prepare(query).bind(...params).all();

  const meetingIds = results.map((m: any) => m.id);

  if (meetingIds.length === 0) {
    return json({ meetings: [] });
  }

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
      ...opt,
      votes: optionVotes.map(v => v.user_id),
      voteWeight: totalWeight,
      voteCount: optionVotes.length
    });
  }

  const agendaVotesMap = new Map<string, Map<string, { for: string[], against: string[], abstain: string[] }>>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!agendaVotesMap.has(vote.meeting_id)) {
      agendaVotesMap.set(vote.meeting_id, new Map());
    }
    const meetingVotes = agendaVotesMap.get(vote.meeting_id)!;
    if (!meetingVotes.has(vote.agenda_item_id)) {
      meetingVotes.set(vote.agenda_item_id, { for: [], against: [], abstain: [] });
    }
    const itemVotes = meetingVotes.get(vote.agenda_item_id)!;
    if (vote.choice in itemVotes) {
      itemVotes[vote.choice as 'for' | 'against' | 'abstain'].push(vote.voter_id);
    }
  }

  const agendaMap = new Map<string, any[]>();
  for (const item of allAgenda.results as any[]) {
    if (!agendaMap.has(item.meeting_id)) agendaMap.set(item.meeting_id, []);
    const meetingVotes = agendaVotesMap.get(item.meeting_id);
    const itemVotes = meetingVotes?.get(item.id) || { for: [], against: [], abstain: [] };
    agendaMap.get(item.meeting_id)!.push({
      ...item,
      votes_for_area: itemVotes.for.length,
      votes_against_area: itemVotes.against.length,
      votes_abstain_area: itemVotes.abstain.length,
    });
  }

  const participationMap = new Map<string, number>();
  for (const p of allParticipation.results as any[]) {
    participationMap.set(p.meeting_id, p.count);
  }

  const participatedVotersResult = await env.DB.prepare(
    `SELECT DISTINCT meeting_id, user_id FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`
  ).bind(...meetingIds).all();

  const participatedVotersMap = new Map<string, string[]>();
  for (const p of participatedVotersResult.results as any[]) {
    if (!participatedVotersMap.has(p.meeting_id)) {
      participatedVotersMap.set(p.meeting_id, []);
    }
    participatedVotersMap.get(p.meeting_id)!.push(p.user_id);
  }

  const votedAreaMap = new Map<string, number>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!votedAreaMap.has(vote.meeting_id)) {
      votedAreaMap.set(vote.meeting_id, 0);
    }
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

// Meetings: Get by ID with full details
route('GET', '/api/meetings/:id', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const [scheduleOptions, agendaItems, eligibleVoters, participatedVoters, allScheduleVotes, allAgendaVotes, protocol] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meeting_schedule_options WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order`).bind(params.id).all(),
    env.DB.prepare(`SELECT user_id, apartment_id, ownership_share FROM meeting_eligible_voters WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT DISTINCT user_id, MIN(first_vote_at) as first_vote_at FROM meeting_participated_voters WHERE meeting_id = ? GROUP BY user_id`).bind(params.id).all(),
    env.DB.prepare(`
      SELECT option_id, user_id, voter_name, vote_weight
      FROM meeting_schedule_votes
      WHERE meeting_id = ?
    `).bind(params.id).all(),
    env.DB.prepare(`
      SELECT agenda_item_id, choice, voter_id, vote_weight
      FROM meeting_vote_records
      WHERE meeting_id = ? AND is_revote = 0
    `).bind(params.id).all(),
    meeting.protocol_id ? env.DB.prepare(`SELECT * FROM meeting_protocols WHERE id = ?`).bind(meeting.protocol_id).first() : null
  ]);

  const votesByOption = new Map<string, { voters: string[], totalWeight: number }>();
  for (const vote of allScheduleVotes.results as any[]) {
    if (!votesByOption.has(vote.option_id)) {
      votesByOption.set(vote.option_id, { voters: [], totalWeight: 0 });
    }
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
        for: { voters: [], weight: 0 },
        against: { voters: [], weight: 0 },
        abstain: { voters: [], weight: 0 }
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
    return {
      ...opt,
      votes: votes.voters,
      voteWeight: votes.totalWeight,
      voteCount: votes.voters.length
    };
  });

  const agendaWithVotes = agendaItems.results.map((item: any) => {
    const votes = votesByAgenda.get(item.id) || {
      for: { voters: [], weight: 0 },
      against: { voters: [], weight: 0 },
      abstain: { voters: [], weight: 0 }
    };
    const totalItemWeight = votes.for.weight + votes.against.weight + votes.abstain.weight;
    return {
      ...item,
      attachments: item.attachments ? (() => { try { return JSON.parse(item.attachments); } catch { return []; } })() : [],
      votesFor: votes.for.weight,
      votesAgainst: votes.against.weight,
      votesAbstain: votes.abstain.weight,
      votesForCount: votes.for.voters.length,
      votesAgainstCount: votes.against.voters.length,
      votesAbstainCount: votes.abstain.voters.length,
      totalVotedWeight: totalItemWeight,
      votersFor: votes.for.voters,
      votersAgainst: votes.against.voters,
      votersAbstain: votes.abstain.voters
    };
  });

  const participationPercent = meeting.total_area > 0
    ? (totalVotedWeight / meeting.total_area) * 100
    : 0;
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

// Meetings: Create
route('POST', '/api/meetings', async (request, env) => {
  console.log('[Meeting] POST /api/meetings called');
  try {
    const authUser = await getUser(request, env);
    console.log('[Meeting] Auth user:', authUser?.id, authUser?.name);
    if (!authUser) {
      return error('Unauthorized', 401);
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e: any) {
      console.error('[Meeting] JSON parse error:', e);
      return error('Invalid JSON body: ' + e.message, 400);
    }

    console.log('[Meeting] Request body keys:', Object.keys(body || {}));

    const id = generateId();

    const buildingId = body.building_id || body.buildingId;
    if (!buildingId) {
      return error('building_id is required', 400);
    }

    console.log('[Meeting] Building ID:', buildingId);

    const tenantId = getTenantId(request);
    const settings = await env.DB.prepare(
      'SELECT * FROM meeting_building_settings WHERE building_id = ?'
    ).bind(buildingId).first() as any;

    console.log('[Meeting] Settings:', JSON.stringify(settings));

    const votingUnit = settings?.voting_unit || 'apartment';
    const quorumPercent = settings?.default_quorum_percent || 50;
    const requireModeration = settings?.require_moderation !== 0;

  const areaResult = await env.DB.prepare(`
    SELECT COALESCE(SUM(total_area), 0) as total_area, COUNT(*) as total_count
    FROM users
    WHERE building_id = ? AND role = 'resident' AND total_area > 0 ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;

  const totalArea = areaResult?.total_area || 0;
  const totalEligibleCount = areaResult?.total_count || 0;

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM meetings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;
  const meetingNumber = (countResult?.count || 0) + 1;

  const organizerType = body.organizer_type || body.organizerType || 'uk';
  let initialStatus = 'schedule_poll_open';
  if (organizerType === 'resident' && requireModeration) {
    initialStatus = 'pending_moderation';
  }

  const pollDays = settings?.schedule_poll_duration_days || 3;
  const pollEndDate = new Date();
  pollEndDate.setDate(pollEndDate.getDate() + pollDays);
  pollEndDate.setHours(23, 59, 59, 999);

  const schedulePollOpenedAt = initialStatus === 'schedule_poll_open' ? new Date().toISOString() : null;

  try {
    await env.DB.prepare(`
      INSERT INTO meetings (
        id, number, building_id, building_address, description,
        organizer_type, organizer_id, organizer_name,
        format, status,
        schedule_poll_ends_at, schedule_poll_opened_at,
        location,
        voting_unit, quorum_percent, allow_revote, require_otp, show_intermediate_results,
        materials,
        total_area, total_eligible_count, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      meetingNumber,
      buildingId,
      body.building_address || body.buildingAddress || '',
      body.description || null,
      organizerType,
      authUser.id,
      authUser.name,
      body.format || 'offline',
      initialStatus,
      pollEndDate.toISOString(),
      schedulePollOpenedAt,
      body.location || null,
      votingUnit,
      quorumPercent,
      1, // allow_revote
      1, // require_otp
      0, // show_intermediate_results
      JSON.stringify(body.materials || []),
      totalArea,
      totalEligibleCount,
      getTenantId(request)
    ).run();
  } catch (e: any) {
    console.error('[Meeting] Error inserting meeting:', e);
    return error('Failed to create meeting: ' + e.message, 500);
  }

  const meetingTime = body.meeting_time || body.meetingTime || settings?.default_meeting_time || '19:00';
  const defaultTime = meetingTime;
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 10);

  try {
    for (let i = 0; i < 3; i++) {
      const optionDate = new Date(baseDate);
      optionDate.setDate(optionDate.getDate() + i);

      const year = optionDate.getFullYear();
      const month = String(optionDate.getMonth() + 1).padStart(2, '0');
      const day = String(optionDate.getDate()).padStart(2, '0');
      const dateTimeStr = `${year}-${month}-${day}T${defaultTime}:00`;

      const optId = generateId();
      await env.DB.prepare(`
        INSERT INTO meeting_schedule_options (id, meeting_id, date_time, tenant_id)
        VALUES (?, ?, ?, ?)
      `).bind(optId, id, dateTimeStr, getTenantId(request)).run();
    }
  } catch (e: any) {
    console.error('[Meeting] Error inserting schedule options:', e);
    return error('Failed to create schedule options: ' + e.message, 500);
  }

  const agendaItems = body.agenda_items || body.agendaItems || [];
  try {
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i];
      const itemId = generateId();
      const attachmentsJson = item.attachments
        ? (typeof item.attachments === 'string' ? item.attachments : JSON.stringify(item.attachments))
        : null;
      await env.DB.prepare(`
        INSERT INTO meeting_agenda_items (id, meeting_id, item_order, title, description, description_extended, attachments, threshold, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId,
        id,
        i + 1,
        item.title,
        item.description || null,
        item.description_extended || item.descriptionExtended || null,
        attachmentsJson,
        item.threshold || 'simple_majority',
        getTenantId(request)
      ).run();
    }
  } catch (e: any) {
    console.error('[Meeting] Error inserting agenda items:', e);
    return error('Failed to create agenda items: ' + e.message, 500);
  }

  invalidateCache('meetings:');

  const created = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (body.building_id && body.status === 'schedule_poll_open') {
    try {
      const { results: residents } = await env.DB.prepare(
        'SELECT id FROM users WHERE role = ? AND building_id = ?'
      ).bind('resident', body.building_id).all();

      for (const resident of residents as any[]) {
        const notifId = generateId();
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
          VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))
        `).bind(
          notifId,
          resident.id,
          '📢 Новое собрание объявлено',
          `Назначено собрание жильцов дома ${body.building_address || ''}. Примите участие в выборе даты!`,
          JSON.stringify({ meetingId: id, url: '/meetings' })
        ).run();

        await sendPushNotification(env, resident.id, {
          title: '📢 Новое собрание объявлено',
          body: `Назначено собрание жильцов дома ${body.building_address || ''}. Примите участие в выборе даты!`,
          type: 'meeting',
          tag: `meeting-announced-${id}`,
          data: {
            meetingId: id,
            url: '/meetings'
          },
          requireInteraction: true
        }).catch(() => {});
      }

      console.log(`[Meeting] Created meeting ${id}, sent notifications to ${residents.length} residents`);
    } catch (e: any) {
      console.error('[Meeting] Error sending notifications:', e);
    }
  }

  return json({ meeting: created }, 201);
  } catch (e: any) {
    console.error('[Meeting] FATAL ERROR creating meeting:', e);
    return error('Meeting creation failed: ' + (e.message || String(e)), 500);
  }
});

// Meetings: Update
route('PATCH', '/api/meetings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'status', db: 'status' },
    { api: 'location', db: 'location' },
    { api: 'format', db: 'format' },
    { api: 'confirmedDateTime', db: 'confirmed_date_time' },
    { api: 'confirmed_date_time', db: 'confirmed_date_time' },
    { api: 'quorumPercent', db: 'quorum_percent' },
    { api: 'quorum_percent', db: 'quorum_percent' },
    { api: 'totalEligibleCount', db: 'total_eligible_count' },
    { api: 'total_eligible_count', db: 'total_eligible_count' },
    { api: 'participationPercent', db: 'participation_percent' },
    { api: 'participation_percent', db: 'participation_percent' },
    { api: 'cancellationReason', db: 'cancellation_reason' },
    { api: 'cancellation_reason', db: 'cancellation_reason' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      values.push(body[field.api]);
    }
  }

  if (body.materials) {
    updates.push('materials = ?');
    values.push(JSON.stringify(body.materials));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    if (tenantId) values.push(tenantId);

    await env.DB.prepare(`
      UPDATE meetings SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Submit for moderation
route('POST', '/api/meetings/:id/submit', async (request, env, params) => {
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    UPDATE meetings SET status = 'pending_moderation', updated_at = datetime('now')
    WHERE id = ? AND status = 'draft' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Approve
route('POST', '/api/meetings/:id/approve', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_poll_open',
        moderated_at = datetime('now'),
        moderated_by = ?,
        schedule_poll_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(authUser!.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind('resident', meeting.building_id, ...(tenantId ? [tenantId] : [])).all();

    for (const resident of residents as any[]) {
      const notifId = generateId();
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
        VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))
      `).bind(
        notifId,
        resident.id,
        '📢 Новое собрание объявлено',
        `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`,
        JSON.stringify({ meetingId: params.id, url: '/meetings' })
      ).run();

      await sendPushNotification(env, resident.id, {
        title: '📢 Новое собрание объявлено',
        body: `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`,
        type: 'meeting',
        tag: `meeting-announced-${params.id}`,
        data: {
          meetingId: params.id,
          url: '/meetings'
        },
        requireInteraction: true
      });
    }
  }

  return json({ meeting: updated });
});

// Meetings: Reject
route('POST', '/api/meetings/:id/reject', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'cancelled',
        cancelled_at = datetime('now'),
        cancellation_reason = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Rejected by moderator', params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (updated?.building_id) {
    const { results: residents } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(updated.building_id, ...(tenantId ? [tenantId] : [])).all();

    const rejectMeetingBody = `Собрание "${updated.title || ''}" отклонено. Причина: ${body.reason || 'не указана'}`;
    for (const resident of (residents || []) as any[]) {
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), resident.id, '❌ Собрание отклонено', rejectMeetingBody, JSON.stringify({ meeting_id: params.id }), tenantId).run().catch(() => {});
      sendPushNotification(env, resident.id, {
        title: '❌ Собрание отклонено',
        body: rejectMeetingBody,
        type: 'meeting_rejected',
        tag: `meeting-rejected-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Open schedule poll
route('POST', '/api/meetings/:id/open-schedule-poll', async (request, env, params) => {
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_poll_open',
        schedule_poll_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status IN ('draft', 'pending_moderation') ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Confirm schedule
route('POST', '/api/meetings/:id/confirm-schedule', async (request, env, params) => {
  const tenantId = getTenantId(request);
  if (tenantId) {
    const mtg = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.id, tenantId).first();
    if (!mtg) return error('Meeting not found', 404);
  }

  const body = await request.json() as any;
  const selectedOptionId = body.option_id || body.optionId;

  let confirmedDateTime: string;
  let selectedOption: any;

  if (selectedOptionId) {
    const option = await env.DB.prepare(
      'SELECT date_time FROM meeting_schedule_options WHERE id = ?'
    ).bind(selectedOptionId).first() as any;
    confirmedDateTime = option?.date_time;
    selectedOption = option;
  } else {
    const { results } = await env.DB.prepare(`
      SELECT o.id, o.date_time,
             COUNT(v.id) as vote_count,
             COALESCE(SUM(v.vote_weight), 0) as vote_weight_total
      FROM meeting_schedule_options o
      LEFT JOIN meeting_schedule_votes v ON o.id = v.option_id
      WHERE o.meeting_id = ?
      GROUP BY o.id
      ORDER BY vote_weight_total DESC, vote_count DESC
      LIMIT 1
    `).bind(params.id).all();
    selectedOption = results[0] as any;
    confirmedDateTime = selectedOption?.date_time;
  }

  if (!confirmedDateTime) {
    return error('No schedule option found', 400);
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_confirmed',
        confirmed_date_time = ?,
        schedule_confirmed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'schedule_poll_open'
  `).bind(confirmedDateTime, params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Open voting
route('POST', '/api/meetings/:id/open-voting', async (request, env, params) => {
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  let totalArea = meeting.total_area || 0;
  let totalEligibleCount = meeting.total_eligible_count || 0;
  if (meeting.building_id && totalArea <= 0) {
    const buildingStats = await env.DB.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_area), 0) as total_area
       FROM users WHERE building_id = ? AND role = 'resident' AND total_area > 0 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(meeting.building_id, ...(tenantId ? [tenantId] : [])).first() as any;
    totalArea = buildingStats?.total_area || 0;
    totalEligibleCount = buildingStats?.count || 0;
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'voting_open',
        voting_opened_at = datetime('now'),
        total_area = ?,
        total_eligible_count = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'schedule_confirmed'
  `).bind(totalArea, totalEligibleCount, params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind('resident', meeting.building_id, ...(tenantId ? [tenantId] : [])).all();

    for (const resident of residents as any[]) {
      await sendPushNotification(env, resident.id, {
        title: '🗳️ Голосование открыто!',
        body: `Голосование на собрании жильцов дома ${meeting.building_address || ''} началось. Примите участие!`,
        type: 'meeting',
        tag: `meeting-voting-${params.id}`,
        data: {
          meetingId: params.id,
          url: '/meetings'
        },
        requireInteraction: true
      });
    }
  }

  return json({ meeting: updated });
});

// Meetings: Close voting
route('POST', '/api/meetings/:id/close-voting', async (request, env, params) => {
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Meeting not found or voting not open', 400);
  }

  const [votedAreaResult, participatedCount] = await Promise.all([
    env.DB.prepare('SELECT COALESCE(SUM(weight), 0) as voted_area FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id)').bind(params.id).first(),
    env.DB.prepare('SELECT COUNT(DISTINCT voter_id) as count FROM meeting_vote_records WHERE meeting_id = ?').bind(params.id).first()
  ]) as any[];

  const votedArea = votedAreaResult?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participated = participatedCount?.count || 0;

  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= meeting.quorum_percent;

  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ?'
  ).bind(params.id).all();

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

    await env.DB.prepare(`
      UPDATE meeting_agenda_items
      SET is_approved = ?,
          votes_for_area = ?,
          votes_against_area = ?,
          votes_abstain_area = ?
      WHERE id = ?
    `).bind(isApproved, forWeight, againstWeight, abstainWeight, i.id).run();
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'voting_closed',
        voting_closed_at = datetime('now'),
        participated_count = ?,
        voted_area = ?,
        participation_percent = ?,
        quorum_reached = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(participated, votedArea, participationPercent, quorumReached ? 1 : 0, params.id).run();

  await env.DB.prepare(`
    UPDATE meeting_vote_reconsideration_requests
    SET status = 'expired', expired_at = datetime('now')
    WHERE meeting_id = ? AND status IN ('pending', 'viewed')
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    const quorumStatus = quorumReached ? 'Кворум достигнут!' : 'Кворум не достигнут.';
    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, {
        title: '🗳️ Голосование завершено',
        body: `Голосование по собранию жильцов завершено. ${quorumStatus} Участие: ${participationPercent.toFixed(1)}%`,
        type: 'meeting',
        tag: `meeting-closed-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Publish results
route('POST', '/api/meetings/:id/publish-results', async (request, env, params) => {
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'results_published',
        results_published_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'voting_closed'
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, {
        title: '📊 Результаты голосования опубликованы',
        body: `Результаты собрания жильцов ${meeting.building_address || ''} доступны для просмотра.`,
        type: 'meeting',
        tag: `meeting-results-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Generate protocol
route('POST', '/api/meetings/:id/generate-protocol', async (request, env, params) => {
  try {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  if (!['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  if (meeting.protocol_id) {
    await env.DB.prepare('DELETE FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).run();
  }

  const protocolId = generateId();
  const protocolNumber = `${meeting.number}/${new Date().getFullYear()}`;

  const { results: protocolAgendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.id).all();

  let content = `# ПРОТОКОЛ №${meeting.number}\n`;
  content += `## Общего собрания собственников помещений\n`;
  content += `### ${meeting.building_address}\n\n`;
  content += `**Дата проведения:** ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU') : 'Не указана'}\n\n`;
  content += `**Формат:** ${meeting.format === 'online' ? 'Онлайн' : meeting.format === 'offline' ? 'Очное' : 'Смешанное'}\n\n`;
  content += `**Организатор:** ${meeting.organizer_name}\n\n`;
  content += `---\n\n## КВОРУМ\n\n`;
  content += `- Общая площадь дома: ${meeting.total_area?.toFixed(2) || 0} кв.м\n`;
  content += `- Площадь проголосовавших: ${meeting.voted_area?.toFixed(2) || 0} кв.м\n`;
  content += `- Количество проголосовавших: ${meeting.participated_count || 0} чел.\n`;
  content += `- Процент участия (по площади): ${meeting.participation_percent?.toFixed(1) || 0}%\n`;
  content += `- Кворум ${meeting.quorum_reached ? '**ДОСТИГНУТ**' : '**НЕ ДОСТИГНУТ**'}\n\n`;
  content += `---\n\n## ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ\n\n`;

  for (const item of protocolAgendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight
        FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id
        WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0
      `).bind(i.id).first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight
        FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id
        WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0
      `).bind(i.id).first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight
        FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id
        WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0
      `).bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all()
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotes = forCount + againstCount + abstainCount;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (>60%)',
      two_thirds: '2/3 голосов (>66.67%)',
      three_quarters: '3/4 голосов (>75%)',
      unanimous: 'Единогласно (100%)'
    };

    content += `### ${i.item_order}. ${i.title}\n\n`;
    if (i.description) content += `${i.description}\n\n`;
    content += `**Порог принятия:** ${thresholdLabels[i.threshold] || 'Простое большинство'}\n\n`;
    content += `**Результаты голосования:**\n`;
    content += `- За: ${forCount} голосов (${forWeight.toFixed(2)} кв.м, ${percentForByWeight.toFixed(1)}%)\n`;
    content += `- Против: ${againstCount} голосов (${againstWeight.toFixed(2)} кв.м, ${percentAgainstByWeight.toFixed(1)}%)\n`;
    content += `- Воздержались: ${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м, ${percentAbstainByWeight.toFixed(1)}%)\n\n`;

    if (comments.results && comments.results.length > 0) {
      const objections = (comments.results as any[]).filter(c => c.comment_type === 'objection');
      const regularComments = (comments.results as any[]).filter(c => c.comment_type !== 'objection');

      if (objections.length > 0) {
        content += `**Возражения участников (голосовали ПРОТИВ):**\n\n`;
        for (const c of objections) {
          content += `> ⚠️ "${c.content}"\n`;
          content += `> — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}\n\n`;
          if (c.counter_proposal) {
            content += `> 💡 **Альтернативное предложение:** ${c.counter_proposal}\n\n`;
          }
        }
      }
      if (regularComments.length > 0) {
        content += `**Комментарии участников:**\n\n`;
        for (const c of regularComments) {
          content += `> "${c.content}"\n`;
          content += `> — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}\n\n`;
        }
      }
    }

    content += `**РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}**\n\n`;
  }

  const { results: voteRecords } = await env.DB.prepare(`
    SELECT DISTINCT
      v.voter_id, v.voter_name, v.apartment_number,
      COALESCE(u.total_area, v.vote_weight) as vote_weight,
      MIN(v.voted_at) as voted_at
    FROM meeting_vote_records v
    LEFT JOIN users u ON u.id = v.voter_id
    WHERE v.meeting_id = ? AND v.is_revote = 0
    GROUP BY v.voter_id ORDER BY v.voter_name
  `).bind(params.id).all();

  content += `---\n\n## ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ\n\n`;
  content += `| № | ФИО | Квартира | Площадь (кв.м) | Время голоса |\n`;
  content += `|---|-----|----------|----------------|---------------|\n`;
  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    content += `| ${idx + 1} | ${v.voter_name} | ${v.apartment_number || '-'} | ${v.vote_weight || '-'} | ${new Date(v.voted_at).toLocaleString('ru-RU')} |\n`;
  }

  content += `\n---\n\n## ПОДПИСИ\n\n`;
  content += `Протокол сформирован автоматически системой УК\n`;
  content += `Дата формирования: ${new Date().toLocaleString('ru-RU')}\n`;
  content += `\n_Председатель собрания: ____________________\n`;
  content += `\n_Секретарь: ____________________\n`;
  content += `\n_Члены счётной комиссии: ____________________\n`;

  const protocolHash = generateVoteHash({ meetingId: params.id, generatedAt: new Date().toISOString() });

  await env.DB.prepare(`
    INSERT INTO meeting_protocols (id, meeting_id, protocol_number, content, protocol_hash, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(protocolId, params.id, protocolNumber, content, protocolHash, getTenantId(request)).run();

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'protocol_generated',
        protocol_id = ?,
        protocol_generated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(protocolId, params.id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(protocolId).first();
  return json({ protocol }, 201);
  } catch (err: any) {
    console.error('Generate protocol error:', err?.message, err?.stack);
    return error(`Protocol generation failed: ${err?.message}`, 500);
  }
});

// Meetings: Approve protocol
route('POST', '/api/meetings/:id/approve-protocol', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const signatureHash = generateVoteHash({ userId: authUser.id, signedAt: new Date().toISOString() });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET signed_by_uk_user_id = ?,
        signed_by_uk_name = ?,
        signed_by_uk_role = ?,
        signed_by_uk_at = datetime('now'),
        uk_signature_hash = ?
    WHERE id = ?
  `).bind(authUser.id, authUser.name, authUser.role, signatureHash, meeting.protocol_id).run();

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'protocol_approved',
        protocol_approved_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Protocol: Sign as chairman (resident who leads the meeting)
route('POST', '/api/meetings/:id/protocol/sign-chairman', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const userInfo = await env.DB.prepare(
    'SELECT apartment FROM users WHERE id = ? AND building_id = ?'
  ).bind(authUser.id, meeting.building_id).first() as any;

  const signatureHash = generateVoteHash({
    userId: authUser.id,
    role: 'chairman',
    signedAt: new Date().toISOString()
  });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET chairman_user_id = ?,
        chairman_name = ?,
        chairman_apartment = ?,
        chairman_signed_at = datetime('now'),
        chairman_signature_hash = ?
    WHERE id = ?
  `).bind(
    authUser.id,
    authUser.name,
    userInfo?.apartment || null,
    signatureHash,
    meeting.protocol_id
  ).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});


// Protocol: Sign as secretary
route('POST', '/api/meetings/:id/protocol/sign-secretary', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const userInfo = await env.DB.prepare(
    'SELECT apartment FROM users WHERE id = ? AND building_id = ?'
  ).bind(authUser.id, meeting.building_id).first() as any;

  const signatureHash = generateVoteHash({
    userId: authUser.id,
    role: 'secretary',
    signedAt: new Date().toISOString()
  });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET secretary_user_id = ?,
        secretary_name = ?,
        secretary_apartment = ?,
        secretary_signed_at = datetime('now'),
        secretary_signature_hash = ?
    WHERE id = ?
  `).bind(
    authUser.id,
    authUser.name,
    userInfo?.apartment || null,
    signatureHash,
    meeting.protocol_id
  ).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Protocol: Set counting commission members
route('POST', '/api/meetings/:id/protocol/counting-commission', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  // body.members should be array of { userId, name, apartment }
  const members = body.members || [];

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET counting_commission = ?
    WHERE id = ?
  `).bind(JSON.stringify(members), meeting.protocol_id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Meetings: Cancel
route('POST', '/api/meetings/:id/cancel', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'cancelled',
        cancelled_at = datetime('now'),
        cancellation_reason = ?,
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Cancelled', params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  // Notify building residents about meeting cancellation
  if (updated?.building_id) {
    const { results: residentsCancel } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(updated.building_id, ...(tenantId ? [tenantId] : [])).all();

    const cancelMeetingBody = `Собрание "${updated.title || ''}" отменено. ${body.reason ? 'Причина: ' + body.reason : ''}`;
    for (const resident of (residentsCancel || []) as any[]) {
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting_cancelled', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), resident.id, '❌ Собрание отменено', cancelMeetingBody, JSON.stringify({ meeting_id: params.id }), tenantId).run().catch(() => {});
      sendPushNotification(env, resident.id, {
        title: '❌ Собрание отменено',
        body: cancelMeetingBody,
        type: 'meeting_cancelled',
        tag: `meeting-cancelled-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: true
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Delete
route('DELETE', '/api/meetings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Verify meeting exists
  const meeting = await env.DB.prepare(
    `SELECT id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get agenda item IDs for cascading to comments
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT id FROM meeting_agenda_items WHERE meeting_id = ?'
  ).bind(params.id).all();
  const agendaIds = agendaItems.map((a: any) => a.id);

  // Delete all related data (cascade)
  try {
    if (agendaIds.length > 0) {
      const placeholders = agendaIds.map(() => '?').join(',');
      await env.DB.prepare(
        `DELETE FROM meeting_agenda_comments WHERE agenda_item_id IN (${placeholders})`
      ).bind(...agendaIds).run();
    }
    await env.DB.prepare('DELETE FROM meeting_vote_reconsideration_requests WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_vote_records WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_agenda_items WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_schedule_votes WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_schedule_options WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_otp_records WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_protocols WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_eligible_voters WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_participated_voters WHERE meeting_id = ?').bind(params.id).run();

    // Finally delete the meeting itself
    await env.DB.prepare(`DELETE FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
    invalidateCache('meetings:');
    return json({ success: true });
  } catch (err: any) {
    console.error('Meeting delete error:', err.message);
    return error(`Failed to delete meeting: ${err.message}`, 500);
  }
});

// Schedule voting
route('POST', '/api/meetings/:meetingId/schedule-votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const optionId = body.option_id || body.optionId;

  // Get meeting info and user's apartment area for weighted voting
  const meeting = await env.DB.prepare(
    `SELECT building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Собрание не найдено', 404);
  }

  // Get user's apartment area for vote weight (default to 50 if not set)
  const userInfo = await env.DB.prepare(
    'SELECT total_area FROM users WHERE id = ?'
  ).bind(authUser.id).first() as any;

  // Use 50 as default if total_area is not set
  const voteWeight = userInfo?.total_area || 50;

  // Remove existing vote and add new one (upsert)
  // Note: table has both user_id (NOT NULL) and voter_id columns - use user_id as primary
  await env.DB.prepare(
    'DELETE FROM meeting_schedule_votes WHERE meeting_id = ? AND user_id = ?'
  ).bind(params.meetingId, authUser.id).run();

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_schedule_votes (id, meeting_id, option_id, user_id, voter_id, voter_name, vote_weight, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, params.meetingId, optionId, authUser.id, authUser.id, authUser.name, voteWeight, getTenantId(request)).run();

  // Update meeting's updated_at to trigger WebSocket broadcast
  await env.DB.prepare(`
    UPDATE meetings SET updated_at = datetime('now') WHERE id = ?
  `).bind(params.meetingId).run();

  invalidateCache('meetings:');

  return json({ success: true, voteWeight });
});

// Get schedule vote by user
route('GET', '/api/meetings/:meetingId/schedule-votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const vote = await env.DB.prepare(
    'SELECT option_id FROM meeting_schedule_votes WHERE meeting_id = ? AND user_id = ?'
  ).bind(params.meetingId, authUser.id).first() as any;

  return json({ optionId: vote?.option_id || null });
});

// Agenda voting
route('POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  // Check if meeting is open for voting
  const meeting = await env.DB.prepare(
    `SELECT status, require_otp, building_id, allow_revote FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Voting is not open', 400);
  }

  // Check if user is eligible to vote (must be resident of this building)
  const eligibleVoter = await env.DB.prepare(`
    SELECT ev.*, u.apartment, u.total_area
    FROM meeting_eligible_voters ev
    JOIN users u ON u.id = ev.user_id
    WHERE ev.meeting_id = ? AND ev.user_id = ?
  `).bind(params.meetingId, authUser.id).first() as any;

  // If no explicit eligible voters list, check if user is resident of the building
  let apartmentArea = body.ownership_share || body.ownershipShare || null;
  let apartmentNumber = body.apartment_number || body.apartmentNumber || null;

  if (!eligibleVoter) {
    // Check if user is resident of the meeting's building
    const userBuilding = await env.DB.prepare(
      'SELECT apartment, total_area FROM users WHERE id = ? AND building_id = ? AND role = ?'
    ).bind(authUser.id, meeting.building_id, 'resident').first() as any;

    if (!userBuilding) {
      return error('You are not eligible to vote in this meeting', 403);
    }

    apartmentArea = apartmentArea || userBuilding.total_area;
    if (!apartmentArea || apartmentArea <= 0) {
      return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    }
    apartmentNumber = apartmentNumber || userBuilding.apartment;
  } else {
    // Use eligible voter data or user's total_area
    apartmentArea = apartmentArea || eligibleVoter.total_area;
    if (!apartmentArea || apartmentArea <= 0) {
      return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    }
    apartmentNumber = apartmentNumber || eligibleVoter.apartment;
  }

  // Check for existing vote
  const existingVote = await env.DB.prepare(
    'SELECT id, choice FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ? AND voter_id = ? AND is_revote = 0'
  ).bind(params.meetingId, params.agendaItemId, authUser.id).first() as any;

  // Create vote hash for audit trail
  const voteHash = generateVoteHash({
    meetingId: params.meetingId,
    agendaItemId: params.agendaItemId,
    voterId: authUser.id,
    choice: body.choice,
    votedAt: new Date().toISOString()
  });

  if (existingVote) {
    // Check if revote is allowed
    if (!meeting.allow_revote) {
      return error('Revoting is not allowed for this meeting', 400);
    }

    // UPDATE existing vote in-place (avoids UNIQUE constraint issue)
    // Previous choice is preserved in the reconsideration requests table
    await env.DB.prepare(`
      UPDATE meeting_vote_records
      SET choice = ?, vote = ?, vote_hash = ?, voted_at = datetime('now'),
          vote_weight = ?, verification_method = ?, otp_verified = ?
      WHERE id = ?
    `).bind(
      body.choice,
      body.choice,
      voteHash,
      apartmentArea,
      body.verification_method || body.verificationMethod || 'login',
      body.otp_verified || body.otpVerified ? 1 : 0,
      existingVote.id
    ).run();
  } else {
    // Insert new vote with vote_weight = apartment area
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_vote_records (
        id, meeting_id, agenda_item_id,
        user_id, vote, voter_id, voter_name, apartment_id, apartment_number, ownership_share, vote_weight,
        choice, verification_method, otp_verified, vote_hash, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      params.meetingId,
      params.agendaItemId,
      authUser.id,           // user_id (NOT NULL)
      body.choice,           // vote (NOT NULL) - same as choice
      authUser.id,           // voter_id
      authUser.name,
      body.apartment_id || body.apartmentId || null,
      apartmentNumber,
      apartmentArea,
      apartmentArea, // vote_weight = apartment area in sq.m (1 кв.м = 1 голос)
      body.choice,
      body.verification_method || body.verificationMethod || 'login',
      body.otp_verified || body.otpVerified ? 1 : 0,
      voteHash,
      getTenantId(request)
    ).run();

    // Track participated voter (check first, table may lack UNIQUE constraint)
    const alreadyParticipated = await env.DB.prepare(
      `SELECT 1 FROM meeting_participated_voters WHERE meeting_id = ? AND user_id = ? LIMIT 1`
    ).bind(params.meetingId, authUser.id).first();
    if (!alreadyParticipated) {
      await env.DB.prepare(
        `INSERT INTO meeting_participated_voters (meeting_id, user_id, tenant_id) VALUES (?, ?, ?)`
      ).bind(params.meetingId, authUser.id, getTenantId(request)).run();
    }
  }

  // Save comment/objection if provided (auto-type: 'objection' for against votes)
  const comment = body.comment?.trim();
  const counterProposal = body.counter_proposal?.trim() || null;
  const commentType = body.comment_type || (body.choice === 'against' ? 'objection' : 'comment');
  if ((comment && comment.length > 0) || (counterProposal && counterProposal.length > 0)) {
    const commentId = generateId();
    const voterData = eligibleVoter || await env.DB.prepare(
      'SELECT apartment FROM users WHERE id = ?'
    ).bind(authUser.id).first() as any;
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_comments (
        id, agenda_item_id, meeting_id, resident_id, resident_name, apartment_number,
        content, comment_type, counter_proposal, include_in_protocol, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      commentId,
      params.agendaItemId,
      params.meetingId,
      authUser.id,
      authUser.name,
      apartmentNumber || voterData?.apartment || null,
      comment || 'Голосовал(а) ПРОТИВ',
      commentType,
      counterProposal,
      getTenantId(request)
    ).run();
  }

  // Update any pending reconsideration requests if vote changed
  if (existingVote && existingVote.choice !== body.choice) {
    await env.DB.prepare(`
      UPDATE meeting_vote_reconsideration_requests
      SET status = 'vote_changed',
          responded_at = datetime('now'),
          new_vote = ?
      WHERE meeting_id = ?
        AND agenda_item_id = ?
        AND resident_id = ?
        AND status IN ('pending', 'viewed')
    `).bind(body.choice, params.meetingId, params.agendaItemId, authUser.id).run();
  }

  return json({ success: true, voteHash, voteWeight: apartmentArea });
});

// Get user's votes for meeting
route('GET', '/api/meetings/:meetingId/votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND voter_id = ?'
  ).bind(params.meetingId, authUser.id).all();

  return json({ votes: results });
});

// ==================== VOTE RECONSIDERATION REQUEST ENDPOINTS ====================

// Get "against" votes for an agenda item (for УК to see who voted against)
route('GET', '/api/meetings/:meetingId/agenda/:agendaItemId/votes/against', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Only managers/directors can view against votes
  if (!['manager', 'director', 'admin'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  // MULTI-TENANCY: Check if meeting exists and belongs to tenant
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(
    `SELECT id, status FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get all "against" votes with resident info and reconsideration request counts
  const { results: againstVotes } = await env.DB.prepare(`
    SELECT
      vr.id as vote_id,
      vr.voter_id,
      vr.voter_name,
      vr.apartment_number,
      vr.vote_weight,
      vr.voted_at,
      u.phone,
      u.total_area,
      (SELECT comment FROM meeting_agenda_comments
       WHERE agenda_item_id = ? AND user_id = vr.voter_id
       ORDER BY created_at DESC LIMIT 1) as comment,
      (SELECT COUNT(*) FROM meeting_vote_reconsideration_requests
       WHERE agenda_item_id = ? AND resident_id = vr.voter_id) as request_count
    FROM meeting_vote_records vr
    LEFT JOIN users u ON u.id = vr.voter_id
    WHERE vr.meeting_id = ?
      AND vr.agenda_item_id = ?
      AND vr.choice = 'against'
      AND vr.is_revote = 0
    ORDER BY vr.vote_weight DESC
  `).bind(params.agendaItemId, params.agendaItemId, params.meetingId, params.agendaItemId).all();

  // Add can_send_request flag (max 2 per resident per agenda item)
  const votesWithFlags = (againstVotes || []).map((v: any) => ({
    ...v,
    can_send_request: meeting.status === 'voting_open' && v.request_count < 2
  }));

  return json({ votes: votesWithFlags });
});

// Send reconsideration request to a resident
route('POST', '/api/meetings/:meetingId/reconsideration-requests', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Only managers/directors can send requests
  if (!['manager', 'director', 'admin'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  const body = await request.json() as any;
  const { agenda_item_id, resident_id, reason, message_to_resident } = body;

  if (!agenda_item_id || !resident_id || !reason) {
    return error('Missing required fields', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if meeting is in voting_open status
  const meeting = await env.DB.prepare(
    `SELECT id, status, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Voting is not open', 400);
  }

  // Get the resident's current vote
  const currentVote = await env.DB.prepare(`
    SELECT vr.*, u.apartment
    FROM meeting_vote_records vr
    JOIN users u ON u.id = vr.voter_id
    WHERE vr.meeting_id = ?
      AND vr.agenda_item_id = ?
      AND vr.voter_id = ?
      AND vr.is_revote = 0
  `).bind(params.meetingId, agenda_item_id, resident_id).first() as any;

  if (!currentVote) {
    return error('Resident has not voted on this item', 400);
  }

  // Check max 2 requests per resident per agenda item
  const existingRequests = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM meeting_vote_reconsideration_requests
    WHERE agenda_item_id = ? AND resident_id = ?
  `).bind(agenda_item_id, resident_id).first() as any;

  if (existingRequests.count >= 2) {
    return error('Maximum 2 requests per resident per agenda item', 400);
  }

  // Create the reconsideration request
  const requestId = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_vote_reconsideration_requests (
      id, meeting_id, agenda_item_id, resident_id, apartment_id,
      requested_by_user_id, requested_by_role, reason, message_to_resident,
      vote_at_request_time, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(
    requestId,
    params.meetingId,
    agenda_item_id,
    resident_id,
    currentVote.apartment || currentVote.apartment_number || '',
    authUser.id,
    authUser.role,
    reason,
    message_to_resident || null,
    currentVote.choice
  ).run();

  // Get agenda item title for notification
  const agendaItem = await env.DB.prepare(
    'SELECT title FROM meeting_agenda_items WHERE id = ?'
  ).bind(agenda_item_id).first() as any;

  // Send push notification to resident
  sendPushNotification(env, resident_id, {
    title: '🗳️ Просьба пересмотреть голос',
    body: `УК просит вас пересмотреть голос по вопросу: "${agendaItem?.title || 'Голосование'}"`,
    type: 'meeting',
    tag: `reconsider-${requestId}`,
    data: { meetingId: params.meetingId, requestId, url: '/meetings' },
    requireInteraction: true
  }).catch(() => {});

  // Create in-app notification
  const notificationId = generateId();
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data)
    VALUES (?, ?, 'meeting', ?, ?, ?)
  `).bind(
    notificationId,
    resident_id,
    'Просьба пересмотреть голос',
    message_to_resident || `УК просит вас пересмотреть голос по вопросу собрания`,
    JSON.stringify({ meetingId: params.meetingId, agendaItemId: agenda_item_id, requestId })
  ).run();

  return json({ success: true, requestId });
});

// Get resident's pending reconsideration requests
route('GET', '/api/meetings/reconsideration-requests/me', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request);
  const { results: requests } = await env.DB.prepare(`
    SELECT
      r.*,
      m.status as meeting_status,
      ai.title as agenda_item_title,
      ai.description as agenda_item_description,
      u.name as requested_by_name
    FROM meeting_vote_reconsideration_requests r
    JOIN meetings m ON m.id = r.meeting_id
    JOIN meeting_agenda_items ai ON ai.id = r.agenda_item_id
    LEFT JOIN users u ON u.id = r.requested_by_user_id
    WHERE r.resident_id = ?
      AND r.status IN ('pending', 'viewed')
      AND m.status = 'voting_open'
      ${tenantId ? 'AND m.tenant_id = ?' : ''}
    ORDER BY r.created_at DESC
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ requests: requests || [] });
});

// Mark reconsideration request as viewed
route('POST', '/api/meetings/reconsideration-requests/:requestId/view', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Verify this request belongs to the user and tenant
  const tenantId = getTenantId(request);
  const request_record = await env.DB.prepare(
    `SELECT r.* FROM meeting_vote_reconsideration_requests r
     JOIN meetings m ON m.id = r.meeting_id
     WHERE r.id = ? AND r.resident_id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}`
  ).bind(params.requestId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!request_record) {
    return error('Request not found', 404);
  }

  if (request_record.status === 'pending') {
    await env.DB.prepare(`
      UPDATE meeting_vote_reconsideration_requests
      SET status = 'viewed', viewed_at = datetime('now')
      WHERE id = ?
    `).bind(params.requestId).run();
  }

  return json({ success: true });
});

// Ignore/dismiss reconsideration request
route('POST', '/api/meetings/reconsideration-requests/:requestId/ignore', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Verify this request belongs to the user and tenant
  const tenantId = getTenantId(request);
  const request_record = await env.DB.prepare(
    `SELECT r.* FROM meeting_vote_reconsideration_requests r
     JOIN meetings m ON m.id = r.meeting_id
     WHERE r.id = ? AND r.resident_id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}`
  ).bind(params.requestId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!request_record) {
    return error('Request not found', 404);
  }

  await env.DB.prepare(`
    UPDATE meeting_vote_reconsideration_requests
    SET status = 'ignored', responded_at = datetime('now')
    WHERE id = ?
  `).bind(params.requestId).run();

  return json({ success: true });
});

// Get reconsideration request statistics for a meeting (for УК)
route('GET', '/api/meetings/:meetingId/reconsideration-requests/stats', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  if (!['manager', 'director', 'admin'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'viewed' THEN 1 ELSE 0 END) as viewed,
      SUM(CASE WHEN status = 'vote_changed' THEN 1 ELSE 0 END) as vote_changed,
      SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) as ignored,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
    FROM meeting_vote_reconsideration_requests
    WHERE meeting_id = ?
  `).bind(params.meetingId).first() as any;

  const conversionRate = stats.total > 0
    ? ((stats.vote_changed || 0) / stats.total * 100).toFixed(1)
    : '0';

  return json({
    stats: {
      ...stats,
      conversion_rate: conversionRate
    }
  });
});

// ==================== END VOTE RECONSIDERATION ENDPOINTS ====================

// Real-time voting stats (for polling during active voting)
route('GET', '/api/meetings/:meetingId/stats', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(
    `SELECT id, status, total_area, quorum_percent, voted_area, participation_percent, quorum_reached FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get current voting stats by area (distinct voters only)
  const [votedAreaResult, participantCount, agendaStats] = await Promise.all([
    env.DB.prepare(`
      SELECT COALESCE(SUM(weight), 0) as voted_area
      FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id)
    `).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT COUNT(DISTINCT voter_id) as count
      FROM meeting_vote_records
      WHERE meeting_id = ?
    `).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT
        ai.id,
        ai.title,
        ai.threshold,
        COALESCE(SUM(CASE WHEN vr.choice = 'for' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_for,
        COALESCE(SUM(CASE WHEN vr.choice = 'against' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_against,
        COALESCE(SUM(CASE WHEN vr.choice = 'abstain' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_abstain,
        COUNT(DISTINCT CASE WHEN vr.is_revote = 0 THEN vr.voter_id END) as voter_count
      FROM meeting_agenda_items ai
      LEFT JOIN meeting_vote_records vr ON vr.agenda_item_id = ai.id
      WHERE ai.meeting_id = ?
      GROUP BY ai.id
      ORDER BY ai.item_order
    `).bind(params.meetingId).all()
  ]) as any[];

  const votedArea = (votedAreaResult as any)?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= (meeting.quorum_percent || 50);

  return json({
    meetingId: params.meetingId,
    status: meeting.status,
    totalArea,
    votedArea,
    participationPercent: Math.round(participationPercent * 100) / 100,
    quorumPercent: meeting.quorum_percent || 50,
    quorumReached,
    participantCount: (participantCount as any)?.count || 0,
    agendaItems: (agendaStats.results || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      threshold: item.threshold,
      votesFor: item.votes_for || 0,
      votesAgainst: item.votes_against || 0,
      votesAbstain: item.votes_abstain || 0,
      voterCount: item.voter_count || 0,
      totalVoted: (item.votes_for || 0) + (item.votes_against || 0) + (item.votes_abstain || 0)
    })),
    timestamp: new Date().toISOString()
  });
});

// OTP: Request
route('POST', '/api/meetings/otp/request', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const code = generateOTPCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_otp_records (
      id, user_id, phone, code, purpose, meeting_id, agenda_item_id, expires_at, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    authUser.id,
    body.phone || authUser.phone,
    code,
    body.purpose || 'agenda_vote',
    body.meeting_id || body.meetingId || null,
    body.agenda_item_id || body.agendaItemId || null,
    expiresAt.toISOString(),
    getTenantId(request)
  ).run();

  // In production, send SMS here
  console.log(`[OTP] Code ${code} sent to ${body.phone || authUser.phone} for user ${authUser.id}`);

  return json({ otpId: id, expiresAt: expiresAt.toISOString() });
});

// OTP: Verify
route('POST', '/api/meetings/otp/verify', async (request, env) => {
  const body = await request.json() as any;
  const otpId = body.otp_id || body.otpId;
  const code = body.code;

  const otp = await env.DB.prepare(
    'SELECT * FROM meeting_otp_records WHERE id = ?'
  ).bind(otpId).first() as any;

  if (!otp) {
    return json({ verified: false, error: 'OTP not found' });
  }

  if (otp.is_used) {
    return json({ verified: false, error: 'OTP already used' });
  }

  if (new Date(otp.expires_at) < new Date()) {
    return json({ verified: false, error: 'OTP expired' });
  }

  if (otp.attempts >= otp.max_attempts) {
    return json({ verified: false, error: 'Max attempts exceeded' });
  }

  if (otp.code === code) {
    await env.DB.prepare(`
      UPDATE meeting_otp_records
      SET is_used = 1, verified_at = datetime('now')
      WHERE id = ?
    `).bind(otpId).run();

    return json({ verified: true });
  } else {
    await env.DB.prepare(`
      UPDATE meeting_otp_records SET attempts = attempts + 1 WHERE id = ?
    `).bind(otpId).run();

    return json({ verified: false, error: 'Invalid code' });
  }
});

// Building settings: Get
route('GET', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const settings = await env.DB.prepare(
    `SELECT * FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  if (!settings) {
    // Return defaults
    return json({
      settings: {
        building_id: params.buildingId,
        voting_unit: 'apartment',
        default_quorum_percent: 50,
        schedule_poll_duration_days: 3,
        voting_duration_hours: 48,
        allow_resident_initiative: 1,
        require_moderation: 1,
        default_meeting_time: '19:00',
        reminder_hours_before: [48, 2],
        notification_channels: ['in_app', 'push']
      }
    });
  }

  return json({
    settings: {
      ...settings,
      reminder_hours_before: settings.reminder_hours_before ? JSON.parse(settings.reminder_hours_before as string) : [48, 2],
      notification_channels: settings.notification_channels ? JSON.parse(settings.notification_channels as string) : ['in_app', 'push']
    }
  });
});

// Building settings: Update
route('PATCH', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;

  // Check if settings exist
  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT building_id FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  if (existing) {
    const updates: string[] = [];
    const values: any[] = [];

    const fields = [
      { api: 'votingUnit', db: 'voting_unit' },
      { api: 'voting_unit', db: 'voting_unit' },
      { api: 'defaultQuorumPercent', db: 'default_quorum_percent' },
      { api: 'default_quorum_percent', db: 'default_quorum_percent' },
      { api: 'schedulePollDurationDays', db: 'schedule_poll_duration_days' },
      { api: 'schedule_poll_duration_days', db: 'schedule_poll_duration_days' },
      { api: 'votingDurationHours', db: 'voting_duration_hours' },
      { api: 'voting_duration_hours', db: 'voting_duration_hours' },
      { api: 'defaultMeetingTime', db: 'default_meeting_time' },
      { api: 'default_meeting_time', db: 'default_meeting_time' },
    ];

    for (const field of fields) {
      if (body[field.api] !== undefined) {
        updates.push(`${field.db} = ?`);
        values.push(body[field.api]);
      }
    }

    if (body.allowResidentInitiative !== undefined || body.allow_resident_initiative !== undefined) {
      updates.push('allow_resident_initiative = ?');
      values.push((body.allowResidentInitiative || body.allow_resident_initiative) ? 1 : 0);
    }

    if (body.requireModeration !== undefined || body.require_moderation !== undefined) {
      updates.push('require_moderation = ?');
      values.push((body.requireModeration || body.require_moderation) ? 1 : 0);
    }

    if (body.reminderHoursBefore || body.reminder_hours_before) {
      updates.push('reminder_hours_before = ?');
      values.push(JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before));
    }

    if (body.notificationChannels || body.notification_channels) {
      updates.push('notification_channels = ?');
      values.push(JSON.stringify(body.notificationChannels || body.notification_channels));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(params.buildingId);

      await env.DB.prepare(`
        UPDATE meeting_building_settings SET ${updates.join(', ')} WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(...values, ...(tenantId ? [tenantId] : [])).run();
    }
  } else {
    // Insert new
    await env.DB.prepare(`
      INSERT INTO meeting_building_settings (
        building_id, voting_unit, default_quorum_percent,
        schedule_poll_duration_days, voting_duration_hours,
        allow_resident_initiative, require_moderation,
        default_meeting_time, reminder_hours_before, notification_channels, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      params.buildingId,
      body.votingUnit || body.voting_unit || 'apartment',
      body.defaultQuorumPercent || body.default_quorum_percent || 50,
      body.schedulePollDurationDays || body.schedule_poll_duration_days || 3,
      body.votingDurationHours || body.voting_duration_hours || 48,
      (body.allowResidentInitiative || body.allow_resident_initiative) !== false ? 1 : 0,
      (body.requireModeration || body.require_moderation) !== false ? 1 : 0,
      body.defaultMeetingTime || body.default_meeting_time || '19:00',
      JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before || [48, 2]),
      JSON.stringify(body.notificationChannels || body.notification_channels || ['in_app', 'push']),
      getTenantId(request)
    ).run();
  }

  const updated = await env.DB.prepare(
    `SELECT * FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  return json({ settings: updated });
});

// Voting units: List by building
route('GET', '/api/meetings/voting-units', async (request, env) => {
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id') || url.searchParams.get('buildingId');

  if (!buildingId) {
    return error('building_id required', 400);
  }

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM meeting_voting_units WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY apartment_number`
  ).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();

  return json({
    votingUnits: results.map((u: any) => ({
      ...u,
      coOwnerIds: u.co_owner_ids ? JSON.parse(u.co_owner_ids) : []
    }))
  });
});

// Voting units: Create
route('POST', '/api/meetings/voting-units', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO meeting_voting_units (
      id, building_id, apartment_id, apartment_number,
      owner_id, owner_name, co_owner_ids,
      ownership_share, total_area, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.building_id || body.buildingId,
    body.apartment_id || body.apartmentId || null,
    body.apartment_number || body.apartmentNumber,
    body.owner_id || body.ownerId || null,
    body.owner_name || body.ownerName || null,
    JSON.stringify(body.co_owner_ids || body.coOwnerIds || []),
    body.ownership_share || body.ownershipShare || 100,
    body.total_area || body.totalArea || null,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(id).first();
  return json({ votingUnit: created }, 201);
});

// Voting units: Verify
route('POST', '/api/meetings/voting-units/:id/verify', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  await env.DB.prepare(`
    UPDATE meeting_voting_units
    SET is_verified = 1, verified_at = datetime('now'), verified_by = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(authUser!.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  const updated = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(params.id).first();
  return json({ votingUnit: updated });
});

// Eligible voters: Set for meeting
route('POST', '/api/meetings/:meetingId/eligible-voters', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;
  const voters = body.voters || [];

  // Clear existing
  await env.DB.prepare(
    'DELETE FROM meeting_eligible_voters WHERE meeting_id = ?'
  ).bind(params.meetingId).run();

  // Insert new
  for (const voter of voters) {
    await env.DB.prepare(`
      INSERT INTO meeting_eligible_voters (meeting_id, user_id, apartment_id, ownership_share, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      params.meetingId,
      voter.user_id || voter.userId,
      voter.apartment_id || voter.apartmentId || null,
      voter.ownership_share || voter.ownershipShare || 100,
      getTenantId(request)
    ).run();
  }

  // Update total count
  await env.DB.prepare(`
    UPDATE meetings SET total_eligible_count = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(voters.length, params.meetingId).run();

  return json({ success: true, count: voters.length });
});

// Get vote records for meeting (audit)
route('GET', '/api/meetings/:meetingId/vote-records', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ? ORDER BY voted_at'
  ).bind(params.meetingId).all();

  return json({ voteRecords: results });
});

// Get protocol
route('GET', '/api/meetings/:meetingId/protocol', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?')
    .bind(meeting.protocol_id).first();

  return json({ protocol });
});

// Get protocol as HTML (for PDF generation on client side)
route('GET', '/api/meetings/:meetingId/protocol/html', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique voters (deduplicated by voter_id)
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT voter_id, voter_name, apartment_number, MAX(vote_weight) as vote_weight, MIN(voted_at) as voted_at
    FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0
    GROUP BY voter_id ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Build HTML for PDF
  let html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Протокол собрания №${meeting.number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; padding: 20mm; max-width: 210mm; }
    h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; }
    h2 { font-size: 14pt; margin: 20px 0 10px; border-bottom: 1px solid #333; padding-bottom: 5px; }
    h3 { font-size: 12pt; margin: 15px 0 8px; }
    p { margin: 5px 0; }
    .header { text-align: center; margin-bottom: 30px; }
    .header p { margin: 3px 0; }
    .section { margin: 15px 0; }
    .quorum { background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0; }
    .quorum.reached { background: #e8f5e9; border-left: 4px solid #4caf50; }
    .quorum.not-reached { background: #ffebee; border-left: 4px solid #f44336; }
    .agenda-item { margin: 15px 0; padding: 10px; background: #fafafa; border-radius: 5px; }
    .votes { display: flex; gap: 20px; margin: 10px 0; }
    .vote-block { flex: 1; }
    .decision { font-weight: bold; font-size: 14pt; margin: 10px 0; padding: 8px; text-align: center; }
    .decision.approved { background: #e8f5e9; color: #2e7d32; }
    .decision.rejected { background: #ffebee; color: #c62828; }
    .comments { margin: 10px 0; padding: 10px; background: #fff8e1; border-left: 3px solid #ffc107; }
    .comment { margin: 8px 0; font-style: italic; }
    .comment-author { font-size: 10pt; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    th, td { border: 1px solid #333; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; }
    .signatures { margin-top: 40px; }
    .signature-line { margin: 20px 0; display: flex; justify-content: space-between; }
    .signature-line span { border-bottom: 1px solid #333; min-width: 200px; display: inline-block; }
    .footer { margin-top: 30px; font-size: 10pt; color: #666; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
    @media print {
      body { padding: 15mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ПРОТОКОЛ №${meeting.number}</h1>
    <p><strong>Общего собрания собственников помещений</strong></p>
    <p>многоквартирного дома по адресу:</p>
    <p><strong>${meeting.building_address || 'Адрес не указан'}</strong></p>
  </div>

  <div class="section">
    <p><strong>Дата проведения:</strong> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p>
    <p><strong>Форма проведения:</strong> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p>
    <p><strong>Инициатор собрания:</strong> ${meeting.organizer_name || 'Управляющая компания'}</p>
  </div>

  <h2>СВЕДЕНИЯ О КВОРУМЕ</h2>
  <div class="quorum ${meeting.quorum_reached ? 'reached' : 'not-reached'}">
    <p><strong>Общая площадь помещений дома:</strong> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p>
    <p><strong>Площадь проголосовавших:</strong> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p>
    <p><strong>Количество правомочных голосующих:</strong> ${meeting.total_eligible_count || 0}</p>
    <p><strong>Приняло участие:</strong> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p>
    <p><strong>Кворум:</strong> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p>
  </div>

  <h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>
`;

  // Add agenda items
  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all()
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    // Use weight-based percentages (sq.m area per Uzbekistan law)
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (2/3)',
      two_thirds: '2/3 голосов',
      three_quarters: '3/4 голосов',
      unanimous: 'Единогласно'
    };

    html += `
  <div class="agenda-item">
    <h3>${i.item_order}. ${i.title}</h3>
    ${i.description ? `<p>${i.description}</p>` : ''}
    <p><em>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</em></p>

    <div class="votes">
      <div class="vote-block">
        <strong>ЗА:</strong> ${forCount} голосов (${forWeight.toFixed(2)} кв.м) — ${percentForByWeight.toFixed(1)}%
      </div>
      <div class="vote-block">
        <strong>ПРОТИВ:</strong> ${againstCount} голосов (${againstWeight.toFixed(2)} кв.м) — ${percentAgainstByWeight.toFixed(1)}%
      </div>
      <div class="vote-block">
        <strong>ВОЗДЕРЖАЛИСЬ:</strong> ${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м) — ${percentAbstainByWeight.toFixed(1)}%
      </div>
    </div>
`;

    // Add comments
    if (comments.results && comments.results.length > 0) {
      html += `
    <div class="comments">
      <p><strong>Доводы участников:</strong></p>
`;
      for (const c of comments.results) {
        const comment = c as any;
        html += `
      <div class="comment">
        "${comment.content}"
        <div class="comment-author">— ${comment.resident_name}${comment.apartment_number ? `, кв. ${comment.apartment_number}` : ''}</div>
      </div>
`;
      }
      html += `    </div>`;
    }

    html += `
    <div class="decision ${i.is_approved ? 'approved' : 'rejected'}">
      РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}
    </div>
  </div>
`;
  }

  // Add participants table
  html += `
  <h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>ФИО</th>
        <th>Квартира</th>
        <th>Площадь (кв.м)</th>
        <th>Время голосования</th>
      </tr>
    </thead>
    <tbody>
`;

  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${v.voter_name}</td>
        <td>${v.apartment_number || '-'}</td>
        <td>${v.vote_weight || '-'}</td>
        <td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td>
      </tr>
`;
  }

  html += `
    </tbody>
  </table>

  <div class="signatures">
    <h2>ПОДПИСИ</h2>
    <div class="signature-line">
      <span>Председатель собрания:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
    <div class="signature-line">
      <span>Секретарь:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
    <div class="signature-line">
      <span>Члены счётной комиссии:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
  </div>

  <div class="footer">
    <p>Протокол сформирован автоматически системой УК</p>
    <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
    ${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}
  </div>

  <script class="no-print">
    // Auto-print when opened
    // window.onload = () => window.print();
  </script>
</body>
</html>
`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    }
  });
});

// Get protocol as DOC file (Word document)
route('GET', '/api/meetings/:meetingId/protocol/doc', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique voters (deduplicated by voter_id)
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT voter_id, voter_name, apartment_number, MAX(vote_weight) as vote_weight, MIN(voted_at) as voted_at
    FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0
    GROUP BY voter_id ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Build Word-compatible HTML (MHTML format for better Word compatibility)
  let docContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
    }
    h1 {
      text-align: center;
      font-size: 16pt;
      margin-bottom: 10pt;
    }
    h2 {
      font-size: 14pt;
      margin-top: 20pt;
      margin-bottom: 10pt;
      border-bottom: 1pt solid #333;
      padding-bottom: 5pt;
    }
    h3 {
      font-size: 12pt;
      margin-top: 15pt;
      margin-bottom: 8pt;
    }
    p {
      margin: 5pt 0;
    }
    .header {
      text-align: center;
      margin-bottom: 30pt;
    }
    .section {
      margin: 15pt 0;
    }
    .quorum {
      background-color: #f5f5f5;
      padding: 10pt;
      margin: 10pt 0;
      border-left: 4pt solid #4caf50;
    }
    .agenda-item {
      margin: 15pt 0;
      padding: 10pt;
      background-color: #fafafa;
    }
    .decision {
      font-weight: bold;
      font-size: 14pt;
      margin: 10pt 0;
      padding: 8pt;
      text-align: center;
    }
    .decision-approved {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    .decision-rejected {
      background-color: #ffebee;
      color: #c62828;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-size: 10pt;
    }
    th, td {
      border: 1pt solid #333;
      padding: 5pt 8pt;
      text-align: left;
    }
    th {
      background-color: #f0f0f0;
    }
    .signatures {
      margin-top: 40pt;
    }
    .signature-line {
      margin: 30pt 0;
    }
    .footer {
      margin-top: 30pt;
      font-size: 10pt;
      color: #666;
      text-align: center;
      border-top: 1pt solid #ccc;
      padding-top: 10pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ПРОТОКОЛ №${meeting.number}</h1>
    <p><b>Общего собрания собственников помещений</b></p>
    <p>многоквартирного дома по адресу:</p>
    <p><b>${meeting.building_address || 'Адрес не указан'}</b></p>
  </div>

  <div class="section">
    <p><b>Дата проведения:</b> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p>
    <p><b>Форма проведения:</b> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p>
    <p><b>Инициатор собрания:</b> ${meeting.organizer_name || 'Управляющая компания'}</p>
  </div>

  <h2>СВЕДЕНИЯ О КВОРУМЕ</h2>
  <div class="quorum">
    <p><b>Общая площадь помещений дома:</b> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p>
    <p><b>Площадь проголосовавших:</b> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p>
    <p><b>Количество правомочных голосующих:</b> ${meeting.total_eligible_count || 0}</p>
    <p><b>Приняло участие:</b> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p>
    <p><b>Кворум:</b> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p>
  </div>

  <h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>
`;

  // Add agenda items
  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain, docComments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all(),
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    // Use weight-based percentages (sq.m = vote weight per Uzbekistan law)
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (2/3)',
      two_thirds: '2/3 голосов',
      three_quarters: '3/4 голосов',
      unanimous: 'Единогласно'
    };

    // Build objections HTML
    const objections = (docComments?.results || []).filter((c: any) => c.comment_type === 'objection');
    const regularComments = (docComments?.results || []).filter((c: any) => c.comment_type !== 'objection');
    let objHtml = '';
    if (objections.length > 0) {
      objHtml += `<p><b>Возражения участников (голосовали ПРОТИВ):</b></p>`;
      for (const c of objections as any[]) {
        objHtml += `<blockquote>⚠️ "${c.content}" — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}`;
        if (c.counter_proposal) objHtml += `<br/>💡 <b>Альтернативное предложение:</b> ${c.counter_proposal}`;
        objHtml += `</blockquote>`;
      }
    }
    if (regularComments.length > 0) {
      objHtml += `<p><b>Комментарии участников:</b></p>`;
      for (const c of regularComments as any[]) {
        objHtml += `<blockquote>"${c.content}" — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}</blockquote>`;
      }
    }

    docContent += `
  <div class="agenda-item">
    <h3>${i.item_order}. ${i.title}</h3>
    ${i.description ? `<p>${i.description}</p>` : ''}
    <p><i>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</i></p>

    <table>
      <tr>
        <th>ЗА</th>
        <th>ПРОТИВ</th>
        <th>ВОЗДЕРЖАЛИСЬ</th>
      </tr>
      <tr>
        <td>${forCount} голосов (${forWeight.toFixed(2)} кв.м) — ${percentForByWeight.toFixed(1)}%</td>
        <td>${againstCount} голосов (${againstWeight.toFixed(2)} кв.м) — ${percentAgainstByWeight.toFixed(1)}%</td>
        <td>${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м) — ${percentAbstainByWeight.toFixed(1)}%</td>
      </tr>
    </table>

    ${objHtml}

    <div class="decision ${i.is_approved ? 'decision-approved' : 'decision-rejected'}">
      РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}
    </div>
  </div>
`;
  }

  // Add participants table
  docContent += `
  <h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2>
  <table>
    <tr>
      <th>№</th>
      <th>ФИО</th>
      <th>Квартира</th>
      <th>Площадь (кв.м)</th>
      <th>Время голосования</th>
    </tr>
`;

  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    docContent += `
    <tr>
      <td>${idx + 1}</td>
      <td>${v.voter_name}</td>
      <td>${v.apartment_number || '-'}</td>
      <td>${v.vote_weight || '-'}</td>
      <td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td>
    </tr>
`;
  }

  docContent += `
  </table>

  <div class="signatures">
    <h2>ПОДПИСИ</h2>
    <div class="signature-line">
      <p>Председатель собрания: ______________________ / ______________________ /</p>
    </div>
    <div class="signature-line">
      <p>Секретарь: ______________________ / ______________________ /</p>
    </div>
    <div class="signature-line">
      <p>Члены счётной комиссии: ______________________ / ______________________ /</p>
    </div>
  </div>

  <div class="footer">
    <p>Протокол сформирован автоматически системой УК</p>
    <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
    ${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}
  </div>
</body>
</html>
`;

  const filename = `protocol_${meeting.number}_${new Date().toISOString().split('T')[0]}.doc`;

  return new Response(docContent, {
    headers: {
      'Content-Type': 'application/msword',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    }
  });
});

// Get protocol data as JSON for frontend DOCX generation
route('GET', '/api/meetings/:meetingId/protocol/data', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(
    `SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique vote records (for participant list) - JOIN with users for actual area
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT v.voter_id, v.voter_name, v.apartment_number,
      COALESCE(u.total_area, v.vote_weight) as vote_weight,
      MIN(v.voted_at) as voted_at
    FROM meeting_vote_records v
    LEFT JOIN users u ON u.id = v.voter_id
    WHERE v.meeting_id = ? AND (v.is_revote = 0 OR v.is_revote IS NULL)
    GROUP BY v.voter_id
    ORDER BY v.voter_name
  `).bind(params.meetingId).all();

  // Get votes by each agenda item (for detailed voting tables) with comments
  const votesByItem: Record<string, any[]> = {};
  for (const item of agendaItems) {
    const { results: itemVotes } = await env.DB.prepare(`
      SELECT
        v.voter_id, v.voter_name, v.apartment_number,
        COALESCE(u.total_area, v.vote_weight) as vote_weight,
        v.choice, v.voted_at,
        c.comment as comment
      FROM meeting_vote_records v
      LEFT JOIN users u ON u.id = v.voter_id
      LEFT JOIN meeting_agenda_comments c ON
        c.agenda_item_id = v.agenda_item_id AND
        c.user_id = v.voter_id
      WHERE v.agenda_item_id = ? AND (v.is_revote = 0 OR v.is_revote IS NULL)
      ORDER BY v.voter_name
    `).bind((item as any).id).all();
    votesByItem[(item as any).id] = itemVotes;
  }

  // Recalculate voted_area from actual unique voters to avoid stale stored data
  const actualVotedArea = voteRecords.reduce((sum: number, r: any) => sum + (Number(r.vote_weight) || 0), 0);
  const actualParticipatedCount = voteRecords.length;
  const totalArea = Number(meeting.total_area) || 1;
  const actualParticipationPercent = (actualVotedArea / totalArea) * 100;

  return json({
    meeting: {
      ...meeting,
      voted_area: actualVotedArea,
      participated_count: actualParticipatedCount,
      participation_percent: Math.min(actualParticipationPercent, 100),
    },
    agendaItems,
    voteRecords,
    votesByItem,
    protocolHash: protocol?.protocol_hash
  });
});

// ==================== AGENDA COMMENTS ROUTES ====================

// Get comments for agenda item
route('GET', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const { results } = await env.DB.prepare(`
    SELECT * FROM meeting_agenda_comments
    WHERE agenda_item_id = ?
    ORDER BY created_at DESC
  `).bind(params.agendaItemId).all();

  return json({ comments: results });
});

// Add comment to agenda item
route('POST', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;

  // Get the meeting_id from agenda item
  const agendaItem = await env.DB.prepare(
    'SELECT meeting_id FROM meeting_agenda_items WHERE id = ?'
  ).bind(params.agendaItemId).first() as any;

  if (!agendaItem) {
    return error('Agenda item not found', 404);
  }

  // Check if meeting is in voting state
  const meeting = await env.DB.prepare(
    'SELECT status FROM meetings WHERE id = ?'
  ).bind(agendaItem.meeting_id).first() as any;

  if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) {
    return error('Comments are only allowed during voting', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_agenda_comments (id, agenda_item_id, user_id, comment, tenant_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    params.agendaItemId,
    authUser.id,
    body.content || body.comment,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_comments WHERE id = ?'
  ).bind(id).first();

  return json({ comment: created }, 201);
});

// Delete own comment
route('DELETE', '/api/comments/:commentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Check ownership
  const comment = await env.DB.prepare(
    'SELECT user_id, agenda_item_id FROM meeting_agenda_comments WHERE id = ?'
  ).bind(params.commentId).first() as any;

  if (!comment) {
    return error('Comment not found', 404);
  }

  // Only owner or admin can delete
  if (comment.user_id !== authUser.id && authUser.role !== 'admin') {
    return error('Not authorized to delete this comment', 403);
  }

  // Check if meeting is still in voting state (need to get meeting_id via agenda_item)
  const agendaItem = await env.DB.prepare(
    'SELECT meeting_id FROM meeting_agenda_items WHERE id = ?'
  ).bind(comment.agenda_item_id).first() as any;

  if (agendaItem) {
    const meeting = await env.DB.prepare(
      'SELECT status FROM meetings WHERE id = ?'
    ).bind(agendaItem.meeting_id).first() as any;

    if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) {
      return error('Cannot delete comments after voting ends', 400);
    }
  }

  await env.DB.prepare('DELETE FROM meeting_agenda_comments WHERE id = ?')
    .bind(params.commentId).run();

  return json({ success: true });
});

} // end registerMeetingRoutes
