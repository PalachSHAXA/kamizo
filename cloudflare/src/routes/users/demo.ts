import { invalidateOnChange } from '../../cache';
import { demoId } from '../../lib/demo/ids';
import { demoRoleManifest, findDemoRole } from '../../lib/demo/manifest';
import { DemoProvisionError, provisionDemoPhases } from '../../lib/demo/provision';
import type { DemoPhase } from '../../lib/demo/provision';
import type { DemoProvisionContext } from '../../lib/demo/types';
import { invalidateCache } from '../../middleware/cache-local';
import { getUser } from '../../middleware/auth';
import {
  checkDemoLoginProcessLimit,
  resolveDemoLoginGlobalLimit,
} from '../../middleware/demoLoginRateLimit';
import { getTenantForRequest, getTenantSlug } from '../../middleware/tenant';
import { route } from '../../router';
import type { Env } from '../../types';
import { createJWT, hashPassword } from '../../utils/crypto';
import { createRequestLogger } from '../../utils/logger';

interface DemoTenant {
  id: string;
  slug: 'demo';
  features: string | null;
  is_demo?: number;
}

interface StoredDemoRole {
  login: string;
  role: string;
  specialization: string | null;
}

const PHASES = ['core', 'commerce', 'finance', 'engagement'] as const;
const PHASE_TABLES: Record<DemoPhase, readonly string[]> = {
  core: [
    'users', 'buildings', 'entrances', 'apartments', 'categories', 'requests', 'meetings',
    'meeting_agenda_items', 'meeting_eligible_voters', 'meeting_participated_voters',
    'meeting_vote_records', 'meeting_protocols', 'announcements', 'chat_channels', 'chat_messages',
  ],
  commerce: [
    'marketplace_categories', 'marketplace_products', 'marketplace_orders',
    'marketplace_order_items', 'marketplace_order_history', 'marketplace_favorites',
    'marketplace_reviews', 'ad_categories', 'ads', 'rental_apartments', 'rental_records',
    'rental_listings', 'rental_listing_photos', 'vehicles', 'guest_access_codes', 'guest_access_logs',
  ],
  finance: [
    'finance_estimates', 'finance_estimate_buildings', 'finance_estimate_staff',
    'finance_estimate_items', 'finance_charges', 'finance_payments', 'personal_accounts',
    'finance_penalty_settings', 'finance_penalties', 'finance_income_categories', 'finance_income',
    'finance_expenses', 'finance_materials', 'finance_material_usage', 'finance_access', 'finance_claims',
  ],
  engagement: [
    'training_partners', 'training_proposals', 'training_votes', 'training_registrations',
    'training_feedback', 'training_notifications', 'employee_ratings', 'notes',
  ],
};
const STATUS_TABLES = PHASES.flatMap((phase) => PHASE_TABLES[phase]);
const provisionInFlight = new Set<string>();

function noStore(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function demoLoginRateDenied(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: 'Demo login rate limit exceeded' }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Retry-After': String(retryAfterSec),
    },
  });
}

function featuresOf(tenant: DemoTenant): string[] {
  try {
    const parsed = tenant.features ? JSON.parse(tenant.features) : [];
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function matchesStoredRole(
  stored: StoredDemoRole | undefined,
  descriptor: { role: string; specialization: string | null },
): boolean {
  return stored?.role === descriptor.role
    && (stored.specialization ?? null) === descriptor.specialization;
}

async function resolveDemoTenant(request: Request, env: Env): Promise<DemoTenant | null> {
  const context = getTenantForRequest(request) as Partial<DemoTenant> | undefined;
  if (context?.slug) {
    if (context.slug !== 'demo' || !context.id) return null;
    return env.DB.prepare(`
      SELECT id, slug, features, is_demo FROM tenants
      WHERE id = ? AND slug = ? AND is_active = 1
    `).bind(context.id, 'demo').first<DemoTenant>();
  }

  const source = request.headers.get('Origin') || request.headers.get('Referer') || '';
  if (!source) return null;
  try {
    if (getTenantSlug(new URL(source).hostname.toLowerCase()) !== 'demo') return null;
  } catch {
    return null;
  }
  return env.DB.prepare(`
    SELECT id, slug, features, is_demo FROM tenants
    WHERE slug = ? AND is_active = 1
  `).bind('demo').first<DemoTenant>();
}

async function loadDemoTenant(env: Env): Promise<DemoTenant | null> {
  return env.DB.prepare(`
    SELECT id, slug, features, is_demo FROM tenants
    WHERE slug = ? AND is_active = 1
  `).bind('demo').first<DemoTenant>();
}

async function inaccessiblePasswordHash(): Promise<string> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const password = Array.from(random, (value) => value.toString(16).padStart(2, '0')).join('');
  return hashPassword(password);
}

async function requestedPhases(request: Request): Promise<DemoPhase[] | null> {
  const text = await request.text();
  if (!text.trim()) return [...PHASES];

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'phases')) return null;
  if (record.phases === undefined) return [...PHASES];
  if (!Array.isArray(record.phases)) return null;
  if (record.phases.length === 0) return null;
  if (record.phases.some((phase) => typeof phase !== 'string' || !PHASES.includes(phase as DemoPhase))) return null;
  if (new Set(record.phases).size !== record.phases.length) return null;

  const selected = new Set(record.phases as DemoPhase[]);
  if (selected.has('commerce') || selected.has('finance') || selected.has('engagement')) selected.add('core');
  return PHASES.filter((phase) => selected.has(phase));
}

async function invalidateDemoPhase(phase: DemoPhase, env: Env): Promise<void> {
  const distributed: Record<DemoPhase, readonly string[]> = {
    core: ['users', 'buildings', 'categories', 'requests', 'announcements'],
    commerce: [],
    finance: [],
    engagement: ['users'],
  };
  const local: Record<DemoPhase, readonly string[]> = {
    core: ['users:', 'buildings:', 'requests:', 'meetings:', 'announcements:'],
    commerce: ['marketplace-', 'ad-categories:', 'rentals:', 'vehicles:', 'guest-access:'],
    finance: ['finance:'],
    engagement: ['training:', 'executors:', 'notes:'],
  };
  await Promise.all(distributed[phase].map((table) => invalidateOnChange(table, env.RATE_LIMITER)));
  for (const pattern of local[phase]) invalidateCache(pattern);
}

async function phaseReadiness(db: D1Database, tenantId: string): Promise<Record<DemoPhase, boolean>> {
  const sentinels: Record<DemoPhase, Array<{ table: string; key: string }>> = {
    core: [
      { table: 'requests', key: 'request:completed' },
      { table: 'meetings', key: 'meeting:active' },
      { table: 'chat_channels', key: 'chat:building-general' },
    ],
    commerce: [
      { table: 'marketplace_products', key: 'market-product:water' },
      { table: 'marketplace_orders', key: 'market-order:delivered' },
      { table: 'rental_listings', key: 'rental-listing:bright-two' },
    ],
    finance: [
      { table: 'finance_estimates', key: 'finance:estimate:complex' },
      { table: 'finance_charges', key: 'finance:charge:0' },
      { table: 'finance_access', key: 'finance:access:manager' },
    ],
    engagement: [
      { table: 'training_proposals', key: 'training:proposal:scheduled' },
      { table: 'employee_ratings', key: 'employee-rating:executor:resident' },
      { table: 'notes', key: 'note:manager:1' },
    ],
  };
  const ready = {} as Record<DemoPhase, boolean>;
  for (const phase of PHASES) {
    const rows = await Promise.all(sentinels[phase].map(async ({ table, key }) => {
      const id = await demoId(tenantId, key);
      return db.prepare(`SELECT id FROM ${table} WHERE tenant_id = ? AND id = ?`)
        .bind(tenantId, id).first<{ id: string }>();
    }));
    ready[phase] = rows.every(Boolean);
  }
  return ready;
}

export function registerDemoRoutes(): void {
  route('GET', '/api/auth/demo-roles', async (request, env) => {
    const tenant = await resolveDemoTenant(request, env);
    if (!tenant) return noStore({ error: 'Demo tenant not found' }, 404);

    const logins = demoRoleManifest.map((role) => role.login);
    const placeholders = logins.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT login, role, specialization FROM users
      WHERE tenant_id = ? AND is_active = 1 AND login IN (${placeholders})
    `).bind(tenant.id, ...logins).all<StoredDemoRole>();
    const available = new Map(result.results.map((user) => [user.login, user]));
    const features = featuresOf(tenant);
    const roles = demoRoleManifest.filter((descriptor) =>
      matchesStoredRole(available.get(descriptor.login), descriptor)
      && (!descriptor.requiredFeature || features.includes(descriptor.requiredFeature)),
    ).map(({ roleKey, role, specialization, primary, order }) => ({
      roleKey, role, specialization, primary, order,
    }));

    return noStore({ roles });
  });

  route('POST', '/api/auth/demo-login', async (request, env) => {
    const tenant = await resolveDemoTenant(request, env);
    if (!tenant) return noStore({ error: 'Demo tenant not found' }, 404);

    let roleKey = '';
    try {
      const body = await request.json() as { roleKey?: unknown };
      if (typeof body.roleKey === 'string') roleKey = body.roleKey;
    } catch {
      return noStore({ error: 'Invalid JSON body' }, 400);
    }
    const descriptor = findDemoRole(roleKey);
    const processLimit = checkDemoLoginProcessLimit(
      tenant.id,
      descriptor?.roleKey ?? 'invalid',
      Date.now(),
      resolveDemoLoginGlobalLimit(env.ENVIRONMENT, env.DEMO_LOGIN_GLOBAL_LIMIT),
    );
    if (!processLimit.allowed) return demoLoginRateDenied(processLimit.retryAfterSec);
    if (!descriptor) return noStore({ error: 'Demo role not found' }, 404);
    if (descriptor.requiredFeature && !featuresOf(tenant).includes(descriptor.requiredFeature)) {
      return noStore({ error: 'Demo role unavailable' }, 404);
    }

    const user = await env.DB.prepare(`
      SELECT id, login, phone, name, role, specialization, address, apartment,
             building_id, entrance, floor, total_area, account_type, tenant_id
      FROM users
      WHERE tenant_id = ? AND login = ? AND is_active = 1
      LIMIT 1
    `).bind(tenant.id, descriptor.login).first<Record<string, unknown>>();
    const storedSpecialization = typeof user?.specialization === 'string' ? user.specialization : null;
    if (!user
      || user.role !== descriptor.role
      || storedSpecialization !== descriptor.specialization
      || user.role === 'super_admin') {
      return noStore({ error: 'Demo role unavailable' }, 404);
    }

    await env.DB.prepare(`
      UPDATE users SET last_login_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).bind(user.id, tenant.id).run();
    const token = await createJWT(
      { userId: String(user.id), role: String(user.role), tenantId: tenant.id, demo_session: true },
      env.JWT_SECRET,
      1800,
    );
    return noStore({ user, token, demoSession: true });
  });

  route('POST', '/api/super-admin/demo/provision', async (request, env) => {
    const authUser = await getUser(request, env);
    if (!authUser || authUser.role !== 'super_admin') return noStore({ error: 'Forbidden' }, 403);

    const tenant = await loadDemoTenant(env);
    if (!tenant || tenant.slug !== 'demo') return noStore({ error: 'Demo tenant not found' }, 404);

    const phases = await requestedPhases(request);
    if (!phases) return noStore({ error: 'Invalid provision body' }, 400);
    if (provisionInFlight.has(tenant.id)) return noStore({ error: 'Demo provision already in progress' }, 409);

    const context: DemoProvisionContext = {
      db: env.DB,
      tenantId: tenant.id,
      tenantSlug: 'demo',
      now: new Date(),
      createPasswordHash: inaccessiblePasswordHash,
    };
    provisionInFlight.add(tenant.id);
    try {
      return noStore(await provisionDemoPhases(context, phases, (phase) => invalidateDemoPhase(phase, env)));
    } catch (error) {
      const completedPhases = error instanceof DemoProvisionError ? error.completedPhases : [];
      createRequestLogger(request).error('demo_provision_failed', undefined, {
        tenantId: tenant.id,
        phase: error instanceof DemoProvisionError ? error.failedPhase : 'unknown',
        code: error instanceof DemoProvisionError ? error.code : 'DEMO_PROVISION_UNEXPECTED',
      });
      return noStore({ error: 'Demo provision failed', completedPhases }, 500);
    } finally {
      provisionInFlight.delete(tenant.id);
    }
  });

  route('GET', '/api/super-admin/demo/status', async (request, env) => {
    const authUser = await getUser(request, env);
    if (!authUser || authUser.role !== 'super_admin') return noStore({ error: 'Forbidden' }, 403);

    const tenant = await loadDemoTenant(env);
    if (!tenant || tenant.slug !== 'demo') return noStore({ error: 'Demo tenant not found' }, 404);

    const countRows = await Promise.all(STATUS_TABLES.map((table) =>
      env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE tenant_id = ?`)
        .bind(tenant.id).first<{ count: number }>(),
    ));
    const counts = Object.fromEntries(STATUS_TABLES.map((table, index) => [table, Number(countRows[index]?.count ?? 0)]));
    const logins = demoRoleManifest.map((role) => role.login);
    const users = await env.DB.prepare(`
      SELECT login, role, specialization FROM users
      WHERE tenant_id = ? AND is_active = 1 AND login IN (${logins.map(() => '?').join(',')})
    `).bind(tenant.id, ...logins).all<StoredDemoRole>();
    const availableUsers = new Map(users.results.map((user) => [user.login, user]));
    const features = featuresOf(tenant);
    const availableRoleKeys = demoRoleManifest
      .filter((role) => matchesStoredRole(availableUsers.get(role.login), role)
        && (!role.requiredFeature || features.includes(role.requiredFeature)))
      .map((role) => role.roleKey);

    return noStore({
      tenantId: tenant.id,
      slug: tenant.slug,
      isDemo: tenant.is_demo === 1,
      counts,
      availableRoleKeys,
      ready: await phaseReadiness(env.DB, tenant.id),
    });
  });
}
