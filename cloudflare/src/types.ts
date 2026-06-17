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
  // Sprint 85 — tenant contract PDFs. On Cloudflare Workers this is
  // the real R2Bucket binding declared in wrangler.toml; on the VPS
  // Node.js path the shim at /opt/kamizo/app/src/shim/r2.js exposes
  // the same .put / .get / .delete / .head surface backed by the
  // local filesystem at /opt/kamizo/data/contracts/.
  CONTRACTS_BUCKET: R2Bucket;
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
