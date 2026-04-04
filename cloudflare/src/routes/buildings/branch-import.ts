// Branch import route
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId } from '../../utils/helpers';

export function registerBranchImportRoutes() {

// Branch Import — upsert branch + buildings + entrances + apartments + residents + staff
route('POST', '/api/branches/import', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const reqUrl = new URL(request.url);
  const branchIdParam = reqUrl.searchParams.get('branchId');
  const raw = await request.json() as any;
  const stats = { branches_created: 0, branches_updated: 0, buildings: 0, entrances: 0, apartments: 0, residents: 0, staff: 0 };

  // Resolve target branch
  let branchId: string;
  let branchCode: string;

  if (branchIdParam) {
    const row = await env.DB.prepare(
      `SELECT id, code FROM branches WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(branchIdParam, ...(tenantId ? [tenantId] : [])).first() as any;
    if (!row) return error('Branch not found', 404);
    branchId = row.id; branchCode = row.code; stats.branches_updated++;
  } else {
    const b = raw?.branch;
    if (!b?.code) return error('Invalid import file: missing branch data', 400);
    branchCode = b.code.toUpperCase();
    const row = await env.DB.prepare(
      `SELECT id FROM branches WHERE code = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(branchCode, ...(tenantId ? [tenantId] : [])).first() as any;
    if (row) {
      branchId = row.id;
      await env.DB.prepare(`UPDATE branches SET name=?,address=?,phone=? WHERE id=?`).bind(b.name, b.address || null, b.phone || null, branchId).run();
      stats.branches_updated++;
    } else {
      branchId = generateId();
      await env.DB.prepare(`INSERT INTO branches (id,code,name,address,phone,tenant_id) VALUES (?,?,?,?,?,?)`).bind(branchId, branchCode, b.name, b.address || null, b.phone || null, tenantId || null).run();
      stats.branches_created++;
    }
  }

  // Detect format and normalize
  type NB = { name: string; address?: string; floors?: number; entrances_count?: number; apartments_count?: number; entrances?: any[]; apartments?: any[]; residents?: any[] };
  type NR = { login: string; name?: string; phone?: string; apartment?: string; building?: string; password_hash?: string; role?: string; entrance?: string; floor?: string };
  type NS = { login: string; name?: string; phone?: string; role: string; specialization?: string; password_hash?: string };
  let normalBuildings: NB[] = []; let normalResidents: NR[] = []; let normalStaff: NS[] = [];

  if (raw?.exportType && raw?.data?.branches) {
    const fileBranches: any[] = raw.data.branches;
    const matched = fileBranches.filter((fb: any) => fb.code?.toUpperCase() === branchCode);
    const src = matched.length > 0 ? matched : fileBranches;
    for (const fb of src) {
      for (const bld of (fb.buildings || [])) {
        normalBuildings.push({ name: bld.name, address: bld.address || '', floors: bld.floors || null, entrances_count: typeof bld.entrances === 'number' ? bld.entrances : null, apartments_count: bld.totalApartments || null, residents: bld.residents || [] });
        for (const res of (bld.residents || [])) {
          normalResidents.push({ login: res.login, name: res.name, phone: res.phone || null, apartment: res.apartment || null, building: bld.name, entrance: res.entrance || null, floor: res.floor || null, password_hash: '', role: res.role || 'resident' });
        }
      }
    }
  } else {
    normalBuildings = raw.buildings || []; normalResidents = raw.residents || []; normalStaff = raw.staff || [];
  }

  // Pre-fetch existing data
  const { results: existBldRows } = await env.DB.prepare(`SELECT id, name FROM buildings WHERE branch_code=? ${tenantId ? 'AND tenant_id=?' : ''}`).bind(branchCode, ...(tenantId ? [tenantId] : [])).all() as any;
  const existBldMap = new Map<string, string>(); for (const r of existBldRows) existBldMap.set(r.name, r.id);
  const { results: existUserRows } = await env.DB.prepare(tenantId ? `SELECT id, login FROM users WHERE tenant_id=?` : `SELECT id, login FROM users`).bind(...(tenantId ? [tenantId] : [])).all() as any;
  const existLoginMap = new Map<string, string>(); for (const r of existUserRows) existLoginMap.set(r.login, r.id);

  // Upsert buildings + entrances + apartments
  const bldNameToId = new Map<string, string>();
  for (const bld of normalBuildings) {
    if (!bld.name) continue;
    if (existBldMap.has(bld.name)) {
      const bid = existBldMap.get(bld.name)!; bldNameToId.set(bld.name, bid);
      await env.DB.prepare(`UPDATE buildings SET address=?,floors=?,entrances_count=?,apartments_count=?,branch_id=? WHERE id=?`).bind(bld.address || null, bld.floors || null, bld.entrances_count || null, bld.apartments_count || null, branchId, bid).run();
    } else {
      const nid = generateId();
      await env.DB.prepare(`INSERT INTO buildings (id,name,address,branch_code,branch_id,floors,entrances_count,apartments_count,heating_type,building_type,tenant_id) VALUES (?,?,?,?,?,?,?,?,'central','monolith',?)`).bind(nid, bld.name, bld.address || '', branchCode, branchId, bld.floors || null, bld.entrances_count || null, bld.apartments_count || null, tenantId || null).run();
      bldNameToId.set(bld.name, nid); stats.buildings++;
    }
    const buildingId = bldNameToId.get(bld.name)!;
    for (const ent of (bld.entrances || [])) {
      const ex = await env.DB.prepare(`SELECT id FROM entrances WHERE building_id=? AND number=?`).bind(buildingId, ent.number).first();
      if (!ex) { await env.DB.prepare(`INSERT INTO entrances (id,building_id,number,floors_from,floors_to,apartments_from,apartments_to,has_elevator,intercom_type,intercom_code) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(generateId(), buildingId, ent.number, ent.floors_from || null, ent.floors_to || null, ent.apartments_from || null, ent.apartments_to || null, ent.has_elevator || 0, ent.intercom_type || null, ent.intercom_code || null).run(); stats.entrances++; }
    }
    for (const apt of (bld.apartments || [])) {
      const ex = await env.DB.prepare(`SELECT id FROM apartments WHERE building_id=? AND number=?`).bind(buildingId, apt.number).first();
      if (!ex) { await env.DB.prepare(`INSERT INTO apartments (id,building_id,number,floor,total_area,living_area,rooms,status,is_commercial,ownership_type) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(generateId(), buildingId, apt.number, apt.floor || null, apt.total_area || null, apt.living_area || null, apt.rooms || null, apt.status || 'vacant', apt.is_commercial || 0, apt.ownership_type || 'private').run(); stats.apartments++; }
    }
  }

  // Batch upsert users
  const STAFF_ROLES = ['admin', 'director', 'manager', 'department_head', 'dispatcher', 'executor', 'security'];
  const ALLOWED = ['resident', 'commercial_owner', ...STAFF_ROLES];
  const toIns: any[] = []; const toUpd: any[] = [];
  for (const res of [...normalResidents, ...normalStaff]) {
    if (!res.login) continue;
    const role = (res as any).role || 'resident';
    if (!ALLOWED.includes(role)) continue;
    if (existLoginMap.has(res.login)) toUpd.push({ id: existLoginMap.get(res.login)!, ...res, role });
    else toIns.push({ ...res, role });
  }

  const CHUNK = 40;
  for (let i = 0; i < toIns.length; i += CHUNK) {
    const chunk = toIns.slice(i, i + CHUNK);
    const stmts = chunk.map((r: any) => { const isS = STAFF_ROLES.includes(r.role); const bid = (!isS && r.building) ? (bldNameToId.get(r.building) || null) : null; return env.DB.prepare(`INSERT OR IGNORE INTO users (id,login,name,phone,password_hash,role,apartment,building,building_id,branch,entrance,floor,specialization,tenant_id,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).bind(generateId(), r.login, r.name || r.login, r.phone || null, r.password_hash || '', r.role, isS ? null : (r.apartment || null), isS ? null : (r.building || null), bid, branchCode, r.entrance || null, r.floor || null, r.specialization || null, tenantId || null); });
    await env.DB.batch(stmts);
    stats.residents += chunk.filter((r: any) => r.role === 'resident' || r.role === 'commercial_owner').length;
    stats.staff += chunk.filter((r: any) => STAFF_ROLES.includes(r.role)).length;
  }
  for (let i = 0; i < toUpd.length; i += CHUNK) {
    const chunk = toUpd.slice(i, i + CHUNK);
    const stmts = chunk.map((r: any) => { const isS = STAFF_ROLES.includes(r.role); const bid = (!isS && r.building) ? (bldNameToId.get(r.building) || null) : null; return isS ? env.DB.prepare(`UPDATE users SET name=?,phone=?,role=?,specialization=? WHERE id=?`).bind(r.name || r.login, r.phone || null, r.role, r.specialization || null, r.id) : env.DB.prepare(`UPDATE users SET name=?,phone=?,apartment=?,building=?,building_id=COALESCE(?,building_id),branch=? WHERE id=?`).bind(r.name || r.login, r.phone || null, r.apartment || null, r.building || null, bid, branchCode, r.id); });
    await env.DB.batch(stmts);
  }

  // Fix building_id for users with building name but no building_id
  if (tenantId) {
    await env.DB.prepare(`UPDATE users SET building_id = (SELECT b.id FROM buildings b WHERE b.name = users.building AND b.branch_code = users.branch AND b.tenant_id = ? LIMIT 1) WHERE building_id IS NULL AND building IS NOT NULL AND branch = ? AND tenant_id = ?`).bind(tenantId, branchCode, tenantId).run();
  } else {
    await env.DB.prepare(`UPDATE users SET building_id = (SELECT b.id FROM buildings b WHERE b.name = users.building AND b.branch_code = users.branch LIMIT 1) WHERE building_id IS NULL AND building IS NOT NULL AND branch = ?`).bind(branchCode).run();
  }

  // Auto-create personal_accounts for residents without one
  const { results: needAccts } = await env.DB.prepare(`SELECT u.id, u.name, u.apartment, u.building_id, u.tenant_id FROM users u LEFT JOIN personal_accounts pa ON pa.building_id = u.building_id AND pa.apartment_number = u.apartment ${tenantId ? 'AND pa.tenant_id = ?' : ''} WHERE u.role = 'resident' AND u.building_id IS NOT NULL AND u.apartment IS NOT NULL AND pa.id IS NULL AND u.branch = ? ${tenantId ? 'AND u.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : []), branchCode, ...(tenantId ? [tenantId] : [])).all() as any;
  if (needAccts && needAccts.length > 0) {
    const paStmts = (needAccts as any[]).map((u: any) => env.DB.prepare(`INSERT OR IGNORE INTO personal_accounts (id, number, building_id, apartment_number, owner_name, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`).bind(generateId(), `PA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, u.building_id, String(u.apartment), u.name || null, u.tenant_id || null));
    for (let i = 0; i < paStmts.length; i += CHUNK) await env.DB.batch(paStmts.slice(i, i + CHUNK));
  }

  invalidateCache('buildings:'); invalidateCache('branches:'); invalidateCache('users:');
  return json({ success: true, stats });
});

} // end registerBranchImportRoutes
