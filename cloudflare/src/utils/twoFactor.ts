// 2FA-on-login helpers.
//
// All randomness goes through `crypto.getRandomValues`. The 6-digit
// numeric code is sha-256 hashed at rest in the `login_otp` table; the
// 32-byte device token is hashed at rest in `auth_trusted_devices`. The
// pending-login token is opaque random data + only useful in combination
// with a still-secret 6-digit code (which the attacker doesn't have).
//
// All wall-clock decisions (TTL, cooldown, hourly/daily quotas) live in
// constants at the top so a security review only has one spot to read.

import type { Env } from '../types';

// ── Lifetimes & quotas ────────────────────────────────────────────────
export const TWO_FA_CONSTANTS = {
  CODE_TTL_SECONDS: 5 * 60,             // 5 minutes
  MAX_VERIFY_ATTEMPTS: 5,                // attempts BEFORE rejection-on-attempt
  RESEND_COOLDOWN_SECONDS: 60,           // min wait between sends to one phone
  HOURLY_SEND_CAP: 3,                    // max codes per phone per hour
  DAILY_SEND_CAP: 10,                    // max codes per phone per 24h
  TRUSTED_DEVICE_TTL_SECONDS: 30 * 24 * 60 * 60, // 30 days
  PENDING_TOKEN_BYTES: 32,               // 256-bit opaque token
  DEVICE_TOKEN_BYTES: 32,                // 256-bit opaque token
} as const;

// ── Crypto primitives ────────────────────────────────────────────────

/** 6-digit numeric code, cryptographically random. Never Math.random. */
export function generate6DigitCode(): string {
  // 4 random bytes is more than enough entropy (~4.3B) to map uniformly
  // into 0..999999 without modulo bias when we use rejection sampling.
  const buf = new Uint8Array(4);
  let attempts = 0;
  while (attempts < 32) {
    crypto.getRandomValues(buf);
    const n = (buf[0] << 24 | buf[1] << 16 | buf[2] << 8 | buf[3]) >>> 0;
    // Reject the top of the uint32 range so 0..999999 maps uniformly.
    // 4294000000 = floor(2^32 / 1_000_000) * 1_000_000
    if (n < 4294000000) {
      return String(n % 1_000_000).padStart(6, '0');
    }
    attempts++;
  }
  // Fallback: extremely unlikely, but guarantee a value.
  crypto.getRandomValues(buf);
  const n = (buf[0] << 24 | buf[1] << 16 | buf[2] << 8 | buf[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, '0');
}

/** Opaque random token, hex-encoded (`PENDING_TOKEN_BYTES * 2` chars). */
export function generateOpaqueToken(byteLen: number): string {
  const buf = new Uint8Array(byteLen);
  crypto.getRandomValues(buf);
  return Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
}

/** sha-256 hex of an input string. Used for code/device-token at rest. */
export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time string equality (defeats early-exit timing oracle). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Phone helpers ────────────────────────────────────────────────────

/** Normalise to digits only (drops +, spaces, parens). */
export function normalisePhone(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '');
}

// ── Send-quota gate (per-phone, anti-SMS-pumping) ────────────────────

export interface QuotaCheckResult {
  allowed: boolean;
  /** human-readable reason when not allowed */
  reason?: 'cooldown' | 'hourly_cap' | 'daily_cap';
  /** seconds until the caller may retry */
  retryAfterSec?: number;
}

/** Read-only check: does NOT mutate the table. Returns the decision. */
export async function checkSendQuota(env: Env, phone: string): Promise<QuotaCheckResult> {
  const row = await env.DB.prepare(
    `SELECT last_sent_at, hour_window_start, hour_count, day_window_start, day_count
     FROM auth_sms_quota WHERE phone = ?`
  ).bind(phone).first<{
    last_sent_at: string;
    hour_window_start: string;
    hour_count: number;
    day_window_start: string;
    day_count: number;
  }>();

  if (!row) return { allowed: true };
  const now = Date.now();
  const lastSent = Date.parse(row.last_sent_at + 'Z') || 0;
  const cooldownMs = TWO_FA_CONSTANTS.RESEND_COOLDOWN_SECONDS * 1000;
  if (now - lastSent < cooldownMs) {
    return {
      allowed: false,
      reason: 'cooldown',
      retryAfterSec: Math.max(1, Math.ceil((cooldownMs - (now - lastSent)) / 1000)),
    };
  }

  // Reset windows in-memory if they've rolled over; recordSend will
  // persist the rolled-over windows.
  const hourStart = Date.parse(row.hour_window_start + 'Z') || 0;
  const dayStart = Date.parse(row.day_window_start + 'Z') || 0;
  const hourCount = (now - hourStart) >= 60 * 60 * 1000 ? 0 : row.hour_count;
  const dayCount = (now - dayStart) >= 24 * 60 * 60 * 1000 ? 0 : row.day_count;

  if (hourCount >= TWO_FA_CONSTANTS.HOURLY_SEND_CAP) {
    return {
      allowed: false,
      reason: 'hourly_cap',
      retryAfterSec: Math.max(1, Math.ceil((hourStart + 60 * 60 * 1000 - now) / 1000)),
    };
  }
  if (dayCount >= TWO_FA_CONSTANTS.DAILY_SEND_CAP) {
    return {
      allowed: false,
      reason: 'daily_cap',
      retryAfterSec: Math.max(1, Math.ceil((dayStart + 24 * 60 * 60 * 1000 - now) / 1000)),
    };
  }
  return { allowed: true };
}

/** Persist the just-happened send. Call AFTER `checkSendQuota` passed
 *  AND the provider returned ok. Updates windows as needed. */
export async function recordSend(env: Env, phone: string): Promise<void> {
  const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT hour_window_start, hour_count, day_window_start, day_count
     FROM auth_sms_quota WHERE phone = ?`
  ).bind(phone).first<{
    hour_window_start: string;
    hour_count: number;
    day_window_start: string;
    day_count: number;
  }>();

  if (!row) {
    await env.DB.prepare(
      `INSERT INTO auth_sms_quota (phone, last_sent_at, hour_window_start, hour_count, day_window_start, day_count)
       VALUES (?, ?, ?, 1, ?, 1)`
    ).bind(phone, nowIso, nowIso, nowIso).run();
    return;
  }
  const hourStart = Date.parse(row.hour_window_start + 'Z') || 0;
  const dayStart = Date.parse(row.day_window_start + 'Z') || 0;
  const nextHourStart = (now - hourStart) >= 60 * 60 * 1000 ? nowIso : row.hour_window_start;
  const nextHourCount = (now - hourStart) >= 60 * 60 * 1000 ? 1 : row.hour_count + 1;
  const nextDayStart = (now - dayStart) >= 24 * 60 * 60 * 1000 ? nowIso : row.day_window_start;
  const nextDayCount = (now - dayStart) >= 24 * 60 * 60 * 1000 ? 1 : row.day_count + 1;
  await env.DB.prepare(
    `UPDATE auth_sms_quota
        SET last_sent_at = ?,
            hour_window_start = ?, hour_count = ?,
            day_window_start = ?, day_count = ?
      WHERE phone = ?`
  ).bind(nowIso, nextHourStart, nextHourCount, nextDayStart, nextDayCount, phone).run();
}

// ── Trusted device lookup ────────────────────────────────────────────

export interface TrustedDeviceLookup {
  trusted: boolean;
  /** id of the matched row; useful for revoke */
  rowId?: string;
}

/** Returns `trusted: true` only when the client-supplied token, after
 *  sha-256, matches a non-revoked, non-expired row for this user. */
export async function isTrustedDevice(env: Env, userId: string, rawToken: string | undefined): Promise<TrustedDeviceLookup> {
  if (!rawToken || rawToken.length < 16) return { trusted: false };
  const tokenHash = await sha256Hex(rawToken);
  const row = await env.DB.prepare(
    `SELECT id, expires_at, revoked_at FROM auth_trusted_devices
      WHERE user_id = ? AND token_hash = ?`
  ).bind(userId, tokenHash).first<{ id: string; expires_at: string; revoked_at: string | null }>();
  if (!row) return { trusted: false };
  if (row.revoked_at) return { trusted: false };
  const now = Date.now();
  const expires = Date.parse(row.expires_at + 'Z') || 0;
  if (expires < now) return { trusted: false };

  // Touch last_used_at on hit. Fire-and-forget — don't block login.
  env.DB.prepare(
    `UPDATE auth_trusted_devices SET last_used_at = datetime('now') WHERE id = ?`
  ).bind(row.id).run().catch(() => {});

  return { trusted: true, rowId: row.id };
}

/** Create a fresh trusted-device row, return the RAW token to ship
 *  back to the client (stored hashed). 30-day TTL. */
export async function createTrustedDevice(
  env: Env,
  userId: string,
  tenantId: string | null,
  userAgent: string | null,
): Promise<string> {
  const raw = generateOpaqueToken(TWO_FA_CONSTANTS.DEVICE_TOKEN_BYTES);
  const tokenHash = await sha256Hex(raw);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + TWO_FA_CONSTANTS.TRUSTED_DEVICE_TTL_SECONDS * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');
  const label = parseDeviceLabel(userAgent);
  await env.DB.prepare(
    `INSERT INTO auth_trusted_devices (id, user_id, tenant_id, token_hash, device_label, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, userId, tenantId, tokenHash, label, expiresAt).run();
  return raw;
}

/** Best-effort, never blocks. "Chrome on macOS" style. */
function parseDeviceLabel(ua: string | null): string {
  if (!ua) return 'Unknown';
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  let os = 'Unknown';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} on ${os}`;
}
