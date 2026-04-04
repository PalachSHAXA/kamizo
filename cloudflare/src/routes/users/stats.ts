// Executor statistics and ratings
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';

export function registerStatsRoutes() {

// Executors: Get stats for specific executor
route('GET', '/api/executors/:id/stats', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  // Get executor info
  const executor = await env.DB.prepare(`
    SELECT id, name, specialization, status FROM users WHERE id = ? AND role = 'executor' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!executor) return error('Executor not found', 404);

  // Calculate stats from requests table
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all 6 independent stats queries in parallel
  const [totalCompleted, weekCompleted, monthCompleted, avgRating, avgTime, statusCounts] = await Promise.all([
    // Total completed
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE executor_id = ? AND status IN ('completed', 'closed') ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as Promise<{ count: number }>,
    // This week completed
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE executor_id = ? AND status IN ('completed', 'closed') AND completed_at >= ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, weekAgo, ...(tenantId ? [tenantId] : [])).first() as Promise<{ count: number }>,
    // This month completed
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE executor_id = ? AND status IN ('completed', 'closed') AND completed_at >= ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, monthAgo, ...(tenantId ? [tenantId] : [])).first() as Promise<{ count: number }>,
    // Average rating from requests
    env.DB.prepare(`
      SELECT AVG(rating) as avg FROM requests
      WHERE executor_id = ? AND rating IS NOT NULL ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as Promise<{ avg: number | null }>,
    // Average completion time (in minutes)
    env.DB.prepare(`
      SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_minutes
      FROM requests
      WHERE executor_id = ? AND started_at IS NOT NULL AND completed_at IS NOT NULL ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as Promise<{ avg_minutes: number | null }>,
    // Count requests by status
    env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM requests
      WHERE executor_id = ?
      GROUP BY status
    `).bind(params.id).all(),
  ]);

  // For couriers - get delivery stats and rating from marketplace_orders
  let deliveryStats = { totalDelivered: 0, deliveredThisWeek: 0, deliveryRating: null as number | null, avgDeliveryTime: 0 };
  if ((executor as any).specialization === 'courier') {
    const [totalDelivered, deliveredThisWeek, deliveryAvgRating, avgDeliveryTime] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) as count FROM marketplace_orders
        WHERE executor_id = ? AND status = 'delivered'
      `).bind(params.id).first() as Promise<{ count: number }>,
      env.DB.prepare(`
        SELECT COUNT(*) as count FROM marketplace_orders
        WHERE executor_id = ? AND status = 'delivered' AND delivered_at >= ?
      `).bind(params.id, weekAgo).first() as Promise<{ count: number }>,
      env.DB.prepare(`
        SELECT AVG(rating) as avg FROM marketplace_orders
        WHERE executor_id = ? AND rating IS NOT NULL
      `).bind(params.id).first() as Promise<{ avg: number | null }>,
      env.DB.prepare(`
        SELECT AVG((julianday(delivered_at) - julianday(delivering_at)) * 24 * 60) as avg_minutes
        FROM marketplace_orders
        WHERE executor_id = ? AND delivering_at IS NOT NULL AND delivered_at IS NOT NULL
      `).bind(params.id).first() as Promise<{ avg_minutes: number | null }>,
    ]);

    deliveryStats = {
      totalDelivered: totalDelivered?.count || 0,
      deliveredThisWeek: deliveredThisWeek?.count || 0,
      deliveryRating: deliveryAvgRating?.avg || null,
      avgDeliveryTime: avgDeliveryTime?.avg_minutes ? Math.round(avgDeliveryTime.avg_minutes) : 0
    };
  }

  // For couriers, use delivery rating; for others, use request rating
  const isCourier = (executor as any).specialization === 'courier';
  const finalRating = isCourier && deliveryStats.deliveryRating !== null
    ? Math.round(deliveryStats.deliveryRating * 10) / 10
    : (avgRating?.avg ? Math.round(avgRating.avg * 10) / 10 : 5.0);

  return json({
    stats: {
      totalCompleted: totalCompleted?.count || 0,
      thisWeek: weekCompleted?.count || 0,
      thisMonth: monthCompleted?.count || 0,
      rating: finalRating,
      avgCompletionTime: avgTime?.avg_minutes ? Math.round(avgTime.avg_minutes) : 0,
      statusBreakdown: statusCounts.results || [],
      // Courier-specific stats
      totalDelivered: deliveryStats.totalDelivered,
      deliveredThisWeek: deliveryStats.deliveredThisWeek,
      avgDeliveryTime: deliveryStats.avgDeliveryTime
    }
  });
});

} // end registerStatsRoutes
