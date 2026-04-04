// Employee ratings and UK satisfaction ratings routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';

export function registerRatingsRoutes() {

// ==================== EMPLOYEE RATINGS ====================

// Ratings: Create
route('POST', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO employee_ratings (id, executor_id, resident_id, quality, speed, politeness, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.executor_id, user.id, body.quality, body.speed, body.politeness, body.comment || null).run();

  return json({ id }, 201);
});

// Ratings: Get for user
route('GET', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM employee_ratings WHERE resident_id = ? ORDER BY created_at DESC LIMIT 500
  `).bind(user.id).all();

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

  const tenantId = getTenantId(request) || 'default';
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

  const tenantId = getTenantId(request) || 'default';
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

  const tenantId = getTenantId(request) || 'default';
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
