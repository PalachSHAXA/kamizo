// Executor/courier delivery routes — active orders, delivered, available, take, update status

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification, isExecutorRole } from '../../index';

export function registerDeliveryRoutes() {

route('GET', '/api/marketplace/executor/orders', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Access denied', 403);
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status NOT IN ('delivered', 'cancelled')
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY CASE o.status WHEN 'confirmed' THEN 1 WHEN 'preparing' THEN 2 WHEN 'ready' THEN 3 WHEN 'delivering' THEN 4 ELSE 5 END,
      o.created_at DESC LIMIT 500
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

route('GET', '/api/marketplace/executor/delivered', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Access denied', 403);
  if (user.specialization !== 'courier') return json({ orders: [] });

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status = 'delivered'
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY o.delivered_at DESC, o.updated_at DESC LIMIT 500
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

route('GET', '/api/marketplace/executor/available', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Access denied', 403);
  if (user.specialization !== 'courier') return json({ orders: [] });

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id IS NULL AND o.status = 'new'
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY o.created_at ASC LIMIT 500
  `).bind(...(tenantId ? [tenantId] : [])).all();

  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

route('POST', '/api/marketplace/executor/orders/:id/take', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Access denied', 403);
  if (user.specialization !== 'courier') return error('Only couriers can take marketplace orders', 403);

  const tenantId = getTenantId(request);
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id IS NULL AND status = 'new'
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) return error('Order not available or already taken', 404);

  await env.DB.prepare(`
    UPDATE marketplace_orders SET executor_id = ?, assigned_at = datetime('now'),
      status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(user.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'confirmed', 'Курьер взял заказ', ?, ?)
  `).bind(generateId(), params.id, user.id, tenantId).run();

  const execTakeBody = `Заказ ${order.order_number} подтверждён`;
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
  `).bind(generateId(), order.user_id, execTakeBody, JSON.stringify({ order_id: params.id }), tenantId).run();
  sendPushNotification(env, order.user_id, {
    title: '🛒 Заказ подтверждён', body: execTakeBody, type: 'marketplace_order',
    tag: `order-status-${params.id}`, data: { orderId: params.id, url: '/' }, requireInteraction: false
  }).catch(() => {});

  return json({ success: true });
});

route('PATCH', '/api/marketplace/executor/orders/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id = ?
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) return error('Order not found or not assigned to you', 404);

  const body = await request.json() as any;
  const { status, comment } = body;

  const allowedTransitions: Record<string, string[]> = {
    'confirmed': ['preparing'], 'preparing': ['ready'], 'ready': ['delivering'], 'delivering': ['delivered']
  };
  const allowed = allowedTransitions[order.status];
  if (!allowed || !allowed.includes(status)) return error(`Cannot change status from ${order.status} to ${status}`);

  const statusField = status === 'preparing' ? 'preparing_at' : status === 'ready' ? 'ready_at' :
    status === 'delivering' ? 'delivering_at' : status === 'delivered' ? 'delivered_at' : null;

  if (statusField) {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();
  } else {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();
  }

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(generateId(), params.id, status, comment || null, user.id, getTenantId(request)).run();

  const statusLabels: Record<string, string> = {
    preparing: 'готовится', ready: 'готов к выдаче', delivering: 'доставляется', delivered: 'доставлен'
  };
  const execStatusBody = `Заказ ${order.order_number} ${statusLabels[status]}`;
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
  `).bind(generateId(), order.user_id, execStatusBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
  sendPushNotification(env, order.user_id, {
    title: status === 'delivered' ? '✅ Заказ доставлен' : '🛒 Статус заказа',
    body: execStatusBody, type: 'marketplace_order', tag: `order-status-${params.id}`,
    data: { orderId: params.id, url: '/' }, requireInteraction: status === 'delivered'
  }).catch(() => {});

  return json({ success: true });
});

} // end registerDeliveryRoutes
