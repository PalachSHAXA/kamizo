import { invalidateOnChange } from '../../cache';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { route } from '../../router';
import type { Env, User } from '../../types';
import { error, generateId, json, sanitizeFilename } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const REPORT_TYPES = new Set(['financial', 'completed_works']);
const RESIDENT_ROLES = new Set(['resident', 'tenant', 'commercial_owner']);
const STAFF_ROLES = new Set(['admin', 'director', 'manager']);

type ReportRow = {
  id: string;
  tenant_id: string;
  building_id: string | null;
  file_key: string;
  file_name: string;
  is_active: number;
};

type IsoDate = {
  value: string;
  epochDay: number;
};

function parseIsoDate(value: string | null): IsoDate | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return { value, epochDay: timestamp / 86_400_000 };
}

function ownTenantId(request: Request, user: User): string | null {
  const requestTenantId = getTenantId(request);
  const userTenantId = user.tenant_id || null;
  if (!requestTenantId || requestTenantId === '__no_tenant__' || !userTenantId) return null;
  return requestTenantId === userTenantId ? userTenantId : null;
}

function parseReportType(value: string | null): string | null {
  return value && REPORT_TYPES.has(value) ? value : null;
}

function pdfFilename(raw: string | null | undefined): string {
  const safe = sanitizeFilename(raw, 200) || 'report.pdf';
  return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

async function authenticate(
  request: Request,
  env: Env,
  roles: Set<string>,
): Promise<
  | { ok: false; response: Response }
  | { ok: true; user: User; tenantId: string }
> {
  const user = await getUser(request, env);
  if (!user) return { ok: false, response: error('Unauthorized', 401) };
  if (!roles.has(user.role) || user.role === 'super_admin') {
    return { ok: false, response: error('Forbidden', 403) };
  }
  const tenantId = ownTenantId(request, user);
  if (!tenantId) return { ok: false, response: error('Tenant context required', 403) };
  return { ok: true, user, tenantId };
}

async function streamReport(env: Env, request: Request, row: ReportRow): Promise<Response> {
  let object: R2ObjectBody | null = null;
  try {
    object = await env.CONTRACTS_BUCKET.get(row.file_key);
  } catch (cause) {
    createRequestLogger(request).error('UK report storage read failed', cause, { reportId: row.id });
  }
  if (!object?.body) return error('Report file not found', 404);

  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(pdfFilename(row.file_name)),
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export function registerUkReportRoutes() {
  route('GET', '/api/resident/uk-reports', async (request, env) => {
    const auth = await authenticate(request, env, RESIDENT_ROLES);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const rawType = url.searchParams.get('type');
    const reportType = parseReportType(rawType);
    if (rawType && !reportType) return error('Invalid report type', 400);

    const { results } = await env.DB.prepare(`
      SELECT id, building_id, report_type, title, period_label, description,
             file_name, file_size, published_at, created_at, updated_at
      FROM resident_uk_reports
      WHERE tenant_id = ? AND is_active = 1
        AND (building_id IS NULL OR building_id = ?)
        ${reportType ? 'AND report_type = ?' : ''}
      ORDER BY published_at DESC, created_at DESC
    `).bind(auth.tenantId, auth.user.building_id || null, ...(reportType ? [reportType] : [])).all();

    return json(results || []);
  });

  route('GET', '/api/admin/uk-reports', async (request, env) => {
    const auth = await authenticate(request, env, STAFF_ROLES);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const rawType = url.searchParams.get('type');
    const reportType = parseReportType(rawType);
    if (rawType && !reportType) return error('Invalid report type', 400);
    const buildingId = url.searchParams.get('building_id')?.trim() || null;

    const { results } = await env.DB.prepare(`
      SELECT id, building_id, report_type, title, period_label, description,
             file_name, file_size, uploaded_by, published_at, is_active,
             created_at, updated_at
      FROM resident_uk_reports
      WHERE tenant_id = ?
        ${reportType ? 'AND report_type = ?' : ''}
        ${buildingId ? 'AND building_id = ?' : ''}
      ORDER BY published_at DESC, created_at DESC
    `).bind(auth.tenantId, ...(reportType ? [reportType] : []), ...(buildingId ? [buildingId] : [])).all();

    return json(results || []);
  });

  route('GET', '/api/admin/uk-reports/works-preview', async (request, env) => {
    const auth = await authenticate(request, env, STAFF_ROLES);
    if (!auth.ok) return auth.response;

    const url = new URL(request.url);
    const buildingId = url.searchParams.get('building_id')?.trim() || '';
    const dateFrom = parseIsoDate(url.searchParams.get('date_from'));
    const dateTo = parseIsoDate(url.searchParams.get('date_to'));
    if (!buildingId) return error('building_id is required', 400);
    if (!dateFrom || !dateTo) return error('date_from and date_to must be valid ISO dates', 400);
    if (dateFrom.epochDay > dateTo.epochDay) return error('date_from must not be after date_to', 400);
    if (dateTo.epochDay - dateFrom.epochDay > 365) return error('Date range must not exceed 366 days', 400);

    const building = await env.DB.prepare(
      'SELECT id, name, address FROM buildings WHERE id = ? AND tenant_id = ? LIMIT 1',
    ).bind(buildingId, auth.tenantId).first<{ id: string; name: string; address: string | null }>();
    if (!building) return error('Building not found', 404);

    const periodEndExclusive = new Date((dateTo.epochDay + 1) * 86_400_000).toISOString().slice(0, 10);
    const summary = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM requests
         WHERE tenant_id = ? AND building_id = ? AND created_at >= ? AND created_at < ?) AS requests_received,
        (SELECT COUNT(*) FROM requests
         WHERE tenant_id = ? AND building_id = ? AND status IN ('completed', 'closed')
           AND COALESCE(completed_at, closed_at) >= ? AND COALESCE(completed_at, closed_at) < ?) AS requests_completed,
        (SELECT COUNT(*) FROM requests
         WHERE tenant_id = ? AND building_id = ? AND status = 'cancelled'
           AND updated_at >= ? AND updated_at < ?) AS requests_cancelled,
        (SELECT COUNT(*) FROM work_orders
         WHERE tenant_id = ? AND building_id = ? AND status = 'completed' AND request_id IS NULL
           AND completed_at >= ? AND completed_at < ?) AS work_orders_completed
    `).bind(
      auth.tenantId, buildingId, dateFrom.value, periodEndExclusive,
      auth.tenantId, buildingId, dateFrom.value, periodEndExclusive,
      auth.tenantId, buildingId, dateFrom.value, periodEndExclusive,
      auth.tenantId, buildingId, dateFrom.value, periodEndExclusive,
    ).first<{
      requests_received: number;
      requests_completed: number;
      requests_cancelled: number;
      work_orders_completed: number;
    }>();

    const { results: completedRequests } = await env.DB.prepare(`
      SELECT id, COALESCE(request_number, CAST(number AS TEXT)) AS number, title, category_id, priority,
             COALESCE(completed_at, closed_at) AS completed_at
      FROM requests
      WHERE tenant_id = ? AND building_id = ? AND status IN ('completed', 'closed')
        AND COALESCE(completed_at, closed_at) >= ? AND COALESCE(completed_at, closed_at) < ?
      ORDER BY COALESCE(completed_at, closed_at) DESC, id DESC
      LIMIT 500
    `).bind(auth.tenantId, buildingId, dateFrom.value, periodEndExclusive).all();

    const { results: completedWorkOrders } = await env.DB.prepare(`
      SELECT id, number, title, type, priority, completed_at
      FROM work_orders
      WHERE tenant_id = ? AND building_id = ? AND status = 'completed' AND request_id IS NULL
        AND completed_at >= ? AND completed_at < ?
      ORDER BY completed_at DESC, id DESC
      LIMIT 500
    `).bind(auth.tenantId, buildingId, dateFrom.value, periodEndExclusive).all();

    return json({
      building,
      period_from: dateFrom.value,
      date_to: dateTo.value,
      generated_at: new Date().toISOString(),
      summary: summary || {
        requests_received: 0,
        requests_completed: 0,
        requests_cancelled: 0,
        work_orders_completed: 0,
      },
      completed_requests: completedRequests || [],
      completed_work_orders: completedWorkOrders || [],
    });
  });

  route('POST', '/api/admin/uk-reports', async (request, env) => {
    const auth = await authenticate(request, env, STAFF_ROLES);
    if (!auth.ok) return auth.response;
    if (!(request.headers.get('content-type') || '').includes('multipart/form-data')) {
      return error('Content-Type must be multipart/form-data', 400);
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return error('Malformed multipart body', 400);
    }

    const reportTypeValue = form.get('report_type');
    const titleValue = form.get('title');
    const periodValue = form.get('period_label');
    const descriptionValue = form.get('description');
    const buildingValue = form.get('building_id');
    const fileValue = form.get('file') as unknown as string | File | null;

    const reportType = typeof reportTypeValue === 'string' ? parseReportType(reportTypeValue.trim()) : null;
    const title = typeof titleValue === 'string' ? titleValue.trim() : '';
    const periodLabel = typeof periodValue === 'string' ? periodValue.trim() : '';
    const description = typeof descriptionValue === 'string' && descriptionValue.trim() ? descriptionValue.trim() : null;
    const buildingId = typeof buildingValue === 'string' && buildingValue.trim() ? buildingValue.trim() : null;

    if (!reportType) return error('Invalid report_type', 400);
    if (!title || title.length > 200) return error('Title is required and must not exceed 200 characters', 400);
    if (!periodLabel || periodLabel.length > 100) return error('Period label is required and must not exceed 100 characters', 400);
    if (description && description.length > 5000) return error('Description must not exceed 5000 characters', 400);
    if (buildingId && buildingId.length > 128) return error('Invalid building_id', 400);
    if (!fileValue || typeof fileValue === 'string') return error('Field "file" is required', 400);
    if (fileValue.type && fileValue.type !== 'application/pdf') return error('Only application/pdf is accepted', 415);
    if (fileValue.size <= 0) return error('PDF file is empty', 400);
    if (fileValue.size > MAX_PDF_BYTES) return error('PDF file exceeds 15 MB', 413);

    if (buildingId) {
      const building = await env.DB.prepare(
        'SELECT id FROM buildings WHERE id = ? AND tenant_id = ? LIMIT 1',
      ).bind(buildingId, auth.tenantId).first<{ id: string }>();
      if (!building) return error('Building not found', 404);
    }

    const bytes = new Uint8Array(await fileValue.arrayBuffer());
    if (bytes.byteLength > MAX_PDF_BYTES) return error('PDF file exceeds 15 MB', 413);
    if (bytes.byteLength < 4 || bytes[0] !== 0x25 || bytes[1] !== 0x50 || bytes[2] !== 0x44 || bytes[3] !== 0x46) {
      return error('File is not a valid PDF', 415);
    }

    const id = generateId();
    const fileKey = `tenants/${auth.tenantId}/resident-reports/${id}.pdf`;
    const fileName = pdfFilename(fileValue.name);

    try {
      await env.CONTRACTS_BUCKET.put(fileKey, bytes, {
        httpMetadata: { contentType: 'application/pdf' },
      });
      await env.DB.prepare(`
        INSERT INTO resident_uk_reports (
          id, tenant_id, building_id, report_type, title, period_label,
          description, file_key, file_name, file_size, uploaded_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, auth.tenantId, buildingId, reportType, title, periodLabel,
        description, fileKey, fileName, bytes.byteLength, auth.user.id,
      ).run();
    } catch (cause) {
      try {
        await env.CONTRACTS_BUCKET.delete(fileKey);
      } catch {
        // A later storage sweep can remove this orphan if cleanup fails.
      }
      createRequestLogger(request).error('UK report upload failed', cause, { reportId: id });
      return error('Failed to publish report', 500);
    }

    await invalidateOnChange('resident_uk_reports', env.RATE_LIMITER);
    const report = await env.DB.prepare(`
      SELECT id, building_id, report_type, title, period_label, description,
             file_name, file_size, uploaded_by, published_at, is_active,
             created_at, updated_at
      FROM resident_uk_reports WHERE id = ? AND tenant_id = ?
    `).bind(id, auth.tenantId).first();
    return json(report, 201);
  });

  route('GET', '/api/uk-reports/:id/file', async (request, env, params) => {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    if (user.role === 'super_admin') return error('Forbidden', 403);
    const tenantId = ownTenantId(request, user);
    if (!tenantId) return error('Tenant context required', 403);

    if (STAFF_ROLES.has(user.role)) {
      const report = await env.DB.prepare(`
        SELECT id, tenant_id, building_id, file_key, file_name, is_active
        FROM resident_uk_reports WHERE id = ? AND tenant_id = ?
      `).bind(params.id, tenantId).first<ReportRow>();
      if (!report) return error('Report not found', 404);
      return streamReport(env, request, report);
    }

    if (RESIDENT_ROLES.has(user.role)) {
      const report = await env.DB.prepare(`
        SELECT id, tenant_id, building_id, file_key, file_name, is_active
        FROM resident_uk_reports
        WHERE id = ? AND tenant_id = ? AND is_active = 1
          AND (building_id IS NULL OR building_id = ?)
      `).bind(params.id, tenantId, user.building_id || null).first<ReportRow>();
      if (!report) return error('Report not found', 404);
      return streamReport(env, request, report);
    }

    return error('Forbidden', 403);
  });

  route('PATCH', '/api/admin/uk-reports/:id', async (request, env, params) => {
    const auth = await authenticate(request, env, STAFF_ROLES);
    if (!auth.ok) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return error('Invalid JSON body', 400);
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Invalid body', 400);
    const record = body as Record<string, unknown>;
    if (Object.keys(record).length !== 1 || !Object.hasOwn(record, 'is_active')) {
      return error('Only is_active may be updated', 400);
    }
    const active = record.is_active === true || record.is_active === 1
      ? 1
      : record.is_active === false || record.is_active === 0
        ? 0
        : null;
    if (active === null) return error('is_active must be a boolean', 400);

    const result = await env.DB.prepare(`
      UPDATE resident_uk_reports
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).bind(active, params.id, auth.tenantId).run();
    if (!result.meta.changes) return error('Report not found', 404);

    await invalidateOnChange('resident_uk_reports', env.RATE_LIMITER);
    const report = await env.DB.prepare(`
      SELECT id, building_id, report_type, title, period_label, description,
             file_name, file_size, uploaded_by, published_at, is_active,
             created_at, updated_at
      FROM resident_uk_reports WHERE id = ? AND tenant_id = ?
    `).bind(params.id, auth.tenantId).first();
    return json(report);
  });
}
