import { getUser } from '../middleware/auth';
import { getTenantId, requireFeature } from '../middleware/tenant';
import { route } from '../router';
import { error, generateId, isManagement, json } from '../utils/helpers';

const DEFAULT_SETTINGS = {
  vote_threshold: 5,
  allow_anonymous_proposals: true,
  allow_anonymous_votes: true,
  allow_anonymous_feedback: true,
  notify_all_on_new_proposal: false,
  auto_close_after_days: 30,
};

type TrainingUser = { id: string; name: string; role: string };

function normalizedStatus(status: string): string {
  return status === 'pending' ? 'voting' : status;
}

function datePart(value: unknown): string | null {
  return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null;
}

function timePart(value: unknown): string | null {
  return typeof value === 'string' && value.includes('T') ? value.slice(11, 16) : null;
}

function projectPartner(row: any): Record<string, unknown> {
  return {
    ...row,
    position: null,
    specialization: null,
    email: row.contact_email,
    phone: row.contact_phone,
    bio: row.description,
    avatar_url: row.logo_url,
    trainings_conducted: 0,
    average_rating: 0,
  };
}

function projectVote(row: any): Record<string, unknown> {
  return {
    ...row,
    voter_id: row.user_id,
    voter_name: row.user_name,
    participation_intent: row.vote ? 'definitely' : 'support_only',
    is_anonymous: 0,
    voted_at: row.created_at,
  };
}

function projectFeedback(row: any): Record<string, unknown> {
  return {
    ...row,
    reviewer_id: row.user_id,
    reviewer_name: row.user_name,
    is_anonymous: 0,
    content_rating: row.rating,
    presenter_rating: row.rating,
    usefulness_rating: row.rating,
  };
}

async function proposalDetails(db: D1Database, tenantId: string, row: any): Promise<Record<string, unknown>> {
  const [votes, registrations, feedback] = await Promise.all([
    db.prepare(`
      SELECT v.*,u.name user_name FROM training_votes v
      LEFT JOIN users u ON u.id=v.user_id AND u.tenant_id=v.tenant_id
      WHERE v.proposal_id=? AND v.tenant_id=? ORDER BY v.created_at DESC LIMIT 500
    `).bind(row.id, tenantId).all(),
    db.prepare(`
      SELECT r.*,u.name user_name FROM training_registrations r
      LEFT JOIN users u ON u.id=r.user_id AND u.tenant_id=r.tenant_id
      WHERE r.proposal_id=? AND r.tenant_id=? ORDER BY r.registered_at DESC LIMIT 500
    `).bind(row.id, tenantId).all(),
    db.prepare(`
      SELECT f.*,u.name user_name FROM training_feedback f
      LEFT JOIN users u ON u.id=f.user_id AND u.tenant_id=f.tenant_id
      WHERE f.proposal_id=? AND f.tenant_id=? ORDER BY f.created_at DESC LIMIT 500
    `).bind(row.id, tenantId).all(),
  ]);
  const projectedVotes = votes.results.map(projectVote);
  const projectedFeedback = feedback.results.map(projectFeedback);
  return {
    ...row,
    topic: row.title,
    author_id: null,
    author_name: null,
    is_author_anonymous: 0,
    partner_name: row.partner_name,
    format: String(row.location || '').toLowerCase().includes('онлайн') ? 'online' : 'offline',
    preferred_time_slots: [],
    vote_threshold: DEFAULT_SETTINGS.vote_threshold,
    status: normalizedStatus(row.status),
    scheduled_date: datePart(row.start_date),
    scheduled_time: timePart(row.start_date),
    scheduled_location: row.location,
    scheduled_link: null,
    votes: projectedVotes,
    registrations: registrations.results,
    feedback: projectedFeedback,
    vote_count: projectedVotes.length,
    registered_count: registrations.results.length,
    completed_at: row.status === 'completed' ? row.end_date : null,
    actual_participants_count: registrations.results.filter((registration: any) => registration.attended === 1).length,
    updated_at: row.created_at,
  };
}

async function requireTrainingUser(request: Request, env: any): Promise<TrainingUser | Response> {
  const feature = await requireFeature('trainings', env, request);
  if (!feature.allowed) return error(feature.error!, 403);
  const user = await getUser(request, env) as TrainingUser | null;
  if (!user) return error('Unauthorized', 401);
  if (!getTenantId(request)) return error('Tenant context required', 401);
  return user;
}

async function findProposal(db: D1Database, tenantId: string, id: string): Promise<any> {
  return db.prepare(`
    SELECT p.*,tp.name partner_name FROM training_proposals p
    JOIN training_partners tp ON tp.id=p.partner_id AND tp.tenant_id=p.tenant_id
    WHERE p.id=? AND p.tenant_id=?
  `).bind(id, tenantId).first();
}

export function registerTrainingRoutes(): void {
  route('GET', '/api/training/partners', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    const activeOnly = new URL(request.url).searchParams.get('active') === 'true';
    const result = await env.DB.prepare(`
      SELECT * FROM training_partners WHERE tenant_id=? ${activeOnly ? 'AND is_active=1' : ''}
      ORDER BY name LIMIT 500
    `).bind(tenantId).all();
    return json({ partners: result.results.map(projectPartner) });
  });

  route('GET', '/api/training/partners/:id', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const row = await env.DB.prepare('SELECT * FROM training_partners WHERE id=? AND tenant_id=?')
      .bind(params.id, getTenantId(request)).first();
    return row ? json({ partner: projectPartner(row) }) : error('Partner not found', 404);
  });

  route('POST', '/api/training/partners', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (user.role !== 'admin') return error('Admin access required', 403);
    const body = await request.json() as any;
    if (!body.name?.trim()) return error('Name is required', 400);
    const id = generateId();
    const tenantId = getTenantId(request)!;
    await env.DB.prepare(`
      INSERT INTO training_partners
        (id,name,description,logo_url,website,contact_email,contact_phone,is_active,tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      id, body.name.trim(), body.bio || body.description || null, body.avatarUrl || body.logo_url || null,
      body.website || null, body.email || null, body.phone || null, body.isActive === false ? 0 : 1, tenantId,
    ).run();
    const row = await env.DB.prepare('SELECT * FROM training_partners WHERE id=? AND tenant_id=?').bind(id, tenantId).first();
    return json({ partner: projectPartner(row) }, 201);
  });

  route('PATCH', '/api/training/partners/:id', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (user.role !== 'admin') return error('Admin access required', 403);
    const body = await request.json() as any;
    const values = [
      body.name ?? null, body.bio ?? body.description ?? null, body.avatarUrl ?? body.logo_url ?? null,
      body.website ?? null, body.email ?? null, body.phone ?? null,
      body.isActive === undefined && body.is_active === undefined ? null : (body.isActive ?? body.is_active) ? 1 : 0,
    ];
    await env.DB.prepare(`
      UPDATE training_partners SET
        name=COALESCE(?,name),description=COALESCE(?,description),logo_url=COALESCE(?,logo_url),
        website=COALESCE(?,website),contact_email=COALESCE(?,contact_email),
        contact_phone=COALESCE(?,contact_phone),is_active=COALESCE(?,is_active)
      WHERE id=? AND tenant_id=?
    `).bind(...values, params.id, getTenantId(request)).run();
    const row = await env.DB.prepare('SELECT * FROM training_partners WHERE id=? AND tenant_id=?')
      .bind(params.id, getTenantId(request)).first();
    return row ? json({ partner: projectPartner(row) }) : error('Partner not found', 404);
  });

  route('DELETE', '/api/training/partners/:id', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (user.role !== 'admin') return error('Admin access required', 403);
    const result = await env.DB.prepare('DELETE FROM training_partners WHERE id=? AND tenant_id=?')
      .bind(params.id, getTenantId(request)).run();
    return result.meta.changes ? json({ success: true }) : error('Partner not found', 404);
  });

  route('GET', '/api/training/proposals', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const partnerId = url.searchParams.get('partner_id') || url.searchParams.get('partnerId');
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 500);
    const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
    const clauses = ['p.tenant_id=?'];
    const binds: unknown[] = [tenantId];
    if (status) {
      clauses.push(status === 'voting' ? "p.status IN ('pending','voting')" : 'p.status=?');
      if (status !== 'voting') binds.push(status);
    }
    if (partnerId) { clauses.push('p.partner_id=?'); binds.push(partnerId); }
    const result = await env.DB.prepare(`
      SELECT p.*,tp.name partner_name FROM training_proposals p
      JOIN training_partners tp ON tp.id=p.partner_id AND tp.tenant_id=p.tenant_id
      WHERE ${clauses.join(' AND ')} ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `).bind(...binds, limit, (page - 1) * limit).all();
    return json({ proposals: await Promise.all(result.results.map((row) => proposalDetails(env.DB, tenantId, row))) });
  });

  route('GET', '/api/training/proposals/:id', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    const row = await findProposal(env.DB, tenantId, params.id);
    return row ? json({ proposal: await proposalDetails(env.DB, tenantId, row) }) : error('Proposal not found', 404);
  });

  route('POST', '/api/training/proposals', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json() as any;
    const tenantId = getTenantId(request)!;
    const partnerId = body.partner_id || body.partnerId;
    const partner = await env.DB.prepare('SELECT id FROM training_partners WHERE id=? AND tenant_id=?')
      .bind(partnerId, tenantId).first();
    if (!partner) return error('Partner not found', 404);
    if (!body.topic?.trim()) return error('Topic is required', 400);
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO training_proposals
        (id,partner_id,title,description,category,duration,location,status,tenant_id)
      VALUES (?,?,?,?,?,'2 часа',?,'pending',?)
    `).bind(
      id, partnerId, body.topic.trim(), body.description || null, 'general',
      body.format === 'online' ? 'Онлайн' : null, tenantId,
    ).run();
    const row = await findProposal(env.DB, tenantId, id);
    return json({ proposal: await proposalDetails(env.DB, tenantId, row) }, 201);
  });

  route('PATCH', '/api/training/proposals/:id', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const body = await request.json() as any;
    const tenantId = getTenantId(request)!;
    const status = body.status === 'voting' ? 'pending' : body.status;
    await env.DB.prepare(`
      UPDATE training_proposals SET
        title=COALESCE(?,title),description=COALESCE(?,description),status=COALESCE(?,status),
        location=COALESCE(?,location),max_participants=COALESCE(?,max_participants)
      WHERE id=? AND tenant_id=?
    `).bind(
      body.topic ?? null, body.description ?? null, status ?? null,
      body.scheduledLocation ?? body.scheduled_location ?? null,
      body.maxParticipants ?? body.max_participants ?? null, params.id, tenantId,
    ).run();
    const row = await findProposal(env.DB, tenantId, params.id);
    return row ? json({ proposal: await proposalDetails(env.DB, tenantId, row) }) : error('Proposal not found', 404);
  });

  route('DELETE', '/api/training/proposals/:id', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (user.role !== 'admin') return error('Admin access required', 403);
    const result = await env.DB.prepare('DELETE FROM training_proposals WHERE id=? AND tenant_id=?')
      .bind(params.id, getTenantId(request)).run();
    return result.meta.changes ? json({ success: true }) : error('Proposal not found', 404);
  });

  route('POST', '/api/training/proposals/:id/schedule', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (!isManagement(user)) return error('Admin/Manager access required', 403);
    const body = await request.json() as any;
    const tenantId = getTenantId(request)!;
    const date = body.scheduledDate || body.scheduled_date;
    const time = body.scheduledTime || body.scheduled_time || '09:00';
    const start = date ? `${date}T${time}:00.000Z` : null;
    await env.DB.prepare(`
      UPDATE training_proposals SET status='scheduled',start_date=?,end_date=?,location=?,max_participants=?
      WHERE id=? AND tenant_id=?
    `).bind(
      start, start, body.scheduledLocation || body.scheduled_location || null,
      body.maxParticipants || body.max_participants || null, params.id, tenantId,
    ).run();
    const row = await findProposal(env.DB, tenantId, params.id);
    return row ? json({ proposal: await proposalDetails(env.DB, tenantId, row) }) : error('Proposal not found', 404);
  });

  route('POST', '/api/training/proposals/:id/complete', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (!isManagement(user)) return error('Admin/Manager access required', 403);
    const tenantId = getTenantId(request)!;
    await env.DB.prepare(`
      UPDATE training_proposals SET status='completed',end_date=? WHERE id=? AND tenant_id=?
    `).bind(new Date().toISOString(), params.id, tenantId).run();
    const row = await findProposal(env.DB, tenantId, params.id);
    return row ? json({ proposal: await proposalDetails(env.DB, tenantId, row) }) : error('Proposal not found', 404);
  });

  route('GET', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    if (!await findProposal(env.DB, tenantId, params.proposalId)) return error('Proposal not found', 404);
    const result = await env.DB.prepare(`
      SELECT v.*,u.name user_name FROM training_votes v
      LEFT JOIN users u ON u.id=v.user_id AND u.tenant_id=v.tenant_id
      WHERE v.proposal_id=? AND v.tenant_id=? ORDER BY v.created_at DESC LIMIT 500
    `).bind(params.proposalId, tenantId).all();
    return json({ votes: result.results.map(projectVote) });
  });

  route('POST', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    if (!await findProposal(env.DB, tenantId, params.proposalId)) return error('Proposal not found', 404);
    const existing = await env.DB.prepare('SELECT id FROM training_votes WHERE proposal_id=? AND user_id=? AND tenant_id=?')
      .bind(params.proposalId, user.id, tenantId).first();
    if (existing) return error('Already voted', 400);
    const id = generateId();
    await env.DB.prepare('INSERT INTO training_votes (id,proposal_id,user_id,vote,tenant_id) VALUES (?,?,?,1,?)')
      .bind(id, params.proposalId, user.id, tenantId).run();
    const row = await env.DB.prepare('SELECT * FROM training_votes WHERE id=? AND tenant_id=?').bind(id, tenantId).first();
    return json({ vote: projectVote({ ...row, user_name: user.name }) }, 201);
  });

  route('DELETE', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    await env.DB.prepare('DELETE FROM training_votes WHERE proposal_id=? AND user_id=? AND tenant_id=?')
      .bind(params.proposalId, user.id, getTenantId(request)).run();
    return json({ success: true });
  });

  route('POST', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    if (!await findProposal(env.DB, tenantId, params.proposalId)) return error('Proposal not found', 404);
    const existing = await env.DB.prepare('SELECT id FROM training_registrations WHERE proposal_id=? AND user_id=? AND tenant_id=?')
      .bind(params.proposalId, user.id, tenantId).first();
    if (existing) return error('Already registered', 400);
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO training_registrations (id,proposal_id,user_id,status,tenant_id)
      VALUES (?,?,?,'registered',?)
    `).bind(id, params.proposalId, user.id, tenantId).run();
    const row = await env.DB.prepare('SELECT * FROM training_registrations WHERE id=? AND tenant_id=?').bind(id, tenantId).first();
    return json({ registration: row }, 201);
  });

  route('DELETE', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    await env.DB.prepare('DELETE FROM training_registrations WHERE proposal_id=? AND user_id=? AND tenant_id=?')
      .bind(params.proposalId, user.id, getTenantId(request)).run();
    return json({ success: true });
  });

  route('POST', '/api/training/proposals/:proposalId/attendance/:userId', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (!isManagement(user)) return error('Admin/Manager access required', 403);
    await env.DB.prepare(`
      UPDATE training_registrations SET attended=1
      WHERE proposal_id=? AND user_id=? AND tenant_id=?
    `).bind(params.proposalId, params.userId, getTenantId(request)).run();
    return json({ success: true });
  });

  route('GET', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    const result = await env.DB.prepare(`
      SELECT f.*,u.name user_name FROM training_feedback f
      LEFT JOIN users u ON u.id=f.user_id AND u.tenant_id=f.tenant_id
      WHERE f.proposal_id=? AND f.tenant_id=? ORDER BY f.created_at DESC LIMIT 500
    `).bind(params.proposalId, tenantId).all();
    return json({ feedback: result.results.map(projectFeedback) });
  });

  route('POST', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    if (!await findProposal(env.DB, tenantId, params.proposalId)) return error('Proposal not found', 404);
    const body = await request.json() as any;
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) return error('Rating must be 1-5', 400);
    const existing = await env.DB.prepare('SELECT id FROM training_feedback WHERE proposal_id=? AND user_id=? AND tenant_id=?')
      .bind(params.proposalId, user.id, tenantId).first();
    if (existing) return error('Feedback already submitted', 400);
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO training_feedback (id,proposal_id,user_id,rating,comment,tenant_id)
      VALUES (?,?,?,?,?,?)
    `).bind(id, params.proposalId, user.id, body.rating, body.comment || null, tenantId).run();
    const row = await env.DB.prepare('SELECT * FROM training_feedback WHERE id=? AND tenant_id=?').bind(id, tenantId).first();
    return json({ feedback: projectFeedback({ ...row, user_name: user.name }) }, 201);
  });

  route('GET', '/api/training/notifications', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    const unreadOnly = new URL(request.url).searchParams.get('unread') === 'true';
    const result = await env.DB.prepare(`
      SELECT * FROM training_notifications
      WHERE user_id=? AND tenant_id=? ${unreadOnly ? 'AND is_read=0' : ''}
      ORDER BY sent_at DESC LIMIT 100
    `).bind(user.id, tenantId).all();
    return json({ notifications: result.results.map((row: any) => ({
      ...row, type: row.notification_type, recipient_id: row.user_id,
      recipient_role: user.role, title: 'Тренинги', message: '', created_at: row.sent_at,
    })) });
  });

  route('POST', '/api/training/notifications/:id/read', async (request, env, params) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const result = await env.DB.prepare(`
      UPDATE training_notifications SET is_read=1 WHERE id=? AND user_id=? AND tenant_id=?
    `).bind(params.id, user.id, getTenantId(request)).run();
    return result.meta.changes ? json({ success: true }) : error('Notification not found', 404);
  });

  route('POST', '/api/training/notifications/read-all', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    await env.DB.prepare('UPDATE training_notifications SET is_read=1 WHERE user_id=? AND tenant_id=?')
      .bind(user.id, getTenantId(request)).run();
    return json({ success: true });
  });

  route('GET', '/api/training/settings', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    return json({ settings: DEFAULT_SETTINGS });
  });

  route('PATCH', '/api/training/settings', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    if (user.role !== 'admin') return error('Admin access required', 403);
    await request.json();
    return json({ success: true, settings: DEFAULT_SETTINGS });
  });

  route('GET', '/api/training/stats', async (request, env) => {
    const user = await requireTrainingUser(request, env);
    if (user instanceof Response) return user;
    const tenantId = getTenantId(request)!;
    const [proposalCounts, voteCount, registrationCount, averageRating] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) total,
          SUM(CASE WHEN status IN ('pending','voting') THEN 1 ELSE 0 END) voting,
          SUM(CASE WHEN status='scheduled' THEN 1 ELSE 0 END) scheduled,
          SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed
        FROM training_proposals WHERE tenant_id=?
      `).bind(tenantId).first() as Promise<any>,
      env.DB.prepare('SELECT COUNT(*) count FROM training_votes WHERE tenant_id=?').bind(tenantId).first() as Promise<any>,
      env.DB.prepare('SELECT COUNT(*) count FROM training_registrations WHERE tenant_id=?').bind(tenantId).first() as Promise<any>,
      env.DB.prepare('SELECT AVG(rating) average FROM training_feedback WHERE tenant_id=?').bind(tenantId).first() as Promise<any>,
    ]);
    return json({ stats: {
      totalProposals: Number(proposalCounts?.total || 0),
      votingProposals: Number(proposalCounts?.voting || 0),
      scheduledTrainings: Number(proposalCounts?.scheduled || 0),
      completedTrainings: Number(proposalCounts?.completed || 0),
      totalVotes: Number(voteCount?.count || 0),
      totalParticipants: Number(registrationCount?.count || 0),
      averageRating: Number(averageRating?.average || 0),
    } });
  });
}
