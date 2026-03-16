// Vehicles, Rentals & Guest Access routes — extracted from index.ts
// Contains: vehicles CRUD, rental apartments, exchange rate, guest codes CRUD/validation/QR

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { json, error, generateId, isManagement, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { hashPassword } from '../utils/crypto';
import { getCurrentCorsOrigin } from '../middleware/cors';
import { sendPushNotification } from '../index';

export function registerRentalRoutes() {

// ==================== VEHICLES ROUTES ====================

// Vehicles: List for user (with owner info from users table)
// Supports both user_id (new) and resident_id (legacy) columns
route('GET', '/api/vehicles', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE COALESCE(v.user_id, v.resident_id) = ?
    ${tenantId ? 'AND v.tenant_id = ?' : ''}
    ORDER BY v.is_primary DESC, v.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ vehicles: results });
});

// Vehicles: Create (with all fields)
route('POST', '/api/vehicles', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary } = body;

  if (!plate_number) {
    return error('Plate number required');
  }

  const id = generateId();
  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO vehicles (id, resident_id, user_id, plate_number, brand, model, color, year, vehicle_type, owner_type, company_name, parking_spot, notes, is_primary, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, user.id, plate_number.toUpperCase(),
    brand || null, model || null, color || null, year || null,
    vehicle_type || 'car', owner_type || 'individual',
    company_name || null, parking_spot || null, notes || null,
    is_primary ? 1 : 0, getTenantId(request)
  ).run();

  // Return vehicle with owner info
  const created = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.id = ?
  `).bind(id).first();

  return json({ vehicle: created }, 201);
});

// Vehicles: Update
route('PATCH', '/api/vehicles/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const allowedFields = ['plate_number', 'brand', 'model', 'color', 'year', 'vehicle_type', 'owner_type', 'company_name', 'parking_spot', 'notes', 'is_primary'];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'plate_number') {
        updates.push(`${field} = ?`);
        values.push(body[field].toUpperCase());
      } else if (field === 'is_primary') {
        updates.push(`${field} = ?`);
        values.push(body[field] ? 1 : 0);
      } else {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
  }

  if (updates.length === 0) {
    return json({ success: true });
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  values.push(user.id);
  values.push(user.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE vehicles SET ${updates.join(', ')} WHERE id = ? AND (user_id = ? OR resident_id = ?) ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  // Return updated vehicle
  const updated = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.id = ? ${tenantId ? 'AND v.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ vehicle: updated });
});

// Vehicles: Delete (supports both user_id and resident_id)
route('DELETE', '/api/vehicles/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM vehicles WHERE id = ? AND (user_id = ? OR resident_id = ?) ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, user.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Vehicles: Get ALL vehicles (for security/managers/admins only)
// Оптимизировано для 5000+ пользователей с пагинацией
route('GET', '/api/vehicles/all', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only allow staff roles to see all vehicles
  const allowedRoles = ['admin', 'director', 'manager', 'executor', 'department_head', 'security'];
  if (!allowedRoles.includes(user.role)) {
    return error('Forbidden', 403);
  }

  const url = new URL(request.url);
  const pagination = getPaginationParams(url);
  const search = url.searchParams.get('search')?.toUpperCase();

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Build WHERE clause for search
  let whereClause = tenantId ? 'WHERE v.tenant_id = ?' : '';
  const params: any[] = tenantId ? [tenantId] : [];

  if (search && search.length >= 2) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + '(v.plate_number LIKE ? OR u.name LIKE ? OR u.apartment LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  // Count total
  const countQuery = `
    SELECT COUNT(*) as total FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    ${whereClause}
  `;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    ${whereClause}
    ORDER BY v.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ vehicles: response.data, pagination: response.pagination });
});

// Vehicles: Search (for security/managers) - also search by plate param
// Supports both user_id and resident_id columns
route('GET', '/api/vehicles/search', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const query = url.searchParams.get('q')?.toUpperCase() || url.searchParams.get('plate')?.toUpperCase();

  if (!query || query.length < 1) {
    return json({ vehicles: [] });
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT v.*, u.name as owner_name, u.phone as owner_phone, u.apartment, u.address
    FROM vehicles v
    JOIN users u ON COALESCE(v.user_id, v.resident_id) = u.id
    WHERE v.plate_number LIKE ?
    ${tenantId ? 'AND v.tenant_id = ?' : ''}
    ORDER BY v.plate_number
    LIMIT 20
  `).bind(`%${query}%`, ...(tenantId ? [tenantId] : [])).all();

  return json({ vehicles: results });
});

// ==================== RENTAL APARTMENTS ROUTES ====================

// My apartments: For tenants/commercial_owners to see their own apartments and records
route('GET', '/api/rentals/my-apartments', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only tenants and commercial_owners can access this
  if (user.role !== 'tenant' && user.role !== 'commercial_owner') {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get apartments owned by this user
  const { results: apartments } = await env.DB.prepare(`
    SELECT
      ra.id, ra.name, ra.address, ra.apartment, ra.owner_id, ra.owner_type,
      ra.is_active, ra.created_at
    FROM rental_apartments ra
    WHERE ra.owner_id = ?
    ${tenantId ? 'AND ra.tenant_id = ?' : ''}
    ORDER BY ra.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  // Get all records for all of user's apartments
  const apartmentIds = apartments.map((a: any) => a.id);
  let records: any[] = [];

  if (apartmentIds.length > 0) {
    const placeholders = apartmentIds.map(() => '?').join(',');
    const { results: recordResults } = await env.DB.prepare(`
      SELECT
        rr.id, rr.apartment_id, rr.guest_names, rr.passport_info,
        rr.check_in_date, rr.check_out_date, rr.amount, rr.currency,
        rr.notes, rr.created_at
      FROM rental_records rr
      WHERE rr.apartment_id IN (${placeholders})
      ${tenantId ? 'AND rr.tenant_id = ?' : ''}
      ORDER BY rr.check_in_date DESC
    `).bind(...apartmentIds, ...(tenantId ? [tenantId] : [])).all();
    records = recordResults || [];
  }

  // Transform to frontend format
  const transformedApartments = apartments.map((r: any) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    apartment: r.apartment,
    ownerId: r.owner_id,
    ownerName: user.name,
    ownerPhone: user.phone,
    ownerLogin: user.login,
    ownerType: r.owner_type,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
  }));

  const transformedRecords = records.map((r: any) => ({
    id: r.id,
    apartmentId: r.apartment_id,
    guestNames: r.guest_names,
    passportInfo: r.passport_info,
    checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date,
    amount: r.amount,
    currency: r.currency || 'UZS',
    notes: r.notes,
    createdAt: r.created_at,
  }));

  return json({
    apartments: transformedApartments,
    records: transformedRecords
  });
});

// Rental apartments: List all (for managers/admins)
route('GET', '/api/rentals/apartments', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) {
    console.error(`[403] GET /api/rentals/apartments - user role: "${user.role}", id: "${user.id}"`);
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT
      ra.id, ra.name, ra.address, ra.apartment, ra.owner_id, ra.owner_type,
      ra.is_active, ra.created_at,
      u.name as owner_name, u.phone as owner_phone, u.login as owner_login
    FROM rental_apartments ra
    LEFT JOIN users u ON u.id = ra.owner_id
    ${tenantId ? 'WHERE ra.tenant_id = ?' : ''}
    ORDER BY ra.created_at DESC
  `).bind(...(tenantId ? [tenantId] : [])).all();

  // Transform to frontend format (decrypt passwords)
  const apartments = await Promise.all(results.map(async (r: any) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    apartment: r.apartment,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    ownerPhone: r.owner_phone,
    ownerLogin: r.owner_login,
    ownerType: r.owner_type,
    isActive: r.is_active === 1,
    createdAt: r.created_at,
  })));

  return json({ apartments });
});

// Rental apartments: Create (creates user + apartment)
route('POST', '/api/rentals/apartments', async (request, env) => {
  try {
    const user = await getUser(request, env);
    if (!user) return error('Unauthorized', 401);
    if (!isManagement(user)) return error('Access denied', 403);

    const body = await request.json() as any;
    console.log('[API] Rental create body received:', JSON.stringify(body));

    const { name, address, apartment, ownerName, ownerPhone, ownerLogin, ownerPassword, ownerType = 'tenant', existingUserId } = body;

    if (!name || !address) {
      return error('Name and address are required');
    }

    const rentalTenantId = getTenantId(request);
    let userId: string;
    let finalOwnerName = ownerName || name;
    let finalOwnerPhone = ownerPhone;
    let finalOwnerLogin = ownerLogin;
    let finalOwnerPassword = ownerPassword;

    if (existingUserId) {
      // Existing resident selected — use their name/phone, but ALWAYS create a NEW user
      // with role tenant/commercial_owner so they get TenantDashboard on login
      const existingUser = await env.DB.prepare(
        `SELECT id, name, phone FROM users WHERE id = ? ${rentalTenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(existingUserId, ...(rentalTenantId ? [rentalTenantId] : [])).first() as any;
      if (!existingUser) return error('User not found', 404);

      // Use existing user's name/phone as defaults
      finalOwnerName = existingUser.name || finalOwnerName;
      finalOwnerPhone = existingUser.phone || finalOwnerPhone;

      // Login and password are required from the form
      if (!ownerLogin || !ownerLogin.trim() || !ownerPassword) {
        return error('Login and password required for rental user');
      }

      // Check login uniqueness
      const loginExists = await env.DB.prepare(
        `SELECT id FROM users WHERE login = ? ${rentalTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
      ).bind(ownerLogin.trim(), ...(rentalTenantId ? [rentalTenantId] : [])).first();
      if (loginExists) return error('Login already exists', 400);

      // Create NEW user with tenant/commercial_owner role
      userId = generateId();
      const passwordHash = await hashPassword(ownerPassword);
      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, name, role, phone, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(userId, ownerLogin.trim(), passwordHash, finalOwnerName, ownerType, finalOwnerPhone || null, getTenantId(request)).run();

      finalOwnerLogin = ownerLogin.trim();
      finalOwnerPassword = ownerPassword;
      console.log('[API] New rental user created from existing resident:', userId, 'role:', ownerType);
    } else {
      // Create new user
      if (!ownerLogin || !ownerPassword) {
        return error('Login and password required for new user');
      }
      const existing = await env.DB.prepare(
        `SELECT id FROM users WHERE login = ? ${rentalTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
      ).bind(ownerLogin.trim(), ...(rentalTenantId ? [rentalTenantId] : [])).first();
      if (existing) return error('Login already exists', 400);

      userId = generateId();
      const passwordHash2 = await hashPassword(ownerPassword);
      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, name, role, phone, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(userId, ownerLogin.trim(), passwordHash2, ownerName || name, ownerType, ownerPhone || null, getTenantId(request)).run();
      console.log('[API] New user created for rental:', userId);
    }

    // Create rental apartment
    const apartmentId = generateId();
    await env.DB.prepare(`
      INSERT INTO rental_apartments (id, name, address, apartment, owner_id, owner_type, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(apartmentId, name, address, apartment || null, userId, ownerType, getTenantId(request)).run();
    console.log('[API] Apartment created:', apartmentId);

    return json({
      apartment: {
        id: apartmentId,
        name,
        address,
        apartment,
        ownerId: userId,
        ownerName: finalOwnerName,
        ownerPhone: finalOwnerPhone,
        ownerLogin: finalOwnerLogin,
        ownerPassword: finalOwnerPassword,
        ownerType,
        isActive: true,
        createdAt: new Date().toISOString(),
      }
    }, 201);
  } catch (err: any) {
    console.error('[API] Error creating rental apartment:', err);
    console.error('[API] Error message:', err.message);
    console.error('[API] Error stack:', err.stack);
    // Check for specific errors
    if (err.message?.includes('UNIQUE constraint failed') || err.message?.includes('login')) {
      return error('Login already exists', 400);
    }
    return error(`Failed to create apartment: ${err.message}`, 500);
  }
});

// Rental apartments: Update
route('PATCH', '/api/rentals/apartments/:id', async (request, env, params) => {
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

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  if (updates.length > 0) {
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`
      UPDATE rental_apartments SET ${updates.join(', ')}, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values).run();
  }

  return json({ success: true });
});

// Rental apartments: Delete (also deletes owner user and records)
route('DELETE', '/api/rentals/apartments/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get apartment to find owner
  const apt = await env.DB.prepare(`SELECT owner_id FROM rental_apartments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!apt) {
    return error('Apartment not found', 404);
  }

  // Delete rental records first (cascade should handle, but be safe)
  await env.DB.prepare(`DELETE FROM rental_records WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Delete apartment
  await env.DB.prepare(`DELETE FROM rental_apartments WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Delete owner user
  await env.DB.prepare(`DELETE FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(apt.owner_id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// Rental records: List all or by apartment
route('GET', '/api/rentals/records', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) {
    console.error(`[403] GET /api/rentals/records - user role: "${user.role}", id: "${user.id}"`);
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const apartmentId = url.searchParams.get('apartmentId');

  let whereClause = tenantId ? 'WHERE rr.tenant_id = ?' : '';
  const params: any[] = tenantId ? [tenantId] : [];

  if (apartmentId) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'rr.apartment_id = ?';
    params.push(apartmentId);
  }

  const query = `
    SELECT
      rr.id, rr.apartment_id, rr.guest_names, rr.passport_info,
      rr.check_in_date, rr.check_out_date, rr.amount, rr.currency,
      rr.notes, rr.created_by, rr.created_at
    FROM rental_records rr
    ${whereClause}
    ORDER BY rr.check_in_date DESC
  `;

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Transform to frontend format
  const records = results.map((r: any) => ({
    id: r.id,
    apartmentId: r.apartment_id,
    guestNames: r.guest_names,
    passportInfo: r.passport_info,
    checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date,
    amount: r.amount,
    currency: r.currency,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));

  return json({ records });
});

// Exchange rate: Get USD rate from CBU
route('GET', '/api/exchange-rate', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  try {
    const cbuResponse = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/');
    if (!cbuResponse.ok) throw new Error('CBU API error');
    const data = await cbuResponse.json() as any[];
    if (!data || data.length === 0) throw new Error('No rate data');
    const rate = parseFloat(data[0].Rate);
    return json({ rate, date: data[0].Date, currency: 'USD' });
  } catch (err: any) {
    return error('Failed to fetch exchange rate: ' + err.message, 502);
  }
});

// Rental records: Create
route('POST', '/api/rentals/records', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) {
    console.error(`[403] POST /api/rentals/records - user role: "${user.role}", id: "${user.id}"`);
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const { apartmentId, guestNames, passportInfo, checkInDate, checkOutDate, amount, currency, notes } = body;

  if (!apartmentId || !guestNames || !checkInDate || !checkOutDate) {
    return error('Apartment, guest names, and dates required');
  }

  let finalAmount = amount || 0;
  let finalCurrency = currency || 'UZS';
  let finalNotes = notes || '';
  let exchangeRate: number | null = null;

  // Auto-convert USD to UZS using CBU exchange rate
  if (currency === 'USD' && amount) {
    try {
      const cbuResponse = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/USD/');
      if (!cbuResponse.ok) throw new Error('CBU API error');
      const data = await cbuResponse.json() as any[];
      if (!data || data.length === 0) throw new Error('No rate data');
      exchangeRate = parseFloat(data[0].Rate);
      finalAmount = Math.round(amount * exchangeRate);
      finalCurrency = 'UZS';
      const conversionNote = `$${amount} × ${exchangeRate.toLocaleString('ru-RU')} = ${finalAmount.toLocaleString('ru-RU')} сум (курс ЦБ на ${data[0].Date})`;
      finalNotes = finalNotes ? `${finalNotes}\n${conversionNote}` : conversionNote;
    } catch (err) {
      // If CBU fetch fails, store as-is in USD
      console.error('CBU rate fetch failed:', err);
      finalAmount = amount;
      finalCurrency = 'USD';
    }
  }

  const id = generateId();
  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO rental_records (id, apartment_id, guest_names, passport_info, check_in_date, check_out_date, amount, currency, notes, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, apartmentId, guestNames, passportInfo || null, checkInDate, checkOutDate, finalAmount, finalCurrency, finalNotes || null, user.id, getTenantId(request)).run();

  return json({
    record: {
      id,
      apartmentId,
      guestNames,
      passportInfo,
      checkInDate,
      checkOutDate,
      amount: finalAmount,
      currency: finalCurrency,
      notes: finalNotes || null,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
      exchangeRate,
      originalAmount: currency === 'USD' ? amount : null,
      originalCurrency: currency === 'USD' ? 'USD' : null,
    }
  }, 201);
});

// Rental records: Update
route('PATCH', '/api/rentals/records/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.guestNames) { updates.push('guest_names = ?'); values.push(body.guestNames); }
  if (body.passportInfo !== undefined) { updates.push('passport_info = ?'); values.push(body.passportInfo); }
  if (body.checkInDate) { updates.push('check_in_date = ?'); values.push(body.checkInDate); }
  if (body.checkOutDate) { updates.push('check_out_date = ?'); values.push(body.checkOutDate); }
  if (body.amount !== undefined) { updates.push('amount = ?'); values.push(body.amount); }
  if (body.currency) { updates.push('currency = ?'); values.push(body.currency); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  if (updates.length > 0) {
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`
      UPDATE rental_records SET ${updates.join(', ')}, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values).run();
  }

  return json({ success: true });
});

// Rental records: Delete
route('DELETE', '/api/rentals/records/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM rental_records WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== GUEST ACCESS ROUTES ====================

// Guest codes: List for user (with auto-expire check)
route('GET', '/api/guest-codes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  // Check if user can see all guest codes (management + security roles need full view)
  const isManagementUser = ['admin', 'director', 'manager', 'security', 'executor', 'department_head'].includes(user.role);
  console.log('[guest-codes] User:', user.id, 'Role:', user.role, 'IsManagement:', isManagementUser);

  // Auto-expire old codes
  if (isManagementUser) {
    // Expire all codes for management view
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET status = 'expired', updated_at = datetime('now')
      WHERE status = 'active' AND valid_until < datetime('now') ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...(tenantId ? [tenantId] : [])).run();
  } else {
    // Expire only user's codes
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET status = 'expired', updated_at = datetime('now')
      WHERE user_id = ? AND status = 'active' AND valid_until < datetime('now') ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(user.id, ...(tenantId ? [tenantId] : [])).run();
  }

  let results;
  if (isManagementUser) {
    // Management sees all codes from all residents
    const response = await env.DB.prepare(`
      SELECT g.*, u.name as creator_name, u.apartment as creator_apartment, u.phone as creator_phone
      FROM guest_access_codes g
      LEFT JOIN users u ON u.id = g.user_id ${tenantId ? 'AND u.tenant_id = ?' : ''}
      WHERE 1=1 ${tenantId ? 'AND g.tenant_id = ?' : ''}
      ORDER BY g.created_at DESC
      LIMIT 200
    `).bind(...(tenantId ? [tenantId, tenantId] : [])).all();
    results = response.results;
    console.log('[guest-codes] Management query returned', results?.length || 0, 'codes');
  } else {
    // Regular users see only their own codes
    const response = await env.DB.prepare(`
      SELECT * FROM guest_access_codes
      WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      ORDER BY created_at DESC
      LIMIT 100
    `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();
    results = response.results;
    console.log('[guest-codes] User query returned', results?.length || 0, 'codes for user', user.id);
  }

  // Return with no-cache headers to ensure fresh data
  return new Response(JSON.stringify({ codes: results }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
});

// Guest codes: Create (full data)
route('POST', '/api/guest-codes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // Calculate validity based on access_type
  let validUntil: string;
  let maxUses = 1;
  const now = new Date();
  const validFrom = body.valid_from ? new Date(body.valid_from) : now;

  switch (body.access_type) {
    case 'single_use':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
      maxUses = 1;
      break;
    case 'day':
      // Valid for exactly 24 hours from creation time
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999;
      break;
    case 'week':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999;
      break;
    case 'month':
      validUntil = body.valid_until || new Date(validFrom.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      maxUses = 999;
      break;
    case 'custom':
      if (!body.valid_until) {
        return error('valid_until is required for custom access type');
      }
      validUntil = body.valid_until;
      maxUses = 999;
      break;
    default:
      validUntil = body.valid_until || new Date(validFrom.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }

  // Create QR token (self-contained)
  const tokenData = {
    i: id,
    rn: body.resident_name || user.name,
    rp: body.resident_phone || user.phone,
    ra: body.resident_apartment || user.apartment,
    rd: body.resident_address || user.address,
    vt: body.visitor_type || 'guest',
    at: body.access_type || 'single_use',
    vf: validFrom.getTime(),
    vu: new Date(validUntil).getTime(),
    mx: maxUses,
    vn: body.visitor_name || '',
    vp: body.visitor_phone || '',
    vv: body.visitor_vehicle_plate || '',
  };

  const jsonString = JSON.stringify(tokenData);
  const qrToken = 'GAPASS:' + btoa(unescape(encodeURIComponent(jsonString)));

  console.log('[guest-codes] Creating code for user:', user.id, 'with id:', id);

  const insertResult = await env.DB.prepare(`
    INSERT INTO guest_access_codes (
      id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
      access_type, valid_from, valid_until, max_uses, current_uses, status,
      resident_name, resident_phone, resident_apartment, resident_address, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?, ?, ?)
  `).bind(
    id, user.id, qrToken,
    body.visitor_type || 'guest',
    body.visitor_name || null,
    body.visitor_phone || null,
    body.visitor_vehicle_plate || null,
    body.access_type || 'single_use',
    validFrom.toISOString(),
    validUntil,
    maxUses,
    body.resident_name || user.name,
    body.resident_phone || user.phone,
    body.resident_apartment || user.apartment,
    body.resident_address || user.address,
    body.notes || null,
    getTenantId(request)
  ).run();

  console.log('[guest-codes] Insert result:', insertResult.success, 'changes:', insertResult.meta?.changes);

  const tenantId = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first();
  console.log('[guest-codes] Created code:', created ? 'found' : 'NOT FOUND');
  return json({ code: created }, 201);
});

// Guest codes: Get recent scan logs (for guard scan history) - MUST be before :id route
route('GET', '/api/guest-codes/scan-history', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT * FROM guest_access_logs
    WHERE ${tenantId ? 'tenant_id = ?' : '1=1'}
    ORDER BY scanned_at DESC
    LIMIT 50
  `).bind(...(tenantId ? [tenantId] : [])).all();

  return json({ logs: results });
});

// Guest codes: Get single code
route('GET', '/api/guest-codes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const code = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!code) return error('Not found', 404);
  return json({ code });
});

// Guest codes: Revoke
route('POST', '/api/guest-codes/:id/revoke', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const tenantId = getTenantId(request);
  const isManagementUser = ['admin', 'director', 'manager'].includes(user.role);
  console.log('[GuestRevoke] User:', user.id, 'Role:', user.role, 'isManagement:', isManagementUser, 'Code ID:', params.id);

  // Get the guest code info before revoking (for notification)
  const guestCode = await env.DB.prepare(
    `SELECT id, user_id, visitor_name, visitor_type FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  console.log('[GuestRevoke] Found guest code:', guestCode ? { id: guestCode.id, user_id: guestCode.user_id, visitor_type: guestCode.visitor_type } : null);

  // Management users can revoke any code, residents can only revoke their own
  if (isManagementUser) {
    console.log('[GuestRevoke] Management user revoking code...');
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(user.id, body.reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();
    console.log('[GuestRevoke] Code revoked successfully');

    // Send notifications to the resident (owner of the guest code)
    console.log('[GuestRevoke] Checking notification conditions:', {
      hasGuestCode: !!guestCode,
      hasUserId: !!(guestCode && guestCode.user_id),
      isDifferentUser: guestCode && guestCode.user_id !== user.id
    });

    if (guestCode && guestCode.user_id && guestCode.user_id !== user.id) {
      console.log('[GuestRevoke] Creating notification for resident:', guestCode.user_id);

      const visitorTypeLabels: Record<string, string> = {
        'guest': 'гостя',
        'courier': 'курьера',
        'taxi': 'такси',
        'other': 'посетителя'
      };
      const visitorLabel = visitorTypeLabels[guestCode.visitor_type] || 'посетителя';
      const visitorName = guestCode.visitor_name ? ` (${guestCode.visitor_name})` : '';
      const reasonText = body.reason ? ` Причина: ${body.reason}` : '';

      const notificationTitle = '🚫 Пропуск отменён';
      const notificationBody = `Ваш пропуск для ${visitorLabel}${visitorName} был отменён управляющей компанией.${reasonText}`;

      // 1. Create in-app notification (always works, shows in bell icon)
      try {
        const notifId = generateId();
        console.log('[GuestRevoke] Inserting notification with ID:', notifId);
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
          VALUES (?, ?, 'guest_pass_revoked', ?, ?, ?, 0, datetime('now'))
        `).bind(
          notifId,
          guestCode.user_id,
          notificationTitle,
          notificationBody,
          JSON.stringify({ guestCodeId: params.id, reason: body.reason, url: '/guest-access' })
        ).run();
        console.log('[GuestRevoke] In-app notification created successfully');
      } catch (notifError) {
        console.error('[GuestRevoke] Failed to create in-app notification:', notifError);
      }

      // 2. Send push notification (only works if user has push subscription)
      console.log('[GuestRevoke] Sending push notification...');
      sendPushNotification(env, guestCode.user_id, {
        title: notificationTitle,
        body: notificationBody,
        type: 'guest_pass_revoked',
        tag: `guest-pass-revoked-${params.id}`,
        data: {
          guestCodeId: params.id,
          reason: body.reason,
          url: '/guest-access'
        },
        requireInteraction: true
      }).then(() => {
        console.log('[GuestRevoke] Push notification sent successfully');
      }).catch(err => console.error('[GuestRevoke] Failed to send push notification:', err));
    } else {
      console.log('[GuestRevoke] Skipping notification - conditions not met');
    }
  } else {
    // Residents can only revoke their own codes
    await env.DB.prepare(`
      UPDATE guest_access_codes
      SET status = 'revoked', revoked_at = datetime('now'), revoked_by = ?, revoked_reason = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(user.id, body.reason || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();
  }

  return json({ success: true });
});

// Guest codes: Delete
route('DELETE', '/api/guest-codes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM guest_access_codes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Guest codes: Validate and use (for security scanning)
route('POST', '/api/guest-codes/validate', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const { qr_token } = await request.json() as { qr_token: string };

  // Decode QR token
  if (!qr_token.startsWith('GAPASS:')) {
    return json({ valid: false, error: 'invalid', message: 'Invalid QR format' });
  }

  let tokenData: any;
  try {
    const base64Data = qr_token.substring(7);
    const decoded = decodeURIComponent(escape(atob(base64Data)));
    tokenData = JSON.parse(decoded);
  } catch (e) {
    return json({ valid: false, error: 'invalid', message: 'Failed to decode QR' });
  }

  const codeId = tokenData.i;
  const now = new Date();

  // Check if code exists in DB
  let code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first() as any;

  // If not in DB, create from token data (for backward compatibility)
  if (!code) {
    // Code was created before DB sync, create it now
    const qrToken = qr_token;
    await env.DB.prepare(`
      INSERT OR IGNORE INTO guest_access_codes (
        id, user_id, qr_token, visitor_type, visitor_name, visitor_phone, visitor_vehicle_plate,
        access_type, valid_from, valid_until, max_uses, current_uses, status,
        resident_name, resident_phone, resident_apartment, resident_address
      ) VALUES (?, 'from-token', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?, ?)
    `).bind(
      codeId, qrToken,
      tokenData.vt, tokenData.vn || null, tokenData.vp || null, tokenData.vv || null,
      tokenData.at, new Date(tokenData.vf).toISOString(), new Date(tokenData.vu).toISOString(),
      tokenData.mx, tokenData.rn, tokenData.rp, tokenData.ra, tokenData.rd
    ).run();

    code = await env.DB.prepare('SELECT * FROM guest_access_codes WHERE id = ?').bind(codeId).first();
  }

  if (!code) {
    return json({ valid: false, error: 'invalid', message: 'Code not found' });
  }

  // Check expiry
  if (now > new Date(code.valid_until)) {
    if (code.status === 'active') {
      await env.DB.prepare(`UPDATE guest_access_codes SET status = 'expired', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    }
    return json({ valid: false, error: 'expired', message: 'Code expired', code });
  }

  // Check status
  if (code.status === 'revoked') {
    return json({ valid: false, error: 'revoked', message: 'Code revoked', code });
  }

  if (code.status === 'used') {
    return json({ valid: false, error: 'already_used', message: 'Code already used', code });
  }

  // Check max uses
  if (code.current_uses >= code.max_uses) {
    await env.DB.prepare(`UPDATE guest_access_codes SET status = 'used', updated_at = datetime('now') WHERE id = ?`).bind(codeId).run();
    return json({ valid: false, error: 'already_used', message: 'Maximum uses reached', code });
  }

  // Valid!
  return json({ valid: true, code });
});

// Guest codes: Use (mark as used after allowing entry)
route('POST', '/api/guest-codes/:id/use', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const code = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!code) return error('Not found', 404);

  const newUses = (code.current_uses || 0) + 1;
  const newStatus = newUses >= code.max_uses ? 'used' : 'active';

  await env.DB.prepare(`
    UPDATE guest_access_codes
    SET current_uses = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newUses, newStatus, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Log the usage
  await env.DB.prepare(`
    INSERT INTO guest_access_logs (id, code_id, scanned_by_id, scanned_by_name, scanned_by_role, action, visitor_type, resident_name, resident_apartment, tenant_id)
    VALUES (?, ?, ?, ?, ?, 'entry_allowed', ?, ?, ?, ?)
  `).bind(
    generateId(), params.id, authUser.id, authUser.name, authUser.role,
    code.visitor_type, code.resident_name, code.resident_apartment, tenantId
  ).run();

  // Return updated code
  const updated = await env.DB.prepare(`SELECT * FROM guest_access_codes WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ success: true, code: updated });
});

// Guest codes: Get usage logs for a code
route('GET', '/api/guest-codes/:id/logs', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT * FROM guest_access_logs WHERE code_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY scanned_at DESC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ logs: results });
});


} // end registerRentalRoutes
