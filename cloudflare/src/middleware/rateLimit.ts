// Rate limiting middleware
// Currently uses Cloudflare KV
// For datacenter migration: replace with Redis (ioredis/redis npm package)

import type { Env, RateLimitConfig, User } from '../types';

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'POST:/api/auth/login': { maxRequests: 5, windowSeconds: 60 },
  'POST:/api/auth/register': { maxRequests: 60, windowSeconds: 60 },
  'POST:/api/auth/register-bulk': { maxRequests: 30, windowSeconds: 60 },
  'GET:/api/requests': { maxRequests: 60, windowSeconds: 60 },
  'POST:/api/requests': { maxRequests: 20, windowSeconds: 60 },
  'GET:/api/users': { maxRequests: 30, windowSeconds: 60 },
  'GET:/api/announcements': { maxRequests: 30, windowSeconds: 60 },
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
