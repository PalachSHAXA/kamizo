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

// Bilingual error helper for user-facing messages.
// The frontend reads `error_ru` / `error_uz` and shows the active language,
// falling back to `error` for older clients that don't know the new fields.
// Use this for messages the user will SEE (validation failures, business
// rules); generic "Forbidden" / "Not found" stays single-language.
export function bilingualError(ru: string, uz: string, status = 400) {
  return json({ error: ru, error_ru: ru, error_uz: uz }, status);
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

// Sprint 68: role hierarchy for privilege-relative checks. Higher number =
// higher privilege. Use `canActOnRole(caller, targetRole)` to gate any
// staff-mutating endpoint (password change, rename, delete, role flip).
//
// Rules:
//   - super_admin can act on anyone (including other super_admins for
//     emergency recovery — they're a tiny trusted set)
//   - everyone else: must STRICTLY outrank target. Self-edit is checked
//     separately at the call-site (callerId === targetId).
const ROLE_RANK: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  director: 80,
  department_head: 60,
  manager: 50,
  advertiser: 50,
  dispatcher: 40,
  executor: 30,
  security: 30,
  resident: 10,
  tenant: 10,
  commercial_owner: 10,
};

export function getRoleRank(role: string | null | undefined): number {
  if (!role) return 0;
  return ROLE_RANK[role.trim().toLowerCase()] ?? 0;
}

export function canActOnRole(
  caller: { id?: string; role: string } | null | undefined,
  target: { id?: string; role: string } | null | undefined,
): boolean {
  if (!caller || !target) return false;
  if (caller.role === 'super_admin') return true;
  // Self-edit is allowed (admin resetting own password, etc.) — caller
  // routes should still allow-list which fields are self-mutable.
  if (caller.id && target.id && caller.id === target.id) return true;
  return getRoleRank(caller.role) > getRoleRank(target.role);
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

// Sprint 78 P0: URL validator for attachment / image fields that legitimately
// need to accept inline data-URL images alongside http(s) links. Allows
// PNG/JPEG/WebP/GIF/PDF data-URLs up to ~5 MB (data-URL is ~33% bigger than
// the underlying bytes). Rejects javascript: / vbscript: / file: / svg+xml.
const ATTACHMENT_DATA_URL_RE = /^data:(image\/(png|jpe?g|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=]+$/i;
export function sanitizeAttachmentUrl(url: string | null | undefined, opts: { maxDataUrlBytes?: number } = {}): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (trimmed.length === 0) return null;
  const maxBytes = opts.maxDataUrlBytes ?? 7_000_000; // ~5 MB binary + base64 overhead
  if (trimmed.startsWith('data:')) {
    if (trimmed.length > maxBytes) return null;
    if (!ATTACHMENT_DATA_URL_RE.test(trimmed)) return null;
    return trimmed;
  }
  // http(s) or absolute-path
  if (trimmed.length > 2000) return null;
  if (/^(https?:\/\/|\/)/i.test(trimmed)) return trimmed;
  return null;
}

// Sprint 78 P1: filename for download attribute / Content-Disposition.
// Allows alphanumerics, dots, dashes, underscores, parentheses, spaces.
// Strips CRLF, path traversal, leading dots.
export function sanitizeFilename(name: string | null | undefined, maxLength = 128): string | null {
  if (!name || typeof name !== 'string') return null;
  // Strip newlines/control chars first
  let s = name.replace(/[\r\n\t\x00-\x1f\x7f]/g, '');
  // Strip path separators + parent refs
  s = s.replace(/[/\\]/g, '_').replace(/\.{2,}/g, '_');
  // Strip leading dots so the file isn't hidden / leading-dot tricks
  s = s.replace(/^\.+/, '');
  s = s.trim().slice(0, maxLength);
  return s.length > 0 ? s : null;
}
