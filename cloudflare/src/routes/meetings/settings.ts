// Building meeting settings, voting units, eligible voters, vote records

import {
  route, getUser, getTenantId, requireFeature,
  json, error, generateId, isManagement
} from './helpers';

export function registerSettingsRoutes() {

// Building settings: Get
route('GET', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const settings = await env.DB.prepare(`SELECT * FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();
  if (!settings) {
    return json({ settings: { building_id: params.buildingId, voting_unit: 'apartment', default_quorum_percent: 50, schedule_poll_duration_days: 3, voting_duration_hours: 48, allow_resident_initiative: 1, require_moderation: 1, default_meeting_time: '19:00', reminder_hours_before: [48, 2], notification_channels: ['in_app', 'push'] } });
  }
  return json({ settings: { ...settings, reminder_hours_before: settings.reminder_hours_before ? JSON.parse(settings.reminder_hours_before as string) : [48, 2], notification_channels: settings.notification_channels ? JSON.parse(settings.notification_channels as string) : ['in_app', 'push'] } });
});

// Building settings: Update
route('PATCH', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') return error('Admin access required', 403);

  const body = await request.json() as any;
  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(`SELECT building_id FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  if (existing) {
    const updates: string[] = [], values: any[] = [];
    const fields = [
      { api: 'votingUnit', db: 'voting_unit' }, { api: 'voting_unit', db: 'voting_unit' },
      { api: 'defaultQuorumPercent', db: 'default_quorum_percent' }, { api: 'default_quorum_percent', db: 'default_quorum_percent' },
      { api: 'schedulePollDurationDays', db: 'schedule_poll_duration_days' }, { api: 'schedule_poll_duration_days', db: 'schedule_poll_duration_days' },
      { api: 'votingDurationHours', db: 'voting_duration_hours' }, { api: 'voting_duration_hours', db: 'voting_duration_hours' },
      { api: 'defaultMeetingTime', db: 'default_meeting_time' }, { api: 'default_meeting_time', db: 'default_meeting_time' },
    ];
    for (const field of fields) { if (body[field.api] !== undefined) { updates.push(`${field.db} = ?`); values.push(body[field.api]); } }
    if (body.allowResidentInitiative !== undefined || body.allow_resident_initiative !== undefined) { updates.push('allow_resident_initiative = ?'); values.push((body.allowResidentInitiative || body.allow_resident_initiative) ? 1 : 0); }
    if (body.requireModeration !== undefined || body.require_moderation !== undefined) { updates.push('require_moderation = ?'); values.push((body.requireModeration || body.require_moderation) ? 1 : 0); }
    if (body.reminderHoursBefore || body.reminder_hours_before) { updates.push('reminder_hours_before = ?'); values.push(JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before)); }
    if (body.notificationChannels || body.notification_channels) { updates.push('notification_channels = ?'); values.push(JSON.stringify(body.notificationChannels || body.notification_channels)); }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(params.buildingId);
      await env.DB.prepare(`UPDATE meeting_building_settings SET ${updates.join(', ')} WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values, ...(tenantId ? [tenantId] : [])).run();
    }
  } else {
    await env.DB.prepare(`INSERT INTO meeting_building_settings (building_id, voting_unit, default_quorum_percent, schedule_poll_duration_days, voting_duration_hours, allow_resident_initiative, require_moderation, default_meeting_time, reminder_hours_before, notification_channels, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(params.buildingId, body.votingUnit || body.voting_unit || 'apartment', body.defaultQuorumPercent || body.default_quorum_percent || 50, body.schedulePollDurationDays || body.schedule_poll_duration_days || 3, body.votingDurationHours || body.voting_duration_hours || 48, (body.allowResidentInitiative || body.allow_resident_initiative) !== false ? 1 : 0, (body.requireModeration || body.require_moderation) !== false ? 1 : 0, body.defaultMeetingTime || body.default_meeting_time || '19:00', JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before || [48, 2]), JSON.stringify(body.notificationChannels || body.notification_channels || ['in_app', 'push']), getTenantId(request)).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();
  return json({ settings: updated });
});

// Voting units: List
route('GET', '/api/meetings/voting-units', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id') || url.searchParams.get('buildingId');
  if (!buildingId) return error('building_id required', 400);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`SELECT * FROM meeting_voting_units WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY apartment_number LIMIT 500`).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();
  return json({ votingUnits: results.map((u: any) => ({ ...u, coOwnerIds: u.co_owner_ids ? JSON.parse(u.co_owner_ids) : [] })) });
});

// Voting units: Create
route('POST', '/api/meetings/voting-units', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);

  const body = await request.json() as any;
  const id = generateId();
  await env.DB.prepare(`INSERT INTO meeting_voting_units (id, building_id, apartment_id, apartment_number, owner_id, owner_name, co_owner_ids, ownership_share, total_area, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, body.building_id || body.buildingId, body.apartment_id || body.apartmentId || null, body.apartment_number || body.apartmentNumber, body.owner_id || body.ownerId || null, body.owner_name || body.ownerName || null, JSON.stringify(body.co_owner_ids || body.coOwnerIds || []), body.ownership_share || body.ownershipShare || 100, body.total_area || body.totalArea || null, getTenantId(request)).run();

  const created = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(id).first();
  return json({ votingUnit: created }, 201);
});

// Voting units: Verify
route('POST', '/api/meetings/voting-units/:id/verify', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);

  await env.DB.prepare(`UPDATE meeting_voting_units SET is_verified = 1, verified_at = datetime('now'), verified_by = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(authUser!.id, params.id, ...(tenantId ? [tenantId] : [])).run();
  const updated = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(params.id).first();
  return json({ votingUnit: updated });
});

// Eligible voters: Set for meeting
route('POST', '/api/meetings/:meetingId/eligible-voters', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);

  const body = await request.json() as any;
  const voters = body.voters || [];
  await env.DB.prepare('DELETE FROM meeting_eligible_voters WHERE meeting_id = ?').bind(params.meetingId).run();
  for (const voter of voters) {
    await env.DB.prepare(`INSERT INTO meeting_eligible_voters (meeting_id, user_id, apartment_id, ownership_share, tenant_id) VALUES (?, ?, ?, ?, ?)`).bind(params.meetingId, voter.user_id || voter.userId, voter.apartment_id || voter.apartmentId || null, voter.ownership_share || voter.ownershipShare || 100, getTenantId(request)).run();
  }
  await env.DB.prepare(`UPDATE meetings SET total_eligible_count = ?, updated_at = datetime('now') WHERE id = ?`).bind(voters.length, params.meetingId).run();
  return json({ success: true, count: voters.length });
});

// Get vote records for meeting (audit)
route('GET', '/api/meetings/:meetingId/vote-records', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);
  if (tenantId) { const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first(); if (!m) return error('Meeting not found', 404); }

  const { results } = await env.DB.prepare('SELECT * FROM meeting_vote_records WHERE meeting_id = ? ORDER BY voted_at LIMIT 500').bind(params.meetingId).all();
  return json({ voteRecords: results });
});

} // end registerSettingsRoutes
