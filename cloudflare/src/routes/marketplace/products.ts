// Public marketplace product routes — categories, product listing, single product

import { route } from '../../router';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { getCached, setCache } from '../../middleware/cache-local';
import { json, error } from '../../utils/helpers';

export function registerProductRoutes() {

// Marketplace: Get categories (PUBLIC)
route('GET', '/api/marketplace/categories', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);

  const cacheKey = `marketplace-categories:${tenantId || 'global'}`;
  const cached = getCached<any>(cacheKey);
  if (cached) return json(cached);

  const { results } = await env.DB.prepare(`
    SELECT * FROM marketplace_categories WHERE is_active = 1 ${tenantId ? "AND (tenant_id = ? OR tenant_id IS NULL OR tenant_id = '')" : ''}
    ORDER BY sort_order LIMIT 500
  `).bind(...(tenantId ? [tenantId] : [])).all();
  const result = { categories: results };
  setCache(cacheKey, result, 300000); // 5 min cache
  return json(result);
});

// Marketplace: Get products with filtering (PUBLIC)
route('GET', '/api/marketplace/products', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const featured = url.searchParams.get('featured');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  const tenantId = getTenantId(request);
  let whereClause = 'WHERE p.is_active = 1';
  const params: any[] = [];

  if (tenantId) { whereClause += ' AND p.tenant_id = ?'; params.push(tenantId); }
  if (categoryId) { whereClause += ' AND p.category_id = ?'; params.push(categoryId); }
  if (search) {
    whereClause += ' AND (p.name_ru LIKE ? OR p.name_uz LIKE ? OR p.description_ru LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (featured === 'true') { whereClause += ' AND p.is_featured = 1'; }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_products p ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY p.is_featured DESC, p.orders_count DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  return json({ products: results, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Marketplace: Get single product (PUBLIC)
route('GET', '/api/marketplace/products/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const tenantId = getTenantId(request);
  const product = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!product) return error('Product not found', 404);

  const { results: reviews } = await env.DB.prepare(`
    SELECT r.*, u.name as user_name
    FROM marketplace_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ? AND r.is_visible = 1 ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY r.created_at DESC LIMIT 10
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ product, reviews });
});

// Marketplace: Favorites - Get
route('GET', '/api/marketplace/favorites', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const { getUser } = await import('../../middleware/auth');
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_favorites f
    JOIN marketplace_products p ON f.product_id = p.id
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE f.user_id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
    ORDER BY f.created_at DESC LIMIT 500
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ favorites: results });
});

// Marketplace: Favorites - Toggle
route('POST', '/api/marketplace/favorites/:productId', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const { getUser } = await import('../../middleware/auth');
  const { generateId } = await import('../../utils/helpers');
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (tenantId) {
    const product = await env.DB.prepare(`SELECT id FROM marketplace_products WHERE id = ? AND tenant_id = ?`).bind(params.productId, tenantId).first();
    if (!product) return error('Product not found', 404);
  }

  const existing = await env.DB.prepare(`SELECT id FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).first();

  if (existing) {
    await env.DB.prepare(`DELETE FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
    return json({ favorited: false });
  } else {
    await env.DB.prepare(`INSERT INTO marketplace_favorites (id, user_id, product_id, tenant_id) VALUES (?, ?, ?, ?)`).bind(generateId(), user.id, params.productId, tenantId).run();
    return json({ favorited: true });
  }
});

} // end registerProductRoutes
