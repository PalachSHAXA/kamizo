// Tenant resolution middleware
// Handles multi-tenant isolation via subdomain detection
// For datacenter migration: keep as-is, just change the hostname parsing if needed

import type { Env, User } from '../types';
import { getCached, setCache } from './cache-local';

// Store current tenant context for this request
let currentTenant: any = null;

// Request-scoped tenant map (prevents race condition with global currentTenant)
const requestTenantMap = new WeakMap<Request, any>();

// Helper function to get current tenant ID (request-scoped, safe from race conditions)
export function getTenantId(req?: Request): string | null {
  if (req) {
    const tenant = requestTenantMap.get(req);
    return tenant?.id || null;
  }
  // Fallback to global (unsafe under concurrent requests)
  return currentTenant?.id || null;
}

export function setTenantForRequest(request: Request, tenant: any) {
  requestTenantMap.set(request, tenant);
}

export function setCurrentTenant(tenant: any) {
  currentTenant = tenant;
}

export function getCurrentTenant() {
  return currentTenant;
}

export function getTenantForRequest(request: Request) {
  return requestTenantMap.get(request);
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
