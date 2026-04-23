// App settings routes

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';

export function registerSettingsRoutes() {

// Get all settings
route('GET', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT key, value, updated_at FROM settings WHERE ${tenantId ? 'tenant_id = ?' : "(tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  // Convert to key-value object
  const settings: Record<string, any> = {};
  for (const row of results as any[]) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return json({ settings });
});

// Get single setting
// PUBLIC: no auth required
route('GET', '/api/settings/:key', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const setting = await env.DB.prepare(
    `SELECT value FROM settings WHERE key = ? AND ${tenantId ? 'tenant_id = ?' : "(tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...[params.key, ...(tenantId ? [tenantId] : [])]).first();

  if (!setting) {
    return json({ value: null });
  }

  try {
    return json({ value: JSON.parse((setting as any).value) });
  } catch {
    return json({ value: (setting as any).value });
  }
});

// Set/update setting
route('PUT', '/api/settings/:key', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    INSERT INTO settings (key, value, tenant_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).bind(params.key, value, tenantId, value).run();

  return json({ success: true, key: params.key });
});

// Bulk update settings
route('POST', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as Record<string, any>;
  const tenantId = getTenantId(request);

  const statements = Object.entries(body).map(([key, val]) => {
    const value = typeof val === 'string' ? val : JSON.stringify(val);
    return env.DB.prepare(`
      INSERT INTO settings (key, value, tenant_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).bind(key, value, tenantId, value);
  });

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return json({ success: true });
});

} // end registerSettingsRoutes
