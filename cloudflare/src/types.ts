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
  ASSETS: Fetcher;
  RATE_LIMITER: KVNamespace;
  CONNECTION_MANAGER: DurableObjectNamespace;
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
