// Authentication middleware
// Validates JWT Bearer tokens and resolves user from DB

import type { Env, User } from '../types';
import { getCached, setCache } from './cache-local';
import { getTenantId, setTenantForRequest } from './tenant';
import { verifyJWT } from '../utils/crypto';

// Per-request user cache to avoid double-lookup when getUser is called
// multiple times for the same request (e.g., rate limiter + route handler)
const requestUserCache = new WeakMap<Request, User | null>();

// Auth middleware with caching
export async function getUser(request: Request, env: Env): Promise<User | null> {
  // Return cached result if getUser was already called for this request
  if (requestUserCache.has(request)) {
    return requestUserCache.get(request)!;
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    requestUserCache.set(request, null);
    return null;
  }

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
    requestUserCache.set(request, cachedUser);
    return cachedUser;
  }

  // Verify JWT and extract userId
  const payload = await verifyJWT(token, env.JWT_SECRET);

  // Fallback: accept raw userId token for backward compatibility with existing sessions
  // This ensures users don't get logged out after JWT migration
  let userId: string;
  if (payload) {
    userId = payload.userId;
  } else {
    // Assume raw token is a userId (UUID format) — legacy session
    userId = token;
  }

  // Query DB by userId
  // On subdomain: filter by tenant_id for isolation
  // On main domain: find user across ALL tenants (mobile app uses main domain)
  let result = await env.DB.prepare(
    `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE id = ? ${authTenantId ? 'AND tenant_id = ?' : ''} AND is_active = 1 LIMIT 1`
  ).bind(...[userId, ...(authTenantId ? [authTenantId] : [])]).first();

  // Super admin fallback: super admins have no tenant_id, so the tenanted
  // query above misses them when they visit a tenant subdomain (e.g. the
  // "Super Admin Panel" on kamizo.uz or an impersonation subdomain). Retry
  // the lookup without the tenant filter and accept the row only if the
  // user's role is super_admin — other roles must stay tenant-scoped.
  if (!result && authTenantId) {
    const fallback = await env.DB.prepare(
      `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE id = ? AND is_active = 1 LIMIT 1`
    ).bind(userId).first() as any;
    if (fallback && fallback.role === 'super_admin') {
      result = fallback;
    }
  }

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
        requestUserCache.set(request, null);
        return null;
      }
    }

    setCache(cacheKey, user, 15000);
    requestUserCache.set(request, user as User);
    return user as User;
  }

  requestUserCache.set(request, null);
  return null;
}
