// Admin/manager order management — list, update status, assign executor

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, bilingualError, generateId } from '../../utils/helpers';
import { sendPushNotification } from '../../index';
import { createRequestLogger } from '../../utils/logger';
import { isMarketplaceAdmin } from './helpers';

export function registerAdminOrderRoutes() {

// Manager: Get all orders
route('GET', '/api/marketplace/admin/orders', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  const userRoleNorm = (user?.role || '').trim().toLowerCase();
  if (!user || !isMarketplaceAdmin(userRoleNorm)) {
    const log = createRequestLogger(request);
    log.warn('GET /api/marketplace/admin/orders - access denied', { userRole: user?.role, userId: user?.id });
    return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  const tenantId = getTenantId(request);
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];
  if (tenantId) { whereClause += ' AND o.tenant_id = ?'; params.push(tenantId); }
  if (status) { whereClause += ' AND o.status = ?'; params.push(status); }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_orders o ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      e.name as executor_name, e.phone as executor_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o LEFT JOIN users u ON o.user_id = u.id LEFT JOIN users e ON o.executor_id = e.id
    ${whereClause} ORDER BY o.created_at DESC LIMIT ? OFFSET ?
  `).bind(...params).all();

  // Fetch all items for returned orders in one query (avoid N+1)
  const orders = results || [];
  let ordersWithItems: any[] = [];
  if (orders.length > 0) {
    const orderIds = orders.map((o: any) => o.id);
    const placeholders = orderIds.map(() => '?').join(',');
    const { results: allItems } = await env.DB.prepare(`
      SELECT id, order_id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id IN (${placeholders})
    `).bind(...orderIds).all();

    const itemsByOrder = new Map<string, any[]>();
    for (const item of (allItems || []) as any[]) {
      const list = itemsByOrder.get(item.order_id) || [];
      list.push(item);
      itemsByOrder.set(item.order_id, list);
    }

    ordersWithItems = orders.map((order: any) => ({
      ...order,
      items: itemsByOrder.get(order.id) || [],
    }));
  }

  return json({ orders: ordersWithItems, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Manager: Update order status or assign executor
route('PATCH', '/api/marketplace/admin/orders/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { status, comment, executor_id } = body;

  // Assigning executor
  if (executor_id !== undefined) {
    // Sprint 63 P0: validate executor before assignment. Was writing
    // body.executor_id verbatim — manager could route orders to any
    // user id (including a foreign-tenant user or a non-courier).
    if (executor_id !== null) {
      const executorRow = await env.DB.prepare(
        `SELECT id FROM users WHERE id = ? AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''} AND (specialization = 'courier' OR role IN ('manager', 'admin'))`
      ).bind(executor_id, ...(tenantId ? [tenantId] : [])).first();
      if (!executorRow) return error('Executor not found in tenant or not a courier', 404);
    }

    await env.DB.prepare(`
      UPDATE marketplace_orders SET executor_id = ?, assigned_at = datetime('now'),
        status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(executor_id, params.id, ...(tenantId ? [tenantId] : [])).run();

    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, 'confirmed', 'Назначен исполнитель', ?, ?)
    `).bind(generateId(), params.id, user.id, tenantId).run();

    if (executor_id) {
      const order = await env.DB.prepare(
        `SELECT order_number, user_id FROM marketplace_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

      const execBody = `Вам назначен заказ ${order?.order_number || ''}`;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), executor_id, execBody, JSON.stringify({ order_id: params.id }), tenantId).run();
      sendPushNotification(env, executor_id, {
        title: '🛒 Новый заказ назначен', body: execBody, type: 'marketplace_order',
        tag: `order-assigned-${params.id}`, data: { orderId: params.id, url: '/' }, requireInteraction: true
      }).catch(() => {});

      if (order?.user_id) {
        const custBody = `Заказ ${order.order_number} подтверждён`;
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
          VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
        `).bind(generateId(), order.user_id, custBody, JSON.stringify({ order_id: params.id }), tenantId).run();
        sendPushNotification(env, order.user_id, {
          title: '🛒 Заказ подтверждён', body: custBody, type: 'marketplace_order',
          tag: `order-status-${params.id}`, data: { orderId: params.id, url: '/' }, requireInteraction: false
        }).catch(() => {});
      }
    }
    return json({ success: true });
  }

  // Updating status
  if (status) {
    const validStatuses = [
      // Stock lifecycle (existing)
      'confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled',
      // On-demand (special-delivery) states, migration 054
      'awaiting_price', 'price_pending', 'price_offered',
      'price_accepted', 'price_declined', 'unavailable',
    ];
    if (!validStatuses.includes(status)) return error('Invalid status');

    // Sprint 63 P0: status transition matrix. Was allowing any → any
    // (manager could jump new → delivered, skipping packing/delivery).
    // From=any-of, To=target. 'cancelled' may be reached from any non-
    // terminal state. 'delivered' may only be reached from 'delivering'.
    //
    // On-demand (migration 054) path bridges into the stock pipeline at
    // price_accepted → confirmed, so a special-delivery order that got
    // its price agreed on goes through the same preparing/ready/delivering
    // path as a regular in-stock order.
    const transitions: Record<string, string[]> = {
      // Stock lifecycle
      confirmed:  ['new', 'price_accepted'],   // ← bridge from on-demand
      preparing:  ['new', 'confirmed'],
      ready:      ['preparing'],
      delivering: ['ready', 'preparing', 'confirmed'],
      delivered:  ['delivering'],
      cancelled: [
        'new', 'confirmed', 'preparing', 'ready', 'delivering',
        // On-demand states cancellable while price is being negotiated
        'awaiting_price', 'price_pending', 'price_offered',
      ],
      // On-demand lifecycle
      price_pending:  ['awaiting_price'],
      price_offered:  ['price_pending'],
      price_accepted: ['price_offered'],
      price_declined: ['price_offered'],
      unavailable:    ['price_pending'],
    };

    const currentOrder = await env.DB.prepare(
      `SELECT status FROM marketplace_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (!currentOrder) return error('Order not found', 404);

    // Idempotency: re-PATCHing the same status is a no-op (avoids
    // duplicate history rows and overwritten timestamps).
    if (currentOrder.status === status) return json({ success: true, noop: true });

    const allowedFrom = transitions[status] || [];
    if (!allowedFrom.includes(currentOrder.status)) {
      return error(`Invalid transition: ${currentOrder.status} → ${status}`, 409);
    }

    if (status === 'cancelled') {
      // Refund stock once. Already gated by transition matrix above —
      // can't re-cancel because no-op fired earlier.
      const orderItems = await env.DB.prepare(`
        SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(params.id, ...(tenantId ? [tenantId] : [])).all() as { results: { product_id: string, quantity: number }[] };
      const refunds = (orderItems.results || []).map(item =>
        env.DB.prepare(`
          UPDATE marketplace_products SET stock_quantity = stock_quantity + ?
          WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
        `).bind(item.quantity, item.product_id, ...(tenantId ? [tenantId] : []))
      );
      if (refunds.length > 0) await env.DB.batch(refunds);
    }

    const statusField = status === 'cancelled' ? 'cancelled_at' : status === 'confirmed' ? 'confirmed_at' :
      status === 'preparing' ? 'preparing_at' : status === 'ready' ? 'ready_at' :
      status === 'delivering' ? 'delivering_at' : status === 'delivered' ? 'delivered_at' :
      status === 'price_offered' ? 'price_offered_at' :   // migration 054
      null;

    // Null-safe: the 5 other on-demand statuses (awaiting_price,
    // price_pending, price_accepted, price_declined, unavailable) have
    // no dedicated timestamp column — only updated_at is written for
    // them. Without this guard the SQL would emit `SET status = ?, null
    // = datetime('now')` and 500 on any PATCH with those statuses.
    const stampCol = statusField ? `, ${statusField} = datetime('now')` : '';

    // Status precondition on UPDATE so a concurrent transition can't slip past.
    const statusUpdate = await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?${stampCol}, updated_at = datetime('now')
      WHERE id = ? AND status = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, currentOrder.status, ...(tenantId ? [tenantId] : [])).run();

    if (!statusUpdate.meta || statusUpdate.meta.changes === 0) {
      return error('Order status changed concurrently — retry', 409);
    }

    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(generateId(), params.id, status, comment || null, user.id, tenantId).run();

    const order = await env.DB.prepare(
      `SELECT user_id, order_number FROM marketplace_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (order) {
      const statusLabels: Record<string, string> = {
        confirmed: 'подтверждён', preparing: 'готовится', ready: 'готов к выдаче',
        delivering: 'доставляется', delivered: 'доставлен', cancelled: 'отменён'
      };
      const notifBody = `Заказ ${order.order_number} ${statusLabels[status]}`;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), order.user_id, notifBody, JSON.stringify({ order_id: params.id }), tenantId).run();
      sendPushNotification(env, order.user_id, {
        title: status === 'cancelled' ? '❌ Заказ отменён' : '🛒 Статус заказа',
        body: notifBody, type: 'marketplace_order', tag: `order-status-${params.id}`,
        data: { orderId: params.id, url: '/' }, requireInteraction: status === 'delivered' || status === 'cancelled'
      }).catch(() => {});
    }
  }

  return json({ success: true });
});

} // end registerAdminOrderRoutes
