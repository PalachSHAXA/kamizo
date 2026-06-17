// Sprint 85 — tenant contract PDF storage (commit 1 of 3).
//
// Five endpoints land here:
//   POST   /api/super-admin/tenants/:tenantId/contract   — super-admin force upload
//   POST   /api/admin/tenant/contract                    — director self-upload (own tenant)
//   GET    /api/resident/contract                        — resident downloads own tenant's PDF
//   GET    /api/admin/tenant/contract                    — any staff role downloads own tenant's PDF
//   DELETE /api/super-admin/tenants/:tenantId/contract   — super-admin delete
//
// Plus two list/detail enrichments (in super-admin.ts):
//   GET /api/tenants                            — adds has_contract + contract_uploaded_at
//   GET /api/super-admin/tenants/:id/details    — adds full contract_* + joined name
//
// Storage shape on R2 (CONTRACTS_BUCKET):
//   tenants/<tenant_id>/contract-<ISO>.pdf
// Including tenant_id in the key means an attacker who somehow gets
// an object listing still can't guess into another tenant — keys are
// not enumerable across namespaces.
//
// Tenant isolation:
//   - Resident endpoint derives tenant_id from JWT, NEVER from URL.
//   - Director self-upload derives tenant_id from JWT, NEVER from URL.
//   - Super-admin endpoints take :tenantId, but role is hard-gated.
//
// On the VPS Node.js path, env.CONTRACTS_BUCKET is shimmed by
// /opt/kamizo/app/src/shim/r2.js with a local filesystem backend at
// /opt/kamizo/data/contracts/. The shim exposes .put / .get / .delete
// / .head with the same signatures the Cloudflare R2 binding does, so
// every handler below works against either backend without branching.

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { json, error, isSuperAdmin } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const PDF_MAGIC = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // "%PDF"

// Staff roles that may DOWNLOAD via /api/admin/tenant/contract.
// Director / admin / manager / department_head / dispatcher /
// executor / security all qualify — the contract is reference
// material everyone on the team may need to verify.
const STAFF_DOWNLOAD_ROLES = new Set(['director', 'admin', 'manager', 'department_head', 'dispatcher', 'executor', 'security']);
// Director / admin are the only roles that may UPLOAD via the
// self-upload endpoint. Manager + dispatcher are intentionally
// excluded — this is the binding-contract artefact for the entire
// УК, and overwriting it is something only the org owner should do.
const SELF_UPLOAD_ROLES = new Set(['director', 'admin']);
// Resident-class roles. Tenant + commercial_owner are also lawful
// signatories on the agreement, so they get the download path too.
const RESIDENT_ROLES = new Set(['resident', 'tenant', 'commercial_owner']);

/**
 * Sanitise the original filename for two purposes:
 *  - Used as Content-Disposition filename on download (Russian /
 *    Uzbek glyphs preserved; URL-encoded by the caller for the
 *    actual header so the wire-form is RFC 6266 compliant).
 *  - Defends against path traversal — strips slashes and dots that
 *    could climb out of the R2 namespace if the filename were ever
 *    concatenated into a key (it isn't today, but defence in depth).
 */
function sanitiseFilename(raw: string | null | undefined): string {
  const fallback = 'contract.pdf';
  if (!raw) return fallback;
  // Cyrillic + Latin alphanumerics + space, dot, underscore, hyphen.
  // Everything else collapses to underscore. Repeated underscores
  // collapse too. Then trim leading/trailing dots, slashes, spaces.
  const cleaned = raw
    .replace(/[\\/]/g, '_')
    .replace(/\.{2,}/g, '_')
    .replace(/[^a-zA-Zа-яА-ЯёЁ0-9._\- ]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._\s]+|[._\s]+$/g, '')
    .slice(0, 200);
  if (!cleaned || cleaned === '_') return fallback;
  // Force a .pdf suffix so download dialogs handle the file correctly
  // even if the user uploaded "договор" without an extension.
  return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`;
}

/** Build the R2 object key for a tenant's current contract. */
function buildContractKey(tenantId: string): string {
  // Replace colons in ISO timestamp so the key reads cleanly via R2
  // object listing (S3-style tooling sometimes wants `:`-free names).
  const stamp = new Date().toISOString().replace(/:/g, '-');
  return `tenants/${tenantId}/contract-${stamp}.pdf`;
}

/** Parse + validate the uploaded PDF. Returns the bytes or an error. */
async function parseUploadedPdf(request: Request): Promise<
  | { ok: true; bytes: Uint8Array; originalFilename: string }
  | { ok: false; status: number; message: string }
> {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return { ok: false, status: 400, message: 'Content-Type must be multipart/form-data' };
  }
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return { ok: false, status: 400, message: 'Malformed multipart body' };
  }
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return { ok: false, status: 400, message: 'Field "file" is required' };
  }
  // Reject by MIME first (cheap path), then re-verify by magic bytes.
  if (file.type && file.type !== 'application/pdf') {
    return { ok: false, status: 415, message: 'Only application/pdf is accepted' };
  }
  // Reject oversize BEFORE buffering the entire body into memory on
  // the Worker path. file.size is available on FormDataEntryValue in
  // both Workers and Node's undici implementation.
  if (typeof file.size === 'number' && file.size > MAX_PDF_BYTES) {
    return { ok: false, status: 413, message: `File exceeds ${MAX_PDF_BYTES} bytes (10 MB)` };
  }
  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_PDF_BYTES) {
    return { ok: false, status: 413, message: `File exceeds ${MAX_PDF_BYTES} bytes (10 MB)` };
  }
  const bytes = new Uint8Array(arrayBuffer);
  // Magic-bytes check — even if MIME was lied about, the first four
  // bytes of every PDF are %PDF (0x25 0x50 0x44 0x46) per ISO 32000.
  if (bytes.length < 4 || bytes[0] !== PDF_MAGIC[0] || bytes[1] !== PDF_MAGIC[1] || bytes[2] !== PDF_MAGIC[2] || bytes[3] !== PDF_MAGIC[3]) {
    return { ok: false, status: 415, message: 'File is not a valid PDF (magic bytes mismatch)' };
  }
  const originalFilename = sanitiseFilename(((file as unknown) as { name?: string }).name);
  return { ok: true, bytes, originalFilename };
}

/**
 * Best-effort delete of a previously-stored contract object on R2.
 * Used when replacing — the new key is written first, then the old
 * one is removed. Logged + swallowed if it fails so a transient R2
 * error doesn't break the upload path; a future GC sweep cleans up
 * any orphan.
 */
async function deleteR2Object(env: any, key: string | null | undefined, request: Request): Promise<void> {
  if (!key) return;
  try {
    await env.CONTRACTS_BUCKET.delete(key);
  } catch (e) {
    createRequestLogger(request).error('Failed to delete prior contract from R2', e, { key });
  }
}

/** Shared upload-flow body used by both POST endpoints. */
async function performUpload(
  env: any,
  request: Request,
  tenantId: string,
  uploaderId: string,
): Promise<Response> {
  const tenant = await env.DB.prepare(
    'SELECT id, contract_r2_key FROM tenants WHERE id = ?'
  ).bind(tenantId).first() as { id: string; contract_r2_key: string | null } | null;
  if (!tenant) return error('Tenant not found', 404);

  const parsed = await parseUploadedPdf(request);
  if (!parsed.ok) return error(parsed.message, parsed.status);

  const newKey = buildContractKey(tenantId);
  try {
    await env.CONTRACTS_BUCKET.put(newKey, parsed.bytes, {
      httpMetadata: { contentType: 'application/pdf' },
    });
  } catch (e) {
    createRequestLogger(request).error('R2 put failed', e, { key: newKey });
    return error('Failed to store contract', 500);
  }

  // Replace bookkeeping in DB first; only then drop the old object so
  // a crash between the two leaves the DB pointing at a real key.
  await env.DB.prepare(`
    UPDATE tenants
    SET contract_r2_key = ?, contract_filename = ?,
        contract_uploaded_at = datetime('now'), contract_uploaded_by = ?
    WHERE id = ?
  `).bind(newKey, parsed.originalFilename, uploaderId, tenantId).run();

  if (tenant.contract_r2_key && tenant.contract_r2_key !== newKey) {
    await deleteR2Object(env, tenant.contract_r2_key, request);
  }

  const enriched = await env.DB.prepare(`
    SELECT t.contract_r2_key, t.contract_filename, t.contract_uploaded_at,
           u.name as contract_uploaded_by_name
    FROM tenants t LEFT JOIN users u ON t.contract_uploaded_by = u.id
    WHERE t.id = ?
  `).bind(tenantId).first();

  return json(enriched);
}

/** Stream the tenant's contract PDF back as a download. */
async function streamContract(
  env: any,
  tenantId: string,
  request: Request,
): Promise<Response> {
  const row = await env.DB.prepare(
    'SELECT contract_r2_key, contract_filename FROM tenants WHERE id = ?'
  ).bind(tenantId).first() as { contract_r2_key: string | null; contract_filename: string | null } | null;
  if (!row || !row.contract_r2_key) {
    return new Response(
      JSON.stringify({ error: 'Договор ещё не загружен. Обратитесь в управляющую компанию.' }),
      { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
  let obj: { body: ReadableStream | null; httpMetadata?: { contentType?: string } } | null = null;
  try {
    obj = await env.CONTRACTS_BUCKET.get(row.contract_r2_key);
  } catch (e) {
    createRequestLogger(request).error('R2 get failed', e, { key: row.contract_r2_key });
  }
  if (!obj || !obj.body) {
    // DB row says we have a key but the object's gone. Treat as 404 —
    // a future GC sweep will null the columns when this happens
    // repeatedly. For now don't 500 because the resident's request
    // wasn't at fault.
    return new Response(
      JSON.stringify({ error: 'Договор временно недоступен. Попробуйте позже.' }),
      { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } },
    );
  }
  // RFC 6266 — filename* with UTF-8 encoding so Russian / Uzbek
  // filenames survive Content-Disposition correctly. We also include
  // the plain `filename=` ASCII fallback for ancient clients (any
  // non-ASCII char in the original is replaced with `_` by
  // sanitiseFilename already, so this is safe).
  const filename = row.contract_filename || 'contract.pdf';
  const headers = new Headers({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'Cache-Control': 'private, max-age=300',
  });
  return new Response(obj.body, { status: 200, headers });
}

export function registerTenantContractRoutes() {

// ── A. POST /api/super-admin/tenants/:tenantId/contract — super-admin upload ──
route('POST', '/api/super-admin/tenants/:tenantId/contract', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isSuperAdmin(user)) return error('Super-admin access required', 403);

  const tenantId = params.tenantId;
  if (!tenantId) return error('Tenant id required', 400);
  return performUpload(env, request, tenantId, user.id as string);
});

// ── B. POST /api/admin/tenant/contract — director self-upload ──
route('POST', '/api/admin/tenant/contract', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!SELF_UPLOAD_ROLES.has(user.role as string)) {
    return error('Director or admin role required to upload the tenant contract', 403);
  }
  const tenantId = (user.tenant_id as string | null) || null;
  if (!tenantId) {
    return error('Director user has no tenant binding on the JWT — cannot determine target tenant', 400);
  }
  return performUpload(env, request, tenantId, user.id as string);
});

// ── C. GET /api/resident/contract — resident downloads own tenant's contract ──
route('GET', '/api/resident/contract', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!RESIDENT_ROLES.has(user.role as string)) {
    return error('This endpoint is for residents only', 403);
  }
  const tenantId = (user.tenant_id as string | null) || null;
  if (!tenantId) {
    return error('User has no tenant binding on the JWT', 400);
  }
  return streamContract(env, tenantId, request);
});

// ── D. GET /api/admin/tenant/contract — any staff downloads own tenant's contract ──
route('GET', '/api/admin/tenant/contract', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!STAFF_DOWNLOAD_ROLES.has(user.role as string)) {
    return error('Staff role required', 403);
  }
  const tenantId = (user.tenant_id as string | null) || null;
  if (!tenantId) {
    return error('User has no tenant binding on the JWT', 400);
  }
  return streamContract(env, tenantId, request);
});

// ── E. DELETE /api/super-admin/tenants/:tenantId/contract — super-admin delete ──
// Director cannot delete (prevent footgun); only super-admin.
route('DELETE', '/api/super-admin/tenants/:tenantId/contract', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isSuperAdmin(user)) return error('Super-admin access required', 403);

  const tenantId = params.tenantId;
  if (!tenantId) return error('Tenant id required', 400);

  const tenant = await env.DB.prepare(
    'SELECT id, contract_r2_key FROM tenants WHERE id = ?'
  ).bind(tenantId).first() as { id: string; contract_r2_key: string | null } | null;
  if (!tenant) return error('Tenant not found', 404);

  await env.DB.prepare(`
    UPDATE tenants
    SET contract_r2_key = NULL, contract_filename = NULL,
        contract_uploaded_at = NULL, contract_uploaded_by = NULL
    WHERE id = ?
  `).bind(tenantId).run();

  if (tenant.contract_r2_key) {
    await deleteR2Object(env, tenant.contract_r2_key, request);
  }

  // Audit row — same security_audit_log table the cross-tenant
  // helpers use. Different event tag so a SOC review can filter for
  // contract deletions specifically.
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event TEXT NOT NULL,
        staff_id TEXT,
        staff_name TEXT,
        staff_role TEXT,
        staff_tenant_id TEXT,
        resource_type TEXT,
        resource_id TEXT,
        resource_tenant_id TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run();
    await env.DB.prepare(`
      INSERT INTO security_audit_log
        (event, staff_id, staff_name, staff_role, staff_tenant_id,
         resource_type, resource_id, resource_tenant_id)
      VALUES ('tenant_contract_deleted', ?, ?, ?, ?, 'tenant_contract', ?, ?)
    `).bind(
      user.id, (user.name as string) || null, user.role,
      (user.tenant_id as string | null) || null,
      tenant.contract_r2_key || tenantId, tenantId,
    ).run();
  } catch {
    // Audit log failure must not break the delete path.
  }

  return new Response(null, { status: 204 });
});

} // end registerTenantContractRoutes
