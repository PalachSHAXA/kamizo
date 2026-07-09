// Employee ratings and UK satisfaction ratings routes

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';

export function registerRatingsRoutes() {

// ==================== EMPLOYEE RATINGS ====================

// Ratings: Create or update (Sprint 60 P0: validate + dedupe)
route('POST', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const body = await request.json() as any;
  if (!body.executor_id || typeof body.executor_id !== 'string') {
    return error('executor_id is required', 400);
  }

  // Validate 1-5 range. Allow null (means "not rated this dimension"),
  // but at least one dimension must be provided.
  const validateScore = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 5) return undefined as unknown as number;
    return n;
  };
  const quality = validateScore(body.quality);
  const speed = validateScore(body.speed);
  const politeness = validateScore(body.politeness);
  if (quality === undefined || speed === undefined || politeness === undefined) {
    return error('Ratings must be integers in range 1-5 or null', 400);
  }
  if (quality === null && speed === null && politeness === null) {
    return error('At least one rating dimension is required', 400);
  }

  const comment = typeof body.comment === 'string' ? body.comment.slice(0, 1000) : null;

  // Verify executor exists in the same tenant (prevents cross-tenant ratings).
  const executor = await env.DB.prepare(
    'SELECT id FROM users WHERE id = ? AND role = ? AND tenant_id = ?'
  ).bind(body.executor_id, 'executor', tenantId).first();
  if (!executor) return error('Executor not found in this tenant', 404);

  // Frontend still sends quality === speed === politeness (single-star UI in
  // ResidentRateEmployeesPage mirrors one value to all three axes). Prod DB
  // collapsed the three sub-scores into one `rating` column at some point
  // without updating this code — that mismatch is the schema drift we hit
  // in the 04:00 UTC 500. Take whichever axis is non-null (in that order)
  // and store as `rating`.
  const combinedRating = quality ?? speed ?? politeness;

  // Dedupe — if rating from this resident for this executor already exists,
  // update it (let people change their mind) rather than inserting a duplicate.
  // Schema lacks UNIQUE constraint, so enforce at app level.
  const existing = await env.DB.prepare(
    'SELECT id FROM employee_ratings WHERE executor_id = ? AND rated_by = ? AND tenant_id = ?'
  ).bind(body.executor_id, user.id, tenantId).first() as any;

  if (existing?.id) {
    await env.DB.prepare(`
      UPDATE employee_ratings SET rating = ?, comment = ?, created_at = datetime('now')
      WHERE id = ?
    `).bind(combinedRating, comment, existing.id).run();
    return json({ id: existing.id, updated: true });
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO employee_ratings (id, executor_id, rated_by, rating, comment, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, body.executor_id, user.id, combinedRating, comment, tenantId).run();

  return json({ id }, 201);
});

// Ratings: Get for user
route('GET', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM employee_ratings WHERE rated_by = ? AND tenant_id = ? ORDER BY created_at DESC LIMIT 500
  `).bind(user.id, tenantId).all();

  return json(results);
});

// ==================== UK SATISFACTION RATINGS ====================

// Submit monthly UK satisfaction rating
route('POST', '/api/uk-ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { overall, cleanliness, responsiveness, communication, comment } = body;

  if (!overall || overall < 1 || overall > 5) {
    return error('Invalid overall rating', 400);
  }

  // Sprint 79 P1/F10: was falling back to literal 'default' tenant_id,
  // which mixed apex residents' ratings into a shared bucket — then
  // /summary read them back into the wrong tenant.
  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO uk_satisfaction_ratings (id, resident_id, tenant_id, period, overall, cleanliness, responsiveness, communication, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(resident_id, tenant_id, period) DO UPDATE SET
        overall = excluded.overall,
        cleanliness = excluded.cleanliness,
        responsiveness = excluded.responsiveness,
        communication = excluded.communication,
        comment = excluded.comment,
        created_at = datetime('now')
    `).bind(id, user.id, tenantId, period, overall, cleanliness || null, responsiveness || null, communication || null, comment || null).run();

    return json({ success: true, period });
  } catch (e: any) {
    return error('Failed to submit rating', 500);
  }
});

// Get current user's UK rating for current month
route('GET', '/api/uk-ratings/my', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Sprint 79 P1/F10: was falling back to literal 'default' tenant_id,
  // which mixed apex residents' ratings into a shared bucket — then
  // /summary read them back into the wrong tenant.
  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result = await env.DB.prepare(`
    SELECT * FROM uk_satisfaction_ratings WHERE resident_id = ? AND tenant_id = ? AND period = ?
  `).bind(user.id, tenantId, period).first();

  return json({ rating: result || null, period });
});

// Get UK rating summary (admin/director/manager)
route('GET', '/api/uk-ratings/summary', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'manager', 'director', 'department_head'].includes(user.role)) {
    return error('Unauthorized', 401);
  }

  // Sprint 79 P1/F10: was falling back to literal 'default' tenant_id,
  // which mixed apex residents' ratings into a shared bucket — then
  // /summary read them back into the wrong tenant.
  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);
  const url = new URL(request.url);
  const months = parseInt(url.searchParams.get('months') || '6');

  // Get monthly averages for the last N months
  const { results: monthlyData } = await env.DB.prepare(`
    SELECT
      period,
      COUNT(*) as total_votes,
      ROUND(AVG(overall), 2) as avg_overall,
      ROUND(AVG(cleanliness), 2) as avg_cleanliness,
      ROUND(AVG(responsiveness), 2) as avg_responsiveness,
      ROUND(AVG(communication), 2) as avg_communication
    FROM uk_satisfaction_ratings
    WHERE tenant_id = ?
    GROUP BY period
    ORDER BY period DESC
    LIMIT ?
  `).bind(tenantId, months).all();

  // Get current month stats
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  const prevPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  const currentMonth = monthlyData.find((m: any) => m.period === currentPeriod);
  const previousMonth = monthlyData.find((m: any) => m.period === prevPeriod);

  // Calculate trend
  let trend = 0;
  if (currentMonth && previousMonth) {
    trend = Math.round(((currentMonth as any).avg_overall - (previousMonth as any).avg_overall) / (previousMonth as any).avg_overall * 100);
  }

  // Get recent comments
  const { results: recentComments } = await env.DB.prepare(`
    SELECT r.comment, r.overall, r.period, r.created_at, u.name as resident_name
    FROM uk_satisfaction_ratings r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.tenant_id = ? AND r.comment IS NOT NULL AND r.comment != ''
    ORDER BY r.created_at DESC
    LIMIT 10
  `).bind(tenantId).all();

  return json({
    monthly: monthlyData,
    current: currentMonth || null,
    previous: previousMonth || null,
    trend,
    recentComments,
    currentPeriod,
  });
});

} // end registerRatingsRoutes
