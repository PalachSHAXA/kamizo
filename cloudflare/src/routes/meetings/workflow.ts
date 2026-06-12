// Workflow transitions: submit, approve, reject, open-schedule-poll, confirm-schedule, open-voting, cancel

import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, generateId, isManagement,
  sendPushNotification, getMeetingWithDetails
} from './helpers';

export function registerWorkflowRoutes() {

// Submit for moderation
route('POST', '/api/meetings/:id/submit', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  // Sprint 61 P0: organizer or management only. Was authorising ANY logged-in
  // user — and on the main domain (tenantId === null) the WHERE clause would
  // even match meetings in other tenants.
  const meetingPre = await env.DB.prepare(
    `SELECT organizer_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meetingPre) return error('Meeting not found', 404);
  if (meetingPre.organizer_id !== authUser.id && !isManagement(authUser)) {
    return error('Only the organizer or management can submit this meeting', 403);
  }

  await env.DB.prepare(`UPDATE meetings SET status = 'pending_moderation', updated_at = datetime('now') WHERE id = ? AND status = 'draft' ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Approve
route('POST', '/api/meetings/:id/approve', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  await env.DB.prepare(`
    UPDATE meetings SET status = 'schedule_poll_open', moderated_at = datetime('now'), moderated_by = ?, schedule_poll_opened_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(authUser!.id, params.id, ...(tenantId ? [tenantId] : [])).run();
  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(`SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind('resident', meeting.building_id, ...(tenantId ? [tenantId] : [])).all();
    for (const resident of residents as any[]) {
      const notifId = generateId();
      await env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at) VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))`)
        .bind(notifId, resident.id, '\u{1F4E2} Новое собрание объявлено', `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`, JSON.stringify({ meetingId: params.id, url: '/meetings' })).run();
      sendPushNotification(env, resident.id, { title: '\u{1F4E2} Новое собрание объявлено', body: `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`, type: 'meeting', tag: `meeting-announced-${params.id}`, data: { meetingId: params.id, url: '/meetings' }, requireInteraction: true }).catch((err) => { console.error('fire-and-forget failed:', err); });
    }
  }
  return json({ meeting: updated });
});

// Reject
route('POST', '/api/meetings/:id/reject', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  await env.DB.prepare(`UPDATE meetings SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?, updated_at = datetime('now') WHERE id = ? AND status = 'pending_moderation' ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(body.reason || 'Rejected by moderator', params.id, ...(tenantId ? [tenantId] : [])).run();
  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (updated?.building_id) {
    const { results: residents } = await env.DB.prepare(`SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(updated.building_id, ...(tenantId ? [tenantId] : [])).all();
    const rejectBody = `Собрание "${updated.title || ''}" отклонено. Причина: ${body.reason || 'не указана'}`;
    for (const resident of (residents || []) as any[]) {
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting_rejected', ?, ?, ?, 0, datetime('now'), ?)`).bind(generateId(), resident.id, '\u{274C} Собрание отклонено', rejectBody, JSON.stringify({ meeting_id: params.id }), tenantId).run().catch(() => {});
      sendPushNotification(env, resident.id, { title: '\u{274C} Собрание отклонено', body: rejectBody, type: 'meeting_rejected', tag: `meeting-rejected-${params.id}`, data: { meetingId: params.id, url: '/meetings' }, requireInteraction: false }).catch((err) => { console.error('fire-and-forget failed:', err); });
    }
  }
  return json({ meeting: updated });
});

// Open schedule poll
route('POST', '/api/meetings/:id/open-schedule-poll', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);

  // Sprint 61 P0: was no role check + return SELECT had no tenant filter →
  // cross-tenant escalation. Now management-only + tenant-scoped read-back.
  await env.DB.prepare(`UPDATE meetings SET status = 'schedule_poll_open', schedule_poll_opened_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status IN ('draft', 'pending_moderation') ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Confirm schedule
route('POST', '/api/meetings/:id/confirm-schedule', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);
  if (tenantId) {
    const mtg = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.id, tenantId).first();
    if (!mtg) return error('Meeting not found', 404);
  }

  const body = await request.json() as any;
  const selectedOptionId = body.option_id || body.optionId;
  let confirmedDateTime: string;

  if (selectedOptionId) {
    const option = await env.DB.prepare('SELECT date_time FROM meeting_schedule_options WHERE id = ?').bind(selectedOptionId).first() as any;
    confirmedDateTime = option?.date_time;
  } else {
    const { results } = await env.DB.prepare(`
      SELECT o.id, o.date_time, COUNT(v.id) as vote_count, COALESCE(SUM(v.vote_weight), 0) as vote_weight_total
      FROM meeting_schedule_options o LEFT JOIN meeting_schedule_votes v ON o.id = v.option_id
      WHERE o.meeting_id = ? GROUP BY o.id ORDER BY vote_weight_total DESC, vote_count DESC LIMIT 1
    `).bind(params.id).all();
    confirmedDateTime = (results[0] as any)?.date_time;
  }
  if (!confirmedDateTime) return error('No schedule option found', 400);

  await env.DB.prepare(`UPDATE meetings SET status = 'schedule_confirmed', confirmed_date_time = ?, schedule_confirmed_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND status = 'schedule_poll_open'`).bind(confirmedDateTime, params.id).run();
  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Open voting
route('POST', '/api/meetings/:id/open-voting', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Admin/Manager access required', 403);
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  let totalArea = meeting.total_area || 0;
  let totalEligibleCount = meeting.total_eligible_count || 0;
  if (meeting.building_id && totalArea <= 0) {
    const buildingStats = await env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_area), 0) as total_area FROM users WHERE building_id = ? AND role = 'resident' AND total_area > 0 ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(meeting.building_id, ...(tenantId ? [tenantId] : [])).first() as any;
    totalArea = buildingStats?.total_area || 0;
    totalEligibleCount = buildingStats?.count || 0;
  }

  await env.DB.prepare(`UPDATE meetings SET status = 'voting_open', voting_opened_at = datetime('now'), total_area = ?, total_eligible_count = ?, updated_at = datetime('now') WHERE id = ? AND status = 'schedule_confirmed'`).bind(totalArea, totalEligibleCount, params.id).run();
  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(`SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind('resident', meeting.building_id, ...(tenantId ? [tenantId] : [])).all();
    // Open-voting previously only fired sendPushNotification. Native
    // push isn't wired yet (no FCM/APNs config), so the bell icon never
    // updated when a manager opened voting on an existing meeting —
    // residents had no way to know voting was open. Insert the in-app
    // row alongside push, mirroring crud-mutate.ts:118 on meeting
    // create.
    const openVotingTitle = '\u{1F5F3}\u{FE0F} Голосование открыто!';
    const openVotingBody = `Голосование на собрании жильцов дома ${meeting.building_address || ''} началось. Примите участие!`;
    for (const resident of residents as any[]) {
      const notifId = generateId();
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(notifId, resident.id, openVotingTitle, openVotingBody, JSON.stringify({ meetingId: params.id, url: '/meetings' }), tenantId)
        .run().catch((err) => { console.error('open-voting in-app notification insert failed:', err); });
      sendPushNotification(env, resident.id, { title: openVotingTitle, body: openVotingBody, type: 'meeting', tag: `meeting-voting-${params.id}`, data: { meetingId: params.id, url: '/meetings' }, requireInteraction: true }).catch((err) => { console.error('fire-and-forget failed:', err); });
    }
  }
  return json({ meeting: updated });
});

// Cancel
route('POST', '/api/meetings/:id/cancel', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  // Sprint 61 P0: was zero-guarded. Any resident from another building
  // could cancel a meeting in protocol_approved state and push-notify the
  // entire affected building. Restrict to management or organizer + only
  // non-terminal statuses.
  const meetingPre = await env.DB.prepare(
    `SELECT organizer_id, status FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meetingPre) return error('Meeting not found', 404);
  if (meetingPre.organizer_id !== authUser.id && !isManagement(authUser)) {
    return error('Only the organizer or management can cancel this meeting', 403);
  }
  const cancellableStatuses = ['draft', 'pending_moderation', 'schedule_poll_open', 'schedule_confirmed', 'voting_open'];
  if (!cancellableStatuses.includes(meetingPre.status)) {
    return error(`Cannot cancel meeting in '${meetingPre.status}' state`, 409);
  }

  await env.DB.prepare(`UPDATE meetings SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(body.reason || 'Cancelled', params.id, ...(tenantId ? [tenantId] : [])).run();
  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  if (updated?.building_id) {
    const { results: residentsCancel } = await env.DB.prepare(`SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(updated.building_id, ...(tenantId ? [tenantId] : [])).all();
    const cancelBody = `Собрание "${updated.title || ''}" отменено. ${body.reason ? 'Причина: ' + body.reason : ''}`;
    for (const resident of (residentsCancel || []) as any[]) {
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting_cancelled', ?, ?, ?, 0, datetime('now'), ?)`).bind(generateId(), resident.id, '\u{274C} Собрание отменено', cancelBody, JSON.stringify({ meeting_id: params.id }), tenantId).run().catch(() => {});
      sendPushNotification(env, resident.id, { title: '\u{274C} Собрание отменено', body: cancelBody, type: 'meeting_cancelled', tag: `meeting-cancelled-${params.id}`, data: { meetingId: params.id, url: '/meetings' }, requireInteraction: true }).catch((err) => { console.error('fire-and-forget failed:', err); });
    }
  }
  return json({ meeting: updated });
});

} // end registerWorkflowRoutes
