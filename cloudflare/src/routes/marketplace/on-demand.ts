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
import { json, error, generateId } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

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
}
