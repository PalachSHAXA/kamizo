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

  // JWT fallback removed 2026-03-16
  // Previously accepted raw token as userId — now strictly requires valid JWT
  if (!payload) {
    requestUserCache.set(request, null);
    return null;
  }
  const userId = payload.userId;

  // Query DB by userId
  const result = await env.DB.prepare(
    `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE id = ? ${authTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...[userId, ...(authTenantId ? [authTenantId] : [])]).first();

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

    setCache(cacheKey, user, 60000);
    requestUserCache.set(request, user as User);
    return user as User;
  }

  requestUserCache.set(request, null);
  return null;
}
