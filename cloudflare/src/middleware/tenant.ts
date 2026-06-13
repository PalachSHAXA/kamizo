// Tenant resolution middleware
// Handles multi-tenant isolation via subdomain detection
// For datacenter migration: keep as-is, just change the hostname parsing if needed

import type { Env } from '../types';

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

// Sprint 77 F3: FE admin SettingsPage exposes a `qr` toggle; backend
// historically checks `rentals` on guest-codes endpoints. Treat them as
// the same flag so a tenant toggling one off in the UI actually
// disables the BE family. Same for any future drift.
const FEATURE_ALIASES: Record<string, string[]> = {
  rentals: ['rentals', 'qr'],
  qr: ['rentals', 'qr'],
};

function featureMatches(want: string, owned: string[]): boolean {
  const candidates = FEATURE_ALIASES[want] || [want];
  return candidates.some(c => owned.includes(c));
}

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
    if (!featureMatches(feature, cached.features)) {
      return { allowed: false, error: `Feature "${feature}" is not available in your plan` };
    }
    return { allowed: true };
  }

  // Query DB
  const tenant = await env.DB.prepare(
    'SELECT features, plan FROM tenants WHERE id = ?'
  ).bind(tenantId).first() as { features?: string; plan?: string } | null;

  // Sprint 77 P1/F5: defensive parse. JSON.parse on malformed/legacy
  // features used to throw and 5xx the request. Now: empty + log.
  // Also: a brand-new tenant created without features defaults to
  // an open set so first-day onboarding doesn't lock everything down.
  // Super-admin can tighten by setting an explicit features array.
  let features: string[] = [];
  if (tenant?.features) {
    try {
      const parsed = JSON.parse(tenant.features);
      if (Array.isArray(parsed)) features = parsed.filter((f): f is string => typeof f === 'string');
    } catch {
      console.error('[requireFeature] Malformed tenants.features JSON for tenant', tenantId);
      features = [];
    }
  } else if (tenant) {
    // Row exists but features is NULL — treat as default plan with the
    // canonical baseline set. Mirrors the CREATE TENANT default in
    // super-admin.ts.
    features = ['requests', 'votes', 'qr', 'rentals', 'notepad', 'reports', 'chat', 'announcements', 'communal', 'meetings'];
  }
  // tenant === null (not found): features stays empty → deny.

  // Cache the result
  featureCache.set(tenantId, { features, ts: Date.now() });
  // Evict old entries
  if (featureCache.size > 200) {
    const oldest = featureCache.keys().next().value;
    if (oldest) featureCache.delete(oldest);
  }

  if (!featureMatches(feature, features)) {
    return { allowed: false, error: `Feature "${feature}" is not available in your plan` };
  }
  return { allowed: true };
}

// Clear feature cache for a specific tenant (call after updating features/plan)
export function clearFeatureCache(tenantId: string): void {
  featureCache.delete(tenantId);
}

// ── Tenant cross-check helpers (Sprint 81) ────────────────────────────
//
// Most staff-facing routes already filter by tenant inside the SQL WHERE
// clause (`WHERE id = ? AND tenant_id = ?`), so a cross-tenant id lookup
// returns null and the route 404s — that is by design (data-hiding, no
// info leak about other tenants). For one user-facing flow we want
// stronger semantics: the QR-pass scanner. A security guard scanning a
// pass that belongs to a different УК should see a CLEAR "wrong tenant"
// denial in the UI (not a generic "invalid"), so the guard isn't told
// the pass is forged when it's actually a real pass from another tenant.
// This still does NOT leak the foreign tenant's name back to the guard;
// it just changes the message + status code.
//
// Pattern at call-sites (see rentals/scanner.ts):
//   1. SELECT WHERE id = ?  (UNFILTERED by tenant)
//   2. if !row → return generic invalid
//   3. if row.tenant_id !== caller's tenant → log + return 403 cross_tenant
//   4. otherwise continue normally

/**
 * Returns true if the record's tenant_id matches the caller's tenant.
 * - Super-admin (caller has no tenant) always passes (cross-tenant admin).
 * - Records that have no tenant_id at all (legacy / global rows) always
 *   pass; tighten only if a specific table needs strict scoping.
 */
export function recordBelongsToCaller(
  record: { tenant_id?: string | null } | null | undefined,
  callerTenantId: string | null,
): boolean {
  if (!record) return false;
  if (!callerTenantId) return true; // super-admin / unscoped
  if (!record.tenant_id) return true; // legacy/global row
  return record.tenant_id === callerTenantId;
}

/**
 * Log a denied cross-tenant access attempt. Best-effort, fire-and-forget.
 * Useful for spotting probing or buggy clients pinning a stale tenant.
 *
 * The destination table (`security_audit_log`) is created on demand by
 * the first call — keeps the deploy story to a single source-file ship
 * instead of a full migration round-trip.
 */
export async function auditCrossTenantAttempt(
  env: { DB: { prepare: (sql: string) => any } },
  args: {
    staffId: string;
    staffName?: string | null;
    staffRole: string;
    staffTenantId: string | null;
    resourceType: string;          // 'guest_code' | 'request' | 'resident' | ...
    resourceId: string | null;
    resourceTenantId: string | null;
  },
): Promise<void> {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        staff_id TEXT,
        staff_name TEXT,
        staff_role TEXT,
        staff_tenant_id TEXT,
        resource_type TEXT,
        resource_id TEXT,
        resource_tenant_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    await env.DB.prepare(`
      INSERT INTO security_audit_log
        (event, staff_id, staff_name, staff_role, staff_tenant_id,
         resource_type, resource_id, resource_tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      'cross_tenant_denied',
      args.staffId,
      args.staffName || null,
      args.staffRole,
      args.staffTenantId,
      args.resourceType,
      args.resourceId,
      args.resourceTenantId,
    ).run();
  } catch {
    // Audit log failure must not break the request path.
  }
}

// Extract tenant slug from hostname
export function getTenantSlug(hostname: string): string | null {
  // Main domains (not tenant subdomains) — return null
  // kamizo.shaxzod.workers.dev is the main workers domain
  if (hostname === 'kamizo.shaxzod.workers.dev') return null;
  if (hostname === 'kamizo.uz') return null;

  // Pattern: {slug}.kamizo.uz
  const kamizoMatch = hostname.match(/^([a-z0-9-]+)\.kamizo\.uz$/);
  if (kamizoMatch) {
    const slug = kamizoMatch[1];
    // Skip well-known subdomains
    if (['app', 'www', 'api'].includes(slug)) return null;
    return slug;
  }

  // Pattern: {slug}.kamizo.shaxzod.workers.dev (tenant subdomains on workers)
  const workersMatch = hostname.match(/^([a-z0-9-]+)\.kamizo\.shaxzod\.workers\.dev$/);
  if (workersMatch) {
    return workersMatch[1];
  }

  return null;
}
