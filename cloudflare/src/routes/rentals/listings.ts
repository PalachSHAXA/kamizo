// Sprint 88 — resident rentals marketplace v1 (Editorial direction).
//
// All endpoints:
//   • require the NEW `rental_listings` feature flag (distinct from the
//     older `rentals` flag that gates the УК contract log — that stays
//     unchanged in apartments.ts / records.ts).
//   • enforce tenant isolation in the SQL WHERE clause (not JS).
//   • set source_type server-side from the caller's role — never trust
//     the client on this field.
//   • use the fixed base64 encoder from marketplace admin-products.ts:148
//     (Buffer.from(arrayBuffer).toString('base64') — prevents the 2026-07-10
//     stack overflow that killed `String.fromCharCode(...spread)` on files
//     > ~100 KB).
//
// v1 endpoint list — see also §4 of the implementation plan:
//   GET    /api/rentals/listings                        (feed)
//   GET    /api/rentals/listings/:id                    (detail)
//   GET    /api/rentals/listings/:id/photos             (full photo array)
//   POST   /api/rentals/listings                        (create — atomic)
//   PATCH  /api/rentals/listings/:id                    (edit)
//   POST   /api/rentals/listings/:id/state              (transition)
//   POST   /api/rentals/listings/:id/confirm            (owner: still available)
//   GET    /api/rentals/my-listings                     (owner's listings)
//   POST   /api/rentals/listings/:id/photos             (add photo, multipart)
//   DELETE /api/rentals/listings/:id/photos/:photoId    (delete photo)
//   PATCH  /api/rentals/listings/:id/photos/reorder     (reorder)
//   POST   /api/rentals/listings/:id/reveal-phone       (return owner phone)
//
// Deferred to v2 per plan: POST /api/rentals/listings/:id/report,
// systemd 14-day confirm-prompt timer. The reports TABLE ships now so
// the УК-hide state transition below can record a reason from day one.

import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, bilingualError, generateId, isManagement } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';
// Notifications — canonical shape per requests/assignment.ts:65-79:
// notifyManagers() batches per-tenant fan-out (insert + push).
// sendPushNotification() handles single-recipient; own INSERT INTO
// notifications alongside to guarantee an in-app row lands even for
// recipients without push subscriptions (mirrors assignment.ts pattern).
import { sendPushNotification } from '../notifications';
import { notifyManagers } from '../../utils/notifications';

// Server-side photo cap: 1 MB decoded per photo (marketplace uses 5 MB
// but rentals expect residents to upload multiple photos per listing;
// tighter cap prevents a 5-photo listing bloating a row into 25 MB
// of base64. Real API also refuses > 8 photos per listing).
const PHOTO_MAX_BYTES = 1 * 1024 * 1024;
const PHOTO_MIN_COUNT = 3;
const PHOTO_MAX_COUNT = 8;

const PHOTO_ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PHOTO_ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

// Roles allowed to publish a rentals listing. Residents and commercial
// owners are the base cases; management can also publish on behalf of
// a tenant (source_type will be 'uk' rather than 'resident').
function canPublish(role: string): boolean {
  return role === 'resident' || role === 'tenant' || role === 'commercial_owner'
      || role === 'admin' || role === 'manager' || role === 'director'
      || role === 'department_head';
}

// State-machine — allowed transitions per role. Rejects everything else.
type ListingState = 'active' | 'rented' | 'archived' | 'hidden';
function canTransition(from: ListingState, to: ListingState, byOwner: boolean, byManagement: boolean): boolean {
  if (byOwner) {
    // Owner: active ↔ rented, active ↔ archived, archived → active
    if (from === 'active' && (to === 'rented' || to === 'archived')) return true;
    if (from === 'rented' && (to === 'active' || to === 'archived')) return true;
    if (from === 'archived' && to === 'active') return true;
  }
  if (byManagement) {
    // Management: any → hidden, hidden → active. Also can perform any
    // owner-transition (edit-on-behalf).
    if (to === 'hidden' && from !== 'hidden') return true;
    if (from === 'hidden' && to === 'active') return true;
    // Fall through to owner-transitions.
    if (from === 'active' && (to === 'rented' || to === 'archived')) return true;
    if (from === 'rented' && (to === 'active' || to === 'archived')) return true;
    if (from === 'archived' && to === 'active') return true;
  }
  return false;
}

// Editable field allowlist for PATCH — source_type / publisher_user_id
// / state / tenant_id / created_at / hidden_* / last_confirmed_at all
// missing on purpose. State goes through /state. Timer goes through
// /confirm. Publisher never mutates.
const PATCHABLE_FIELDS = new Set([
  'rooms', 'area_m2', 'floor', 'floor_total', 'apartment_number', 'entrance',
  'building_id', 'price_monthly', 'deposit_months',
  'furnished', 'air_conditioning', 'internet', 'parking', 'animals_allowed',
  'duration_type', 'description', 'phone_visible',
]);
const PATCH_BOOL_FIELDS = new Set(['furnished', 'air_conditioning', 'internet', 'parking', 'animals_allowed', 'phone_visible']);

// ── helper: normalise the raw DB row for API response ────────────
// Feed / detail endpoints emit publisher_name + optional publisher_phone
// via JOIN — same pattern marketplace uses for category_name_ru.
function shapeListingRow(r: any, opts: { includePhone: boolean }): any {
  return {
    id: r.id, tenant_id: r.tenant_id,
    publisher_user_id: r.publisher_user_id, source_type: r.source_type,
    state: r.state,
    hidden_reason: r.hidden_reason ?? null,
    hidden_by_user_id: r.hidden_by_user_id ?? null,
    hidden_at: r.hidden_at ?? null,
    rooms: r.rooms, area_m2: r.area_m2,
    floor: r.floor, floor_total: r.floor_total,
    apartment_number: r.apartment_number ?? null,
    entrance: r.entrance ?? null,
    building_id: r.building_id ?? null,
    price_monthly: r.price_monthly,
    price_currency: r.price_currency,
    deposit_months: r.deposit_months ?? null,
    furnished: r.furnished, air_conditioning: r.air_conditioning,
    internet: r.internet, parking: r.parking, animals_allowed: r.animals_allowed,
    duration_type: r.duration_type,
    description: r.description,
    phone_visible: r.phone_visible,
    last_confirmed_at: r.last_confirmed_at,
    confirm_prompt_sent_at: r.confirm_prompt_sent_at ?? null,
    created_at: r.created_at, updated_at: r.updated_at,
    publisher_name: r.publisher_name ?? null,
    // Never leak phone in list contexts. Detail-endpoint viewers only
    // see it if the owner opted in (phone_visible=1). Owners always
    // see their own phone.
    publisher_phone: opts.includePhone && r.phone_visible ? (r.publisher_phone ?? null) : null,
    publisher_login: r.publisher_login ?? null,
    cover_photo_id: r.cover_photo_id ?? null,
  };
}

// ── helper: parse an optional base64 data-URL from a create-body
//    photo entry and validate it ──────────────────────────────────
function validateDataUrl(dataUrl: string): { ok: true; bytes: number } | { ok: false; reason: string } {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return { ok: false, reason: 'Invalid data URL — must be data:image/(jpeg|png|webp);base64,…' };
  // Approx decoded size — every 4 base64 chars = 3 bytes. Off by a few
  // bytes due to padding, close enough for the cap check.
  const b64 = match[2];
  const bytes = Math.floor((b64.length * 3) / 4);
  if (bytes > PHOTO_MAX_BYTES) return { ok: false, reason: `Photo too large — max ${PHOTO_MAX_BYTES} bytes decoded` };
  return { ok: true, bytes };
}

export function registerListingRoutes() {

// ═════════════════════════════════════════════════════════════════
// GET /api/rentals/listings — public feed within tenant
// ═════════════════════════════════════════════════════════════════
route('GET', '/api/rentals/listings', async (request, env) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);

  // Optional filters — all applied server-side.
  const rooms = url.searchParams.get('rooms');
  const priceMin = url.searchParams.get('price_min');
  const priceMax = url.searchParams.get('price_max');
  const furnished = url.searchParams.get('furnished');
  const floorMin = url.searchParams.get('floor_min');
  const floorMax = url.searchParams.get('floor_max');

  const filters: string[] = [`l.state = 'active'`];
  const params: any[] = [];
  if (tenantId) { filters.push('l.tenant_id = ?'); params.push(tenantId); }
  if (rooms !== null) { filters.push('l.rooms = ?'); params.push(Number(rooms)); }
  if (priceMin !== null) { filters.push('l.price_monthly >= ?'); params.push(Number(priceMin)); }
  if (priceMax !== null) { filters.push('l.price_monthly <= ?'); params.push(Number(priceMax)); }
  if (furnished === '1' || furnished === 'true') { filters.push('l.furnished = 1'); }
  if (floorMin !== null) { filters.push('l.floor >= ?'); params.push(Number(floorMin)); }
  if (floorMax !== null) { filters.push('l.floor <= ?'); params.push(Number(floorMax)); }

  // Explicitly enumerate columns — never SELECT * and never SELECT
  // p.data_url from a JOIN into rental_listing_photos. Cover reference
  // only (photo_id + a boolean-ish hint that the listing has photos).
  const { results } = await env.DB.prepare(`
    SELECT l.id, l.tenant_id, l.publisher_user_id, l.source_type, l.state,
           l.rooms, l.area_m2, l.floor, l.floor_total, l.apartment_number, l.entrance, l.building_id,
           l.price_monthly, l.price_currency, l.deposit_months,
           l.furnished, l.air_conditioning, l.internet, l.parking, l.animals_allowed,
           l.duration_type, l.description, l.phone_visible,
           l.last_confirmed_at, l.confirm_prompt_sent_at, l.created_at, l.updated_at,
           u.name AS publisher_name, u.login AS publisher_login,
           (SELECT p.id FROM rental_listing_photos p WHERE p.listing_id = l.id ORDER BY p.sort_order ASC LIMIT 1) AS cover_photo_id
    FROM rental_listings l
    LEFT JOIN users u ON u.id = l.publisher_user_id
    WHERE ${filters.join(' AND ')}
    ORDER BY l.created_at DESC LIMIT 200
  `).bind(...params).all();

  const listings = (results || []).map((r: any) => shapeListingRow(r, { includePhone: false }));
  return json({ listings });
});

// ═════════════════════════════════════════════════════════════════
// GET /api/rentals/listings/:id — one listing detail
// ═════════════════════════════════════════════════════════════════
// Non-owner viewers only see state IN ('active','rented'). Owner sees
// any state (including hidden and archived). Enforced in WHERE via a
// dual-condition, not JS post-filter.
route('GET', '/api/rentals/listings/:id', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  const row = await env.DB.prepare(`
    SELECT l.id, l.tenant_id, l.publisher_user_id, l.source_type, l.state,
           l.hidden_reason, l.hidden_by_user_id, l.hidden_at,
           l.rooms, l.area_m2, l.floor, l.floor_total, l.apartment_number, l.entrance, l.building_id,
           l.price_monthly, l.price_currency, l.deposit_months,
           l.furnished, l.air_conditioning, l.internet, l.parking, l.animals_allowed,
           l.duration_type, l.description, l.phone_visible,
           l.last_confirmed_at, l.confirm_prompt_sent_at, l.created_at, l.updated_at,
           u.name AS publisher_name, u.phone AS publisher_phone, u.login AS publisher_login,
           (SELECT p.id FROM rental_listing_photos p WHERE p.listing_id = l.id ORDER BY p.sort_order ASC LIMIT 1) AS cover_photo_id
    FROM rental_listings l
    LEFT JOIN users u ON u.id = l.publisher_user_id
    WHERE l.id = ?
      ${tenantId ? 'AND l.tenant_id = ?' : ''}
      AND (l.state IN ('active','rented') OR l.publisher_user_id = ?)
  `).bind(params.id, ...(tenantId ? [tenantId] : []), user.id).first();

  if (!row) return error('Listing not found', 404);
  return json({ listing: shapeListingRow(row as any, { includePhone: true }) });
});

// ═════════════════════════════════════════════════════════════════
// GET /api/rentals/listings/:id/photos — full array (data_urls)
// ═════════════════════════════════════════════════════════════════
route('GET', '/api/rentals/listings/:id/photos', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  // Verify listing exists in tenant AND caller can view it (same rule
  // as GET :id — active/rented for public; any state for owner). The
  // JOIN also acts as the tenant scope for the child rows.
  const parent = await env.DB.prepare(`
    SELECT id FROM rental_listings
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      AND (state IN ('active','rented') OR publisher_user_id = ?)
  `).bind(params.id, ...(tenantId ? [tenantId] : []), user.id).first();

  if (!parent) return error('Listing not found', 404);

  const { results } = await env.DB.prepare(`
    SELECT id, listing_id, tenant_id, sort_order, data_url, created_at
    FROM rental_listing_photos
    WHERE listing_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    ORDER BY sort_order ASC, created_at ASC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ photos: results || [] });
});

// ═════════════════════════════════════════════════════════════════
// POST /api/rentals/listings — create (atomic listing + photos)
// ═════════════════════════════════════════════════════════════════
// Body:
//   { rooms, area_m2, floor, floor_total, apartment_number?, entrance?,
//     building_id?, price_monthly, price_currency='UZS', deposit_months?,
//     furnished?, air_conditioning?, internet?, parking?, animals_allowed?,
//     duration_type?, description, phone_visible?,
//     photos: [{ data_url }, ...] }   -- 3..8 photos, each ≤ 1 MB decoded
//
// Server-side rules enforced here:
//   - source_type = isManagement(user) ? 'uk' : 'resident'  (never trusted from client)
//   - tenant_id  = getTenantId(request)                     (never from client)
//   - publisher_user_id = user.id                           (never from client)
//   - building_id (if provided) must exist AND belong to caller's tenant
//   - photos: 3..8, each validated by validateDataUrl()
route('POST', '/api/rentals/listings', async (request, env) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!canPublish(user.role)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const log = createRequestLogger(request);
  const body = await request.json() as any;

  // ── Required fields ─────────────────────────────────────────────
  const rooms = Number(body.rooms);
  const area_m2 = Number(body.area_m2);
  const floor = Number(body.floor);
  const floor_total = Number(body.floor_total);
  const price_monthly = Number(body.price_monthly);
  const description = typeof body.description === 'string' ? body.description : '';
  if (!(rooms >= 0 && rooms <= 4 && Number.isInteger(rooms)))
    return error('rooms must be integer 0..4 (0 = studio, 4 = 4+)', 400);
  if (!(area_m2 > 0)) return error('area_m2 must be > 0', 400);
  if (!(Number.isInteger(floor) && floor > 0)) return error('floor must be positive integer', 400);
  if (!(Number.isInteger(floor_total) && floor_total >= floor)) return error('floor_total must be >= floor', 400);
  if (!(price_monthly >= 0 && Number.isFinite(price_monthly))) return error('price_monthly must be >= 0', 400);

  // ── Photos: 3..8, each ≤ 1 MB ───────────────────────────────────
  const rawPhotos = Array.isArray(body.photos) ? body.photos : [];
  if (rawPhotos.length < PHOTO_MIN_COUNT)
    return error(`At least ${PHOTO_MIN_COUNT} photos required`, 400);
  if (rawPhotos.length > PHOTO_MAX_COUNT)
    return error(`At most ${PHOTO_MAX_COUNT} photos allowed`, 400);
  for (let i = 0; i < rawPhotos.length; i++) {
    const p = rawPhotos[i];
    if (!p || typeof p.data_url !== 'string')
      return error(`photos[${i}].data_url missing`, 400);
    const check = validateDataUrl(p.data_url);
    if (!check.ok) return error(`photos[${i}]: ${check.reason}`, 400);
  }

  // ── Tenant + building scope ────────────────────────────────────
  const tenantId = getTenantId(request);
  if (body.building_id) {
    // Verify building belongs to caller's tenant BEFORE insert. Prevents
    // cross-tenant reference by a manager on tenant A pointing at
    // tenant B's building_id.
    const b = await env.DB.prepare(
      `SELECT id FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(body.building_id, ...(tenantId ? [tenantId] : [])).first();
    if (!b) return error('building_id not found in caller\'s tenant', 400);
  }

  // ── Server-authoritative fields ────────────────────────────────
  const source_type = isManagement(user) ? 'uk' : 'resident';
  const publisher_user_id = user.id;

  const id = generateId();
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  // Whitelisted optional fields with safe defaults.
  const apartment_number = typeof body.apartment_number === 'string' ? body.apartment_number : null;
  const entrance = typeof body.entrance === 'string' ? body.entrance : null;
  const building_id = body.building_id || null;
  const price_currency = 'UZS';   // v1: single currency, ignore client
  const deposit_months = body.deposit_months != null && Number.isFinite(Number(body.deposit_months))
    ? Number(body.deposit_months) : null;
  const furnished = body.furnished ? 1 : 0;
  const ac = body.air_conditioning ? 1 : 0;
  const internet = body.internet ? 1 : 0;
  const parking = body.parking ? 1 : 0;
  const animals = body.animals_allowed ? 1 : 0;
  const duration_type = ['short','long','flexible'].includes(body.duration_type) ? body.duration_type : 'long';
  const phone_visible = body.phone_visible === false ? 0 : 1;

  // Atomic — listing row + all photo rows in a single batch.
  const stmts = [];
  stmts.push(env.DB.prepare(`
    INSERT INTO rental_listings (
      id, tenant_id, publisher_user_id, source_type,
      rooms, area_m2, floor, floor_total, apartment_number, entrance, building_id,
      price_monthly, price_currency, deposit_months,
      furnished, air_conditioning, internet, parking, animals_allowed,
      duration_type, description, phone_visible,
      last_confirmed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, tenantId || '', publisher_user_id, source_type,
    rooms, area_m2, floor, floor_total, apartment_number, entrance, building_id,
    price_monthly, price_currency, deposit_months,
    furnished, ac, internet, parking, animals,
    duration_type, description, phone_visible,
    now, now, now,
  ));
  for (let i = 0; i < rawPhotos.length; i++) {
    stmts.push(env.DB.prepare(`
      INSERT INTO rental_listing_photos (id, listing_id, tenant_id, sort_order, data_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(generateId(), id, tenantId || '', i, rawPhotos[i].data_url, now));
  }
  await env.DB.batch(stmts);

  log.info('Rental listing created', { id, publisher_user_id, tenant_id: tenantId, photos: rawPhotos.length });

  const created = await env.DB.prepare(`
    SELECT l.*, u.name AS publisher_name, u.phone AS publisher_phone, u.login AS publisher_login,
           (SELECT p.id FROM rental_listing_photos p WHERE p.listing_id = l.id ORDER BY p.sort_order ASC LIMIT 1) AS cover_photo_id
    FROM rental_listings l LEFT JOIN users u ON u.id = l.publisher_user_id
    WHERE l.id = ? ${tenantId ? 'AND l.tenant_id = ?' : ''}
  `).bind(id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Notify tenant managers/admins/directors that a new listing needs
  // triage. Fire-and-forget: a push/insert failure must never fail the
  // create request. Same shape as requests/assignment.ts:65-79.
  // notifyManagers batches the INSERTs (in-app rows land even when a
  // recipient has no push subscriptions) then fires push in parallel.
  const summary = `${roomsLabelRu(created?.rooms)} · ${fmtSumRu(created?.price_monthly)} сум/мес · ${created?.publisher_name || 'житель'}`;
  // I18N NOTE: title/body below are RU-only pending app-wide
  // localization of notification bodies (users.language column exists,
  // no existing site reads it — flip all notification sites at once so
  // recipients don't see mixed languages).
  notifyManagers(env, tenantId, {
    title: '🏠 Новое объявление в аренду',
    body: summary,
    type: 'rental_listing_created',
    tag: `rental-listing-created-${id}`,
    data: { listingId: id, url: '/rentals-moderation' },
  }).catch((err) => { console.error('notifyManagers (rental create) failed:', err); });

  return json({ listing: shapeListingRow(created, { includePhone: true }) }, 201);
});

// Body-formatting helpers — mirror the same terse phrasing marketplace's
// push notifications use. Russian-only for now (matches existing pattern
// in requests/*, notifications.ts). users.language exists — swap-in is
// trivial in v1.1 if we decide to localise notification bodies.
function roomsLabelRu(rooms: number | null | undefined): string {
  if (rooms === 0) return 'Студия';
  if (rooms === 4) return '4+ комн';
  return `${rooms ?? '?'}-комн`;
}
function fmtSumRu(n: number | null | undefined): string {
  return new Intl.NumberFormat('ru-RU').format(Number(n) || 0);
}

// ═════════════════════════════════════════════════════════════════
// PATCH /api/rentals/listings/:id — edit whitelisted fields
// ═════════════════════════════════════════════════════════════════
// Ownership enforced in the WHERE clause (owner path). Management path
// adds isManagement guard at handler top and DROPS the publisher_user_id
// clause. Never allows editing source_type, publisher_user_id, state,
// tenant_id, or timer fields.
route('PATCH', '/api/rentals/listings/:id', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const tenantId = getTenantId(request);
  const mgmt = isManagement(user);

  // If body carries building_id, re-verify it belongs to caller's tenant
  // (same rule as create).
  if (body.building_id) {
    const b = await env.DB.prepare(
      `SELECT id FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(body.building_id, ...(tenantId ? [tenantId] : [])).first();
    if (!b) return error('building_id not found in caller\'s tenant', 400);
  }

  const updates: string[] = [];
  const values: any[] = [];
  for (const field of Object.keys(body)) {
    if (!PATCHABLE_FIELDS.has(field)) continue;
    updates.push(`${field} = ?`);
    values.push(PATCH_BOOL_FIELDS.has(field) ? (body[field] ? 1 : 0) : body[field]);
  }
  if (updates.length === 0) return error('No editable fields provided', 400);

  updates.push(`updated_at = datetime('now')`);
  values.push(params.id);
  if (tenantId) values.push(tenantId);
  if (!mgmt) values.push(user.id);

  const ownerClause = mgmt ? '' : 'AND publisher_user_id = ?';
  const res = await env.DB.prepare(
    `UPDATE rental_listings SET ${updates.join(', ')}
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ${ownerClause}`
  ).bind(...values).run();

  // meta.changes exists on D1 batch results; not on the shim in all
  // paths. Fall back to a follow-up SELECT for the 404 check to keep
  // behaviour deterministic.
  const stillThere = await env.DB.prepare(
    `SELECT id FROM rental_listings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ${ownerClause}`
  ).bind(params.id, ...(tenantId ? [tenantId] : []), ...(mgmt ? [] : [user.id])).first();
  if (!stillThere) return error('Listing not found or not yours', 404);

  const updated = await env.DB.prepare(
    `SELECT l.*, u.name AS publisher_name, u.phone AS publisher_phone, u.login AS publisher_login
     FROM rental_listings l LEFT JOIN users u ON u.id = l.publisher_user_id
     WHERE l.id = ? ${tenantId ? 'AND l.tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ listing: shapeListingRow(updated as any, { includePhone: true }) });
});

// ═════════════════════════════════════════════════════════════════
// POST /api/rentals/listings/:id/state — state transition
// ═════════════════════════════════════════════════════════════════
// Body: { state: 'active'|'rented'|'archived'|'hidden', hidden_reason? }
// State-machine enforced by canTransition(). Ownership in WHERE.
route('POST', '/api/rentals/listings/:id/state', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const target = body.state as ListingState;
  if (!['active','rented','archived','hidden'].includes(target)) {
    return error('state must be one of: active, rented, archived, hidden', 400);
  }

  const tenantId = getTenantId(request);
  const row = await env.DB.prepare(
    `SELECT state, publisher_user_id FROM rental_listings
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!row) return error('Listing not found', 404);

  const mgmt = isManagement(user);
  const isOwner = row.publisher_user_id === user.id;
  if (!mgmt && !isOwner) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const from = row.state as ListingState;
  if (from === target) return error('Listing already in target state', 400);
  if (!canTransition(from, target, isOwner, mgmt)) {
    return error(`Transition ${from} → ${target} not allowed for this role`, 400);
  }

  // «Скрыто модерацией» — record who did it and the reason. Required
  // for owner-facing «Скрыто модерацией» banner and any later audit.
  if (target === 'hidden') {
    if (!mgmt) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
    const reason = typeof body.hidden_reason === 'string' ? body.hidden_reason.slice(0, 500) : null;
    await env.DB.prepare(
      `UPDATE rental_listings SET state = 'hidden', hidden_reason = ?, hidden_by_user_id = ?,
                                  hidden_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(reason, user.id, params.id, ...(tenantId ? [tenantId] : [])).run();
    // Notify the OWNER that their listing was hidden. Include the
    // reason inline so they don't have to open the app to learn why —
    // otherwise the reason "sits in the DB and the resident only sees
    // it if they happen to navigate back" (pre-launch audit).
    // Double insert (push + direct DB) mirrors requests/assignment.ts:
    // sendPushNotification writes an in-app row only when the user has
    // push subs, so the direct INSERT is what guarantees the row exists
    // for a push-less user or a failed push.
    // I18N NOTE: RU-only pending app-wide notification localization
    // (see rental_listing_created site above for context).
    const hideTitle = '🔒 Ваше объявление скрыто модерацией';
    const hideBody = reason
      ? `Причина: ${reason}. Откройте, чтобы посмотреть.`
      : 'Откройте объявление, чтобы посмотреть подробности.';
    sendPushNotification(env, row.publisher_user_id, {
      title: hideTitle, body: hideBody, type: 'rental_listing_hidden',
      tag: `rental-listing-hidden-${params.id}`,
      data: { listingId: params.id, url: `/apartment-rentals/${params.id}` },
      requireInteraction: true,
    }).catch((err) => { console.error('push (rental hide) failed:', err); });
    env.DB.prepare(
      `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
       VALUES (?, ?, 'rental_listing_hidden', ?, ?, ?, 0, datetime('now'), ?)`
    ).bind(
      generateId(), row.publisher_user_id, hideTitle, hideBody,
      JSON.stringify({ listing_id: params.id, hidden_reason: reason, url: `/apartment-rentals/${params.id}` }),
      tenantId || ''
    ).run().catch((err) => { console.error('notification insert (rental hide) failed:', err); });
  } else {
    // Any non-hidden transition clears the hidden_* fields so a
    // subsequently un-hidden listing doesn't retain a stale reason.
    await env.DB.prepare(
      `UPDATE rental_listings SET state = ?, hidden_reason = NULL, hidden_by_user_id = NULL,
                                  hidden_at = NULL, updated_at = datetime('now')
       WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(target, params.id, ...(tenantId ? [tenantId] : [])).run();
    // Notify owner on RESTORE only — hidden → non-hidden is
    // management-only per canTransition (line 71-72), so this fires only
    // when a manager unhides. Owner's own transitions (active↔rented,
    // active↔archived) they initiated themselves; don't spam them.
    // Restore-not-notify also skips restore-via-owner: canTransition
    // makes that impossible, but the guard is explicit anyway.
    if (from === 'hidden' && mgmt && row.publisher_user_id !== user.id) {
      // I18N NOTE: RU-only pending app-wide notification localization
      // (see rental_listing_created site above for context).
      const restoreTitle = '✅ Ваше объявление снова опубликовано';
      const restoreBody = 'Управляющая компания вернула его в ленту.';
      sendPushNotification(env, row.publisher_user_id, {
        title: restoreTitle, body: restoreBody, type: 'rental_listing_restored',
        tag: `rental-listing-restored-${params.id}`,
        data: { listingId: params.id, url: `/apartment-rentals/${params.id}` },
      }).catch((err) => { console.error('push (rental restore) failed:', err); });
      env.DB.prepare(
        `INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
         VALUES (?, ?, 'rental_listing_restored', ?, ?, ?, 0, datetime('now'), ?)`
      ).bind(
        generateId(), row.publisher_user_id, restoreTitle, restoreBody,
        JSON.stringify({ listing_id: params.id, url: `/apartment-rentals/${params.id}` }),
        tenantId || ''
      ).run().catch((err) => { console.error('notification insert (rental restore) failed:', err); });
    }
  }

  return json({ success: true, state: target });
});

// ═════════════════════════════════════════════════════════════════
// POST /api/rentals/listings/:id/confirm — owner: still available
// ═════════════════════════════════════════════════════════════════
// v1 endpoint; the 14-day timer that reads this is v2. Bumping
// last_confirmed_at now is a no-op until the timer starts scanning.
route('POST', '/api/rentals/listings/:id/confirm', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const res = await env.DB.prepare(
    `UPDATE rental_listings
     SET last_confirmed_at = datetime('now'), confirm_prompt_sent_at = NULL,
         updated_at = datetime('now')
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} AND publisher_user_id = ? AND state = 'active'`
  ).bind(params.id, ...(tenantId ? [tenantId] : []), user.id).run();

  const stillThere = await env.DB.prepare(
    `SELECT id FROM rental_listings
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} AND publisher_user_id = ?`
  ).bind(params.id, ...(tenantId ? [tenantId] : []), user.id).first();
  if (!stillThere) return error('Listing not found or not yours', 404);

  return json({ success: true });
});

// ═════════════════════════════════════════════════════════════════
// GET /api/rentals/my-listings — caller's own across all states
// ═════════════════════════════════════════════════════════════════
route('GET', '/api/rentals/my-listings', async (request, env) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT l.id, l.tenant_id, l.publisher_user_id, l.source_type, l.state,
           l.hidden_reason, l.hidden_by_user_id, l.hidden_at,
           l.rooms, l.area_m2, l.floor, l.floor_total, l.apartment_number, l.entrance, l.building_id,
           l.price_monthly, l.price_currency, l.deposit_months,
           l.furnished, l.air_conditioning, l.internet, l.parking, l.animals_allowed,
           l.duration_type, l.description, l.phone_visible,
           l.last_confirmed_at, l.confirm_prompt_sent_at, l.created_at, l.updated_at,
           u.name AS publisher_name, u.phone AS publisher_phone, u.login AS publisher_login,
           (SELECT p.id FROM rental_listing_photos p WHERE p.listing_id = l.id ORDER BY p.sort_order ASC LIMIT 1) AS cover_photo_id
    FROM rental_listings l LEFT JOIN users u ON u.id = l.publisher_user_id
    WHERE l.publisher_user_id = ? ${tenantId ? 'AND l.tenant_id = ?' : ''}
    ORDER BY l.created_at DESC LIMIT 200
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  const listings = (results || []).map((r: any) => shapeListingRow(r, { includePhone: true }));
  return json({ listings });
});

// ═════════════════════════════════════════════════════════════════
// POST /api/rentals/listings/:id/photos — add one photo (multipart)
// ═════════════════════════════════════════════════════════════════
// Reuses the fixed base64 encoder from admin-products.ts:148
// (Buffer.from(...).toString('base64') — prevents the 2026-07-10 stack
// overflow that killed btoa(String.fromCharCode(...spread)) on files
// > ~100 KB).
route('POST', '/api/rentals/listings/:id/photos', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const mgmt = isManagement(user);
  const parentClause = mgmt
    ? `id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    : `id = ? ${tenantId ? 'AND tenant_id = ?' : ''} AND publisher_user_id = ?`;
  const parentBinds = mgmt
    ? [params.id, ...(tenantId ? [tenantId] : [])]
    : [params.id, ...(tenantId ? [tenantId] : []), user.id];

  const parent = await env.DB.prepare(`SELECT id FROM rental_listings WHERE ${parentClause}`).bind(...parentBinds).first();
  if (!parent) return error('Listing not found or not yours', 404);

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return error('Content-Type must be multipart/form-data', 400);
  }

  const formData = await request.formData();
  const file = formData.get('photo') as unknown as File | null;
  if (!file) return error('No `photo` file provided', 400);

  // Reuse marketplace's sanitizer.
  const originalName = (file as any).name || 'photo';
  const sanitizedName = originalName.replace(/\.\./g, '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').replace(/^\.+/, '');
  const ext = sanitizedName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
  if (!PHOTO_ALLOWED_MIME.has(file.type)) return error('Invalid file type. Allowed: JPEG, PNG, WEBP', 400);
  if (ext && !PHOTO_ALLOWED_EXT.has(ext)) return error('Invalid file extension', 400);
  if (file.size > PHOTO_MAX_BYTES) return error(`File too large. Maximum size: ${PHOTO_MAX_BYTES} bytes`, 400);

  // Enforce max 8 photos.
  const existing = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rental_listing_photos
     WHERE listing_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if ((existing?.n || 0) >= PHOTO_MAX_COUNT) return error(`Max ${PHOTO_MAX_COUNT} photos per listing`, 400);

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const data_url = `data:${file.type};base64,${base64}`;

  const id = generateId();
  const next_order = (existing?.n || 0);
  await env.DB.prepare(`
    INSERT INTO rental_listing_photos (id, listing_id, tenant_id, sort_order, data_url)
    VALUES (?, ?, ?, ?, ?)
  `).bind(id, params.id, tenantId || '', next_order, data_url).run();

  return json({ photo: { id, listing_id: params.id, tenant_id: tenantId || '', sort_order: next_order, data_url } }, 201);
});

// ═════════════════════════════════════════════════════════════════
// DELETE /api/rentals/listings/:id/photos/:photoId
// ═════════════════════════════════════════════════════════════════
// Refuses if it would leave < 3 photos on the parent listing (matches
// the client-side create validation and the min-photo product rule).
route('DELETE', '/api/rentals/listings/:id/photos/:photoId', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const mgmt = isManagement(user);

  // Verify ownership on the PARENT — the child's tenant scope is
  // enforced separately in the DELETE WHERE below.
  const parent = await env.DB.prepare(
    `SELECT id FROM rental_listings
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ${mgmt ? '' : 'AND publisher_user_id = ?'}`
  ).bind(params.id, ...(tenantId ? [tenantId] : []), ...(mgmt ? [] : [user.id])).first();
  if (!parent) return error('Listing not found or not yours', 404);

  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM rental_listing_photos
     WHERE listing_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if ((count?.n || 0) <= PHOTO_MIN_COUNT) {
    return error(`Cannot go below ${PHOTO_MIN_COUNT} photos. Add a replacement first.`, 400);
  }

  await env.DB.prepare(
    `DELETE FROM rental_listing_photos
     WHERE id = ? AND listing_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.photoId, params.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ═════════════════════════════════════════════════════════════════
// PATCH /api/rentals/listings/:id/photos/reorder
// ═════════════════════════════════════════════════════════════════
// Body: { ids: [photoId, photoId, ...] } — new sort_order = index in
// this array. Verifies every id belongs to the parent listing.
route('PATCH', '/api/rentals/listings/:id/photos/reorder', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === 'string') : [];
  if (ids.length === 0) return error('ids array required', 400);

  const tenantId = getTenantId(request);
  const mgmt = isManagement(user);
  const parent = await env.DB.prepare(
    `SELECT id FROM rental_listings
     WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ${mgmt ? '' : 'AND publisher_user_id = ?'}`
  ).bind(params.id, ...(tenantId ? [tenantId] : []), ...(mgmt ? [] : [user.id])).first();
  if (!parent) return error('Listing not found or not yours', 404);

  // Verify each id belongs to this listing in this tenant.
  const placeholders = ids.map(() => '?').join(',');
  const { results: children } = await env.DB.prepare(
    `SELECT id FROM rental_listing_photos
     WHERE listing_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
       AND id IN (${placeholders})`
  ).bind(params.id, ...(tenantId ? [tenantId] : []), ...ids).all();
  const foundIds = new Set((children as any[]).map(r => r.id));
  for (const id of ids) {
    if (!foundIds.has(id)) return error(`photo ${id} does not belong to this listing`, 400);
  }

  // Write new sort_order via batch — SQLite will serialise these.
  const stmts = ids.map((id, i) =>
    env.DB.prepare(
      `UPDATE rental_listing_photos SET sort_order = ?
       WHERE id = ? AND listing_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(i, id, params.id, ...(tenantId ? [tenantId] : []))
  );
  await env.DB.batch(stmts);

  return json({ success: true });
});

// ═════════════════════════════════════════════════════════════════
// POST /api/rentals/listings/:id/reveal-phone
// ═════════════════════════════════════════════════════════════════
// Returns { phone, name }. Only fires if listing.phone_visible = 1 for
// non-owner viewers. Owner always sees own phone (which the client
// already has anyway — this is convenience).
route('POST', '/api/rentals/listings/:id/reveal-phone', async (request, env, params) => {
  const fc = await requireFeature('rental_listings', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const row = await env.DB.prepare(
    `SELECT l.publisher_user_id, l.phone_visible, l.state,
            u.name AS publisher_name, u.phone AS publisher_phone
     FROM rental_listings l LEFT JOIN users u ON u.id = l.publisher_user_id
     WHERE l.id = ? ${tenantId ? 'AND l.tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!row) return error('Listing not found', 404);

  const isOwner = row.publisher_user_id === user.id;
  // Non-owners can only see phones on listings currently in the feed.
  if (!isOwner && !(row.state === 'active' || row.state === 'rented')) {
    return error('Listing not available', 404);
  }
  if (!isOwner && !row.phone_visible) {
    return error('Owner has hidden the phone number', 403);
  }
  if (!row.publisher_phone) return error('Owner has no phone on file', 404);

  return json({ phone: row.publisher_phone, name: row.publisher_name });
});

} // end registerListingRoutes
