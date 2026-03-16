// Buildings & CRM routes — extracted from index.ts
// Contains: branches, districts, buildings, entrances, documents, apartments, owners,
//   personal accounts, debt reports, CRM residents, meters, meter readings

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId } from '../middleware/tenant';
import { invalidateCache } from '../middleware/cache-local';
import { cachedQuery, cachedQueryWithArgs, invalidateOnChange, CacheTTL, CachePrefix } from '../cache';
import { json, error, generateId, isManagement, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { isExecutorRole } from '../index';

export function registerBuildingRoutes() {

// ==================== BRANCHES ROUTES ====================

// Branches: List all
route('GET', '/api/branches', async (request, env) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM buildings WHERE branch_code = b.code ${tenantId ? 'AND tenant_id = ?' : ''}) as buildings_count,
      (SELECT COUNT(*) FROM users u
       JOIN buildings bld ON u.building_id = bld.id
       WHERE bld.branch_code = b.code AND u.role = 'resident' ${tenantId ? 'AND bld.tenant_id = ?' : ''}) as residents_count
    FROM branches b
    ${tenantId ? 'WHERE b.tenant_id = ?' : ''}
    ORDER BY b.name
  `).bind(...(tenantId ? [tenantId, tenantId, tenantId] : [])).all();

  return json({ branches: results });
});

// Branches: Get single
route('GET', '/api/branches/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const branch = await env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM buildings WHERE branch_code = b.code ${tenantId ? 'AND tenant_id = ?' : ''}) as buildings_count,
      (SELECT COUNT(*) FROM users u
       JOIN buildings bld ON u.building_id = bld.id
       WHERE bld.branch_code = b.code AND u.role = 'resident' ${tenantId ? 'AND bld.tenant_id = ?' : ''}) as residents_count
    FROM branches b
    WHERE b.id = ? ${tenantId ? 'AND b.tenant_id = ?' : ''}
  `).bind(...(tenantId ? [tenantId, tenantId] : []), params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!branch) return error('Branch not found', 404);
  return json({ branch });
});

// Branches: Create
route('POST', '/api/branches', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const { code, name, address, phone, district } = body;

  if (!code || !name) {
    return error('Code and name are required', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if code is unique (within tenant)
  const existing = await env.DB.prepare(
    `SELECT id FROM branches WHERE code = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(code.toUpperCase(), ...(tenantId ? [tenantId] : [])).first();

  if (existing) {
    return error('Branch with this code already exists', 400);
  }

  const id = generateId();
  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO branches (id, code, name, address, phone, district, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, code.toUpperCase(), name, address || null, phone || null, district || null, getTenantId(request)).run();

  const branch = await env.DB.prepare('SELECT * FROM branches WHERE id = ?').bind(id).first();
  return json({ branch }, 201);
});

// Branches: Update
route('PATCH', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name !== undefined) {
    updates.push('name = ?');
    values.push(body.name);
  }
  if (body.address !== undefined) {
    updates.push('address = ?');
    values.push(body.address);
  }
  if (body.phone !== undefined) {
    updates.push('phone = ?');
    values.push(body.phone);
  }
  if (body.district !== undefined) {
    updates.push('district = ?');
    values.push(body.district || null);
  }
  if (body.is_active !== undefined) {
    updates.push('is_active = ?');
    values.push(body.is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return error('No fields to update', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  values.push(params.id);
  if (tenantId) values.push(tenantId);
  await env.DB.prepare(`
    UPDATE branches SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(...values).run();

  const branch = await env.DB.prepare(`SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ branch });
});

// Districts: Cascade Delete (delete entire hierarchy: branches → buildings → apartments → residents)
route('DELETE', '/api/districts/cascade', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) return error('District name is required', 400);

  const tenantId = getTenantId(request);
  const tq = tenantId ? ' AND tenant_id = ?' : '';
  const tb = (col: string) => tenantId ? ` AND ${col} = ?` : '';

  // Step 1: Get branch IDs in this district
  const branchRows = await env.DB.prepare(
    `SELECT id FROM branches WHERE district = ?${tq}`
  ).bind(name, ...(tenantId ? [tenantId] : [])).all();
  const branchIds = (branchRows.results as any[]).map(r => r.id as string);

  if (branchIds.length === 0) {
    return json({ success: true, deleted: { branches: 0, buildings: 0, residents: 0 } });
  }

  const branchPlaceholders = branchIds.map(() => '?').join(',');

  // Step 2: Get building IDs in those branches
  const buildingRows = await env.DB.prepare(
    `SELECT id FROM buildings WHERE branch_id IN (${branchPlaceholders})${tb('tenant_id')}`
  ).bind(...branchIds, ...(tenantId ? [tenantId] : [])).all();
  const buildingIds = (buildingRows.results as any[]).map(r => r.id as string);

  const buildingPlaceholders = buildingIds.length > 0 ? buildingIds.map(() => '?').join(',') : null;

  // Step 3: Execute cascade deletion atomically
  const statements: any[] = [];

  if (buildingIds.length > 0) {
    // Delete residents (users with role='resident') in those buildings
    statements.push(
      env.DB.prepare(
        `DELETE FROM users WHERE role = 'resident' AND building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    // Clean up chat_channels referencing those buildings
    statements.push(
      env.DB.prepare(
        `DELETE FROM chat_channels WHERE building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    // Clean up executor_zones referencing those buildings
    statements.push(
      env.DB.prepare(
        `DELETE FROM executor_zones WHERE building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    // NULL out announcements targeting those buildings
    statements.push(
      env.DB.prepare(
        `UPDATE announcements SET target_building_id = NULL WHERE target_building_id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
    // Delete buildings (cascades: apartments, entrances, meetings, meters, personal_accounts, building_documents)
    statements.push(
      env.DB.prepare(
        `DELETE FROM buildings WHERE id IN (${buildingPlaceholders!})${tb('tenant_id')}`
      ).bind(...buildingIds, ...(tenantId ? [tenantId] : []))
    );
  }

  // Delete branches
  statements.push(
    env.DB.prepare(
      `DELETE FROM branches WHERE district = ?${tq}`
    ).bind(name, ...(tenantId ? [tenantId] : []))
  );

  await env.DB.batch(statements);

  return json({
    success: true,
    deleted: {
      branches: branchIds.length,
      buildings: buildingIds.length,
    },
  });
});

// Districts: Delete (unlink all branches from a district)
route('DELETE', '/api/districts', async (request, env) => {
  const user = await getUser(request, env);
  if (!isManagement(user)) {
    return error('Manager access required', 403);
  }

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name) return error('District name is required', 400);

  const tenantId = getTenantId(request);

  // Check if any branches in this district have buildings or residents
  const blockers = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM branches
     WHERE district = ? ${tenantId ? 'AND tenant_id = ?' : ''}
     AND (buildings_count > 0 OR residents_count > 0)`
  ).bind(name, ...(tenantId ? [tenantId] : [])).first() as any;

  if (blockers?.count > 0) {
    return error(
      `Невозможно удалить: в районе есть здания или жители. Сначала удалите или перенесите все жилые комплексы.`,
      409
    );
  }

  // Safe to unlink — set district = NULL for all branches in this district
  await env.DB.prepare(
    `UPDATE branches SET district = NULL, updated_at = datetime('now')
     WHERE district = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(name, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// Branches: Delete
route('DELETE', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if branch has buildings
  const buildingsCount = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM buildings WHERE branch_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (buildingsCount?.count > 0) {
    return error('Cannot delete branch with buildings. Remove buildings first.', 400);
  }

  await env.DB.prepare(`DELETE FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Branch: Change code with cascade update to all buildings
route('POST', '/api/branches/:id/change-code', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'super_admin'].includes(user.role)) {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const newCode = (body.new_code || '').trim().toUpperCase();

  if (!newCode || newCode.length < 1 || newCode.length > 20) {
    return error('Invalid code', 400);
  }
  if (!/^[A-Z0-9_-]+$/.test(newCode)) {
    return error('Code must contain only Latin letters, digits, - or _', 400);
  }

  // Get current branch
  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!branch) return error('Branch not found', 404);

  const oldCode = branch.code;
  if (oldCode === newCode) return json({ branch, changed: false });

  // Uniqueness check within tenant
  const existing = await env.DB.prepare(
    `SELECT id FROM branches WHERE code = ? AND id != ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(newCode, params.id, ...(tenantId ? [tenantId] : [])).first();
  if (existing) return error(`Код "${newCode}" уже используется другим ЖК`, 409);

  // Atomic batch: update branches.code and all buildings.branch_code
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE branches SET code = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(newCode, params.id, ...(tenantId ? [tenantId] : [])),
    env.DB.prepare(
      `UPDATE buildings SET branch_code = ? WHERE branch_code = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(newCode, oldCode, ...(tenantId ? [tenantId] : [])),
  ]);

  // Insert audit log entry
  await env.DB.prepare(
    `INSERT INTO branch_code_audit (id, branch_id, old_code, new_code, changed_by, changed_by_name, tenant_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(generateId(), params.id, oldCode, newCode, user.id, user.name || user.email, tenantId || null).run().catch(() => {});

  const updated = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ branch: updated, changed: true, old_code: oldCode, new_code: newCode });
});

// Branch Export — full snapshot (branch + buildings + entrances + apartments + residents + staff)
route('GET', '/api/branches/:id/export', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);

  const branch = await env.DB.prepare(
    `SELECT * FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!branch) return error('Branch not found', 404);

  // Buildings for this branch
  const { results: buildings } = await env.DB.prepare(
    `SELECT * FROM buildings WHERE (branch_id = ? OR branch_code = ?) ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY name`
  ).bind(params.id, branch.code, ...(tenantId ? [tenantId] : [])).all() as any;

  const buildingIds: string[] = buildings.map((b: any) => b.id);

  // Entrances + apartments per building
  const buildingsWithData: any[] = [];
  for (const building of buildings) {
    const { results: entrances } = await env.DB.prepare(
      `SELECT * FROM entrances WHERE building_id = ? ORDER BY number`
    ).bind(building.id).all() as any;

    const { results: apartments } = await env.DB.prepare(
      `SELECT * FROM apartments WHERE building_id = ? ORDER BY number`
    ).bind(building.id).all() as any;

    buildingsWithData.push({ ...building, entrances, apartments });
  }

  // Residents
  let residents: any[] = [];
  if (buildingIds.length > 0) {
    const ph = buildingIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE building_id IN (${ph}) AND role = 'resident' ORDER BY name`
    ).bind(...buildingIds).all() as any;
    residents = results;
  }

  // Staff (all non-resident tenant users, or building-linked if no tenant)
  let staff: any[] = [];
  if (tenantId) {
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE tenant_id = ? AND role NOT IN ('resident','super_admin','advertiser','tenant') ORDER BY name`
    ).bind(tenantId).all() as any;
    staff = results;
  } else if (buildingIds.length > 0) {
    const ph = buildingIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT * FROM users WHERE building_id IN (${ph}) AND role NOT IN ('resident','super_admin') ORDER BY name`
    ).bind(...buildingIds).all() as any;
    staff = results;
  }

  return json({
    version: '1.0',
    exported_at: new Date().toISOString(),
    branch,
    buildings: buildingsWithData,
    residents,
    staff,
  });
});

// Branch Import — upsert branch + buildings + entrances + apartments + residents + staff
route('POST', '/api/branches/import', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantId = getTenantId(request);
  const reqUrl = new URL(request.url);
  const branchIdParam = reqUrl.searchParams.get('branchId');
  const raw = await request.json() as any;

  const stats = { branches_created: 0, branches_updated: 0, buildings: 0, entrances: 0, apartments: 0, residents: 0, staff: 0 };

  // ── Resolve target branch ──────────────────────────────────────
  let branchId: string;
  let branchCode: string;

  if (branchIdParam) {
    const row = await env.DB.prepare(
      `SELECT id, code FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(branchIdParam, ...(tenantId ? [tenantId] : [])).first() as any;
    if (!row) return error('Branch not found', 404);
    branchId = row.id;
    branchCode = row.code;
    stats.branches_updated++;
  } else {
    const b = raw?.branch;
    if (!b?.code) return error('Invalid import file: missing branch data', 400);
    branchCode = b.code.toUpperCase();
    const row = await env.DB.prepare(
      `SELECT id FROM branches WHERE code = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(branchCode, ...(tenantId ? [tenantId] : [])).first() as any;
    if (row) {
      branchId = row.id;
      await env.DB.prepare(`UPDATE branches SET name=?,address=?,phone=? WHERE id=?`)
        .bind(b.name, b.address||null, b.phone||null, branchId).run();
      stats.branches_updated++;
    } else {
      branchId = generateId();
      await env.DB.prepare(`INSERT INTO branches (id,code,name,address,phone,tenant_id) VALUES (?,?,?,?,?,?)`)
        .bind(branchId, branchCode, b.name, b.address||null, b.phone||null, tenantId||null).run();
      stats.branches_created++;
    }
  }

  // ── Detect format ──────────────────────────────────────────────
  // Old platform format: { exportType, data: { branches: [{ code, buildings: [{ name, residents: [...] }] }] } }
  // New Kamizo format:   { branch, buildings: [...], residents: [...], staff: [...] }
  type NormalBuilding = { name: string; address?: string; floors?: number; entrances_count?: number; apartments_count?: number; entrances?: any[]; apartments?: any[]; residents?: any[] };
  type NormalResident = { login: string; name?: string; phone?: string; apartment?: string; building?: string; password_hash?: string; role?: string; entrance?: string; floor?: string };
  type NormalStaff = { login: string; name?: string; phone?: string; role: string; specialization?: string; password_hash?: string };

  let normalBuildings: NormalBuilding[] = [];
  let normalResidents: NormalResident[] = [];
  let normalStaff: NormalStaff[] = [];

  if (raw?.exportType && raw?.data?.branches) {
    // ── OLD PLATFORM FORMAT ──
    const fileBranches: any[] = raw.data.branches;
    // Try to match by code, else import all
    const matched = fileBranches.filter((fb: any) => fb.code?.toUpperCase() === branchCode);
    const sourceBranches = matched.length > 0 ? matched : fileBranches;

    for (const fb of sourceBranches) {
      for (const bld of (fb.buildings || [])) {
        // old field names: entrances (number) → entrances_count, totalApartments → apartments_count
        normalBuildings.push({
          name: bld.name,
          address: bld.address || '',
          floors: bld.floors || null,
          entrances_count: typeof bld.entrances === 'number' ? bld.entrances : null,
          apartments_count: bld.totalApartments || null,
          residents: bld.residents || [],
        });
        for (const res of (bld.residents || [])) {
          normalResidents.push({
            login: res.login,
            name: res.name,
            phone: res.phone || null,
            apartment: res.apartment || null,
            building: bld.name,
            entrance: res.entrance || null,
            floor: res.floor || null,
            password_hash: '',
            role: res.role || 'resident',
          });
        }
      }
    }
  } else {
    // ── NEW KAMIZO FORMAT ──
    normalBuildings = raw.buildings || [];
    normalResidents = raw.residents || [];
    normalStaff = raw.staff || [];
  }

  // ── Pre-fetch existing data (bulk, no per-row queries) ────────
  // All buildings in this branch
  const { results: existingBldRows } = await env.DB.prepare(
    `SELECT id, name FROM buildings WHERE branch_code=? ${tenantId ? 'AND tenant_id=?' : ''}`
  ).bind(branchCode, ...(tenantId ? [tenantId] : [])).all() as any;
  const existingBldMap = new Map<string, string>(); // name → id
  for (const r of existingBldRows) existingBldMap.set(r.name, r.id);

  // All existing logins for this tenant
  const { results: existingUserRows } = await env.DB.prepare(
    tenantId
      ? `SELECT id, login FROM users WHERE tenant_id=?`
      : `SELECT id, login FROM users`
  ).bind(...(tenantId ? [tenantId] : [])).all() as any;
  const existingLoginMap = new Map<string, string>(); // login → id
  for (const r of existingUserRows) existingLoginMap.set(r.login, r.id);

  // ── Upsert buildings (usually few, sequential is fine) ────────
  const buildingNameToId = new Map<string, string>();
  for (const bld of normalBuildings) {
    if (!bld.name) continue;
    if (existingBldMap.has(bld.name)) {
      const bid = existingBldMap.get(bld.name)!;
      buildingNameToId.set(bld.name, bid);
      await env.DB.prepare(
        `UPDATE buildings SET address=?,floors=?,entrances_count=?,apartments_count=?,branch_id=? WHERE id=?`
      ).bind(bld.address||null, bld.floors||null, bld.entrances_count||null, bld.apartments_count||null, branchId, bid).run();
    } else {
      const newId = generateId();
      await env.DB.prepare(
        `INSERT INTO buildings (id,name,address,branch_code,branch_id,floors,entrances_count,apartments_count,heating_type,building_type,tenant_id)
         VALUES (?,?,?,?,?,?,?,?,'central','monolith',?)`
      ).bind(newId, bld.name, bld.address||'', branchCode, branchId, bld.floors||null, bld.entrances_count||null, bld.apartments_count||null, tenantId||null).run();
      buildingNameToId.set(bld.name, newId);
      stats.buildings++;
    }

    const buildingId = buildingNameToId.get(bld.name)!;
    // Entrances (new format only — usually <10)
    for (const ent of (bld.entrances || [])) {
      const ex = await env.DB.prepare(`SELECT id FROM entrances WHERE building_id=? AND number=?`).bind(buildingId, ent.number).first() as any;
      if (!ex) {
        await env.DB.prepare(
          `INSERT INTO entrances (id,building_id,number,floors_from,floors_to,apartments_from,apartments_to,has_elevator,intercom_type,intercom_code) VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(generateId(),buildingId,ent.number,ent.floors_from||null,ent.floors_to||null,ent.apartments_from||null,ent.apartments_to||null,ent.has_elevator||0,ent.intercom_type||null,ent.intercom_code||null).run();
        stats.entrances++;
      }
    }
    // Apartments (new format only)
    for (const apt of (bld.apartments || [])) {
      const ex = await env.DB.prepare(`SELECT id FROM apartments WHERE building_id=? AND number=?`).bind(buildingId, apt.number).first() as any;
      if (!ex) {
        await env.DB.prepare(
          `INSERT INTO apartments (id,building_id,number,floor,total_area,living_area,rooms,status,is_commercial,ownership_type) VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(generateId(),buildingId,apt.number,apt.floor||null,apt.total_area||null,apt.living_area||null,apt.rooms||null,apt.status||'vacant',apt.is_commercial||0,apt.ownership_type||'private').run();
        stats.apartments++;
      }
    }
  }

  // ── Batch upsert residents ─────────────────────────────────────
  const ALLOWED_USER_ROLES = ['resident','commercial_owner','admin','director','manager','department_head','dispatcher','executor','security'];
  const toInsert: any[] = [];
  const toUpdate: any[] = [];

  for (const res of [...normalResidents, ...normalStaff]) {
    if (!res.login) continue;
    const role = (res as any).role || 'resident';
    if (!ALLOWED_USER_ROLES.includes(role)) continue;

    if (existingLoginMap.has(res.login)) {
      toUpdate.push({ id: existingLoginMap.get(res.login)!, ...res, role });
    } else {
      toInsert.push({ ...res, role });
    }
  }

  // Batch INSERT in chunks of 40
  const CHUNK = 40;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const stmts = chunk.map((res: any) => {
      const isStaff = ['admin','director','manager','department_head','dispatcher','executor','security'].includes(res.role);
      const resolvedBuildingId = (!isStaff && res.building) ? (buildingNameToId.get(res.building) || null) : null;
      return env.DB.prepare(
        `INSERT OR IGNORE INTO users (id,login,name,phone,password_hash,role,apartment,building,building_id,branch,entrance,floor,specialization,tenant_id,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`
      ).bind(
        generateId(), res.login, res.name||res.login, res.phone||null,
        res.password_hash||'',
        res.role, isStaff ? null : (res.apartment||null), isStaff ? null : (res.building||null),
        resolvedBuildingId,
        branchCode, res.entrance||null, res.floor||null, res.specialization||null, tenantId||null
      );
    });
    await env.DB.batch(stmts);
    stats.residents += chunk.filter((r: any) => r.role === 'resident' || r.role === 'commercial_owner').length;
    stats.staff += chunk.filter((r: any) => ['admin','director','manager','department_head','dispatcher','executor','security'].includes(r.role)).length;
  }

  // Batch UPDATE existing in chunks of 40
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    const stmts = chunk.map((res: any) => {
      const isStaff = ['admin','director','manager','department_head','dispatcher','executor','security'].includes(res.role);
      const resolvedBuildingId = (!isStaff && res.building) ? (buildingNameToId.get(res.building) || null) : null;
      return isStaff
        ? env.DB.prepare(`UPDATE users SET name=?,phone=?,role=?,specialization=? WHERE id=?`)
            .bind(res.name||res.login, res.phone||null, res.role, res.specialization||null, res.id)
        : env.DB.prepare(`UPDATE users SET name=?,phone=?,apartment=?,building=?,building_id=COALESCE(?,building_id),branch=? WHERE id=?`)
            .bind(res.name||res.login, res.phone||null, res.apartment||null, res.building||null, resolvedBuildingId, branchCode, res.id);
    });
    await env.DB.batch(stmts);
  }

  // Fix building_id for any users who have building name but no building_id
  // (covers previously imported residents and any edge cases)
  if (tenantId) {
    await env.DB.prepare(`
      UPDATE users
      SET building_id = (
        SELECT b.id FROM buildings b
        WHERE b.name = users.building
          AND b.branch_code = users.branch
          AND b.tenant_id = ?
        LIMIT 1
      )
      WHERE building_id IS NULL
        AND building IS NOT NULL
        AND branch = ?
        AND tenant_id = ?
    `).bind(tenantId, branchCode, tenantId).run();
  } else {
    await env.DB.prepare(`
      UPDATE users
      SET building_id = (
        SELECT b.id FROM buildings b
        WHERE b.name = users.building
          AND b.branch_code = users.branch
        LIMIT 1
      )
      WHERE building_id IS NULL
        AND building IS NOT NULL
        AND branch = ?
    `).bind(branchCode).run();
  }

  // Auto-create personal_accounts for residents who have building_id + apartment but no account
  const { results: residentsNeedingAccounts } = await env.DB.prepare(`
    SELECT u.id, u.name, u.apartment, u.building_id, u.tenant_id
    FROM users u
    LEFT JOIN personal_accounts pa ON pa.building_id = u.building_id
      AND pa.apartment_number = u.apartment
      ${tenantId ? 'AND pa.tenant_id = ?' : ''}
    WHERE u.role = 'resident'
      AND u.building_id IS NOT NULL
      AND u.apartment IS NOT NULL
      AND pa.id IS NULL
      AND u.branch = ?
      ${tenantId ? 'AND u.tenant_id = ?' : ''}
  `).bind(...(tenantId ? [tenantId] : []), branchCode, ...(tenantId ? [tenantId] : [])).all() as any;

  if (residentsNeedingAccounts && residentsNeedingAccounts.length > 0) {
    const paStmts = (residentsNeedingAccounts as any[]).map((u: any) => {
      const paId = generateId();
      const accountNum = `PA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      return env.DB.prepare(
        `INSERT OR IGNORE INTO personal_accounts (id, number, building_id, apartment_number, owner_name, tenant_id)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(paId, accountNum, u.building_id, String(u.apartment), u.name || null, u.tenant_id || null);
    });
    for (let i = 0; i < paStmts.length; i += CHUNK) {
      await env.DB.batch(paStmts.slice(i, i + CHUNK));
    }
  }

  invalidateCache('buildings:');
  invalidateCache('branches:');
  invalidateCache('users:');

  return json({ success: true, stats });
});

// ==================== BUILDINGS ROUTES (CRM) ====================

// Buildings: List all with stats (supports branch_id filter + pagination)
route('GET', '/api/buildings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const branchCode = url.searchParams.get('branch_code');
  const search = url.searchParams.get('search')?.toLowerCase();
  const pagination = getPaginationParams(url);
  const tenantId = getTenantId(request);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const bindValues: any[] = [];

  if (tenantId) {
    whereClause += ` AND b.tenant_id = ?`;
    bindValues.push(tenantId);
  }

  if (branchCode) {
    whereClause += ` AND b.branch_code = ?`;
    bindValues.push(branchCode);
  }

  if (search) {
    whereClause += ` AND (LOWER(b.name) LIKE ? OR LOWER(b.address) LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindValues.push(searchPattern, searchPattern);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM buildings b ${whereClause}`;
  const countStmt = env.DB.prepare(countQuery);
  const { total } = bindValues.length > 0
    ? await countStmt.bind(...bindValues).first() as any
    : await countStmt.first() as any;

  // Paginated data query
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT b.*,
      br.code as branch_code_from_branch,
      br.name as branch_name,
      (SELECT COUNT(*) FROM users WHERE building_id = b.id AND role = 'resident' ${tenantId ? 'AND tenant_id = ?' : ''}) as residents_count,
      (SELECT COUNT(*) FROM entrances WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) as entrances_actual,
      (SELECT COUNT(*) FROM apartments WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) as apartments_actual,
      (SELECT COUNT(*) FROM requests WHERE resident_id IN (SELECT id FROM users WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) AND status NOT IN ('completed', 'cancelled', 'closed') ${tenantId ? 'AND tenant_id = ?' : ''}) as active_requests_count
    FROM buildings b
    LEFT JOIN branches br ON b.branch_id = br.id
    ${whereClause}
    ORDER BY b.name
    LIMIT ? OFFSET ?
  `;

  const dataStmt = env.DB.prepare(dataQuery);
  // Subquery ?-placeholders (in SELECT) come BEFORE WHERE ?-placeholders in SQL string
  // So subqueryTenantIds must be bound first, then bindValues (WHERE params), then pagination
  const subqueryTenantIds = tenantId ? [tenantId, tenantId, tenantId, tenantId, tenantId] : [];
  const { results } = await dataStmt.bind(...subqueryTenantIds, ...bindValues, pagination.limit, offset).all();

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ buildings: response.data, pagination: response.pagination });
});

// Buildings: Get single with full details
route('GET', '/api/buildings/:id', async (request, env, params) => {
  const tenantId = getTenantId(request);
  // Кэшируем данные здания на 5 минут (включает динамические счетчики)
  const data = await cachedQueryWithArgs(
    CachePrefix.BUILDING,
    CacheTTL.BUILDING_STATS,
    [params.id, tenantId || 'no-tenant'],
    async (buildingId: string, _tenantKey: string) => {
      const building = await env.DB.prepare(`
        SELECT b.*,
          (SELECT COUNT(*) FROM users WHERE building_id = b.id AND role = 'resident' ${tenantId ? 'AND tenant_id = ?' : ''}) as residents_count,
          (SELECT COUNT(*) FROM entrances WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) as entrances_actual,
          (SELECT COUNT(*) FROM apartments WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) as apartments_actual,
          (SELECT COUNT(*) FROM requests WHERE resident_id IN (SELECT id FROM users WHERE building_id = b.id ${tenantId ? 'AND tenant_id = ?' : ''}) AND status NOT IN ('completed', 'cancelled', 'closed') ${tenantId ? 'AND tenant_id = ?' : ''}) as active_requests_count
        FROM buildings b
        WHERE b.id = ? ${tenantId ? 'AND b.tenant_id = ?' : ''}
      `).bind(...(tenantId ? [tenantId, tenantId, tenantId, tenantId, tenantId] : []), buildingId, ...(tenantId ? [tenantId] : [])).first();

      if (!building) return null;

      // Get entrances
      const { results: entrances } = await env.DB.prepare(
        `SELECT * FROM entrances WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY number`
      ).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();

      // Get documents (graceful: table may have different schema in production)
      let documents: any[] = [];
      try {
        const docsResult = await env.DB.prepare(
          `SELECT * FROM building_documents WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
        ).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();
        documents = docsResult.results;
      } catch (e) {
        // Table may not exist or have different schema
      }

      return { building, entrances, documents };
    },
    env.RATE_LIMITER
  );

  if (!data || !data.building) return error('Building not found', 404);

  return json(data);
});

// Buildings: Create (full)
route('POST', '/api/buildings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO buildings (
      id, name, address, zone, cadastral_number, branch_code, building_number, branch_id,
      floors, entrances_count, apartments_count, total_area, living_area, common_area, land_area,
      year_built, year_renovated, building_type, roof_type, wall_material, foundation_type,
      has_elevator, elevator_count, has_gas, heating_type, has_hot_water, water_supply_type, sewerage_type,
      has_intercom, has_video_surveillance, has_concierge, has_parking_lot, parking_spaces, has_playground,
      manager_id, manager_name, management_start_date, contract_number, contract_end_date,
      monthly_budget, reserve_fund, total_debt, collection_rate,
      latitude, longitude, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.address,
    body.zone || null,
    body.cadastral_number || body.cadastralNumber || null,
    body.branch_code || body.branchCode || 'YS',
    body.building_number || body.buildingNumber || null,
    body.branch_id || body.branchId || null,
    body.floors || null,
    body.entrances_count || body.entrances || 1,
    body.apartments_count || body.totalApartments || null,
    body.total_area || body.totalArea || null,
    body.living_area || body.livingArea || null,
    body.common_area || body.commonArea || null,
    body.land_area || body.landArea || null,
    body.year_built || body.yearBuilt || null,
    body.year_renovated || body.yearRenovated || null,
    body.building_type || body.buildingType || 'monolith',
    body.roof_type || body.roofType || 'flat',
    body.wall_material || body.wallMaterial || null,
    body.foundation_type || body.foundationType || null,
    body.has_elevator || body.hasElevator ? 1 : 0,
    body.elevator_count || body.elevatorCount || 0,
    body.has_gas || body.hasGas ? 1 : 0,
    body.heating_type || body.heatingType || 'central',
    body.has_hot_water || body.hasHotWater ? 1 : 0,
    body.water_supply_type || body.waterSupplyType || 'central',
    body.sewerage_type || body.sewerageType || 'central',
    body.has_intercom || body.hasIntercom ? 1 : 0,
    body.has_video_surveillance || body.hasVideoSurveillance ? 1 : 0,
    body.has_concierge || body.hasConcierge ? 1 : 0,
    body.has_parking_lot || body.hasParkingLot ? 1 : 0,
    body.parking_spaces || body.parkingSpaces || 0,
    body.has_playground || body.hasPlayground ? 1 : 0,
    body.manager_id || body.managerId || null,
    body.manager_name || body.managerName || null,
    body.management_start_date || body.managementStartDate || null,
    body.contract_number || body.contractNumber || null,
    body.contract_end_date || body.contractEndDate || null,
    body.monthly_budget || body.monthlyBudget || 0,
    body.reserve_fund || body.reserveFund || 0,
    body.total_debt || body.totalDebt || 0,
    body.collection_rate || body.collectionRate || 0,
    body.latitude || null,
    body.longitude || null,
    getTenantId(request)
  ).run();

  // Инвалидируем кэш зданий
  await invalidateOnChange('buildings', env.RATE_LIMITER);

  const tenantId = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ building: created }, 201);
});

// Buildings: Update
route('PATCH', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  // Map all possible fields (support both snake_case and camelCase)
  const fieldMappings: Record<string, string> = {
    name: 'name', address: 'address', zone: 'zone',
    cadastral_number: 'cadastral_number', cadastralNumber: 'cadastral_number',
    branch_code: 'branch_code', branchCode: 'branch_code',
    building_number: 'building_number', buildingNumber: 'building_number',
    floors: 'floors', entrances_count: 'entrances_count', entrances: 'entrances_count',
    apartments_count: 'apartments_count', totalApartments: 'apartments_count',
    total_area: 'total_area', totalArea: 'total_area',
    living_area: 'living_area', livingArea: 'living_area',
    common_area: 'common_area', commonArea: 'common_area',
    land_area: 'land_area', landArea: 'land_area',
    year_built: 'year_built', yearBuilt: 'year_built',
    year_renovated: 'year_renovated', yearRenovated: 'year_renovated',
    building_type: 'building_type', buildingType: 'building_type',
    roof_type: 'roof_type', roofType: 'roof_type',
    wall_material: 'wall_material', wallMaterial: 'wall_material',
    foundation_type: 'foundation_type', foundationType: 'foundation_type',
    has_elevator: 'has_elevator', hasElevator: 'has_elevator',
    elevator_count: 'elevator_count', elevatorCount: 'elevator_count',
    has_gas: 'has_gas', hasGas: 'has_gas',
    heating_type: 'heating_type', heatingType: 'heating_type',
    has_hot_water: 'has_hot_water', hasHotWater: 'has_hot_water',
    water_supply_type: 'water_supply_type', waterSupplyType: 'water_supply_type',
    sewerage_type: 'sewerage_type', sewerageType: 'sewerage_type',
    has_intercom: 'has_intercom', hasIntercom: 'has_intercom',
    has_video_surveillance: 'has_video_surveillance', hasVideoSurveillance: 'has_video_surveillance',
    has_concierge: 'has_concierge', hasConcierge: 'has_concierge',
    has_parking_lot: 'has_parking_lot', hasParkingLot: 'has_parking_lot',
    parking_spaces: 'parking_spaces', parkingSpaces: 'parking_spaces',
    has_playground: 'has_playground', hasPlayground: 'has_playground',
    manager_id: 'manager_id', managerId: 'manager_id',
    manager_name: 'manager_name', managerName: 'manager_name',
    management_start_date: 'management_start_date', managementStartDate: 'management_start_date',
    contract_number: 'contract_number', contractNumber: 'contract_number',
    contract_end_date: 'contract_end_date', contractEndDate: 'contract_end_date',
    monthly_budget: 'monthly_budget', monthlyBudget: 'monthly_budget',
    reserve_fund: 'reserve_fund', reserveFund: 'reserve_fund',
    total_debt: 'total_debt', totalDebt: 'total_debt',
    collection_rate: 'collection_rate', collectionRate: 'collection_rate',
    latitude: 'latitude', longitude: 'longitude',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      // Convert boolean to integer for SQLite
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);

  const tenantId = getTenantId(request);
  if (tenantId) {
    values.push(tenantId);
  }

  await env.DB.prepare(`UPDATE buildings SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  // Инвалидируем кэш зданий
  await invalidateOnChange('buildings', env.RATE_LIMITER);

  const updated = await env.DB.prepare(`SELECT * FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ building: updated });
});

// Buildings: Delete
route('DELETE', '/api/buildings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const buildingId = params.id;
  const tenantId = getTenantId(request);

  // First, unlink users from this building (set building_id to NULL)
  await env.DB.prepare(`UPDATE users SET building_id = NULL WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();

  // Unlink announcements
  await env.DB.prepare(`UPDATE announcements SET target_building_id = NULL WHERE target_building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();

  // Delete chat channels for this building
  await env.DB.prepare(`DELETE FROM chat_channels WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();

  // Delete executor zones
  await env.DB.prepare(`DELETE FROM executor_zones WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();

  // Delete meeting voting units
  await env.DB.prepare(`DELETE FROM meeting_voting_units WHERE building_id = ?`).bind(buildingId).run();

  // Delete meeting building settings
  await env.DB.prepare(`DELETE FROM meeting_building_settings WHERE building_id = ?`).bind(buildingId).run();

  // Now delete the building - cascades will handle entrances, documents, apartments, meetings, etc.
  await env.DB.prepare(`DELETE FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(buildingId, ...(tenantId ? [tenantId] : [])).run();

  // Invalidate cache
  await invalidateOnChange('buildings', env.RATE_LIMITER);

  return json({ success: true });
});

// ==================== ENTRANCES ROUTES (CRM) ====================

// Entrances: List by building
route('GET', '/api/buildings/:buildingId/entrances', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM apartments WHERE building_id = e.building_id AND entrance_id = e.id ${tenantId ? 'AND tenant_id = ?' : ''}) as apartments_count
    FROM entrances e
    WHERE e.building_id = ? ${tenantId ? 'AND e.tenant_id = ?' : ''}
    ORDER BY e.number
  `).bind(...(tenantId ? [tenantId] : []), params.buildingId, ...(tenantId ? [tenantId] : [])).all();
  return json({ entrances: results });
});

// Entrances: Create
route('POST', '/api/buildings/:buildingId/entrances', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  try {
    await env.DB.prepare(`
      INSERT INTO entrances (
        id, building_id, number, floors_from, floors_to, apartments_from, apartments_to,
        has_elevator, elevator_id, intercom_type, intercom_code, cleaning_schedule, responsible_id, notes, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      params.buildingId,
      body.number,
      body.floors_from || body.floorsFrom || 1,
      body.floors_to || body.floorsTo || null,
      body.apartments_from || body.apartmentsFrom || null,
      body.apartments_to || body.apartmentsTo || null,
      body.has_elevator || body.hasElevator ? 1 : 0,
      body.elevator_id || body.elevatorId || null,
      body.intercom_type || body.intercomType || null,
      body.intercom_code || body.intercomCode || null,
      body.cleaning_schedule || body.cleaningSchedule || null,
      body.responsible_id || body.responsibleId || null,
      body.notes || null,
      getTenantId(request)
    ).run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE constraint')) {
      return error(`Подъезд №${body.number} уже существует в этом здании`, 409);
    }
    throw e;
  }

  const created = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(id).first();
  return json({ entrance: created }, 201);
});

// Entrances: Update
route('PATCH', '/api/entrances/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    number: 'number',
    floors_from: 'floors_from', floorsFrom: 'floors_from',
    floors_to: 'floors_to', floorsTo: 'floors_to',
    apartments_from: 'apartments_from', apartmentsFrom: 'apartments_from',
    apartments_to: 'apartments_to', apartmentsTo: 'apartments_to',
    has_elevator: 'has_elevator', hasElevator: 'has_elevator',
    elevator_id: 'elevator_id', elevatorId: 'elevator_id',
    intercom_type: 'intercom_type', intercomType: 'intercom_type',
    intercom_code: 'intercom_code', intercomCode: 'intercom_code',
    cleaning_schedule: 'cleaning_schedule', cleaningSchedule: 'cleaning_schedule',
    responsible_id: 'responsible_id', responsibleId: 'responsible_id',
    last_inspection: 'last_inspection', lastInspection: 'last_inspection',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  const tenantIdUpd = getTenantId(request);

  const updateResult = await env.DB.prepare(`UPDATE entrances SET ${updates.join(', ')} WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`).bind(...values, ...(tenantIdUpd ? [tenantIdUpd] : [])).run();

  if (!updateResult.meta?.changes) {
    return error('Подъезд не найден или нет доступа', 404);
  }

  const updated = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(params.id).first() as any;

  // If apartments_from/to or floors changed, auto-generate new apartments (INSERT OR IGNORE keeps existing ones intact)
  const rangeChanged = body.apartments_from !== undefined || body.apartments_to !== undefined ||
    body.apartmentsFrom !== undefined || body.apartmentsTo !== undefined ||
    body.floors_from !== undefined || body.floors_to !== undefined ||
    body.floorsFrom !== undefined || body.floorsTo !== undefined;

  if (rangeChanged && updated && updated.building_id) {
    const floorsFrom = updated.floors_from || 1;
    const floorsTo = updated.floors_to || 9;
    const aptsFrom = updated.apartments_from || 1;
    const aptsTo = updated.apartments_to || 36;
    const totalApts = aptsTo - aptsFrom + 1;
    const totalFloors = floorsTo - floorsFrom + 1;
    const aptsPerFloor = Math.ceil(totalApts / totalFloors);
    const aptData: Array<{ number: string; floor: number }> = [];
    let aptNum = aptsFrom;
    for (let floor = floorsFrom; floor <= floorsTo && aptNum <= aptsTo; floor++) {
      for (let i = 0; i < aptsPerFloor && aptNum <= aptsTo; i++) {
        aptData.push({ number: String(aptNum), floor });
        aptNum++;
      }
    }

    if (aptData.length > 0) {
      for (let i = 0; i < aptData.length; i += 50) {
        const batch = aptData.slice(i, i + 50);
        const stmts = batch.map((apt) =>
          env.DB.prepare(
            `INSERT OR IGNORE INTO apartments (id, building_id, entrance_id, number, floor, status, tenant_id)
             VALUES (?, ?, ?, ?, ?, 'occupied', ?)`
          ).bind(generateId(), updated.building_id, params.id, apt.number, apt.floor, tenantIdUpd)
        );
        await env.DB.batch(stmts);
      }
    }
  }

  return json({ entrance: updated });
});

// Entrances: Delete
route('DELETE', '/api/entrances/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM entrances WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  return json({ success: true });
});

// ==================== BUILDING DOCUMENTS ROUTES ====================

// Building Documents: List
route('GET', '/api/buildings/:buildingId/documents', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM building_documents WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY uploaded_at DESC`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).all();
  return json({ documents: results });
});

// Building Documents: Create
route('POST', '/api/buildings/:buildingId/documents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    INSERT INTO building_documents (id, building_id, name, type, file_url, file_size, uploaded_by, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.buildingId,
    body.name,
    body.type || 'other',
    body.file_url || body.fileUrl,
    body.file_size || body.fileSize || 0,
    authUser!.id,
    body.expires_at || body.expiresAt || null,
    tenantId
  ).run();

  const created = await env.DB.prepare(
    `SELECT * FROM building_documents WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(id, ...(tenantId ? [tenantId] : [])).first();
  return json({ document: created }, 201);
});

// Building Documents: Delete
route('DELETE', '/api/building-documents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM building_documents WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  return json({ success: true });
});

// ==================== APARTMENTS ROUTES (CRM) ====================

// Apartments: List by building
route('GET', '/api/buildings/:buildingId/apartments', async (request, env, params) => {
  const url = new URL(request.url);
  const entranceId = url.searchParams.get('entrance_id');
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '100');
  const offset = (page - 1) * limit;
  const tenantId = getTenantId(request);

  let query = `
    SELECT a.*,
      o.full_name as owner_name,
      o.phone as owner_phone,
      pa.account_number,
      pa.balance,
      (SELECT COUNT(*) FROM users u WHERE u.building_id = a.building_id AND TRIM(u.apartment) = TRIM(a.number) AND u.role = 'resident' ${tenantId ? 'AND u.tenant_id = a.tenant_id' : ''}) as resident_count
    FROM apartments a
    LEFT JOIN owners o ON a.primary_owner_id = o.id
    LEFT JOIN personal_accounts pa ON a.personal_account_id = pa.id
    WHERE a.building_id = ?
  `;
  const bindings: any[] = [params.buildingId];

  if (tenantId) {
    query += ' AND a.tenant_id = ?';
    bindings.push(tenantId);
  }
  if (entranceId) {
    query += ' AND a.entrance_id = ?';
    bindings.push(entranceId);
  }
  if (status) {
    query += ' AND a.status = ?';
    bindings.push(status);
  }

  query += ' ORDER BY CAST(a.number AS INTEGER), a.number LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  // Get total count
  let countQuery = `SELECT COUNT(*) as total FROM apartments WHERE building_id = ?`;
  const countBindings: any[] = [params.buildingId];
  if (tenantId) {
    countQuery += ' AND tenant_id = ?';
    countBindings.push(tenantId);
  }
  if (entranceId) {
    countQuery += ' AND entrance_id = ?';
    countBindings.push(entranceId);
  }
  if (status) {
    countQuery += ' AND status = ?';
    countBindings.push(status);
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    apartments: results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});

// Apartments: Get single with details
route('GET', '/api/apartments/:id', async (request, env, params) => {
  const tenantId = getTenantId(request);

  // Try with tenant filter first, fallback to without (user already has access from list)
  let apartment = await env.DB.prepare(`
    SELECT a.*,
      b.name as building_name,
      b.address as building_address,
      e.number as entrance_number
    FROM apartments a
    LEFT JOIN buildings b ON a.building_id = b.id
    LEFT JOIN entrances e ON a.entrance_id = e.id
    WHERE a.id = ? ${tenantId ? 'AND a.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  // Fallback: try without tenant filter if not found (handles tenant_id mismatch)
  if (!apartment && tenantId) {
    apartment = await env.DB.prepare(`
      SELECT a.*,
        b.name as building_name,
        b.address as building_address,
        e.number as entrance_number
      FROM apartments a
      LEFT JOIN buildings b ON a.building_id = b.id
      LEFT JOIN entrances e ON a.entrance_id = e.id
      WHERE a.id = ?
    `).bind(params.id).first();
  }

  if (!apartment) return error('Apartment not found', 404);

  // Get owners (non-critical, wrap in try/catch)
  let owners: any[] = [];
  try {
    const { results } = await env.DB.prepare(`
      SELECT o.*, oa.ownership_share, oa.is_primary, oa.start_date
      FROM owners o
      JOIN owner_apartments oa ON o.id = oa.owner_id
      WHERE oa.apartment_id = ?
      ORDER BY oa.is_primary DESC
    `).bind(params.id).all();
    owners = results || [];
  } catch (e) {}

  // Get personal account (non-critical)
  let account = null;
  try {
    account = await env.DB.prepare(
      'SELECT * FROM personal_accounts WHERE apartment_id = ?'
    ).bind(params.id).first();
  } catch (e) {}

  // Get residents from users table - use apartment's own data for matching (column-to-column)
  let userResidents: any[] = [];
  try {
    const apt = apartment as any;
    const aptNumber = String(apt.number || '').trim();
    if (aptNumber && apt.building_id) {
      // Direct query matching apartment's building_id and number - no tenant filter needed
      // since we already verified apartment access above
      const { results } = await env.DB.prepare(`
        SELECT id, name, phone, login, address, apartment, total_area, role
        FROM users
        WHERE building_id = ?
        AND TRIM(apartment) = ?
        AND role IN ('resident', 'tenant')
      `).bind(apt.building_id, aptNumber).all();
      userResidents = results || [];
    }
  } catch (e) {}

  return json({ apartment, owners, personalAccount: account, userResidents });
});

// Apartments: Bulk Create (MUST be before single create route for correct matching)
route('POST', '/api/buildings/:buildingId/apartments/bulk', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const apartments = body.apartments;
  if (!Array.isArray(apartments) || apartments.length === 0) {
    return error('apartments array is required', 400);
  }
  if (apartments.length > 1000) {
    return error('Maximum 1000 apartments per batch', 400);
  }

  const tenantId = getTenantId(request);
  let createdCount = 0;
  const errors: string[] = [];

  // Process in batches of 50 using D1 batch
  for (let i = 0; i < apartments.length; i += 50) {
    const batch = apartments.slice(i, i + 50);
    const stmts = batch.map((apt: any) => {
      const id = generateId();
      return env.DB.prepare(`
        INSERT OR IGNORE INTO apartments (id, building_id, entrance_id, number, floor, status, is_commercial, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        params.buildingId,
        apt.entrance_id || null,
        String(apt.number),
        apt.floor || null,
        apt.status || 'occupied',
        apt.is_commercial ? 1 : 0,
        tenantId
      );
    });

    try {
      const results = await env.DB.batch(stmts);
      for (const r of results) {
        if (r.meta?.changes && r.meta.changes > 0) createdCount++;
      }
    } catch (e: any) {
      errors.push(`Batch ${Math.floor(i / 50) + 1}: ${e.message}`);
    }
  }

  return json({
    created: createdCount,
    total: apartments.length,
    errors: errors.length > 0 ? errors : undefined
  }, 201);
});

// Apartments: Create (single)
route('POST', '/api/buildings/:buildingId/apartments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const tenantId = getTenantId(request);

  // Check if apartment with this number already exists in this building
  const existing = await env.DB.prepare(
    `SELECT id, entrance_id FROM apartments WHERE building_id = ? AND number = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, String(body.number), ...(tenantId ? [tenantId] : [])).first();

  if (existing) {
    // If apartment exists but in a different entrance, update its entrance_id
    const newEntranceId = body.entrance_id || body.entranceId || null;
    if (newEntranceId && existing.entrance_id !== newEntranceId) {
      await env.DB.prepare('UPDATE apartments SET entrance_id = ? WHERE id = ?')
        .bind(newEntranceId, existing.id).run();
      const updated = await env.DB.prepare('SELECT * FROM apartments WHERE id = ?').bind(existing.id).first();
      return json({ apartment: updated, updated: true });
    }
    return error(`Квартира №${body.number} уже существует в этом доме`, 409);
  }

  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO apartments (
      id, building_id, entrance_id, number, floor,
      total_area, living_area, kitchen_area, balcony_area, rooms,
      has_balcony, has_loggia, ceiling_height, window_view,
      ownership_type, ownership_share, cadastral_number,
      status, is_commercial, primary_owner_id, personal_account_id, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.buildingId,
    body.entrance_id || body.entranceId || null,
    body.number,
    body.floor || null,
    body.total_area || body.totalArea || null,
    body.living_area || body.livingArea || null,
    body.kitchen_area || body.kitchenArea || null,
    body.balcony_area || body.balconyArea || null,
    body.rooms || null,
    body.has_balcony || body.hasBalcony ? 1 : 0,
    body.has_loggia || body.hasLoggia ? 1 : 0,
    body.ceiling_height || body.ceilingHeight || null,
    body.window_view || body.windowView || null,
    body.ownership_type || body.ownershipType || 'private',
    body.ownership_share || body.ownershipShare || 1.0,
    body.cadastral_number || body.cadastralNumber || null,
    body.status || 'occupied',
    body.is_commercial || body.isCommercial ? 1 : 0,
    body.primary_owner_id || body.primaryOwnerId || null,
    body.personal_account_id || body.personalAccountId || null,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare('SELECT * FROM apartments WHERE id = ?').bind(id).first();
  return json({ apartment: created }, 201);
});

// Apartments: Update
route('PATCH', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    entrance_id: 'entrance_id', entranceId: 'entrance_id',
    number: 'number', floor: 'floor',
    total_area: 'total_area', totalArea: 'total_area',
    living_area: 'living_area', livingArea: 'living_area',
    kitchen_area: 'kitchen_area', kitchenArea: 'kitchen_area',
    balcony_area: 'balcony_area', balconyArea: 'balcony_area',
    rooms: 'rooms',
    has_balcony: 'has_balcony', hasBalcony: 'has_balcony',
    has_loggia: 'has_loggia', hasLoggia: 'has_loggia',
    ceiling_height: 'ceiling_height', ceilingHeight: 'ceiling_height',
    window_view: 'window_view', windowView: 'window_view',
    ownership_type: 'ownership_type', ownershipType: 'ownership_type',
    ownership_share: 'ownership_share', ownershipShare: 'ownership_share',
    cadastral_number: 'cadastral_number', cadastralNumber: 'cadastral_number',
    status: 'status',
    is_commercial: 'is_commercial', isCommercial: 'is_commercial',
    primary_owner_id: 'primary_owner_id', primaryOwnerId: 'primary_owner_id',
    personal_account_id: 'personal_account_id', personalAccountId: 'personal_account_id',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  const tenantIdUpd = getTenantId(request);

  await env.DB.prepare(`UPDATE apartments SET ${updates.join(', ')} WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`).bind(...values, ...(tenantIdUpd ? [tenantIdUpd] : [])).run();

  const updated = await env.DB.prepare('SELECT * FROM apartments WHERE id = ?').bind(params.id).first();
  return json({ apartment: updated });
});

// Apartments: Delete
route('DELETE', '/api/apartments/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM apartments WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  return json({ success: true });
});

// ==================== OWNERS ROUTES (CRM) ====================

// Owners: List all
route('GET', '/api/owners', async (request, env) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const search = url.searchParams.get('search');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query = 'SELECT * FROM owners WHERE 1=1';
  const bindings: any[] = [];

  if (tenantId) {
    query += ' AND tenant_id = ?';
    bindings.push(tenantId);
  }
  if (type) {
    query += ' AND type = ?';
    bindings.push(type);
  }
  if (search) {
    query += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const searchPattern = `%${search}%`;
    bindings.push(searchPattern, searchPattern, searchPattern);
  }

  query += ' ORDER BY full_name LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  // Get total
  let countQuery = 'SELECT COUNT(*) as total FROM owners WHERE 1=1';
  const countBindings: any[] = [];
  if (tenantId) {
    countQuery += ' AND tenant_id = ?';
    countBindings.push(tenantId);
  }
  if (type) {
    countQuery += ' AND type = ?';
    countBindings.push(type);
  }
  if (search) {
    countQuery += ' AND (full_name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const searchPattern = `%${search}%`;
    countBindings.push(searchPattern, searchPattern, searchPattern);
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    owners: results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});

// Owners: Get single with apartments
route('GET', '/api/owners/:id', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const owner = await env.DB.prepare(`SELECT * FROM owners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!owner) return error('Owner not found', 404);

  // Get apartments (with tenant_id filter for security)
  const { results: apartments } = await env.DB.prepare(`
    SELECT a.*, oa.ownership_share, oa.is_primary,
      b.name as building_name, b.address as building_address
    FROM apartments a
    JOIN owner_apartments oa ON a.id = oa.apartment_id
    JOIN buildings b ON a.building_id = b.id
    WHERE oa.owner_id = ?
    ${tenantId ? 'AND a.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ owner, apartments });
});

// Owners: Create
route('POST', '/api/owners', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Build full name if not provided
  let fullName = body.full_name || body.fullName;
  if (!fullName && body.type !== 'legal_entity') {
    fullName = [body.last_name || body.lastName, body.first_name || body.firstName, body.middle_name || body.middleName]
      .filter(Boolean).join(' ');
  }

  await env.DB.prepare(`
    INSERT INTO owners (
      id, type, last_name, first_name, middle_name, full_name,
      company_name, inn, ogrn, legal_address,
      phone, email, preferred_contact,
      passport_series, passport_number, passport_issued_by, passport_issued_date, registration_address,
      ownership_type, ownership_share, ownership_start_date,
      ownership_document, ownership_document_number, ownership_document_date,
      is_active, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.type || 'individual',
    body.last_name || body.lastName || null,
    body.first_name || body.firstName || null,
    body.middle_name || body.middleName || null,
    fullName,
    body.company_name || body.companyName || null,
    body.inn || null,
    body.ogrn || null,
    body.legal_address || body.legalAddress || null,
    body.phone || null,
    body.email || null,
    body.preferred_contact || body.preferredContact || 'phone',
    body.passport_series || body.passportSeries || null,
    body.passport_number || body.passportNumber || null,
    body.passport_issued_by || body.passportIssuedBy || null,
    body.passport_issued_date || body.passportIssuedDate || null,
    body.registration_address || body.registrationAddress || null,
    body.ownership_type || body.ownershipType || 'owner',
    body.ownership_share || body.ownershipShare || 100,
    body.ownership_start_date || body.ownershipStartDate || null,
    body.ownership_document || body.ownershipDocument || null,
    body.ownership_document_number || body.ownershipDocumentNumber || null,
    body.ownership_document_date || body.ownershipDocumentDate || null,
    body.is_active !== false ? 1 : 0,
    body.notes || null,
    getTenantId(request) || null
  ).run();

  const createdTenantId = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM owners WHERE id = ? ${createdTenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(createdTenantId ? [createdTenantId] : [])).first();
  return json({ owner: created }, 201);
});

// Owners: Update
route('PATCH', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    type: 'type',
    last_name: 'last_name', lastName: 'last_name',
    first_name: 'first_name', firstName: 'first_name',
    middle_name: 'middle_name', middleName: 'middle_name',
    full_name: 'full_name', fullName: 'full_name',
    company_name: 'company_name', companyName: 'company_name',
    inn: 'inn', ogrn: 'ogrn',
    legal_address: 'legal_address', legalAddress: 'legal_address',
    phone: 'phone', email: 'email',
    preferred_contact: 'preferred_contact', preferredContact: 'preferred_contact',
    passport_series: 'passport_series', passportSeries: 'passport_series',
    passport_number: 'passport_number', passportNumber: 'passport_number',
    passport_issued_by: 'passport_issued_by', passportIssuedBy: 'passport_issued_by',
    passport_issued_date: 'passport_issued_date', passportIssuedDate: 'passport_issued_date',
    registration_address: 'registration_address', registrationAddress: 'registration_address',
    ownership_type: 'ownership_type', ownershipType: 'ownership_type',
    ownership_share: 'ownership_share', ownershipShare: 'ownership_share',
    ownership_start_date: 'ownership_start_date', ownershipStartDate: 'ownership_start_date',
    ownership_document: 'ownership_document', ownershipDocument: 'ownership_document',
    ownership_document_number: 'ownership_document_number', ownershipDocumentNumber: 'ownership_document_number',
    ownership_document_date: 'ownership_document_date', ownershipDocumentDate: 'ownership_document_date',
    is_active: 'is_active', isActive: 'is_active',
    is_verified: 'is_verified', isVerified: 'is_verified',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  let whereClause = 'WHERE id = ?';
  values.push(params.id);
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    values.push(tenantId);
  }

  await env.DB.prepare(`UPDATE owners SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();

  const updated = await env.DB.prepare(`SELECT * FROM owners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ owner: updated });
});

// Owners: Delete
route('DELETE', '/api/owners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM owners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Owner-Apartment: Link owner to apartment
route('POST', '/api/owners/:ownerId/apartments/:apartmentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    INSERT OR REPLACE INTO owner_apartments (owner_id, apartment_id, ownership_share, is_primary, start_date)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    params.ownerId,
    params.apartmentId,
    body.ownership_share || body.ownershipShare || 100,
    body.is_primary || body.isPrimary ? 1 : 0,
    body.start_date || body.startDate || new Date().toISOString().split('T')[0]
  ).run();

  // Update apartment's primary owner if this is primary
  if (body.is_primary || body.isPrimary) {
    await env.DB.prepare('UPDATE apartments SET primary_owner_id = ? WHERE id = ?')
      .bind(params.ownerId, params.apartmentId).run();
  }

  return json({ success: true }, 201);
});

// Owner-Apartment: Unlink
route('DELETE', '/api/owners/:ownerId/apartments/:apartmentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  await env.DB.prepare('DELETE FROM owner_apartments WHERE owner_id = ? AND apartment_id = ?')
    .bind(params.ownerId, params.apartmentId).run();

  // Clear primary owner if needed
  await env.DB.prepare('UPDATE apartments SET primary_owner_id = NULL WHERE id = ? AND primary_owner_id = ?')
    .bind(params.apartmentId, params.ownerId).run();

  return json({ success: true });
});

// ==================== PERSONAL ACCOUNTS ROUTES (CRM) ====================

// Personal Accounts: List by building
route('GET', '/api/buildings/:buildingId/accounts', async (request, env, params) => {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const hasDebt = url.searchParams.get('has_debt');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM personal_accounts WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.buildingId, ...(tenantId ? [tenantId] : [])];

  if (status) {
    query += ' AND status = ?';
    bindings.push(status);
  }
  if (hasDebt === 'true') {
    query += ' AND current_debt > 0';
  }

  query += ' ORDER BY apartment_number LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  let countQuery = `SELECT COUNT(*) as total FROM personal_accounts WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const countBindings: any[] = [params.buildingId, ...(tenantId ? [tenantId] : [])];
  if (status) {
    countQuery += ' AND status = ?';
    countBindings.push(status);
  }
  if (hasDebt === 'true') {
    countQuery += ' AND current_debt > 0';
  }
  const countResult = await env.DB.prepare(countQuery).bind(...countBindings).first() as any;

  return json({
    accounts: results,
    pagination: {
      page,
      limit,
      total: countResult?.total || 0,
      pages: Math.ceil((countResult?.total || 0) / limit)
    }
  });
});

// Personal Accounts: Get single
route('GET', '/api/accounts/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const account = await env.DB.prepare(`
    SELECT pa.*,
      a.number as apt_number, a.floor, a.rooms,
      b.name as building_name, b.address as building_address
    FROM personal_accounts pa
    LEFT JOIN apartments a ON pa.apartment_id = a.id
    LEFT JOIN buildings b ON pa.building_id = b.id
    WHERE pa.id = ? ${tenantId ? 'AND pa.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!account) return error('Account not found', 404);

  return json({ account });
});

// Personal Accounts: Create
route('POST', '/api/accounts', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Generate account number if not provided
  const accountNumber = body.number || `ЛС-${Date.now().toString(36).toUpperCase()}`;

  await env.DB.prepare(`
    INSERT INTO personal_accounts (
      id, number, apartment_id, building_id, primary_owner_id,
      owner_name, apartment_number, address, total_area,
      residents_count, registered_count,
      balance, current_debt, penalty_amount,
      has_subsidy, subsidy_amount, subsidy_end_date,
      has_discount, discount_percent, discount_reason,
      status, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    accountNumber,
    body.apartment_id || body.apartmentId,
    body.building_id || body.buildingId,
    body.primary_owner_id || body.primaryOwnerId || null,
    body.owner_name || body.ownerName || null,
    body.apartment_number || body.apartmentNumber || null,
    body.address || null,
    body.total_area || body.totalArea || null,
    body.residents_count || body.residentsCount || 0,
    body.registered_count || body.registeredCount || 0,
    body.balance || 0,
    body.current_debt || body.currentDebt || 0,
    body.penalty_amount || body.penaltyAmount || 0,
    body.has_subsidy || body.hasSubsidy ? 1 : 0,
    body.subsidy_amount || body.subsidyAmount || 0,
    body.subsidy_end_date || body.subsidyEndDate || null,
    body.has_discount || body.hasDiscount ? 1 : 0,
    body.discount_percent || body.discountPercent || 0,
    body.discount_reason || body.discountReason || null,
    body.status || 'active',
    getTenantId(request) || null
  ).run();

  // Link account to apartment
  if (body.apartment_id || body.apartmentId) {
    await env.DB.prepare('UPDATE apartments SET personal_account_id = ? WHERE id = ?')
      .bind(id, body.apartment_id || body.apartmentId).run();
  }

  const created = await env.DB.prepare('SELECT * FROM personal_accounts WHERE id = ?').bind(id).first();
  return json({ account: created }, 201);
});

// Personal Accounts: Update
route('PATCH', '/api/accounts/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    owner_name: 'owner_name', ownerName: 'owner_name',
    apartment_number: 'apartment_number', apartmentNumber: 'apartment_number',
    address: 'address',
    total_area: 'total_area', totalArea: 'total_area',
    residents_count: 'residents_count', residentsCount: 'residents_count',
    registered_count: 'registered_count', registeredCount: 'registered_count',
    balance: 'balance',
    current_debt: 'current_debt', currentDebt: 'current_debt',
    penalty_amount: 'penalty_amount', penaltyAmount: 'penalty_amount',
    last_payment_date: 'last_payment_date', lastPaymentDate: 'last_payment_date',
    last_payment_amount: 'last_payment_amount', lastPaymentAmount: 'last_payment_amount',
    has_subsidy: 'has_subsidy', hasSubsidy: 'has_subsidy',
    subsidy_amount: 'subsidy_amount', subsidyAmount: 'subsidy_amount',
    subsidy_end_date: 'subsidy_end_date', subsidyEndDate: 'subsidy_end_date',
    has_discount: 'has_discount', hasDiscount: 'has_discount',
    discount_percent: 'discount_percent', discountPercent: 'discount_percent',
    discount_reason: 'discount_reason', discountReason: 'discount_reason',
    status: 'status',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  let whereClause = 'WHERE id = ?';
  values.push(params.id);
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    values.push(tenantId);
  }

  await env.DB.prepare(`UPDATE personal_accounts SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();

  const updated = await env.DB.prepare(`SELECT * FROM personal_accounts WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ account: updated });
});

// Personal Accounts: Get debtors
route('GET', '/api/accounts/debtors', async (request, env) => {
  const url = new URL(request.url);
  const minDebt = parseInt(url.searchParams.get('min_debt') || '0');
  const buildingId = url.searchParams.get('building_id');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query = `
    SELECT pa.*,
      b.name as building_name
    FROM personal_accounts pa
    JOIN buildings b ON pa.building_id = b.id
    WHERE pa.current_debt > ?
    ${tenantId ? 'AND pa.tenant_id = ?' : ''}
  `;
  const bindings: any[] = [minDebt, ...(tenantId ? [tenantId] : [])];

  if (buildingId) {
    query += ' AND pa.building_id = ?';
    bindings.push(buildingId);
  }

  query += ' ORDER BY pa.current_debt DESC';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ debtors: results });
});

// ==================== REPORTS: DEBTS ====================

route('GET', '/api/reports/debts', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id');
  const district = url.searchParams.get('district');
  const search = url.searchParams.get('search')?.trim().toLowerCase();
  const debtorsOnly = url.searchParams.get('debtors_only') === 'true';
  const sortBy = url.searchParams.get('sort_by') || 'debt';
  const sortDir = url.searchParams.get('sort_dir') === 'asc' ? 'ASC' : 'DESC';
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 2000);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Resident-centric query: ALL residents appear even without personal_accounts
  const conditions: string[] = [
    "u.role = 'resident'",
    "u.building_id IS NOT NULL",
    "u.apartment IS NOT NULL",
  ];
  const bindings: any[] = [];

  if (tenantId) {
    conditions.push('u.tenant_id = ?');
    bindings.push(tenantId);
  }
  if (buildingId) {
    conditions.push('u.building_id = ?');
    bindings.push(buildingId);
  }
  if (district) {
    conditions.push('br.district = ?');
    bindings.push(district);
  }
  if (debtorsOnly) {
    conditions.push('COALESCE(pa.current_debt, 0) > 0');
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`;

  const orderMap: Record<string, string> = {
    debt: `COALESCE(pa.current_debt, 0) ${sortDir}`,
    name: `u.name ${sortDir}`,
    apartment: `u.apartment ${sortDir}`,
  };
  const orderBy = orderMap[sortBy] || orderMap['debt'];

  // LEFT JOIN personal_accounts on apartment match: try apartment_id first, then building+apt_number
  const paJoinTenant = tenantId ? 'AND pa.tenant_id = ?' : '';
  const query = `
    SELECT
      u.id AS resident_id,
      u.name AS resident_name,
      u.phone AS resident_phone,
      u.apartment AS apartment_number,
      u.entrance,
      u.floor,
      u.building_id,
      b.name AS building_name,
      b.address AS building_address,
      b.collection_rate AS tariff,
      br.id AS branch_id,
      br.name AS branch_name,
      br.district,
      pa.id AS account_id,
      pa.number AS account_number,
      COALESCE(pa.balance, 0) AS balance,
      COALESCE(pa.current_debt, 0) AS current_debt,
      pa.last_payment_date,
      pa.last_payment_amount,
      COALESCE(pa.status, 'active') AS account_status
    FROM users u
    JOIN buildings b ON u.building_id = b.id
    LEFT JOIN branches br ON b.branch_id = br.id
    LEFT JOIN personal_accounts pa ON pa.building_id = u.building_id
      AND pa.apartment_number = u.apartment
      ${paJoinTenant}
    ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `;

  // Bindings: pa tenant (if applicable) → WHERE bindings → LIMIT OFFSET
  const finalBindings: any[] = [];
  if (tenantId) finalBindings.push(tenantId); // for LEFT JOIN pa.tenant_id
  finalBindings.push(...bindings);             // WHERE conditions
  finalBindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...finalBindings).all();

  // Client-side search (Cyrillic-safe)
  let filtered = results as any[];
  if (search) {
    filtered = filtered.filter(r =>
      (r.resident_name || '').toLowerCase().includes(search) ||
      (r.apartment_number || '').toLowerCase().includes(search) ||
      (r.account_number || '').toLowerCase().includes(search)
    );
  }

  const totalDebt = filtered.reduce((s: number, r: any) => s + (r.current_debt || 0), 0);
  const totalBalance = filtered.reduce((s: number, r: any) => s + (r.balance || 0), 0);
  const debtorCount = filtered.filter((r: any) => (r.current_debt || 0) > 0).length;

  return json({
    records: filtered,
    total: filtered.length,
    summary: { totalDebt, totalBalance, debtorCount },
  });
});

// ==================== CRM RESIDENTS ROUTES ====================

// CRM Residents: List by apartment
route('GET', '/api/apartments/:apartmentId/residents', async (request, env, params) => {
  const url = new URL(request.url);
  const isActive = url.searchParams.get('is_active');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM crm_residents WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.apartmentId, ...(tenantId ? [tenantId] : [])];

  if (isActive !== null) {
    query += ' AND is_active = ?';
    bindings.push(isActive === 'true' ? 1 : 0);
  }

  query += ' ORDER BY resident_type, full_name';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ residents: results });
});

// CRM Residents: Get single
route('GET', '/api/residents/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const resident = await env.DB.prepare(`
    SELECT r.*,
      a.number as apartment_number, a.floor,
      b.name as building_name, b.address as building_address,
      o.full_name as owner_name, o.phone as owner_phone
    FROM crm_residents r
    LEFT JOIN apartments a ON r.apartment_id = a.id
    LEFT JOIN buildings b ON a.building_id = b.id
    LEFT JOIN owners o ON r.owner_id = o.id
    WHERE r.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!resident) return error('Resident not found', 404);

  return json({ resident });
});

// CRM Residents: Create
route('POST', '/api/apartments/:apartmentId/residents', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Build full_name if not provided
  const fullName = body.full_name || body.fullName ||
    [body.last_name || body.lastName, body.first_name || body.firstName, body.middle_name || body.middleName]
      .filter(Boolean).join(' ');

  await env.DB.prepare(`
    INSERT INTO crm_residents (
      id, apartment_id, owner_id,
      last_name, first_name, middle_name, full_name, birth_date,
      resident_type, relation_to_owner,
      registration_type, registration_date, registration_end_date,
      phone, additional_phone, email,
      is_active, moved_in_date,
      passport_series, passport_number,
      notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.apartmentId,
    body.owner_id || body.ownerId || null,
    body.last_name || body.lastName || null,
    body.first_name || body.firstName || null,
    body.middle_name || body.middleName || null,
    fullName,
    body.birth_date || body.birthDate || null,
    body.resident_type || body.residentType || 'owner',
    body.relation_to_owner || body.relationToOwner || null,
    body.registration_type || body.registrationType || 'permanent',
    body.registration_date || body.registrationDate || null,
    body.registration_end_date || body.registrationEndDate || null,
    body.phone || null,
    body.additional_phone || body.additionalPhone || null,
    body.email || null,
    body.is_active !== false ? 1 : 0,
    body.moved_in_date || body.movedInDate || new Date().toISOString().split('T')[0],
    body.passport_series || body.passportSeries || null,
    body.passport_number || body.passportNumber || null,
    body.notes || null,
    getTenantId(request) || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM crm_residents WHERE id = ?').bind(id).first();
  return json({ resident: created }, 201);
});

// CRM Residents: Update
route('PATCH', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    last_name: 'last_name', lastName: 'last_name',
    first_name: 'first_name', firstName: 'first_name',
    middle_name: 'middle_name', middleName: 'middle_name',
    full_name: 'full_name', fullName: 'full_name',
    birth_date: 'birth_date', birthDate: 'birth_date',
    resident_type: 'resident_type', residentType: 'resident_type',
    relation_to_owner: 'relation_to_owner', relationToOwner: 'relation_to_owner',
    registration_type: 'registration_type', registrationType: 'registration_type',
    registration_date: 'registration_date', registrationDate: 'registration_date',
    registration_end_date: 'registration_end_date', registrationEndDate: 'registration_end_date',
    phone: 'phone',
    additional_phone: 'additional_phone', additionalPhone: 'additional_phone',
    email: 'email',
    is_active: 'is_active', isActive: 'is_active',
    moved_in_date: 'moved_in_date', movedInDate: 'moved_in_date',
    moved_out_date: 'moved_out_date', movedOutDate: 'moved_out_date',
    moved_out_reason: 'moved_out_reason', movedOutReason: 'moved_out_reason',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  let whereClause = 'WHERE id = ?';
  values.push(params.id);
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    values.push(tenantId);
  }

  await env.DB.prepare(`UPDATE crm_residents SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();

  const updated = await env.DB.prepare(`SELECT * FROM crm_residents WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ resident: updated });
});

// CRM Residents: Delete
route('DELETE', '/api/residents/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM crm_residents WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// CRM Residents: Move out (soft delete)
route('POST', '/api/residents/:id/move-out', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE crm_residents
    SET is_active = 0, moved_out_date = ?, moved_out_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.moved_out_date || body.movedOutDate || new Date().toISOString().split('T')[0],
    body.reason || null,
    params.id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  return json({ success: true });
});

// ==================== METERS ROUTES (CRM) ====================

// Meters: List by apartment
route('GET', '/api/apartments/:apartmentId/meters', async (request, env, params) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const isActive = url.searchParams.get('is_active');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM meters WHERE apartment_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.apartmentId, ...(tenantId ? [tenantId] : [])];

  if (type) {
    query += ' AND type = ?';
    bindings.push(type);
  }
  if (isActive !== null) {
    query += ' AND is_active = ?';
    bindings.push(isActive === 'true' ? 1 : 0);
  }

  query += ' ORDER BY type, serial_number';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ meters: results });
});

// Meters: List common meters by building
route('GET', '/api/buildings/:buildingId/meters', async (request, env, params) => {
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const isCommon = url.searchParams.get('is_common');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query = `SELECT * FROM meters WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`;
  const bindings: any[] = [params.buildingId, ...(tenantId ? [tenantId] : [])];

  if (type) {
    query += ' AND type = ?';
    bindings.push(type);
  }
  if (isCommon !== null) {
    query += ' AND is_common = ?';
    bindings.push(isCommon === 'true' ? 1 : 0);
  }

  query += ' ORDER BY type, serial_number';

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ meters: results });
});

// Meters: Get single with latest readings
route('GET', '/api/meters/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meter = await env.DB.prepare(`
    SELECT m.*,
      a.number as apartment_number, a.floor,
      b.name as building_name, b.address as building_address
    FROM meters m
    LEFT JOIN apartments a ON m.apartment_id = a.id
    LEFT JOIN buildings b ON COALESCE(m.building_id, a.building_id) = b.id
    WHERE m.id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!meter) return error('Meter not found', 404);

  // Get last 12 readings
  const { results: readings } = await env.DB.prepare(`
    SELECT * FROM meter_readings
    WHERE meter_id = ?
    ORDER BY reading_date DESC
    LIMIT 12
  `).bind(params.id).all();

  return json({ meter, readings });
});

// Meters: Create
route('POST', '/api/meters', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO meters (
      id, apartment_id, building_id,
      type, is_common,
      serial_number, model, brand,
      install_date, install_location, initial_value,
      verification_date, next_verification_date, seal_number, seal_date,
      is_active, current_value, last_reading_date,
      tariff_zone, notes, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.apartment_id || body.apartmentId || null,
    body.building_id || body.buildingId || null,
    body.type,
    body.is_common || body.isCommon ? 1 : 0,
    body.serial_number || body.serialNumber,
    body.model || null,
    body.brand || null,
    body.install_date || body.installDate || null,
    body.install_location || body.installLocation || body.location || null,
    body.initial_value || body.initialValue || 0,
    body.verification_date || body.verificationDate || null,
    body.next_verification_date || body.nextVerificationDate || null,
    body.seal_number || body.sealNumber || null,
    body.seal_date || body.sealDate || null,
    body.is_active !== false ? 1 : 0,
    body.current_value || body.currentValue || body.initial_value || body.initialValue || 0,
    body.last_reading_date || body.lastReadingDate || null,
    body.tariff_zone || body.tariffZone || 'single',
    body.notes || null,
    getTenantId(request) || null
  ).run();

  const created = await env.DB.prepare('SELECT * FROM meters WHERE id = ?').bind(id).first();
  return json({ meter: created }, 201);
});

// Meters: Update
route('PATCH', '/api/meters/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fieldMappings: Record<string, string> = {
    serial_number: 'serial_number', serialNumber: 'serial_number',
    model: 'model',
    brand: 'brand',
    install_date: 'install_date', installDate: 'install_date',
    install_location: 'install_location', installLocation: 'install_location', location: 'install_location',
    verification_date: 'verification_date', verificationDate: 'verification_date',
    next_verification_date: 'next_verification_date', nextVerificationDate: 'next_verification_date',
    seal_number: 'seal_number', sealNumber: 'seal_number',
    seal_date: 'seal_date', sealDate: 'seal_date',
    is_active: 'is_active', isActive: 'is_active',
    current_value: 'current_value', currentValue: 'current_value',
    last_reading_date: 'last_reading_date', lastReadingDate: 'last_reading_date',
    tariff_zone: 'tariff_zone', tariffZone: 'tariff_zone',
    notes: 'notes',
  };

  for (const [key, dbField] of Object.entries(fieldMappings)) {
    if (body[key] !== undefined) {
      let value = body[key];
      if (typeof value === 'boolean') value = value ? 1 : 0;
      updates.push(`${dbField} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) return json({ success: true });

  updates.push('updated_at = datetime("now")');

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  let whereClause = 'WHERE id = ?';
  values.push(params.id);
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    values.push(tenantId);
  }

  await env.DB.prepare(`UPDATE meters SET ${updates.join(', ')} ${whereClause}`).bind(...values).run();

  const updated = await env.DB.prepare(`SELECT * FROM meters WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meter: updated });
});

// Meters: Delete
route('DELETE', '/api/meters/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM meters WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Meters: Decommission
route('POST', '/api/meters/:id/decommission', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meters
    SET is_active = 0, decommissioned_at = datetime('now'), decommissioned_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== METER READINGS ROUTES ====================

// Meter Readings: List by meter
route('GET', '/api/meters/:meterId/readings', async (request, env, params) => {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const status = url.searchParams.get('status');

  let query = 'SELECT * FROM meter_readings WHERE meter_id = ?';
  const bindings: any[] = [params.meterId];

  if (status) {
    query += ' AND status = ?';
    bindings.push(status);
  }

  query += ' ORDER BY reading_date DESC LIMIT ? OFFSET ?';
  bindings.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...bindings).all();
  return json({ readings: results });
});

// Meter Readings: Submit reading (resident or inspector)
route('POST', '/api/meters/:meterId/readings', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // Verify meter exists
  const meter = await env.DB.prepare('SELECT id, current_value FROM meters WHERE id = ?')
    .bind(params.meterId).first() as any;

  if (!meter) return error('Meter not found', 404);

  const newValue = body.value;
  const readingDate = body.reading_date || body.readingDate || new Date().toISOString().split('T')[0];

  // Get previous reading from meter_readings table for accurate consumption calculation
  const prevReading = await env.DB.prepare(
    'SELECT value FROM meter_readings WHERE meter_id = ? ORDER BY reading_date DESC, created_at DESC LIMIT 1'
  ).bind(params.meterId).first() as any;

  let previousValue: number | null = null;
  let consumption: number | null = null;

  if (prevReading) {
    previousValue = Number(prevReading.value);
    if (newValue < previousValue) {
      return error('Текущее показание не может быть меньше предыдущего', 400);
    }
    consumption = newValue - previousValue;
  }

  // Determine source based on user role
  const source = authUser.role === 'resident' ? 'resident' :
                 (isExecutorRole(authUser.role) ? 'inspector' : body.source || 'resident');

  await env.DB.prepare(`
    INSERT INTO meter_readings (
      id, meter_id,
      value, previous_value, consumption, reading_date,
      source, submitted_by, submitted_at,
      photo_url, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?)
  `).bind(
    id,
    params.meterId,
    newValue,
    previousValue,
    consumption,
    readingDate,
    source,
    authUser.id,
    body.photo_url || body.photoUrl || null,
    'pending',
    body.notes || null
  ).run();

  // Update meter's current value and last reading date
  await env.DB.prepare(`
    UPDATE meters
    SET current_value = ?, last_reading_date = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newValue, readingDate, params.meterId).run();

  const created = await env.DB.prepare('SELECT * FROM meter_readings WHERE id = ?').bind(id).first();
  return json({ reading: created }, 201);
});

// Meter Readings: Approve/Reject
route('POST', '/api/meter-readings/:id/verify', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const status = body.approved ? 'approved' : 'rejected';

  await env.DB.prepare(`
    UPDATE meter_readings
    SET status = ?, is_verified = ?, verified_by = ?, verified_at = datetime('now'),
        rejection_reason = ?
    WHERE id = ?
  `).bind(
    status,
    body.approved ? 1 : 0,
    authUser!.id,
    body.rejection_reason || body.rejectionReason || null,
    params.id
  ).run();

  // If rejected, revert meter's current value to previous reading
  if (!body.approved) {
    const reading = await env.DB.prepare('SELECT meter_id, previous_value FROM meter_readings WHERE id = ?')
      .bind(params.id).first() as any;

    if (reading) {
      await env.DB.prepare('UPDATE meters SET current_value = ?, updated_at = datetime("now") WHERE id = ?')
        .bind(reading.previous_value, reading.meter_id).run();
    }
  }

  return json({ success: true });
});

// Meter Readings: Get last reading
route('GET', '/api/meters/:meterId/last-reading', async (request, env, params) => {
  const reading = await env.DB.prepare(`
    SELECT * FROM meter_readings
    WHERE meter_id = ?
    ORDER BY reading_date DESC
    LIMIT 1
  `).bind(params.meterId).first();

  return json({ reading: reading || null });
});

} // end registerBuildingRoutes
