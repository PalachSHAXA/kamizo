// Training System routes — extracted from index.ts
// Contains: training partners, proposals, voting, registration, attendance, feedback, notifications, settings, stats

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, requireFeature } from '../middleware/tenant';
import { json, error, generateId, isManagement, isAdminLevel } from '../utils/helpers';

export function registerTrainingRoutes() {

// ==================== TRAINING SYSTEM ROUTES ====================

// Training Partners: List all
route('GET', '/api/training/partners', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  let whereClause = tenantId ? 'WHERE tenant_id = ?' : '';
  const params: any[] = tenantId ? [tenantId] : [];

  if (activeOnly) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'is_active = 1';
  }

  const query = `SELECT * FROM training_partners ${whereClause} ORDER BY name LIMIT 500`;
  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ partners: results });
});

// Training Partners: Get by ID
route('GET', '/api/training/partners/:id', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const partner = await env.DB.prepare(`SELECT * FROM training_partners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!partner) {
    return error('Partner not found', 404);
  }
  return json({ partner });
});

// Training Partners: Create
route('POST', '/api/training/partners', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO training_partners (
      id, name, position, specialization, email, phone, bio, avatar_url, is_active, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.position || null,
    body.specialization || null,
    body.email || null,
    body.phone || null,
    body.bio || null,
    body.avatar_url || body.avatarUrl || null,
    body.is_active !== false ? 1 : 0,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?').bind(id).first();
  return json({ partner: created }, 201);
});

// Training Partners: Update
route('PATCH', '/api/training/partners/:id', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'name', db: 'name' },
    { api: 'position', db: 'position' },
    { api: 'specialization', db: 'specialization' },
    { api: 'email', db: 'email' },
    { api: 'phone', db: 'phone' },
    { api: 'bio', db: 'bio' },
    { api: 'avatarUrl', db: 'avatar_url' },
    { api: 'avatar_url', db: 'avatar_url' },
    { api: 'isActive', db: 'is_active' },
    { api: 'is_active', db: 'is_active' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      if (field.db === 'is_active') {
        values.push(body[field.api] ? 1 : 0);
      } else {
        values.push(body[field.api]);
      }
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    const tenantId = getTenantId(request);
    await env.DB.prepare(`
      UPDATE training_partners SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?').bind(params.id).first();
  return json({ partner: updated });
});

// Training Partners: Delete
route('DELETE', '/api/training/partners/:id', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM training_partners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Training Proposals: List
route('GET', '/api/training/proposals', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const partnerId = url.searchParams.get('partner_id') || url.searchParams.get('partnerId');
  const authorId = url.searchParams.get('author_id') || url.searchParams.get('authorId');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM training_proposals WHERE 1=1';
  const params: any[] = [];

  if (tenantId) {
    query += ' AND tenant_id = ?';
    params.push(tenantId);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (partnerId) {
    query += ' AND partner_id = ?';
    params.push(partnerId);
  }
  if (authorId) {
    query += ' AND author_id = ?';
    params.push(authorId);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Get vote counts and registered counts for each proposal
  const proposalsWithCounts = await Promise.all(results.map(async (p: any) => {
    const [voteCount, regCount] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM training_votes WHERE proposal_id = ?').bind(p.id).first(),
      env.DB.prepare('SELECT COUNT(*) as count FROM training_registrations WHERE proposal_id = ?').bind(p.id).first()
    ]);
    return {
      ...p,
      vote_count: (voteCount as any)?.count || 0,
      registered_count: (regCount as any)?.count || 0,
      preferred_time_slots: p.preferred_time_slots ? JSON.parse(p.preferred_time_slots) : []
    };
  }));

  return json({ proposals: proposalsWithCounts });
});

// Training Proposals: Get by ID with full details
route('GET', '/api/training/proposals/:id', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(`SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  // Get votes, registrations, feedback
  const [votes, registrations, feedback] = await Promise.all([
    env.DB.prepare('SELECT * FROM training_votes WHERE proposal_id = ? ORDER BY voted_at DESC LIMIT 500')
      .bind(params.id).all(),
    env.DB.prepare('SELECT * FROM training_registrations WHERE proposal_id = ? ORDER BY registered_at DESC LIMIT 500')
      .bind(params.id).all(),
    env.DB.prepare('SELECT * FROM training_feedback WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 500')
      .bind(params.id).all()
  ]);

  return json({
    proposal: {
      ...proposal,
      preferred_time_slots: proposal.preferred_time_slots ? JSON.parse(proposal.preferred_time_slots) : [],
      votes: votes.results,
      registrations: registrations.results,
      feedback: feedback.results
    }
  });
});

// Training Proposals: Create
route('POST', '/api/training/proposals', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY: Add tenant_id on creation
  const tenantId = getTenantId(request);

  // Get default vote threshold from settings
  const thresholdSetting = await env.DB.prepare(
    `SELECT value FROM training_settings WHERE key = 'vote_threshold' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).first() as any;
  const voteThreshold = parseInt(thresholdSetting?.value || '5');

  // Get partner name (verify belongs to tenant)
  const partner = await env.DB.prepare(`SELECT name FROM training_partners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(body.partner_id || body.partnerId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!partner) {
    return error('Partner not found', 404);
  }

  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO training_proposals (
      id, topic, description,
      author_id, author_name, is_author_anonymous,
      partner_id, partner_name,
      format, preferred_time_slots, vote_threshold, status, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voting', ?)
  `).bind(
    id,
    body.topic,
    body.description || null,
    authUser.id,
    authUser.name,
    body.is_author_anonymous || body.isAuthorAnonymous ? 1 : 0,
    body.partner_id || body.partnerId,
    partner.name,
    body.format || 'offline',
    JSON.stringify(body.preferred_time_slots || body.preferredTimeSlots || []),
    voteThreshold,
    tenantId || ''
  ).run();

  // Create notification for all employees about new proposal
  const notifyAll = await env.DB.prepare(
    `SELECT value FROM training_settings WHERE key = 'notify_all_on_new_proposal' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).first() as any;

  if (notifyAll?.value === 'true') {
    const notifId = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message, tenant_id
      ) VALUES (?, 'new_proposal', ?, 'all', 'employee', ?, ?, ?)
    `).bind(
      notifId, id,
      'Новое предложение тренинга',
      `Предложена тема: "${body.topic}"`,
      tenantId || ''
    ).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(id).first();
  return json({ proposal: created }, 201);
});

// Training Proposals: Update
route('PATCH', '/api/training/proposals/:id', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'topic', db: 'topic' },
    { api: 'description', db: 'description' },
    { api: 'format', db: 'format' },
    { api: 'status', db: 'status' },
    { api: 'scheduledDate', db: 'scheduled_date' },
    { api: 'scheduled_date', db: 'scheduled_date' },
    { api: 'scheduledTime', db: 'scheduled_time' },
    { api: 'scheduled_time', db: 'scheduled_time' },
    { api: 'scheduledLocation', db: 'scheduled_location' },
    { api: 'scheduled_location', db: 'scheduled_location' },
    { api: 'scheduledLink', db: 'scheduled_link' },
    { api: 'scheduled_link', db: 'scheduled_link' },
    { api: 'maxParticipants', db: 'max_participants' },
    { api: 'max_participants', db: 'max_participants' },
    { api: 'partnerResponse', db: 'partner_response' },
    { api: 'partner_response', db: 'partner_response' },
    { api: 'partnerResponseNote', db: 'partner_response_note' },
    { api: 'partner_response_note', db: 'partner_response_note' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      values.push(body[field.api]);
    }
  }

  if (body.preferredTimeSlots || body.preferred_time_slots) {
    updates.push('preferred_time_slots = ?');
    values.push(JSON.stringify(body.preferredTimeSlots || body.preferred_time_slots));
  }

  if (body.partnerResponse || body.partner_response) {
    updates.push("partner_response_at = datetime('now')");
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    const tenantId = getTenantId(request);
    await env.DB.prepare(`
      UPDATE training_proposals SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Proposals: Delete
route('DELETE', '/api/training/proposals/:id', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Training Proposals: Schedule
route('POST', '/api/training/proposals/:id/schedule', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const existingProposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existingProposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE training_proposals
    SET status = 'scheduled',
        scheduled_date = ?,
        scheduled_time = ?,
        scheduled_location = ?,
        scheduled_link = ?,
        max_participants = ?,
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.scheduledDate || body.scheduled_date,
    body.scheduledTime || body.scheduled_time,
    body.scheduledLocation || body.scheduled_location || null,
    body.scheduledLink || body.scheduled_link || null,
    body.maxParticipants || body.max_participants || null,
    params.id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  // Notify all voters about scheduling
  const proposal = await env.DB.prepare(`SELECT topic FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  const { results: votes } = await env.DB.prepare('SELECT DISTINCT voter_id FROM training_votes WHERE proposal_id = ? LIMIT 500')
    .bind(params.id).all();

  for (const vote of votes) {
    const notifId = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message, tenant_id
      ) VALUES (?, 'training_scheduled', ?, ?, 'employee', ?, ?, ?)
    `).bind(
      notifId, params.id, (vote as any).voter_id,
      'Тренинг запланирован',
      `Тренинг "${proposal.topic}" состоится ${body.scheduledDate || body.scheduled_date} в ${body.scheduledTime || body.scheduled_time}`,
      tenantId || ''
    ).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Proposals: Complete
route('POST', '/api/training/proposals/:id/complete', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const existingProposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existingProposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  // Get actual participants count
  const regCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM training_registrations WHERE proposal_id = ? AND attended = 1'
  ).bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE training_proposals
    SET status = 'completed',
        completed_at = datetime('now'),
        actual_participants_count = ?,
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.actualParticipantsCount || body.actual_participants_count || regCount?.count || 0,
    params.id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  // Update partner's trainings_conducted count
  const proposal = await env.DB.prepare(`SELECT partner_id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (proposal) {
    await env.DB.prepare(`
      UPDATE training_partners
      SET trainings_conducted = trainings_conducted + 1, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(proposal.partner_id, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ proposal: updated });
});

// Training Votes: Add vote
route('POST', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Verify proposal belongs to tenant
  const proposal = await env.DB.prepare(
    `SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  // Check if already voted
  const existing = await env.DB.prepare(
    'SELECT id FROM training_votes WHERE proposal_id = ? AND voter_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Already voted', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_votes (
      id, proposal_id, voter_id, voter_name, participation_intent, is_anonymous, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.proposalId,
    authUser.id,
    authUser.name,
    body.participationIntent || body.participation_intent || 'definitely',
    body.isAnonymous || body.is_anonymous ? 1 : 0,
    tenantId || ''
  ).run();

  // Check if threshold reached
  const voteCount = await env.DB.prepare('SELECT COUNT(*) as count FROM training_votes WHERE proposal_id = ?')
    .bind(params.proposalId).first() as any;

  if (proposal && proposal.status === 'voting' && voteCount.count >= proposal.vote_threshold) {
    // Update status to review
    await env.DB.prepare(`
      UPDATE training_proposals SET status = 'review', updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).run();

    // Notify admin
    const notifId1 = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message, tenant_id
      ) VALUES (?, 'threshold_reached', ?, 'admin', 'admin', ?, ?, ?)
    `).bind(
      notifId1, params.proposalId,
      'Порог голосов достигнут',
      `Предложение "${proposal.topic}" набрало необходимое количество голосов`,
      tenantId || ''
    ).run();

    // Notify partner
    const notifId2 = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message, tenant_id
      ) VALUES (?, 'threshold_reached', ?, ?, 'partner', ?, ?, ?)
    `).bind(
      notifId2, params.proposalId, proposal.partner_id,
      'Приглашение провести тренинг',
      `Вас выбрали лектором для тренинга "${proposal.topic}"`,
      tenantId || ''
    ).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_votes WHERE id = ?').bind(id).first();
  return json({ vote: created }, 201);
});

// Training Votes: Remove vote
route('DELETE', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  await env.DB.prepare(
    'DELETE FROM training_votes WHERE proposal_id = ? AND voter_id = ?'
  ).bind(params.proposalId, authUser.id).run();

  return json({ success: true });
});

// Training Votes: Get for proposal
route('GET', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM training_votes WHERE proposal_id = ? ORDER BY voted_at DESC LIMIT 500'
  ).bind(params.proposalId).all();

  return json({ votes: results });
});

// Training Registrations: Register
route('POST', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  // Check if already registered
  const existing = await env.DB.prepare(
    'SELECT id FROM training_registrations WHERE proposal_id = ? AND user_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Already registered', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_registrations (id, proposal_id, user_id, user_name, tenant_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, params.proposalId, authUser.id, authUser.name, tenantId || '').run();

  const created = await env.DB.prepare('SELECT * FROM training_registrations WHERE id = ?').bind(id).first();
  return json({ registration: created }, 201);
});

// Training Registrations: Unregister
route('DELETE', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  await env.DB.prepare(
    'DELETE FROM training_registrations WHERE proposal_id = ? AND user_id = ?'
  ).bind(params.proposalId, authUser.id).run();

  return json({ success: true });
});

// Training Registrations: Confirm attendance
route('POST', '/api/training/proposals/:proposalId/attendance/:userId', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  await env.DB.prepare(`
    UPDATE training_registrations
    SET attended = 1, attendance_confirmed_at = datetime('now')
    WHERE proposal_id = ? AND user_id = ?
  `).bind(params.proposalId, params.userId).run();

  return json({ success: true });
});

// Training Feedback: Add
route('POST', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  // Check if already submitted feedback
  const existing = await env.DB.prepare(
    'SELECT id FROM training_feedback WHERE proposal_id = ? AND reviewer_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Feedback already submitted', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_feedback (
      id, proposal_id, reviewer_id, reviewer_name, is_anonymous,
      rating, content_rating, presenter_rating, usefulness_rating, comment, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.proposalId,
    authUser.id,
    authUser.name,
    body.isAnonymous || body.is_anonymous ? 1 : 0,
    body.rating,
    body.contentRating || body.content_rating || null,
    body.presenterRating || body.presenter_rating || null,
    body.usefulnessRating || body.usefulness_rating || null,
    body.comment || null,
    tenantId || ''
  ).run();

  // Update partner's average rating (scoped to tenant)
  const avgRating = await env.DB.prepare(`
    SELECT AVG(rating) as avg FROM training_feedback f
    JOIN training_proposals p ON f.proposal_id = p.id
    WHERE p.partner_id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
  `).bind(proposal.partner_id, ...(tenantId ? [tenantId] : [])).first() as any;

  await env.DB.prepare(`
    UPDATE training_partners SET average_rating = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(avgRating?.avg || 0, proposal.partner_id, ...(tenantId ? [tenantId] : [])).run();

  const created = await env.DB.prepare('SELECT * FROM training_feedback WHERE id = ?').bind(id).first();
  return json({ feedback: created }, 201);
});

// Training Feedback: Get for proposal
route('GET', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM training_feedback WHERE proposal_id = ? ORDER BY created_at DESC LIMIT 500'
  ).bind(params.proposalId).all();

  return json({ feedback: results });
});

// Training Notifications: Get for user
route('GET', '/api/training/notifications', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id via proposals table
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let query = `
    SELECT tn.* FROM training_notifications tn
    WHERE (tn.recipient_id = ? OR tn.recipient_id = 'all')
    ${tenantId ? 'AND tn.tenant_id = ?' : ''}
  `;

  if (isAdminLevel(authUser)) {
    query = `
      SELECT tn.* FROM training_notifications tn
      WHERE (tn.recipient_id = ? OR tn.recipient_id = 'all' OR tn.recipient_id = 'admin')
      ${tenantId ? 'AND tn.tenant_id = ?' : ''}
    `;
  }

  if (unreadOnly) {
    query += ' AND tn.is_read = 0';
  }

  query += ' ORDER BY tn.created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();
  return json({ notifications: results });
});

// Training Notifications: Mark as read
route('POST', '/api/training/notifications/:id/read', async (request, env, params) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify notification belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const notif = await env.DB.prepare(`
      SELECT id FROM training_notifications
      WHERE id = ? AND tenant_id = ?
    `).bind(params.id, tenantId).first();

    if (!notif) {
      return error('Notification not found', 404);
    }
  }

  await env.DB.prepare('UPDATE training_notifications SET is_read = 1 WHERE id = ?')
    .bind(params.id).run();

  return json({ success: true });
});

// Training Notifications: Mark all as read
route('POST', '/api/training/notifications/read-all', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Only update notifications belonging to tenant
  const tenantId = getTenantId(request);

  if (tenantId) {
    await env.DB.prepare(`
      UPDATE training_notifications SET is_read = 1
      WHERE (recipient_id = ? OR recipient_id = 'all')
      AND tenant_id = ?
    `).bind(authUser.id, tenantId).run();

    if (isAdminLevel(authUser)) {
      await env.DB.prepare(`
        UPDATE training_notifications SET is_read = 1
        WHERE recipient_id = 'admin'
        AND tenant_id = ?
      `).bind(tenantId).run();
    }
  } else {
    await env.DB.prepare(`
      UPDATE training_notifications SET is_read = 1
      WHERE recipient_id = ? OR recipient_id = 'all'
    `).bind(authUser.id).run();

    if (isAdminLevel(authUser)) {
      await env.DB.prepare(`
        UPDATE training_notifications SET is_read = 1 WHERE recipient_id = 'admin'
      `).run();
    }
  }

  return json({ success: true });
});

// Training Settings: Get all
route('GET', '/api/training/settings', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM training_settings ${tenantId ? 'WHERE tenant_id = ?' : ''} LIMIT 500`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  // Convert to object
  const settings: Record<string, any> = {};
  for (const row of results) {
    const r = row as any;
    // Parse boolean values
    if (r.value === 'true') settings[r.key] = true;
    else if (r.value === 'false') settings[r.key] = false;
    else if (!isNaN(Number(r.value))) settings[r.key] = Number(r.value);
    else settings[r.key] = r.value;
  }

  return json({ settings });
});

// Training Settings: Update
route('PATCH', '/api/training/settings', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as any;

  for (const [key, value] of Object.entries(body)) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO training_settings (key, value, updated_at, tenant_id)
      VALUES (?, ?, datetime('now'), ?)
    `).bind(key, String(value), tenantId || '').run();
  }

  return json({ success: true });
});

// Training Stats
route('GET', '/api/training/stats', async (request, env) => {
  const fc = await requireFeature('trainings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const [
    totalProposals,
    votingProposals,
    scheduledTrainings,
    completedTrainings,
    totalVotes,
    totalRegistrations,
    avgRating
  ] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals ${tenantId ? 'WHERE tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals WHERE status = 'voting' ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals WHERE status = 'scheduled' ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals WHERE status = 'completed' ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_votes tv JOIN training_proposals tp ON tv.proposal_id = tp.id ${tenantId ? 'WHERE tp.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_registrations tr JOIN training_proposals tp ON tr.proposal_id = tp.id ${tenantId ? 'WHERE tp.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT AVG(tf.rating) as avg FROM training_feedback tf JOIN training_proposals tp ON tf.proposal_id = tp.id ${tenantId ? 'WHERE tp.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first()
  ]);

  return json({
    stats: {
      totalProposals: (totalProposals as any)?.count || 0,
      votingProposals: (votingProposals as any)?.count || 0,
      scheduledTrainings: (scheduledTrainings as any)?.count || 0,
      completedTrainings: (completedTrainings as any)?.count || 0,
      totalVotes: (totalVotes as any)?.count || 0,
      totalParticipants: (totalRegistrations as any)?.count || 0,
      averageRating: (avgRating as any)?.avg || 0
    }
  });
});

} // end registerTrainingRoutes
