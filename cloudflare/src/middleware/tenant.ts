// Tenant resolution middleware
// Handles multi-tenant isolation via subdomain detection
// For datacenter migration: keep as-is, just change the hostname parsing if needed

import type { Env, User } from '../types';
import { getCached, setCache } from './cache-local';

// Request-scoped tenant map (safe from race conditions — no global mutable state)
const requestTenantMap = new WeakMap<Request, Record<string, unknown>>();

// Get current tenant ID (request-scoped only)
export function getTenantId(req?: Request): string | null {
  if (req) {
    const tenant = requestTenantMap.get(req);
    return (tenant?.id as string) || null;
  }
  return null;
}

export function setTenantForRequest(request: Request, tenant: Record<string, unknown>) {
  requestTenantMap.set(request, tenant);
}

/** @deprecated No-op. Use setTenantForRequest(request, tenant) instead. */
export function setCurrentTenant(_tenant: Record<string, unknown> | null) {
  // Global tenant state removed for concurrency safety.
  // This is kept as a no-op for backward compatibility.
}

/** @deprecated Returns null. Use getTenantForRequest(request) instead. */
export function getCurrentTenant(): Record<string, unknown> | null {
  return null;
}

export function getTenantForRequest(request: Request): Record<string, unknown> | undefined {
  return requestTenantMap.get(request);
}

// Feature gating — checks if a feature is enabled for the current tenant's plan
// Returns { allowed: true } or { allowed: false, error: string }
// In single-tenant mode (no tenantId) — always allowed
const featureCache = new Map<string, { features: string[]; ts: number }>();
const FEATURE_CACHE_TTL = 60_000; // 1 min

export async function requireFeature(
  feature: string,
  env: Env,
  request: Request
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const tenantId = getTenantId(request);
  if (!tenantId || tenantId === '__no_tenant__') return { allowed: true };

  // Check cache
  const cached = featureCache.get(tenantId);
  if (cached && Date.now() - cached.ts < FEATURE_CACHE_TTL) {
    if (!cached.features.includes(feature)) {
      return { allowed: false, error: `Feature "${feature}" is not available in your plan` };
    }
    return { allowed: true };
  }

  // Query DB
  const tenant = await env.DB.prepare(
    'SELECT features, plan FROM tenants WHERE id = ?'
  ).bind(tenantId).first() as { features?: string; plan?: string } | null;

  const features: string[] = tenant?.features ? JSON.parse(tenant.features) : [];

  // Cache the result
  featureCache.set(tenantId, { features, ts: Date.now() });
  // Evict old entries
  if (featureCache.size > 200) {
    const oldest = featureCache.keys().next().value;
    if (oldest) featureCache.delete(oldest);
  }

  if (!features.includes(feature)) {
    return { allowed: false, error: `Feature "${feature}" is not available in your plan` };
  }
  return { allowed: true };
}

// Clear feature cache for a specific tenant (call after updating features/plan)
export function clearFeatureCache(tenantId: string): void {
  featureCache.delete(tenantId);
}

// Extract tenant slug from hostname
export function getTenantSlug(hostname: string): string | null {
  // Pattern: {slug}.kamizo.uz or {slug}.kamizo.shaxzod.workers.dev
  const kamizoMatch = hostname.match(/^([a-z0-9-]+)\.kamizo\.uz$/);
  if (kamizoMatch) {
    const slug = kamizoMatch[1];
    // Skip well-known subdomains
    if (['app', 'www', 'api'].includes(slug)) return null;
    return slug;
  }

  const workersMatch = hostname.match(/^([a-z0-9-]+)\.kamizo\.shaxzod\.workers\.dev$/);
  if (workersMatch) {
    return workersMatch[1];
  }

  return null;
}
