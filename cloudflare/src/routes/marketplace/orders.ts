// Order routes — create, list, details, items, cancel, rate

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';

export function registerOrderRoutes() {

// Create order
route('POST', '/api/marketplace/orders', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const log = createRequestLogger(request);

  try {
    const body = await request.json() as any;
    const { delivery_date, delivery_time_slot, delivery_notes, payment_method } = body;
    const tenantId = getTenantId(request);
    log.info('Creating order', { userId: user.id, userName: user.name });

    const { results: cartItems } = await env.DB.prepare(`
      SELECT c.*, p.name_ru, p.price, p.image_url, p.stock_quantity
      FROM marketplace_cart c JOIN marketplace_products p ON c.product_id = p.id
      WHERE c.user_id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
    `).bind(user.id, ...(tenantId ? [tenantId] : [])).all() as { results: any[] };

    if (!cartItems || cartItems.length === 0) { log.warn('Cart is empty'); return error('Cart is empty', 400); }

    const outOfStockItems: string[] = [];
    for (const item of cartItems) {
      if (item.stock_quantity < item.quantity) {
        outOfStockItems.push(`${item.name_ru} (доступно: ${item.stock_quantity}, в корзине: ${item.quantity})`);
      }
    }
    if (outOfStockItems.length > 0) {
      log.warn('Insufficient stock', { outOfStockItems });
      return error(`Недостаточно товара на складе: ${outOfStockItems.join(', ')}`, 400);
    }

    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = totalAmount >= 100000 ? 0 : 15000;
    const finalAmount = totalAmount + deliveryFee;

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderCount = await env.DB.prepare(
      `SELECT COUNT(*) as count FROM marketplace_orders WHERE order_number LIKE ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(`MP-${today}%`, ...(tenantId ? [tenantId] : [])).first() as any;
    const orderNumber = `MP-${today}-${String((orderCount?.count || 0) + 1).padStart(4, '0')}`;
    const orderId = generateId();

    const statements = [];
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_orders (
        id, order_number, user_id, status, total_amount, delivery_fee, final_amount,
        delivery_address, delivery_apartment, delivery_entrance, delivery_floor, delivery_phone,
        delivery_date, delivery_time_slot, delivery_notes, payment_method, tenant_id
      ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId, orderNumber, user.id, totalAmount, deliveryFee, finalAmount,
      user.address || '', user.apartment || '', user.entrance || '', user.floor || '', user.phone || '',
      delivery_date || null, delivery_time_slot || null, delivery_notes || null, payment_method || 'cash', tenantId
    ));

    for (const item of cartItems) {
      statements.push(env.DB.prepare(`
        INSERT INTO marketplace_order_items (id, order_id, product_id, product_name, product_image, quantity, unit_price, total_price, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(generateId(), orderId, item.product_id, item.name_ru, item.image_url, item.quantity, item.price, item.price * item.quantity, tenantId));

      statements.push(env.DB.prepare(`
        UPDATE marketplace_products SET orders_count = orders_count + 1,
          stock_quantity = CASE WHEN stock_quantity >= ? THEN stock_quantity - ? ELSE stock_quantity END
        WHERE id = ? AND stock_quantity >= ? ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(item.quantity, item.quantity, item.product_id, item.quantity, ...(tenantId ? [tenantId] : [])));
    }

    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, 'new', 'Заказ создан', ?, ?)
    `).bind(generateId(), orderId, user.id, tenantId));
    statements.push(env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ?`).bind(user.id));

    await env.DB.batch(statements);

    // Notify managers
    const managers = await env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('admin', 'director', 'manager', 'marketplace_manager') ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all() as { results: any[] };
    const notifBody = `Заказ ${orderNumber} на сумму ${finalAmount.toLocaleString()} сум`;
    for (const mgr of (managers.results || [])) {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), mgr.id, notifBody, JSON.stringify({ order_id: orderId }), tenantId).run();
      sendPushNotification(env, mgr.id, {
        title: '🛒 Новый заказ', body: notifBody, type: 'marketplace_order',
        tag: `order-new-${orderId}`, data: { orderId, url: '/marketplace' }, requireInteraction: true
      }).catch(() => {});
    }

    log.info('Order created', { orderNumber });
    return json({ order: { id: orderId, order_number: orderNumber, final_amount: finalAmount } }, 201);
  } catch (e: any) {
    log.error('[Marketplace Order] ERROR', e);
    return error('Failed to create order', 500);
  }
});

// Get user orders
route('GET', '/api/marketplace/orders', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let whereClause = 'WHERE o.user_id = ?';
  const params: any[] = [user.id];
  if (tenantId) { whereClause += ' AND o.tenant_id = ?'; params.push(tenantId); }
  if (status) { whereClause += ' AND o.status = ?'; params.push(status); }

  const { results } = await env.DB.prepare(`
    SELECT o.*, (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o ${whereClause} ORDER BY o.created_at DESC LIMIT 500
  `).bind(...params).all();

  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Get single order with items
route('GET', '/api/marketplace/orders/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND (user_id = ? OR ? IN ('admin', 'director', 'manager', 'marketplace_manager'))
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, user.role, ...(tenantId ? [tenantId] : [])).first();
  if (!order) return error('Order not found', 404);

  const { results: items } = await env.DB.prepare(
    `SELECT * FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  const { results: history } = await env.DB.prepare(`
    SELECT h.*, u.name as changed_by_name FROM marketplace_order_history h
    LEFT JOIN users u ON h.changed_by = u.id
    WHERE h.order_id = ? ${tenantId ? 'AND h.tenant_id = ?' : ''} ORDER BY h.created_at DESC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ order, items, history });
});

// Get order items (for manager dashboard)
route('GET', '/api/marketplace/orders/:id/items', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    const order = await env.DB.prepare(
      `SELECT id FROM marketplace_orders WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first();
    if (!order) return error('Access denied', 403);
  } else if (tenantId) {
    const order = await env.DB.prepare(`SELECT id FROM marketplace_orders WHERE id = ? AND tenant_id = ?`).bind(params.id, tenantId).first();
    if (!order) return error('Order not found', 404);
  }

  const { results: items } = await env.DB.prepare(`SELECT * FROM marketplace_order_items WHERE order_id = ?`).bind(params.id).all();
  return json({ items });
});

} // end registerOrderRoutes
