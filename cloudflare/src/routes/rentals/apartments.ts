// Rental apartments CRUD: my-apartments, list, create, update, delete
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { hashPassword } from '../../utils/crypto';
import { createRequestLogger } from '../../utils/logger';

export function registerApartmentRoutes() {
// My apartments: For tenants/commercial_owners
route('GET', '/api/rentals/my-apartments', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'tenant' && user.role !== 'commercial_owner') return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const { results: apartments } = await env.DB.prepare(`
    SELECT ra.id, ra.name, ra.address, ra.apartment, ra.owner_id, ra.owner_type, ra.is_active, ra.created_at
    FROM rental_apartments ra WHERE ra.owner_id = ? ${tenantId ? 'AND ra.tenant_id = ?' : ''}
    ORDER BY ra.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();
  const apartmentIds = apartments.map((a: any) => a.id);
  let records: any[] = [];
  if (apartmentIds.length > 0) {
    const placeholders = apartmentIds.map(() => '?').join(',');
    const { results: recordResults } = await env.DB.prepare(`
      SELECT rr.id, rr.apartment_id, rr.guest_names, rr.passport_info,
        rr.check_in_date, rr.check_out_date, rr.amount, rr.currency, rr.notes, rr.created_at
      FROM rental_records rr WHERE rr.apartment_id IN (${placeholders})
      ${tenantId ? 'AND rr.tenant_id = ?' : ''} ORDER BY rr.check_in_date DESC
    `).bind(...apartmentIds, ...(tenantId ? [tenantId] : [])).all();
    records = recordResults || [];
  }
  const transformedApartments = apartments.map((r: any) => ({
    id: r.id, name: r.name, address: r.address, apartment: r.apartment,
    ownerId: r.owner_id, ownerName: user.name, ownerPhone: user.phone,
    ownerLogin: user.login, ownerType: r.owner_type,
    isActive: r.is_active === 1, createdAt: r.created_at,
  }));

  const transformedRecords = records.map((r: any) => ({
    id: r.id, apartmentId: r.apartment_id, guestNames: r.guest_names,
    passportInfo: r.passport_info, checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date, amount: r.amount,
    currency: r.currency || 'UZS', notes: r.notes, createdAt: r.created_at,
  }));

  return json({ apartments: transformedApartments, records: transformedRecords });
});
// Rental apartments: List all (for managers/admins)
route('GET', '/api/rentals/apartments', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) {
    const log = createRequestLogger(request);
    log.warn('Access denied', { role: user.role, userId: user.id });
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT ra.id, ra.name, ra.address, ra.apartment, ra.owner_id, ra.owner_type, ra.is_active, ra.created_at,
           u.name as owner_name, u.phone as owner_phone, u.login as owner_login
    FROM rental_apartments ra LEFT JOIN users u ON u.id = ra.owner_id
    ${tenantId ? 'WHERE ra.tenant_id = ?' : ''} ORDER BY ra.created_at DESC LIMIT 500
  `).bind(...(tenantId ? [tenantId] : [])).all();

  const apartments = await Promise.all(results.map(async (r: any) => ({
    id: r.id, name: r.name, address: r.address, apartment: r.apartment,
    ownerId: r.owner_id, ownerName: r.owner_name, ownerPhone: r.owner_phone,
    ownerLogin: r.owner_login, ownerType: r.owner_type,
    isActive: r.is_active === 1, createdAt: r.created_at,
  })));
  return json({ apartments });
});
// Rental apartments: Create
route('POST', '/api/rentals/apartments', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  try {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    if (!isManagement(user)) return error('Access denied', 403);
    const log = createRequestLogger(request);
    const body = await request.json() as any;
    const { name, address, apartment, ownerName, ownerPhone, ownerLogin, ownerPassword, ownerType = 'tenant', existingUserId } = body;
    if (!name || !address) return error('Name and address are required');

    const rentalTenantId = getTenantId(request);
    let userId: string;
    let finalOwnerName = ownerName || name;
    let finalOwnerPhone = ownerPhone;
    let finalOwnerLogin = ownerLogin;
    let finalOwnerPassword = ownerPassword;

    if (existingUserId) {
      const existingUser = await env.DB.prepare(
        `SELECT id, name, phone FROM users WHERE id = ? ${rentalTenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(existingUserId, ...(rentalTenantId ? [rentalTenantId] : [])).first() as any;
      if (!existingUser) return error('User not found', 404);

      finalOwnerName = existingUser.name || finalOwnerName;
      finalOwnerPhone = existingUser.phone || finalOwnerPhone;
      if (!ownerLogin || !ownerLogin.trim() || !ownerPassword) return error('Login and password required for rental user');

      const loginExists = await env.DB.prepare(
        `SELECT id FROM users WHERE login = ? ${rentalTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
      ).bind(ownerLogin.trim(), ...(rentalTenantId ? [rentalTenantId] : [])).first();
      if (loginExists) return error('Login already exists', 400);

      userId = generateId();
      const passwordHash = await hashPassword(ownerPassword);
      await env.DB.prepare(`INSERT INTO users (id, login, password_hash, name, role, phone, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(userId, ownerLogin.trim(), passwordHash, finalOwnerName, ownerType, finalOwnerPhone || null, getTenantId(request)).run();
      finalOwnerLogin = ownerLogin.trim();
      finalOwnerPassword = ownerPassword;
      log.info('Rental user created from existing resident', { userId, ownerType });
    } else {
      if (!ownerLogin || !ownerPassword) return error('Login and password required for new user');
      const existing = await env.DB.prepare(
        `SELECT id FROM users WHERE login = ? ${rentalTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
      ).bind(ownerLogin.trim(), ...(rentalTenantId ? [rentalTenantId] : [])).first();
      if (existing) return error('Login already exists', 400);

      userId = generateId();
      const passwordHash2 = await hashPassword(ownerPassword);
      await env.DB.prepare(`INSERT INTO users (id, login, password_hash, name, role, phone, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(userId, ownerLogin.trim(), passwordHash2, ownerName || name, ownerType, ownerPhone || null, getTenantId(request)).run();
      log.info('New user created for rental', { userId });
    }

    const apartmentId = generateId();
    await env.DB.prepare(`INSERT INTO rental_apartments (id, name, address, apartment, owner_id, owner_type, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(apartmentId, name, address, apartment || null, userId, ownerType, getTenantId(request)).run();
    log.info('Rental apartment created', { apartmentId });

    return json({
      apartment: {
        id: apartmentId, name, address, apartment, ownerId: userId,
        ownerName: finalOwnerName, ownerPhone: finalOwnerPhone,
        ownerLogin: finalOwnerLogin, ownerPassword: finalOwnerPassword,
        ownerType, isActive: true, createdAt: new Date().toISOString(),
      }
    }, 201);
  } catch (err: any) {
    const log = createRequestLogger(request);
    log.error('Error creating rental apartment', err);
    if (err.message?.includes('UNIQUE constraint failed') || err.message?.includes('login'))
      return error('Login already exists', 400);
    return error('Failed to create apartment', 500);
  }
});
// Rental apartments: Update
route('PATCH', '/api/rentals/apartments/:id', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.address) { updates.push('address = ?'); values.push(body.address); }
  if (body.apartment !== undefined) { updates.push('apartment = ?'); values.push(body.apartment); }
  if (body.isActive !== undefined) { updates.push('is_active = ?'); values.push(body.isActive ? 1 : 0); }

  const tenantId = getTenantId(request);
  if (updates.length > 0) {
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE rental_apartments SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }
  return json({ success: true });
});
// Rental apartments: Delete
route('DELETE', '/api/rentals/apartments/:id', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const apt = await env.DB.prepare(`SELECT owner_id FROM rental_apartments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!apt) return error('Apartment not found', 404);

  await env.DB.prepare(`DELETE FROM rental_records WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  await env.DB.prepare(`DELETE FROM rental_apartments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  await env.DB.prepare(`DELETE FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(apt.owner_id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

} // end registerApartmentRoutes
