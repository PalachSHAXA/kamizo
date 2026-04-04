// Admin/manager order management — list, update status, assign executor

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
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
    return error('Access denied', 403);
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

  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Manager: Update order status or assign executor
route('PATCH', '/api/marketplace/admin/orders/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { status, comment, executor_id } = body;

  // Assigning executor
  if (executor_id !== undefined) {
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
    const validStatuses = ['confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return error('Invalid status');

    if (status === 'cancelled') {
      const currentOrder = await env.DB.prepare(
        `SELECT status FROM marketplace_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
      if (currentOrder && currentOrder.status !== 'cancelled') {
        const orderItems = await env.DB.prepare(`
          SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
        `).bind(params.id, ...(tenantId ? [tenantId] : [])).all() as { results: { product_id: string, quantity: number }[] };
        for (const item of (orderItems.results || [])) {
          await env.DB.prepare(`
            UPDATE marketplace_products SET stock_quantity = stock_quantity + ?
            WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
          `).bind(item.quantity, item.product_id, ...(tenantId ? [tenantId] : [])).run();
        }
      }
    }

    const statusField = status === 'cancelled' ? 'cancelled_at' : status === 'confirmed' ? 'confirmed_at' :
      status === 'preparing' ? 'preparing_at' : status === 'ready' ? 'ready_at' :
      status === 'delivering' ? 'delivering_at' : status === 'delivered' ? 'delivered_at' : null;

    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();

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
