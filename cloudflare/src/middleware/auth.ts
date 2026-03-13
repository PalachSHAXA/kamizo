// Authentication middleware
// Extracts and validates user from Bearer token
// For datacenter migration: swap token validation with JWT or session-based auth

import type { Env, User } from '../types';
import { getCached, setCache } from './cache-local';
import { getTenantId, setTenantForRequest } from './tenant';

// Auth middleware with caching
export async function getUser(request: Request, env: Env): Promise<User | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);

  // Use request-scoped tenant (safe from race conditions)
  const authTenantId = getTenantId(request);

  // Check cache first (tenant-aware key)
  const cacheKey = `user:${token}:${authTenantId || 'main'}`;
  const cachedUser = getCached<User>(cacheKey);
  if (cachedUser) {
    if (!authTenantId) {
      if ((cachedUser as any).tenant_id) {
        setTenantForRequest(request, { id: (cachedUser as any).tenant_id });
      } else if (cachedUser.role !== 'super_admin') {
        setTenantForRequest(request, { id: '__no_tenant__' });
      }
    }
    return cachedUser;
  }

  // Query DB
  let result = await env.DB.prepare(
    `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE id = ? ${authTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...[token, ...(authTenantId ? [authTenantId] : [])]).first();

  if (result) {
    const user = result as any;

    if (!authTenantId) {
      if (user.tenant_id) {
        setTenantForRequest(request, { id: user.tenant_id });
      } else if (user.role !== 'super_admin') {
        setTenantForRequest(request, { id: '__no_tenant__' });
      }
    }

    // Block feature-gated roles
    if (authTenantId && user.role === 'advertiser') {
      const tenant = (await env.DB.prepare('SELECT features FROM tenants WHERE id = ?').bind(authTenantId).first()) as any;
      const features: string[] = tenant?.features ? JSON.parse(tenant.features) : [];
      if (!features.includes(user.role)) {
        return null;
      }
    }

    setCache(cacheKey, user, 60000);
    return user as User;
  }

  return null;
}
