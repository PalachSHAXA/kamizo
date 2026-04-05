// Dashboard stats routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';

async function getStats(env: Env, request: Request) {
  const tenantId = getTenantId(request);
  const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';
  const bind = tenantId ? [tenantId] : [];

  const stats = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'new'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status IN ('assigned', 'in_progress')${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'completed'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'resident'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'executor'${tenantFilter}`).bind(...bind).first(),
  ]);

  return {
    new_requests: (stats[0] as any)?.count || 0,
    in_progress: (stats[1] as any)?.count || 0,
    completed: (stats[2] as any)?.count || 0,
    total_residents: (stats[3] as any)?.count || 0,
    total_executors: (stats[4] as any)?.count || 0,
  };
}

export function registerStatsRoutes() {

// PROTECTED: auth required
route('GET', '/api/stats', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  return json(await getStats(env, request));
});

// Alias for /api/stats/dashboard (frontend compatibility)
route('GET', '/api/stats/dashboard', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  return json(await getStats(env, request));
});

} // end registerStatsRoutes
