import { route } from '../../router';
import { getTenantId, getTenantSlug, setTenantForRequest } from '../../middleware/tenant';
import type { Env } from '../../types';

const EXCHANGE_KEY_PREFIX = 'impersonation-exchange:';
const exchangesInFlight = new Set<string>();
const consumedExchanges = new Map<string, number>();

interface ImpersonationExchangeRecord {
  token: string;
  user: Record<string, unknown>;
  tenantId: string;
  tenantName: string;
  originUrl: string;
  expiresAt: number;
}

function noStoreJson(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function invalidExchange(): Response {
  return noStoreJson({ error: 'Invalid or expired impersonation exchange' }, 400);
}

async function resolveRequestTenant(request: Request, env: Env): Promise<string | null> {
  const existingTenantId = getTenantId(request);
  if (existingTenantId) return existingTenantId;

  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  if (!origin) return null;

  try {
    const slug = getTenantSlug(new URL(origin).hostname.toLowerCase());
    if (!slug) return null;
    const tenant = await env.DB.prepare(
      'SELECT id FROM tenants WHERE slug = ? AND is_active = 1'
    ).bind(slug).first() as { id: string } | null;
    if (!tenant?.id) return null;
    setTenantForRequest(request, tenant);
    return tenant.id;
  } catch {
    return null;
  }
}

export function registerImpersonationExchangeRoutes() {
  route('POST', '/api/auth/impersonation-exchange', async (request, env) => {
    let code: string;
    try {
      const body = await request.json() as { code?: unknown };
      code = typeof body.code === 'string' ? body.code.trim() : '';
    } catch {
      return invalidExchange();
    }

    if (!/^[A-Za-z0-9_-]{20,64}$/.test(code)) return invalidExchange();

    const now = Date.now();
    for (const [consumedCode, expiresAt] of consumedExchanges) {
      if (expiresAt <= now) consumedExchanges.delete(consumedCode);
    }
    if (exchangesInFlight.has(code) || (consumedExchanges.get(code) ?? 0) > now) {
      return invalidExchange();
    }

    exchangesInFlight.add(code);
    const key = `${EXCHANGE_KEY_PREFIX}${code}`;
    let consumedUntil = now + 60_000;

    try {
      const tenantId = await resolveRequestTenant(request, env);
      if (!tenantId) return invalidExchange();

      let rawRecord: string | null;
      try {
        rawRecord = await env.RATE_LIMITER.get(key);
      } catch {
        return noStoreJson({ error: 'Impersonation exchange unavailable' }, 503);
      }
      if (!rawRecord) return invalidExchange();

      try {
        await env.RATE_LIMITER.delete(key);
      } catch {
        consumedExchanges.set(code, consumedUntil);
        return noStoreJson({ error: 'Impersonation exchange unavailable' }, 503);
      }

      let record: ImpersonationExchangeRecord;
      try {
        record = JSON.parse(rawRecord) as ImpersonationExchangeRecord;
      } catch {
        consumedExchanges.set(code, consumedUntil);
        return invalidExchange();
      }

      if (typeof record.expiresAt === 'number') consumedUntil = Math.max(consumedUntil, record.expiresAt);
      consumedExchanges.set(code, consumedUntil);

      if (
        typeof record.expiresAt !== 'number'
        || !Number.isFinite(record.expiresAt)
        || record.expiresAt <= Date.now()
        || record.tenantId !== tenantId
        || typeof record.token !== 'string'
        || record.token.length === 0
        || typeof record.user !== 'object'
        || record.user === null
      ) {
        return invalidExchange();
      }

      return noStoreJson({
        token: record.token,
        user: record.user,
        tenantName: record.tenantName,
        originUrl: record.originUrl,
      }, 200);
    } finally {
      exchangesInFlight.delete(code);
    }
  });
}
