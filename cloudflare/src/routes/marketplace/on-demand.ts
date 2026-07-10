// On-demand (special-delivery) marketplace requests.
//
// The resident asks the УК to bring a product that isn't in stock — the
// price is set by the manager after negotiating on the market, not from
// marketplace_products.price. This is Stage 3a of the on-demand rollout:
// resident submits the request; Stage 3b will let the manager set a
// price and Stage 3c ties the 24h response timer.

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, bilingualError, generateId } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';
import { isMarketplaceAdmin } from './helpers';

export function registerOnDemandRoutes() {
  // Resident: submit a request for an on-demand (special-delivery) product.
  // Distinct from POST /api/marketplace/orders which reads the resident's
  // marketplace_cart. On-demand is single-product-per-request with no cart
  // step because the price is unknown at creation time — the manager
  // negotiates via price_offered/price_accepted states (Stage 3b).
  route('POST', '/api/marketplace/orders/on-demand', async (request, env) => {
    const fc = await requireFeature('marketplace', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const log = createRequestLogger(request);

    try {
      const body = await request.json() as any;
      const {
        product_id,
        quantity,
        delivery_address,
        delivery_apartment,
        delivery_entrance,
        delivery_floor,
        delivery_phone,
        delivery_notes,
      } = body;

      if (!product_id) return error('product_id required', 400);
      if (!quantity || typeof quantity !== 'number' || quantity < 1) {
        return error('quantity must be a positive integer', 400);
      }
      // Address + phone are mandatory in body (no user-fallback): the
      // resident profile might not have address/phone filled in (qa-res
      // is exactly this case), and a courier can't work with an empty
      // string. apartment/entrance/floor stay optional with user-fallback.
      if (!delivery_address || typeof delivery_address !== 'string' || delivery_address.trim().length === 0) {
        return error('delivery_address required', 400);
      }
      if (!delivery_phone || typeof delivery_phone !== 'string' || delivery_phone.trim().length === 0) {
        return error('delivery_phone required', 400);
      }

      const tenantId = getTenantId(request);
      if (!tenantId) return error('Tenant context required', 401);

      // Product must exist in the caller's tenant, be active, AND be
      // flagged is_on_demand=1. Regular stock products go through the
      // cart flow; this guard means the frontend can safely tie the
      // «Заказать под привоз» button to a per-product flag without a
      // race window.
      const product = await env.DB.prepare(
        `SELECT id, name_ru, name_uz, image_url, is_on_demand
         FROM marketplace_products
         WHERE id = ? AND tenant_id = ? AND is_active = 1`
      ).bind(product_id, tenantId).first() as any;

      if (!product) return error('Product not found', 404);
      if (product.is_on_demand !== 1) {
        return error('Product is not available for on-demand order (use regular cart flow)', 400);
      }

      // Product name fallback: RU → UZ → generic. Guards against rows
      // with empty name_ru even though the column is NOT NULL (empty
      // string is legal at the schema level).
      const productName = product.name_ru || product.name_uz || 'Товар';

      // Order number: reuse the same MP-YYYYMMDD-NNNN format as stock
      // orders (order_type discriminates). Scoped per-tenant.
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderCount = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM marketplace_orders
         WHERE order_number LIKE ? AND tenant_id = ?`
      ).bind(`MP-${today}%`, tenantId).first() as any;
      const orderNumber = `MP-${today}-${String((orderCount?.count || 0) + 1).padStart(4, '0')}`;

      const orderId = generateId();
      const orderItemId = generateId();

      // Amounts start at 0 — "price not yet set" placeholder. Migration
      // 056 made only product_id nullable in order_items; unit_price /
      // total_price / total_amount / final_amount remain NOT NULL. Zero
      // is semantically "in negotiation"; Stage 3b UPDATE fills real
      // numbers when the manager sets a price. admin-dashboard SUM
      // aggregates are gated by status='delivered' so amount=0 doesn't
      // pollute revenue.
      const statements = [
        env.DB.prepare(`
          INSERT INTO marketplace_orders (
            id, order_number, user_id, status, order_type,
            total_amount, delivery_fee, final_amount,
            delivery_address, delivery_apartment, delivery_entrance, delivery_floor,
            delivery_phone, delivery_notes,
            payment_method, tenant_id
          ) VALUES (?, ?, ?, 'awaiting_price', 'on_demand', 0, 0, 0, ?, ?, ?, ?, ?, ?, 'cash', ?)
        `).bind(
          orderId, orderNumber, user.id,
          delivery_address.trim(),
          (delivery_apartment && String(delivery_apartment).trim()) || (user as any).apartment || '',
          (delivery_entrance && String(delivery_entrance).trim()) || (user as any).entrance || '',
          (delivery_floor && String(delivery_floor).trim()) || (user as any).floor || '',
          delivery_phone.trim(),
          (delivery_notes && String(delivery_notes).trim()) || null,
          tenantId,
        ),
        env.DB.prepare(`
          INSERT INTO marketplace_order_items (
            id, order_id, product_id, product_name, product_image,
            quantity, unit_price, total_price, tenant_id
          ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
        `).bind(
          orderItemId, orderId, product_id,
          productName,
          product.image_url || null,
          quantity,
          tenantId,
        ),
        env.DB.prepare(`
          INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
          VALUES (?, ?, 'awaiting_price', 'Заявка на привоз создана', ?, ?)
        `).bind(generateId(), orderId, user.id, tenantId),
      ];

      await env.DB.batch(statements);

      log.info('On-demand order created', {
        orderId, orderNumber, productId: product_id, quantity, userId: user.id,
      });

      return json({
        order: {
          id: orderId,
          order_number: orderNumber,
          status: 'awaiting_price',
          order_type: 'on_demand',
          product_id,
          product_name: productName,
          quantity,
        },
      }, 201);
    } catch (err) {
      log.error('On-demand order creation error', err);
      return error('Failed to create on-demand order', 500);
    }
  });

  // ────────────────────────────────────────────────────────────────
  // Stage 3b — price negotiation actions
  // ────────────────────────────────────────────────────────────────

  // Manager offers a price: price_pending → price_offered.
  // Body: { unit_price: number, delivery_fee: number }
  //
  // On-demand orders are single-item by construction (POST /on-demand
  // creates exactly one order_item), so a single unit_price fully
  // describes the offer. If multi-item on-demand ever ships, this
  // signature grows to an array.
  route('PATCH', '/api/marketplace/admin/orders/:id/offer-price', async (request, env, params) => {
    const fc = await requireFeature('marketplace', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const user = await getUser(request, env);
    const roleNorm = (user?.role || '').trim().toLowerCase();
    if (!user || !isMarketplaceAdmin(roleNorm)) {
      return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
    }

    const log = createRequestLogger(request);
    try {
      const body = await request.json() as any;
      const { unit_price, delivery_fee } = body;

      if (typeof unit_price !== 'number' || unit_price < 0) {
        return error('unit_price must be a non-negative number', 400);
      }
      if (typeof delivery_fee !== 'number' || delivery_fee < 0) {
        return error('delivery_fee must be a non-negative number', 400);
      }

      const tenantId = getTenantId(request);
      if (!tenantId) return error('Tenant context required', 401);

      const order = await env.DB.prepare(
        `SELECT id, status, order_type FROM marketplace_orders
         WHERE id = ? AND tenant_id = ?`
      ).bind(params.id, tenantId).first() as any;
      if (!order) return error('Order not found', 404);
      if (order.order_type !== 'on_demand') return error('Not an on-demand order', 400);
      if (order.status !== 'price_pending') {
        return error(`Cannot offer price from status '${order.status}'`, 409);
      }

      const item = await env.DB.prepare(
        `SELECT id, quantity FROM marketplace_order_items
         WHERE order_id = ? AND tenant_id = ? LIMIT 1`
      ).bind(params.id, tenantId).first() as any;
      if (!item) return error('Order item missing', 500);

      const itemTotal = unit_price * item.quantity;
      const finalAmount = itemTotal + delivery_fee;

      // Atomic batch: item price → order amounts+status → history.
      // WHERE status='price_pending' precondition on the orders UPDATE
      // survives concurrent transitions (two managers hitting the
      // button — the second gets meta.changes=0 and we return 409).
      const statements = [
        env.DB.prepare(`
          UPDATE marketplace_order_items
          SET unit_price = ?, total_price = ?
          WHERE id = ? AND tenant_id = ?
        `).bind(unit_price, itemTotal, item.id, tenantId),
        env.DB.prepare(`
          UPDATE marketplace_orders
          SET total_amount = ?, delivery_fee = ?, final_amount = ?,
              status = 'price_offered',
              price_offered_at = datetime('now'),
              price_offered_expires_at = datetime('now', '+24 hours'),
              updated_at = datetime('now')
          WHERE id = ? AND status = 'price_pending' AND tenant_id = ?
        `).bind(itemTotal, delivery_fee, finalAmount, params.id, tenantId),
        env.DB.prepare(`
          INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
          VALUES (?, ?, 'price_offered', ?, ?, ?)
        `).bind(
          generateId(), params.id,
          `Цена предложена: товар ${itemTotal} сум + доставка ${delivery_fee} сум = ${finalAmount} сум`,
          user.id, tenantId,
        ),
      ];

      const results = await env.DB.batch(statements);
      const orderUpdate = results[1] as any;
      if (!orderUpdate.meta || orderUpdate.meta.changes === 0) {
        return error('Order status changed concurrently — retry', 409);
      }

      log.info('On-demand price offered', {
        orderId: params.id, unit_price, delivery_fee, finalAmount, managerId: user.id,
      });

      return json({
        success: true,
        order: {
          id: params.id,
          status: 'price_offered',
          total_amount: itemTotal,
          delivery_fee,
          final_amount: finalAmount,
        },
      });
    } catch (err) {
      log.error('offer-price error', err);
      return error('Failed to offer price', 500);
    }
  });

  // Resident accepts the offered price: price_offered → confirmed
  // via the intermediate price_accepted (matrix respects both hops).
  //
  // Ownership + state check: this resident, this order, on_demand,
  // status=price_offered. Two-step batched transitions so the matrix
  // isn't bypassed and history records both semantic events.
  route('POST', '/api/marketplace/orders/:id/accept-price', async (request, env, params) => {
    const fc = await requireFeature('marketplace', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const log = createRequestLogger(request);
    try {
      const tenantId = getTenantId(request);
      if (!tenantId) return error('Tenant context required', 401);

      const order = await env.DB.prepare(
        `SELECT id, status, order_type, user_id FROM marketplace_orders
         WHERE id = ? AND tenant_id = ?`
      ).bind(params.id, tenantId).first() as any;
      if (!order) return error('Order not found', 404);
      if (order.user_id !== user.id) return error('Not your order', 403);
      if (order.order_type !== 'on_demand') return error('Not an on-demand order', 400);
      if (order.status !== 'price_offered') {
        return error(`Cannot accept price from status '${order.status}'`, 409);
      }

      // Both UPDATEs use their own status precondition. The second
      // UPDATE runs against the row the first UPDATE just wrote —
      // atomic within the batch. If the row was mutated concurrently
      // between statements, the second UPDATE's WHERE fails and we
      // detect meta.changes=0 → return 409.
      const statements = [
        env.DB.prepare(`
          UPDATE marketplace_orders
          SET status = 'price_accepted', updated_at = datetime('now')
          WHERE id = ? AND status = 'price_offered' AND user_id = ? AND tenant_id = ?
        `).bind(params.id, user.id, tenantId),
        env.DB.prepare(`
          INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
          VALUES (?, ?, 'price_accepted', 'Цена принята клиентом', ?, ?)
        `).bind(generateId(), params.id, user.id, tenantId),
        env.DB.prepare(`
          UPDATE marketplace_orders
          SET status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status = 'price_accepted' AND user_id = ? AND tenant_id = ?
        `).bind(params.id, user.id, tenantId),
        env.DB.prepare(`
          INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
          VALUES (?, ?, 'confirmed', 'Заказ подтверждён и принят в работу', ?, ?)
        `).bind(generateId(), params.id, user.id, tenantId),
      ];

      const results = await env.DB.batch(statements);
      const finalUpdate = results[2] as any;
      if (!finalUpdate.meta || finalUpdate.meta.changes === 0) {
        return error('Order status changed concurrently — retry', 409);
      }

      log.info('On-demand price accepted', { orderId: params.id, userId: user.id });
      return json({ success: true, order: { id: params.id, status: 'confirmed' } });
    } catch (err) {
      log.error('accept-price error', err);
      return error('Failed to accept price', 500);
    }
  });

  // Resident declines the offered price: price_offered → price_declined
  // (terminal). Optional reason stored in cancellation_reason (same
  // column, semantically fits "why this negotiation ended").
  route('POST', '/api/marketplace/orders/:id/decline-price', async (request, env, params) => {
    const fc = await requireFeature('marketplace', env, request);
    if (!fc.allowed) return error(fc.error!, 403);

    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);

    const log = createRequestLogger(request);
    try {
      const body = await request.json().catch(() => ({})) as any;
      const reason = body?.reason && typeof body.reason === 'string' ? body.reason.trim() : null;

      const tenantId = getTenantId(request);
      if (!tenantId) return error('Tenant context required', 401);

      const order = await env.DB.prepare(
        `SELECT id, status, order_type, user_id FROM marketplace_orders
         WHERE id = ? AND tenant_id = ?`
      ).bind(params.id, tenantId).first() as any;
      if (!order) return error('Order not found', 404);
      if (order.user_id !== user.id) return error('Not your order', 403);
      if (order.order_type !== 'on_demand') return error('Not an on-demand order', 400);
      if (order.status !== 'price_offered') {
        return error(`Cannot decline price from status '${order.status}'`, 409);
      }

      const statements = [
        env.DB.prepare(`
          UPDATE marketplace_orders
          SET status = 'price_declined', cancellation_reason = ?, updated_at = datetime('now')
          WHERE id = ? AND status = 'price_offered' AND user_id = ? AND tenant_id = ?
        `).bind(reason || null, params.id, user.id, tenantId),
        env.DB.prepare(`
          INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
          VALUES (?, ?, 'price_declined', ?, ?, ?)
        `).bind(
          generateId(), params.id,
          reason ? `Клиент отказался: ${reason}` : 'Клиент отказался',
          user.id, tenantId,
        ),
      ];

      const results = await env.DB.batch(statements);
      const upd = results[0] as any;
      if (!upd.meta || upd.meta.changes === 0) {
        return error('Order status changed concurrently — retry', 409);
      }

      log.info('On-demand price declined', { orderId: params.id, userId: user.id, hasReason: !!reason });
      return json({ success: true, order: { id: params.id, status: 'price_declined' } });
    } catch (err) {
      log.error('decline-price error', err);
      return error('Failed to decline price', 500);
    }
  });
}
