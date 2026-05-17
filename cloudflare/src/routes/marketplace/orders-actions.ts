// Order action routes — cancel + rate

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, bilingualError, generateId } from '../../utils/helpers';
import { sendPushNotification } from '../../index';

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

  // Sprint 63 P0: race-condition guard. Was doing stock-refund loop then
  // unconditional status UPDATE. Two parallel cancels (or a customer-
  // cancel racing an admin-cancel at admin-orders.ts) both passed the
  // status gate → stock credited twice. Gate the status UPDATE with a
  // status precondition + check changes; only refund if WE won the race.
  const cancelReason = body.reason || 'Отменено покупателем';
  const updateResult = await env.DB.prepare(`
    UPDATE marketplace_orders SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?, updated_at = datetime('now')
    WHERE id = ? AND status IN ('new', 'confirmed') ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(cancelReason, params.id, ...(tenantId ? [tenantId] : [])).run();

  if (!updateResult.meta || updateResult.meta.changes === 0) {
    return error('Order is no longer cancellable (already in progress or completed)', 409);
  }

  // We own the cancel — refund stock.
  const orderItems = await env.DB.prepare(`
    SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all() as { results: { product_id: string, quantity: number }[] };

  const stockRefunds = (orderItems.results || []).map(item =>
    env.DB.prepare(`
      UPDATE marketplace_products SET stock_quantity = stock_quantity + ?
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(item.quantity, item.product_id, ...(tenantId ? [tenantId] : []))
  );
  if (stockRefunds.length > 0) await env.DB.batch(stockRefunds);

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'cancelled', ?, ?, ?)
  `).bind(generateId(), params.id, cancelReason, user.id, tenantId).run();

  // Sprint 63 P0: notify the assigned courier so they don't keep working
  // on a cancelled order. Fire-and-forget — DB write already committed.
  if (order.executor_id) {
    sendPushNotification(env, order.executor_id, {
      title: '❌ Заказ отменён',
      body: `Заказ #${order.order_number || params.id.slice(0, 8)} отменён покупателем. Причина: ${cancelReason}`,
      type: 'marketplace_cancelled',
      tag: `mp-cancelled-${params.id}`,
      data: { orderId: params.id, url: '/' },
      requireInteraction: true,
    }).catch(() => {});
  }

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
    return bilingualError('Рейтинг должен быть от 1 до 5', 'Reyting 1 dan 5 gacha bo\'lishi kerak', 400);
  }

  const tenantId = getTenantId(request);
  const order = await env.DB.prepare(
    `SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? AND status = 'delivered' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!order) return error('Order not found or not delivered', 404);

  if (order.rating) return bilingualError('Вы уже оценили этот заказ', 'Siz bu buyurtmani allaqachon baholagansiz', 400);

  await env.DB.prepare(
    `UPDATE marketplace_orders SET rating = ?, review = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(rating, review || null, params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

} // end registerOrderActionRoutes
