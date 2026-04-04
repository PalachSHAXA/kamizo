// Batch import/export routes: bulk register, staff export/import
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { invalidateCache } from '../../middleware/cache-local';
import { json, error, generateId, isManagement } from '../../utils/helpers';
import { hashPassword } from '../../utils/crypto';
import { createRequestLogger } from '../../utils/logger';

export function registerImportRoutes() {

// Auth: Bulk register (for Excel import) - now updates existing users instead of skipping
route('POST', '/api/auth/register-bulk', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { users } = await request.json() as { users: any[] };
  const created: any[] = [];
  const updated: any[] = [];

  const bulkTenantId = getTenantId(request);
  for (const u of users) {
    const existing = await env.DB.prepare(
      `SELECT id FROM users WHERE login = ? ${bulkTenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
    ).bind(...[u.login.trim(), ...(bulkTenantId ? [bulkTenantId] : [])]).first() as any;

    if (existing) {
      // UPDATE existing user with new data
      await env.DB.prepare(`
        UPDATE users SET
          name = ?, address = ?, apartment = ?, building_id = ?, entrance = ?, floor = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        u.name, u.address || null, u.apartment || null, u.building_id || null,
        u.entrance || null, u.floor || null, existing.id
      ).run();

      if (u.password) {
        const passwordHash = await hashPassword(u.password);
        await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
          .bind(passwordHash, existing.id).run();
      }

      updated.push({ id: existing.id, login: u.login, name: u.name });
    } else {
      // CREATE new user
      const id = generateId();
      const rawPwd = u.password || 'kamizo';
      const passwordHash = await hashPassword(rawPwd);

      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, name, role, phone, address, apartment, building_id, entrance, floor, total_area, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, u.login.trim(), passwordHash, u.name, 'resident',
        u.phone || null, u.address || null, u.apartment || null, u.building_id || null, u.entrance || null, u.floor || null, u.total_area || null, getTenantId(request)
      ).run();

      created.push({ id, login: u.login, name: u.name });
    }

    // Link data to apartment: update total_area and create personal_account
    const userId = existing ? existing.id : created[created.length - 1]?.id;
    if (u.building_id && u.apartment && userId) {
      try {
        const apt = await env.DB.prepare(
          `SELECT id FROM apartments WHERE building_id = ? AND number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
        ).bind(u.building_id, String(u.apartment), ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;

        let aptId = apt?.id;

        if (apt) {
          const updateParts: string[] = [];
          const updateBinds: any[] = [];
          if (u.total_area) {
            updateParts.push('total_area = ?');
            updateBinds.push(u.total_area);
          }
          updateParts.push('primary_owner_id = ?');
          updateBinds.push(userId);
          updateParts.push('status = ?');
          updateBinds.push('occupied');

          if (updateParts.length > 0) {
            await env.DB.prepare(
              `UPDATE apartments SET ${updateParts.join(', ')} WHERE id = ?`
            ).bind(...updateBinds, apt.id).run();
          }
        } else {
          aptId = generateId();
          let entranceId = null;
          if (u.entrance) {
            const ent = await env.DB.prepare(
              `SELECT id FROM entrances WHERE building_id = ? AND number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
            ).bind(u.building_id, parseInt(u.entrance), ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;
            if (ent) entranceId = ent.id;
          }
          await env.DB.prepare(`
            INSERT INTO apartments (id, building_id, entrance_id, number, floor, total_area, status, primary_owner_id, tenant_id)
            VALUES (?, ?, ?, ?, ?, ?, 'occupied', ?, ?)
          `).bind(
            aptId, u.building_id, entranceId, String(u.apartment),
            u.floor ? parseInt(u.floor) : null, u.total_area || null,
            userId, bulkTenantId || null
          ).run();
        }

        if (aptId) {
          const loginTrimmed = u.login?.trim();
          const accountNum = (loginTrimmed && /^\d+$/.test(loginTrimmed))
            ? loginTrimmed
            : null;

          const existingAccount = await env.DB.prepare(
            `SELECT id FROM personal_accounts WHERE apartment_id = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
          ).bind(aptId, ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;

          if (!existingAccount) {
            let existingByNumber = null;
            if (accountNum) {
              existingByNumber = await env.DB.prepare(
                `SELECT id FROM personal_accounts WHERE number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
              ).bind(accountNum, ...(bulkTenantId ? [bulkTenantId] : [])).first();
            }

            if (!existingByNumber) {
              const paId = generateId();
              const finalAccountNum = accountNum || `PA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
              await env.DB.prepare(`
                INSERT INTO personal_accounts (id, number, apartment_id, building_id, owner_name, apartment_number, total_area, tenant_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
              `).bind(
                paId, finalAccountNum, aptId, u.building_id,
                u.name || null, String(u.apartment), u.total_area || null,
                bulkTenantId || null
              ).run();

              await env.DB.prepare(
                'UPDATE apartments SET personal_account_id = ? WHERE id = ?'
              ).bind(paId, aptId).run();
            }
          } else {
            await env.DB.prepare(
              `UPDATE personal_accounts SET owner_name = ?, apartment_number = ?, total_area = COALESCE(NULLIF(total_area, 0), ?)
               WHERE id = ?`
            ).bind(u.name || null, String(u.apartment), u.total_area || null, existingAccount.id).run();
          }
        }
      } catch (linkErr) {
        createRequestLogger(request).error('Failed to link apartment data', linkErr);
      }
    }
  }

  return json({ created, updated }, 201);
});

// Staff Export
route('GET', '/api/team/export', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }
  const tenantId = getTenantId(request);
  const STAFF_ROLES = ['admin', 'director', 'manager', 'department_head', 'dispatcher', 'executor', 'security'];
  const ph = STAFF_ROLES.map(() => '?').join(',');
  const { results: staff } = await env.DB.prepare(
    `SELECT id, login, name, phone, role, specialization, branch, is_active
     FROM users WHERE role IN (${ph}) ${tenantId ? 'AND tenant_id=?' : ''} ORDER BY role, name`
  ).bind(...STAFF_ROLES, ...(tenantId ? [tenantId] : [])).all() as any;

  return json({ exportType: 'staff', exportedAt: new Date().toISOString(), version: '1.0', staff });
});

// Staff Import
route('POST', '/api/team/import', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }
  const tenantId = getTenantId(request);
  const raw = await request.json() as any;

  // Normalize: accept array, {staff:[...]}, {users:[...]}, {data:{staff:[...]}}
  let members: any[] = [];
  if (Array.isArray(raw)) {
    members = raw;
  } else if (Array.isArray(raw.staff)) {
    members = raw.staff;
  } else if (Array.isArray(raw.users)) {
    members = raw.users;
  } else if (Array.isArray(raw.data?.staff)) {
    members = raw.data.staff;
  } else if (raw.exportType && raw.data?.branches) {
    for (const br of (raw.data.branches || [])) {
      for (const bld of (br.buildings || [])) {
        for (const u of (bld.residents || [])) {
          if (['admin','director','manager','department_head','dispatcher','executor','security'].includes(u.role)) {
            members.push(u);
          }
        }
      }
    }
  }

  if (members.length === 0) return error('No staff data found in file', 400);

  const ALLOWED = ['admin','director','manager','department_head','dispatcher','executor','security'];
  const stats = { created: 0, updated: 0, skipped: 0 };

  const { results: existingRows } = await env.DB.prepare(
    tenantId ? `SELECT id, login FROM users WHERE tenant_id=?` : `SELECT id, login FROM users`
  ).bind(...(tenantId ? [tenantId] : [])).all() as any;
  const loginMap = new Map<string, string>();
  for (const r of existingRows) loginMap.set(r.login, r.id);

  const toInsert: any[] = [];
  const toUpdate: any[] = [];

  for (const m of members) {
    const role = m.role || 'executor';
    if (!ALLOWED.includes(role)) { stats.skipped++; continue; }
    const login = m.login || m.phone;
    if (!login) { stats.skipped++; continue; }

    if (loginMap.has(login)) {
      toUpdate.push({ id: loginMap.get(login)!, ...m, role, login });
    } else {
      toInsert.push({ ...m, role, login });
    }
  }

  const CHUNK = 40;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    await env.DB.batch(chunk.map((m: any) =>
      env.DB.prepare(
        `INSERT OR IGNORE INTO users (id,login,name,phone,password_hash,role,specialization,branch,tenant_id,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,1)`
      ).bind(generateId(), m.login, m.name||m.login, m.phone||null, m.password_hash||'', m.role, m.specialization||null, m.branch||null, tenantId||null)
    ));
    stats.created += chunk.length;
  }

  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    await env.DB.batch(chunk.map((m: any) =>
      env.DB.prepare(`UPDATE users SET name=?,phone=?,role=?,specialization=? WHERE id=?`)
        .bind(m.name||m.login, m.phone||null, m.role, m.specialization||null, m.id)
    ));
    stats.updated += chunk.length;
  }

  invalidateCache('users:');
  return json({ success: true, stats });
});

} // end registerImportRoutes
