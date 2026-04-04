// Order action routes — cancel + rate

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';

export function registerOrderActionRoutes() {

// Cancel order (by user)
route('POST', '/api/marketplace/orders/:id/cancel', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const order = await env.DB.prepare(
    `SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) return error('Order not found', 404);
  if (!['new', 'confirmed'].includes(order.status)) {
    return error('Cannot cancel order in this status');
  }

  // Return stock for each item
  const orderItems = await env.DB.prepare(`
    SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all() as { results: { product_id: string, quantity: number }[] };

  for (const item of (orderItems.results || [])) {
    await env.DB.prepare(`
      UPDATE marketplace_products SET stock_quantity = stock_quantity + ?
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(item.quantity, item.product_id, ...(tenantId ? [tenantId] : [])).run();
  }

  await env.DB.prepare(`
    UPDATE marketplace_orders SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Отменено покупателем', params.id, ...(tenantId ? [tenantId] : [])).run();

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'cancelled', ?, ?, ?)
  `).bind(generateId(), params.id, body.reason || 'Отменено покупателем', user.id, tenantId).run();

  return json({ success: true });
});

// Rate order
route('POST', '/api/marketplace/orders/:id/rate', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { rating, review } = body;

  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return error('Рейтинг должен быть от 1 до 5', 400);
  }

  const tenantId = getTenantId(request);
  const order = await env.DB.prepare(
    `SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? AND status = 'delivered' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!order) return error('Order not found or not delivered', 404);

  if (order.rating) return error('Вы уже оценили этот заказ', 400);

  await env.DB.prepare(
    `UPDATE marketplace_orders SET rating = ?, review = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(rating, review || null, params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

} // end registerOrderActionRoutes
