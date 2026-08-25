// D1 dual-write mirror для таблицы tenants.
//
// Вынесено из routes/super-admin.ts (2026-08): тем же зеркалом должен
// пользоваться PATCH /api/tenant/features, а импортировать super-admin.ts
// из misc/health.ts нельзя — super-admin.ts тянет isSuperAdmin из ../index
// и получается цикл. Логика перенесена без изменений.

import { createRequestLogger } from '../utils/logger';
import type { Env } from '../types';

// Bug 2 (2026-06-18) — D1 dual-write mirror.
//
// The kamizo Cloudflare Worker resolves *.kamizo.uz subdomains by
// querying env.DB (Cloudflare D1) for the matching tenant row. After
// the VPS migration, every tenant create/update/delete handler in
// this file landed in /opt/kamizo/data/kamizo.db (better-sqlite3 via
// the shim at /opt/kamizo/app/src/shim/d1.js) without touching D1.
// D1 stayed frozen at the 2026-03-28 snapshot; tenants created after
// that date were unreachable through their subdomains because the
// Worker's SELECT returned nothing → tenantNotFoundResponse() →
// "Управляющая компания X не найдена".
//
// The investigation proposed three fixes. This is Variant #1: a one-
// shot D1 backfill (already applied via /tmp/backfill-d1.mjs) plus
// this VPS-side dual-write so every future mutation also lands in D1.
// Variant #3 (decommission D1 + KV-cache the slug→tenant map from the
// VPS) is still the long-term plan. This mirror is intentionally a
// thin fire-and-forget HTTP call so it can be deleted in one commit
// when Variant #3 lands.
//
// The helper detects the VPS context by the env triple
// (CF_API_TOKEN + CF_ACCOUNT_ID + CF_D1_DATABASE_ID) — these are only
// set in /opt/kamizo/app/.env on the VPS. Inside the Cloudflare
// Worker the triple is absent and the helper silently no-ops, so
// the same handler code stays correct on both runtimes.
//
// All callers run AFTER the canonical env.DB.prepare(...).run() so
// VPS SQLite remains the source-of-truth. A mirror failure logs but
// never fails the response.
export async function mirrorTenantWriteToD1(
  env: Env,
  request: Request,
  sql: string,
  params: any[],
): Promise<void> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_D1_DATABASE_ID) {
    return; // not VPS (or VPS misconfigured); silently skip
  }
  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.CF_D1_DATABASE_ID}/query`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => '');
      createRequestLogger(request).error(
        'mirrorTenantWriteToD1: D1 HTTP API rejected',
        { status: resp.status, body: body.slice(0, 500), sql: sql.slice(0, 80) },
      );
      return;
    }
    const j = await resp.json().catch(() => null) as { success?: boolean; errors?: unknown } | null;
    if (!j?.success) {
      createRequestLogger(request).error(
        'mirrorTenantWriteToD1: D1 returned success=false',
        { errors: j?.errors, sql: sql.slice(0, 80) },
      );
    }
  } catch (err) {
    // Network failure, DNS resolution failure, timeout — never block the response.
    createRequestLogger(request).error('mirrorTenantWriteToD1: threw', err);
  }
}
