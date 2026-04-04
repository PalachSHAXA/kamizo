// Admin product + category CRUD + image upload

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';
import { isMarketplaceAdmin } from './helpers';

export function registerAdminProductRoutes() {

route('GET', '/api/marketplace/admin/products', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_products p LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.is_active = 1 ${tenantId ? 'AND p.tenant_id = ?' : ''}
    ORDER BY p.created_at DESC LIMIT 500
  `).bind(...(tenantId ? [tenantId] : [])).all();
  return json({ products: results });
});

route('POST', '/api/marketplace/admin/products', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);
  const body = await request.json() as any;
  const id = generateId();
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    INSERT INTO marketplace_products (
      id, category_id, name_ru, name_uz, description_ru, description_uz,
      price, old_price, unit, stock_quantity, min_order_quantity, max_order_quantity,
      weight, weight_unit, image_url, images, is_active, is_featured, created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.category_id, body.name_ru, body.name_uz || body.name_ru,
    body.description_ru || null, body.description_uz || null,
    body.price, body.old_price || null, body.unit || 'шт',
    body.stock_quantity || 0, body.min_order_quantity || 1, body.max_order_quantity || null,
    body.weight || null, body.weight_unit || 'кг',
    body.image_url || null, body.images ? JSON.stringify(body.images) : null,
    body.is_active !== false ? 1 : 0, body.is_featured ? 1 : 0, user.id, tenantId
  ).run();

  const created = await env.DB.prepare(
    `SELECT * FROM marketplace_products WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ product: created }, 201);
});

route('PATCH', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['category_id', 'name_ru', 'name_uz', 'description_ru', 'description_uz', 'price', 'old_price',
    'unit', 'stock_quantity', 'min_order_quantity', 'max_order_quantity', 'weight', 'weight_unit', 'image_url', 'is_featured'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_featured' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (body.images) { updates.push('images = ?'); values.push(JSON.stringify(body.images)); }

  const tenantId = getTenantId(request);
  if (updates.length > 0) {
    updates.push('updated_at = datetime("now")');
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE marketplace_products SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(
    `SELECT * FROM marketplace_products WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ product: updated });
});

route('DELETE', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `UPDATE marketplace_products SET is_active = 0 WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

route('POST', '/api/marketplace/admin/upload-image', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  try {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) return error('Content-Type must be multipart/form-data', 400);

    const formData = await request.formData();
    const file = formData.get('image') as unknown as File;
    if (!file) return error('No image file provided', 400);

    const originalName = file.name || 'image';
    const sanitizedName = originalName.replace(/\.\./g, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/^\.+/, '');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const fileExtension = sanitizedName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

    if (!allowedTypes.includes(file.type)) return error('Invalid file type. Allowed: JPEG, PNG, GIF, WEBP', 400);
    if (fileExtension && !allowedExtensions.includes(fileExtension)) return error('Invalid file extension', 400);
    if (file.size > 5 * 1024 * 1024) return error('File too large. Maximum size: 5MB', 400);

    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    return json({ image_url: `data:${file.type};base64,${base64}` });
  } catch (err) {
    const log = createRequestLogger(request);
    log.error('Image upload error', err);
    return error('Failed to upload image', 500);
  }
});

route('POST', '/api/marketplace/admin/categories', async (request, env) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  const body = await request.json() as any;
  const id = generateId();
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    INSERT INTO marketplace_categories (id, name_ru, name_uz, icon, parent_id, sort_order, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.name_ru, body.name_uz || body.name_ru, body.icon || '📦', body.parent_id || null, body.sort_order || 99, tenantId).run();

  const created = await env.DB.prepare(
    `SELECT * FROM marketplace_categories WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ category: created }, 201);
});

route('PATCH', '/api/marketplace/admin/categories/:id', async (request, env, params) => {
  const fc = await requireFeature('marketplace', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user || !isMarketplaceAdmin(user.role)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['name_ru', 'name_uz', 'icon', 'parent_id', 'sort_order', 'is_active'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }

  if (updates.length > 0) {
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE marketplace_categories SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(
    `SELECT * FROM marketplace_categories WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ category: updated });
});

} // end registerAdminProductRoutes
