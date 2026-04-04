// Admin dashboard stats + reports

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';
import { isMarketplaceAdmin } from './helpers';

export function registerAdminDashboardRoutes() {

// Manager: Dashboard stats
route('GET', '/api/marketplace/admin/dashboard', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  const today = new Date().toISOString().slice(0, 10);
  const tenantId = getTenantId(request);
  const tFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tBind = tenantId ? [tenantId] : [];

  const [newOrders, preparingOrders, deliveringOrders, todayOrders, todayRevenue, totalProducts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'new'${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status IN ('confirmed', 'preparing', 'ready')${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'delivering'${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE date(created_at) = ?${tFilter}`).bind(today, ...tBind).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(final_amount), 0) as total FROM marketplace_orders WHERE date(created_at) = ? AND status != 'cancelled'${tFilter}`).bind(today, ...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_products WHERE is_active = 1${tFilter}`).bind(...tBind).first()
  ]);

  return json({
    stats: {
      new_orders: (newOrders as any)?.count || 0,
      preparing_orders: (preparingOrders as any)?.count || 0,
      delivering_orders: (deliveringOrders as any)?.count || 0,
      today_orders: (todayOrders as any)?.count || 0,
      today_revenue: (todayRevenue as any)?.total || 0,
      total_products: (totalProducts as any)?.count || 0
    }
  });
});

// Manager: Marketplace Reports (for Director)
route('GET', '/api/marketplace/admin/reports', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  const url = new URL(request.url);
  const startDate = url.searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = url.searchParams.get('end_date') || new Date().toISOString().slice(0, 10);

  const tenantId = getTenantId(request);
  const tFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tFilterO = tenantId ? ' AND o.tenant_id = ?' : '';
  const tBind = tenantId ? [tenantId] : [];

  try {
    const overallStats = await env.DB.prepare(`
      SELECT COUNT(*) as total_orders, COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0) as total_delivery_fees,
        COALESCE(AVG(CASE WHEN rating IS NOT NULL THEN rating END), 0) as avg_rating,
        COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as rated_orders
      FROM marketplace_orders WHERE date(created_at) BETWEEN ? AND ?${tFilter}
    `).bind(startDate, endDate, ...tBind).first() as any;

    const topProducts = await env.DB.prepare(`
      SELECT oi.product_id, oi.product_name, p.image_url,
        SUM(oi.quantity) as total_sold, SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM marketplace_order_items oi JOIN marketplace_orders o ON oi.order_id = o.id
      LEFT JOIN marketplace_products p ON oi.product_id = p.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY oi.product_id, oi.product_name ORDER BY total_revenue DESC LIMIT 20
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    const categoryStats = await env.DB.prepare(`
      SELECT COALESCE(c.name_ru, 'Без категории') as category_name,
        SUM(oi.quantity) as total_sold, SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM marketplace_order_items oi JOIN marketplace_orders o ON oi.order_id = o.id
      LEFT JOIN marketplace_products p ON oi.product_id = p.id
      LEFT JOIN marketplace_categories c ON p.category_id = c.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY c.id, c.name_ru ORDER BY total_revenue DESC
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    const dailySales = await env.DB.prepare(`
      SELECT date(created_at) as date, COUNT(*) as orders,
        SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END) as revenue
      FROM marketplace_orders WHERE date(created_at) BETWEEN ? AND ?${tFilter}
      GROUP BY date(created_at) ORDER BY date(created_at)
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    const ordersByStatus = await env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter} GROUP BY status
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    const topCustomers = await env.DB.prepare(`
      SELECT u.id as user_id, u.name as user_name, u.phone as user_phone,
        COUNT(o.id) as order_count, SUM(o.final_amount) as total_spent
      FROM marketplace_orders o JOIN users u ON o.user_id = u.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY u.id, u.name, u.phone ORDER BY total_spent DESC LIMIT 10
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    const executorStats = await env.DB.prepare(`
      SELECT u.id as executor_id, u.name as executor_name,
        COUNT(o.id) as delivered_count, COALESCE(AVG(o.rating), 0) as avg_rating
      FROM marketplace_orders o JOIN users u ON o.executor_id = u.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY u.id, u.name ORDER BY delivered_count DESC
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    return json({
      period: { start_date: startDate, end_date: endDate },
      overall: overallStats,
      top_products: topProducts.results || [],
      categories: categoryStats.results || [],
      daily_sales: dailySales.results || [],
      orders_by_status: ordersByStatus.results || [],
      top_customers: topCustomers.results || [],
      executor_stats: executorStats.results || [],
    });
  } catch (err: any) {
    const log = createRequestLogger(request);
    log.error('Marketplace reports error', err);
    return error('Failed to generate report', 500);
  }
});

} // end registerAdminDashboardRoutes
