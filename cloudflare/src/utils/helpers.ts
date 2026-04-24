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
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 500);
  return {
    page: Math.max(1, page),
    limit: Math.max(1, limit)
  };
}

export function createPaginatedResponse<T>(data: T[], total: number, params: PaginationParams): PaginatedResponse<T> {
  const page = params.page || 1;
  const limit = params.limit || 50;
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
export function isManagement(user: { role: string } | null | undefined): boolean {
  if (!user) return false;
  const role = (user.role || '').trim().toLowerCase();
  return role === 'admin' || role === 'director' || role === 'manager' || role === 'super_admin';
}

export function isAdminLevel(user: { role: string } | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.role === 'director';
}

// Check if user has executor role (executor or security)
export function isExecutorRole(role: string): boolean {
  return role === 'executor' || role === 'security';
}

// Check if user is super admin
export function isSuperAdmin(user: any): user is { role: string; id: string; [key: string]: any } {
  return user?.role === 'super_admin';
}

// Sanitize user input to prevent stored XSS
export function sanitizeInput(input: string | null | undefined, maxLength = 1000): string | null {
  if (!input) return null;
  return input
    .slice(0, maxLength)
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Sanitize error messages — strip SQL/DB internals before sending to client
export function sanitizeErrorMessage(message: string | undefined, statusCode: number): string {
  if (!message) return 'Internal server error';
  // For 5xx errors, never expose SQL/DB details
  if (statusCode >= 500) {
    const sqlPatterns = /SQLITE|SQL|UNIQUE constraint|FOREIGN KEY|NOT NULL|CHECK constraint|no such table|no such column|database|D1_ERROR/i;
    if (sqlPatterns.test(message)) {
      return 'Internal server error';
    }
  }
  return message;
}

// Validate and sanitize URL (prevent javascript: protocol XSS)
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim().slice(0, 2000);
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return null;
}
