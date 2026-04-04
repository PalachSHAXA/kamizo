// Shopping cart routes — get, add/update, remove, clear

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';

export function registerCartRoutes() {

// Cart - Get
route('GET', '/api/marketplace/cart', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT c.*, p.name_ru, p.name_uz, p.price, p.old_price, p.image_url, p.stock_quantity, p.unit,
           cat.name_ru as category_name_ru, cat.icon as category_icon
    FROM marketplace_cart c
    JOIN marketplace_products p ON c.product_id = p.id
    LEFT JOIN marketplace_categories cat ON p.category_id = cat.id
    WHERE c.user_id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
    ORDER BY c.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  const total = (results as any[]).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemsCount = (results as any[]).reduce((sum, item) => sum + item.quantity, 0);

  return json({ cart: results, total, itemsCount });
});

// Cart - Add/Update item
route('POST', '/api/marketplace/cart', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const { product_id, quantity = 1 } = body;

  if (!product_id || typeof quantity !== 'number' || quantity < 1) {
    return error('Invalid product or quantity');
  }

  const product = await env.DB.prepare(
    `SELECT * FROM marketplace_products WHERE id = ? AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(product_id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!product) return error('Product not found', 404);

  const reservedStock = await env.DB.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total FROM marketplace_cart
    WHERE product_id = ? AND user_id != ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(product_id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  const otherUsersReserved = reservedStock?.total || 0;
  const availableStock = product.stock_quantity - otherUsersReserved;

  if (availableStock < quantity) {
    return error(`Недостаточно товара. Доступно: ${Math.max(0, availableStock)} шт.`, 400);
  }

  await env.DB.prepare(`
    INSERT INTO marketplace_cart (id, user_id, product_id, quantity, created_at, updated_at, tenant_id)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).bind(generateId(), user.id, product_id, quantity, tenantId, quantity).run();

  return json({ success: true });
});

// Cart - Remove item
route('DELETE', '/api/marketplace/cart/:productId', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (tenantId) {
    await env.DB.prepare(
      `DELETE FROM marketplace_cart WHERE user_id = ? AND product_id IN (SELECT id FROM marketplace_products WHERE id = ? AND tenant_id = ?)`
    ).bind(user.id, params.productId, tenantId).run();
  } else {
    await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
  }
  return json({ success: true });
});

// Cart - Clear
route('DELETE', '/api/marketplace/cart', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `DELETE FROM marketplace_cart WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(user.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

} // end registerCartRoutes
