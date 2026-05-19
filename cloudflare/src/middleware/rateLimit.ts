// Rate limiting middleware
// Currently uses Cloudflare KV
// For datacenter migration: replace with Redis (ioredis/redis npm package)

import type { Env, RateLimitConfig, User } from '../types';

// Sprint 74: keys MUST match the route template (e.g. '/api/users/:id/...').
// The dispatcher passes `matched.path` from the router so :id literals stay
// in the key. Previously keys were resolved paths and per-id explosion
// silently bypassed these limits.
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // Auth
  'POST:/api/auth/login': { maxRequests: 5, windowSeconds: 60 },
  'POST:/api/auth/register': { maxRequests: 60, windowSeconds: 60 },
  'POST:/api/auth/register-bulk': { maxRequests: 30, windowSeconds: 60 },

  // Sprint 74 P0/F1: SMS / OTP — tightest of all (SMS-gateway cost +
  // victim-cooldown burn). Keyed per-caller via getClientIdentifier.
  'POST:/api/meetings/otp/request': { maxRequests: 3, windowSeconds: 600 },
  'POST:/api/meetings/otp/verify': { maxRequests: 10, windowSeconds: 600 },

  // Sprint 74 P1/F3: password reset / change — brute resistance.
  'POST:/api/users/me/password': { maxRequests: 5, windowSeconds: 60 },
  'POST:/api/users/:id/password': { maxRequests: 10, windowSeconds: 60 },
  'POST:/api/users/:id/reset-password': { maxRequests: 10, windowSeconds: 60 },
  'POST:/api/admin/reset-password': { maxRequests: 10, windowSeconds: 60 },

  // Sprint 74 P1/F6: plate-search staff-side enumeration cap.
  'GET:/api/vehicles/search': { maxRequests: 30, windowSeconds: 60 },

  // Sprint 74 P1/F9: chat message fan-out (each post pushes to all managers).
  'POST:/api/chat/channels/:id/messages': { maxRequests: 30, windowSeconds: 60 },

  // Sprint 74 P1/F5: upload (was unbounded; 25 MB rows × 100/min = 2.5 GB).
  'POST:/api/upload': { maxRequests: 20, windowSeconds: 60 },

  // Cost-heavy reports / exports — keep per-user calls low.
  'GET:/api/marketplace/admin/reports': { maxRequests: 10, windowSeconds: 60 },
  'GET:/api/reports/debts': { maxRequests: 10, windowSeconds: 60 },
  'GET:/api/branches/:id/export': { maxRequests: 5, windowSeconds: 60 },
  'GET:/api/team/export': { maxRequests: 5, windowSeconds: 60 },

  // Push test/send (admin self-spam path).
  'POST:/api/push/test': { maxRequests: 5, windowSeconds: 60 },
  'POST:/api/push/send': { maxRequests: 30, windowSeconds: 60 },

  // Existing
  'GET:/api/requests': { maxRequests: 60, windowSeconds: 60 },
  'POST:/api/requests': { maxRequests: 20, windowSeconds: 60 },
  'GET:/api/users': { maxRequests: 30, windowSeconds: 60 },
  'GET:/api/announcements': { maxRequests: 30, windowSeconds: 60 },
  'POST:/api/_emergency-reset': { maxRequests: 3, windowSeconds: 3600 },
  'default': { maxRequests: 100, windowSeconds: 60 }
};

export async function checkRateLimit(
  env: Env,
  identifier: string,
  endpoint: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  try {
    const config = RATE_LIMITS[endpoint] || RATE_LIMITS['default'];
    const key = `ratelimit:${endpoint}:${identifier}`;
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;

    const data = await env.RATE_LIMITER.get(key, 'json') as { count: number; resetAt: number } | null;

    if (!data || data.resetAt < now) {
      const resetAt = now + windowMs;
      await env.RATE_LIMITER.put(
        key,
        JSON.stringify({ count: 1, resetAt }),
        { expirationTtl: config.windowSeconds }
      );
      return { allowed: true, remaining: config.maxRequests - 1, resetAt };
    }

    if (data.count >= config.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: data.resetAt };
    }

    const newCount = data.count + 1;
    const ttlSeconds = Math.max(60, Math.ceil((data.resetAt - now) / 1000));
    await env.RATE_LIMITER.put(
      key,
      JSON.stringify({ count: newCount, resetAt: data.resetAt }),
      { expirationTtl: ttlSeconds }
    );

    return { allowed: true, remaining: config.maxRequests - newCount, resetAt: data.resetAt };
  } catch (e) {
    console.error('Rate limiter KV error:', e instanceof Error ? e.message : e);
    // Fail-closed: block request when KV is unavailable to prevent abuse
    return { allowed: false, remaining: 0, resetAt: Date.now() + 60000 };
  }
}

export function getClientIdentifier(request: Request, user?: User | null): string {
  if (user?.id) return `user:${user.id}`;
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For') ||
             'unknown';
  return `ip:${ip}`;
}
