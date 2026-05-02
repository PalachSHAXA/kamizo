// POST /api/meetings, PATCH /api/meetings/:id, DELETE /api/meetings/:id
import {
  route, getUser, getTenantId, requireFeature,
  invalidateCache, json, error, generateId, sendPushNotification, createRequestLogger
} from './helpers';

export function registerMeetingMutateRoutes() {
// Meetings: Create
route('POST', '/api/meetings', async (request, env) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const log = createRequestLogger(request);
  try {
    const authUser = await getUser(request, env);
    if (!authUser) return error('Unauthorized', 401);

    let body: any;
    try { body = await request.json(); } catch (e: any) { log.error('JSON parse error', e); return error('Invalid JSON body', 400); }

    const id = generateId();
    const buildingId = body.building_id || body.buildingId;
    if (!buildingId) return error('building_id is required', 400);

    const tenantId = getTenantId(request);
    const settings = await env.DB.prepare('SELECT * FROM meeting_building_settings WHERE building_id = ?').bind(buildingId).first() as any;
    const votingUnit = settings?.voting_unit || 'apartment';
    const quorumPercent = settings?.default_quorum_percent || 50;
    const requireModeration = settings?.require_moderation !== 0;

    const areaResult = await env.DB.prepare(`
      SELECT COALESCE(SUM(total_area), 0) as total_area, COUNT(*) as total_count
      FROM users WHERE building_id = ? AND role = 'resident' AND total_area > 0 ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;
    const totalArea = areaResult?.total_area || 0;
    const totalEligibleCount = areaResult?.total_count || 0;

    const countResult = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM meetings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;
    const meetingNumber = (countResult?.count || 0) + 1;

    const organizerType = body.organizer_type || body.organizerType || 'uk';
    let initialStatus = 'schedule_poll_open';
    if (organizerType === 'resident' && requireModeration) initialStatus = 'pending_moderation';

    const pollDays = settings?.schedule_poll_duration_days || 3;
    const pollEndDate = new Date();
    pollEndDate.setDate(pollEndDate.getDate() + pollDays);
    pollEndDate.setHours(23, 59, 59, 999);
    const schedulePollOpenedAt = initialStatus === 'schedule_poll_open' ? new Date().toISOString() : null;

    try {
      await env.DB.prepare(`
        INSERT INTO meetings (
          id, number, building_id, building_address, description,
          organizer_type, organizer_id, organizer_name, format, status,
          schedule_poll_ends_at, schedule_poll_opened_at, location,
          voting_unit, quorum_percent, allow_revote, require_otp, show_intermediate_results,
          materials, total_area, total_eligible_count, tenant_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, meetingNumber, buildingId, body.building_address || body.buildingAddress || '', body.description || null,
        organizerType, authUser.id, authUser.name, body.format || 'offline', initialStatus,
        pollEndDate.toISOString(), schedulePollOpenedAt, body.location || null,
        votingUnit, quorumPercent, 1, 1, 0,
        JSON.stringify(body.materials || []), totalArea, totalEligibleCount, getTenantId(request)
      ).run();
    } catch (e: any) { log.error('Error inserting meeting', e); return error('Failed to create meeting', 500); }

    const meetingTime = body.meeting_time || body.meetingTime || settings?.default_meeting_time || '19:00';
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + 10);

    try {
      for (let i = 0; i < 3; i++) {
        const optionDate = new Date(baseDate);
        optionDate.setDate(optionDate.getDate() + i);
        const year = optionDate.getFullYear();
        const month = String(optionDate.getMonth() + 1).padStart(2, '0');
        const day = String(optionDate.getDate()).padStart(2, '0');
        const dateTimeStr = `${year}-${month}-${day}T${meetingTime}:00`;
        await env.DB.prepare(`INSERT INTO meeting_schedule_options (id, meeting_id, date_time, tenant_id) VALUES (?, ?, ?, ?)`)
          .bind(generateId(), id, dateTimeStr, getTenantId(request)).run();
      }
    } catch (e: any) { log.error('Error inserting schedule options', e); return error('Failed to create schedule options', 500); }

    const agendaItems = body.agenda_items || body.agendaItems || [];
    try {
      for (let i = 0; i < agendaItems.length; i++) {
        const item = agendaItems[i];
        const attachmentsJson = item.attachments ? (typeof item.attachments === 'string' ? item.attachments : JSON.stringify(item.attachments)) : null;
        await env.DB.prepare(`
          INSERT INTO meeting_agenda_items (id, meeting_id, item_order, title, description, description_extended, attachments, threshold, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(generateId(), id, i + 1, item.title, item.description || null, item.description_extended || item.descriptionExtended || null, attachmentsJson, item.threshold || 'simple_majority', getTenantId(request)).run();
      }
    } catch (e: any) { log.error('Error inserting agenda items', e); return error('Failed to create agenda items', 500); }

    invalidateCache('meetings:');
    const created = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first() as any;

    // Notify eligible residents that a meeting has been created and voting/poll is open.
    // initialStatus drives whether voters are notified — schedule_poll_open or voting_open both qualify.
    if (buildingId && (initialStatus === 'schedule_poll_open' || initialStatus === 'voting_open')) {
      try {
        const { results: residents } = await env.DB.prepare(
          `SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
        ).bind('resident', buildingId, ...(tenantId ? [tenantId] : [])).all();

        const meetingTitleRu = initialStatus === 'voting_open' ? '\u{1F5F3}\u{FE0F} Открыто голосование' : '\u{1F4E2} Новое собрание объявлено';
        const meetingBodyRu = initialStatus === 'voting_open'
          ? 'Новое собрание собственников. Проголосуйте.'
          : `Назначено собрание жильцов дома ${body.building_address || body.buildingAddress || ''}. Примите участие в выборе даты!`;

        for (const resident of residents as any[]) {
          const notifId = generateId();
          env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'), ?)`)
            .bind(notifId, resident.id, meetingTitleRu, meetingBodyRu, JSON.stringify({ meetingId: id, url: '/meetings' }), tenantId)
            .run().catch((err) => { console.error('meeting notification insert failed:', err); });
          sendPushNotification(env, resident.id, {
            title: meetingTitleRu,
            body: meetingBodyRu,
            type: 'meeting', tag: `meeting:${id}`,
            data: { meetingId: id, url: '/meetings' }, requireInteraction: true
          }).catch((err) => { console.error('meeting push notification failed:', err); });
        }
        log.info('Meeting created', { meetingId: id, notifiedResidents: residents.length });
      } catch (e: any) { log.error('Error sending notifications', e); }
    }

    return json({ meeting: created }, 201);
  } catch (e: any) { log.error('Fatal error creating meeting', e); return error('Meeting creation failed', 500); }
});

// Meetings: Update
route('PATCH', '/api/meetings/:id', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'status', db: 'status' }, { api: 'location', db: 'location' }, { api: 'format', db: 'format' },
    { api: 'confirmedDateTime', db: 'confirmed_date_time' }, { api: 'confirmed_date_time', db: 'confirmed_date_time' },
    { api: 'quorumPercent', db: 'quorum_percent' }, { api: 'quorum_percent', db: 'quorum_percent' },
    { api: 'totalEligibleCount', db: 'total_eligible_count' }, { api: 'total_eligible_count', db: 'total_eligible_count' },
    { api: 'participationPercent', db: 'participation_percent' }, { api: 'participation_percent', db: 'participation_percent' },
    { api: 'cancellationReason', db: 'cancellation_reason' }, { api: 'cancellation_reason', db: 'cancellation_reason' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) { updates.push(`${field.db} = ?`); values.push(body[field.api]); }
  }
  if (body.materials) { updates.push('materials = ?'); values.push(JSON.stringify(body.materials)); }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE meetings SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Delete
route('DELETE', '/api/meetings/:id', async (request, env, params) => {
  const fc = await requireFeature('meetings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const log = createRequestLogger(request);
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!meeting) return error('Meeting not found', 404);

  const { results: agendaItems } = await env.DB.prepare('SELECT id FROM meeting_agenda_items WHERE meeting_id = ?').bind(params.id).all();
  const agendaIds = agendaItems.map((a: any) => a.id);

  try {
    if (agendaIds.length > 0) {
      const placeholders = agendaIds.map(() => '?').join(',');
      await env.DB.prepare(`DELETE FROM meeting_agenda_comments WHERE agenda_item_id IN (${placeholders})`).bind(...agendaIds).run();
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
    await env.DB.prepare(`DELETE FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
    invalidateCache('meetings:');
    return json({ success: true });
  } catch (err: any) { log.error('Meeting delete error', err); return error('Failed to delete meeting', 500); }
});

} // end registerMeetingMutateRoutes
