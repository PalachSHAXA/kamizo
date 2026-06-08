// Shared types for the backend

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ENCRYPTION_KEY: string;
  JWT_SECRET: string;
  BASE_DOMAIN: string;
  VAPID_EMAIL: string;
  VAPID_PRIVATE_KEY: string;
  SENTRY_DSN?: string;
  EMERGENCY_RESET_SECRET?: string;
  SETUP_TOKEN?: string;
  SUPERADMIN_BOOTSTRAP_PASSWORD?: string;
  ASSETS: Fetcher;
  RATE_LIMITER: KVNamespace;
  CONNECTION_MANAGER: DurableObjectNamespace;

  // ── 2FA-on-login (Eskiz.uz) ───────────────────────────────────────
  // All optional; defaults keep the legacy single-step login intact.
  // Set with `wrangler secret put NAME` (Eskiz creds) or `[vars]` (flags).
  TWO_FA_ENABLED?: string;       // '1' | 'true' to flip the feature on; anything else = OFF
  TWO_FA_DEV_MODE?: string;      // '1' | 'true' → MockProvider returns dev_code in response (DEV only)
  ESKIZ_EMAIL?: string;          // Eskiz dashboard email
  ESKIZ_PASSWORD?: string;       // Eskiz dashboard password
  ESKIZ_FROM?: string;           // approved sender id / nickname; falls back to "4546"
  ESKIZ_API_BASE?: string;       // override for testing; defaults to https://notify.eskiz.uz/api
}

export interface User {
  id: string;
  login: string;
  phone: string;
  name: string;
  role: string;
  specialization?: string;
  address?: string;
  apartment?: string;
  building_id?: string;
  entrance?: string;
  floor?: string;
  account_type?: string;
  tenant_id?: string;
  email?: string;
}

export type Handler = (request: Request, env: Env, params: Record<string, string>) => Promise<Response>;

export interface Route {
  method: string;
  // Original path template, e.g. '/api/agenda/:agendaItemId/comments'.
  // Sprint 74: used as the rate-limit key so buckets don't multiply per
  // resolved id.
  path: string;
  pattern: RegExp;
  handler: Handler;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}
