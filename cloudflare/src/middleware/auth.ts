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

  // Check cache first (tenant-aware key).
  // Audit P2: if a user is deactivated in DB while their record is still
  // warm in our 15s in-memory cache, the cached copy keeps working. The DB
  // query below filters by is_active = 1 (so newly-fetched users are always
  // active), but the cache hit path used to return without re-checking.
  // We now select is_active and validate it on every cache hit — keeps the
  // 15s TTL but closes the deactivation window to one request.
  const cacheKey = `user:${token}:${authTenantId || 'main'}`;
  const cachedUser = getCached<User & { is_active?: number }>(cacheKey);
  if (cachedUser) {
    if (cachedUser.is_active === 0) {
      requestUserCache.set(request, null);
      return null;
    }
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

  // Verify JWT and extract userId.
  //
  // Sprint 66 P0/F4: REMOVED the legacy raw-UUID Bearer fallback. Previously
  // if JWT verification failed, the token was assumed to be a userId — which
  // meant ANY leaked user.id (from chat messages, request lists, executor
  // listings, super_banners, audit logs, push targets, ...) authenticated
  // the holder as that user. Mass-impersonation surface was huge.
  // Now: tokens MUST be signed JWTs. Holders of pre-JWT sessions get a
  // single forced re-login.
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || typeof payload.userId !== 'string') {
    requestUserCache.set(request, null);
    return null;
  }
  const userId: string = payload.userId;
  // Sprint 66 P0/F11: JWT also carries `tenantId` (issued at login). On
  // the apex domain (where authTenantId === null) we previously looked up
  // by `WHERE id = ?` only — combined with the legacy UUID fallback this
  // let an attacker pivot between tenants by handing in a leaked id of a
  // user in another tenant. Now: also pin the lookup to the tenantId
  // baked into the verified JWT. The legacy fallback is already removed
  // above, so this is defence in depth.
  const lookupTenantId: string | null = authTenantId
    || ((payload as { tenantId?: string }).tenantId ?? null);

  let result = await env.DB.prepare(
    `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id, is_active FROM users WHERE id = ? ${lookupTenantId ? 'AND tenant_id = ?' : ''} AND is_active = 1 LIMIT 1`
  ).bind(...[userId, ...(lookupTenantId ? [lookupTenantId] : [])]).first();

  // Super admin fallback: super admins have no tenant_id, so the tenanted
  // query above misses them when they visit a tenant subdomain (e.g. the
  // "Super Admin Panel" on kamizo.uz or an impersonation subdomain). Retry
  // the lookup without the tenant filter and accept the row only if the
  // user's role is super_admin — other roles must stay tenant-scoped.
  if (!result && lookupTenantId) {
    const fallback = await env.DB.prepare(
      `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at, account_type, tenant_id, is_active FROM users WHERE id = ? AND is_active = 1 LIMIT 1`
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
