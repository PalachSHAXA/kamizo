// Shared helper functions used across route modules
// These are framework-agnostic — will work on Cloudflare Workers, Node.js, Bun, etc.

import type { PaginationParams, PaginatedResponse } from '../types';
import { getCurrentCorsOrigin } from '../middleware/cors';

// JSON response helper
export function json(data: any, status = 200, cacheControl?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (cacheControl) {
    headers['Cache-Control'] = cacheControl;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

// Error response helper
export function error(message: string, status = 400) {
  return json({ error: message }, status);
}

// Generate UUID
export function generateId() {
  return crypto.randomUUID();
}

// Pagination helpers
export function getPaginationParams(url: URL): PaginationParams {
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '500', 10), 5000);
  return {
    page: Math.max(1, page),
    limit: Math.max(1, limit)
  };
}

export function createPaginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  const page = params.page || 1;
  const limit = params.limit || 500;
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
}

// Role check helpers
export function isManagement(user: { role: string } | null): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'director' || role === 'manager';
}

export function isAdminLevel(user: { role: string } | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'director';
}
