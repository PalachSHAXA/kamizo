// Rental records: list, create, update, delete + exchange rate

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId, requireFeature } from '../../middleware/tenant';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { createRequestLogger } from '../../utils/logger';

export function registerRecordRoutes() {

// Rental records: List all or by apartment
route('GET', '/api/rentals/records', async (request, env) => {
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
  const url = new URL(request.url);
  const apartmentId = url.searchParams.get('apartmentId');

  let whereClause = tenantId ? 'WHERE rr.tenant_id = ?' : '';
  const params: any[] = tenantId ? [tenantId] : [];
  if (apartmentId) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'rr.apartment_id = ?';
    params.push(apartmentId);
  }

  const { results } = await env.DB.prepare(`
    SELECT rr.id, rr.apartment_id, rr.guest_names, rr.passport_info,
      rr.check_in_date, rr.check_out_date, rr.amount, rr.currency,
      rr.notes, rr.created_by, rr.created_at
    FROM rental_records rr ${whereClause} ORDER BY rr.check_in_date DESC LIMIT 500
  `).bind(...params).all();

  const records = results.map((r: any) => ({
    id: r.id, apartmentId: r.apartment_id, guestNames: r.guest_names,
    passportInfo: r.passport_info, checkInDate: r.check_in_date,
    checkOutDate: r.check_out_date, amount: r.amount, currency: r.currency,
    notes: r.notes, createdBy: r.created_by, createdAt: r.created_at,
  }));

  return json({ records });
});

// Exchange rate: Get USD rate from CBU
route('GET', '/api/exchange-rate', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
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
    return error('Failed to fetch exchange rate', 502);
  }
});

// Rental records: Create
route('POST', '/api/rentals/records', async (request, env) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) {
    const log = createRequestLogger(request);
    log.warn('Access denied', { role: user.role, userId: user.id });
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const { apartmentId, guestNames, passportInfo, checkInDate, checkOutDate, amount, currency, notes } = body;
  if (!apartmentId || !guestNames || !checkInDate || !checkOutDate) return error('Apartment, guest names, and dates required');

  let finalAmount = amount || 0;
  let finalCurrency = currency || 'UZS';
  let finalNotes = notes || '';
  let exchangeRate: number | null = null;

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
      const log = createRequestLogger(request);
      log.error('CBU rate fetch failed', err);
      finalAmount = amount;
      finalCurrency = 'USD';
    }
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO rental_records (id, apartment_id, guest_names, passport_info, check_in_date, check_out_date, amount, currency, notes, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, apartmentId, guestNames, passportInfo || null, checkInDate, checkOutDate, finalAmount, finalCurrency, finalNotes || null, user.id, getTenantId(request)).run();

  // Auto-create finance_income entry for UK commission (10%)
  if (finalAmount > 0) {
    try {
      const tenantIdForIncome = getTenantId(request) || '';
      const commissionPercent = 10;
      const commissionAmount = Math.round(finalAmount * commissionPercent / 100);
      let category = await env.DB.prepare(
        "SELECT id FROM finance_income_categories WHERE name = 'Аренда квартир (через платформу)' AND (tenant_id = ? OR is_default = 1) LIMIT 1"
      ).bind(tenantIdForIncome).first<{ id: string }>();
      if (!category) {
        const catId = generateId();
        await env.DB.prepare(
          "INSERT INTO finance_income_categories (id, name, is_default, is_active, tenant_id) VALUES (?, 'Аренда квартир (через платформу)', 0, 1, ?)"
        ).bind(catId, tenantIdForIncome).run();
        category = { id: catId };
      }
      const apt = await env.DB.prepare('SELECT number FROM apartments WHERE id = ? LIMIT 1').bind(apartmentId).first<{ number: string }>();
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      await env.DB.prepare(
        'INSERT INTO finance_income (id, category_id, amount, period, description, source_type, source_id, created_by, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(generateId(), category.id, commissionAmount, period, `Комиссия с аренды кв. ${apt?.number || apartmentId}`, 'rental', id, user.id, tenantIdForIncome).run();
    } catch { /* silently skip if finance tables not ready */ }
  }

  return json({
    record: {
      id, apartmentId, guestNames, passportInfo, checkInDate, checkOutDate,
      amount: finalAmount, currency: finalCurrency, notes: finalNotes || null,
      createdBy: user.id, createdAt: new Date().toISOString(), exchangeRate,
      originalAmount: currency === 'USD' ? amount : null,
      originalCurrency: currency === 'USD' ? 'USD' : null,
    }
  }, 201);
});

// Rental records: Update
route('PATCH', '/api/rentals/records/:id', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
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

  const tenantId = getTenantId(request);
  if (updates.length > 0) {
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE rental_records SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }
  return json({ success: true });
});

// Rental records: Delete
route('DELETE', '/api/rentals/records/:id', async (request, env, params) => {
  const fc = await requireFeature('rentals', env, request);
  if (!fc.allowed) return error(fc.error!, 403);
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isManagement(user)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM rental_records WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

} // end registerRecordRoutes
