// App settings routes
//
// Sprint 79 P0/F1: settings.key was a global PRIMARY KEY in the schema,
// so `ON CONFLICT(key) DO UPDATE` let tenant B clobber tenant A's row.
// Until the schema migration to a composite UNIQUE(key, tenant_id)
// lands (see cloudflare/migrations/0XX_settings_composite_key.sql),
// the workaround is to tenant-prefix the stored key:
//   stored key = `${tenant_id}::${key}` (or `__no_tenant__::${key}`)
//   exposed key to the API caller = the original `key`
// This isolates tenants even with the broken PK.
//
// Also: the GET /:key endpoint is no longer fully public — it now
// requires auth so unrelated tenants/anonymous clients can't probe
// settings.

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, isManagement } from '../../utils/helpers';

function scopeKey(rawKey: string, tenantId: string | null): string {
  const prefix = tenantId || '__no_tenant__';
  return `${prefix}::${rawKey}`;
}

function unscopeKey(stored: string, tenantId: string | null): string {
  const prefix = tenantId || '__no_tenant__';
  const head = `${prefix}::`;
  return stored.startsWith(head) ? stored.slice(head.length) : stored;
}

export function registerSettingsRoutes() {

// Get all settings
route('GET', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const prefix = (tenantId || '__no_tenant__') + '::';
  const { results } = await env.DB.prepare(
    `SELECT key, value, updated_at FROM settings WHERE key LIKE ?
     AND ${tenantId ? 'tenant_id = ?' : "(tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(prefix + '%', ...(tenantId ? [tenantId] : [])).all();

  // Convert to key-value object, stripping the tenant prefix.
  const settings: Record<string, any> = {};
  for (const row of results as any[]) {
    const k = unscopeKey(row.key, tenantId);
    try {
      settings[k] = JSON.parse(row.value);
    } catch {
      settings[k] = row.value;
    }
  }

  return json({ settings });
});

// Get single setting (auth required — was public; settings rows could
// leak tenant config like branding/contract templates).
route('GET', '/api/settings/:key', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);
  const setting = await env.DB.prepare(
    `SELECT value FROM settings WHERE key = ? AND ${tenantId ? 'tenant_id = ?' : "(tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(scopeKey(params.key, tenantId), ...(tenantId ? [tenantId] : [])).first();

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
  const stored = scopeKey(params.key, tenantId);

  await env.DB.prepare(`
    INSERT INTO settings (key, value, tenant_id, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).bind(stored, value, tenantId, value).run();

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
    const stored = scopeKey(key, tenantId);
    return env.DB.prepare(`
      INSERT INTO settings (key, value, tenant_id, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).bind(stored, value, tenantId, value);
  });

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return json({ success: true });
});

} // end registerSettingsRoutes
