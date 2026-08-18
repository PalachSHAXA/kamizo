import { createHash, pbkdf2Sync } from 'node:crypto';

const ITERATIONS = 50_000;
const TENANT_ID = 'e2e-tenant';
const BUILDING_ID = 'e2e-building';
const APARTMENT_ID = 'e2e-apartment';

function sql(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function passwordHash(password, label) {
  const salt = createHash('sha256').update(`kamizo-e2e:${label}`).digest().subarray(0, 16);
  const hash = pbkdf2Sync(password.trim(), salt, ITERATIONS, 32, 'sha256');
  return `${ITERATIONS}:${salt.toString('base64')}:${hash.toString('base64')}`;
}

export async function buildSeedSql(options) {
  const tenantName = options.tenantName ?? 'Kamizo E2E';
  const userHash = passwordHash(options.password, 'tenant-users');
  const superHash = passwordHash(options.superadminPassword, 'superadmin');
  const features = JSON.stringify([
    'requests', 'votes', 'qr', 'rentals', 'notepad', 'reports', 'meetings',
    'marketplace', 'vehicles', 'training', 'chat', 'announcements', 'colleagues', 'advertiser',
    'communal', 'rental_listings',
  ]);
  const roles = [
    ['admin', 'admin', 'Администратор E2E', null],
    ['director', 'director', 'Директор E2E', null],
    ['manager', 'manager', 'Управляющий E2E', null],
    ['department_head', 'department_head', 'Глава отдела E2E', null],
    ['dispatcher', 'dispatcher', 'Диспетчер E2E', null],
    ['resident', 'resident', 'Житель E2E', null],
    ['commercial_owner', 'commercial_owner', 'Собственник помещения E2E', null],
    ['executor', 'executor', 'Исполнитель E2E', 'plumber'],
    ['security', 'security', 'Охранник E2E', 'security'],
    ['advertiser', 'advertiser', 'Рекламодатель E2E', null],
  ];
  const users = roles.map(([login, role, name, specialization]) => `
INSERT INTO users (
  id, login, password_hash, name, role, specialization, phone, address,
  apartment, building_id, branch, building, total_area, agreed_to_terms_at,
  is_active, tenant_id, account_type, status
) VALUES (
  ${sql(`e2e-user-${login}`)}, ${sql(login)}, ${sql(userHash)}, ${sql(name)},
  ${sql(role)}, ${sql(specialization)}, ${sql(`+99890${roles.indexOf(roles.find(item => item[0] === login)) + 1}000000`)},
  ${sql('ул. Тестовая, 1')}, ${sql(login === 'resident' ? '42' : login === 'commercial_owner' ? 'C1' : null)},
  ${sql(BUILDING_ID)}, ${sql('YS')}, ${sql('E2E Building')},
  ${login === 'resident' ? 64.5 : login === 'commercial_owner' ? 120 : 'NULL'}, datetime('now'), 1,
  ${sql(TENANT_ID)}, 'standard', 'available'
);`).join('\n');

  return `
INSERT INTO tenants (id, name, slug, url, admin_url, plan, features, is_active, is_demo)
VALUES (${sql(TENANT_ID)}, ${sql(tenantName)}, 'e2e', 'http://localhost:5173',
  'http://localhost:5173/admin', 'enterprise', ${sql(features)}, 1, 1);

INSERT INTO tenants (id, name, slug, url, admin_url, plan, features, is_active, is_demo)
VALUES ('demo-tenant', 'Kamizo Demo', 'demo', 'https://demo.kamizo.uz',
  'https://demo.kamizo.uz/admin', 'enterprise', '[]', 1, 1);

INSERT INTO branches (id, code, name, address, is_active)
VALUES ('e2e-branch', 'YS', 'E2E Branch', 'ул. Тестовая, 1', 1);

INSERT INTO buildings (id, name, address, branch_code, branch_id, floors, apartments_count, total_area, tenant_id)
VALUES (${sql(BUILDING_ID)}, 'E2E Building', 'ул. Тестовая, 1', 'YS', 'e2e-branch', 9, 100, 6400, ${sql(TENANT_ID)});

INSERT INTO users (id, login, password_hash, name, role, is_active, tenant_id)
VALUES ('e2e-user-superadmin', 'superadmin', ${sql(superHash)}, 'Super Admin E2E', 'super_admin', 1, NULL);
${users}

INSERT INTO apartments (id, building_id, number, floor, total_area, primary_owner_id, tenant_id)
VALUES (${sql(APARTMENT_ID)}, ${sql(BUILDING_ID)}, '42', 4, 64.5, 'e2e-user-resident', ${sql(TENANT_ID)});

INSERT INTO apartments (id, building_id, number, floor, total_area, primary_owner_id, tenant_id)
VALUES ('e2e-commercial-apartment', ${sql(BUILDING_ID)}, 'C1', 1, 120, 'e2e-user-commercial_owner', ${sql(TENANT_ID)});

INSERT INTO chat_channels (
  id, type, name, resident_id, created_by, tenant_id
) VALUES (
  'e2e-support', 'private_support', 'E2E Resident Support',
  'e2e-user-resident', 'e2e-user-resident', ${sql(TENANT_ID)}
);

INSERT INTO finance_charges (
  id, apartment_id, period, amount, property_type, area_sqm, rate_per_sqm,
  status, due_date, paid_amount, tenant_id
) VALUES (
  'e2e-overdue-charge', ${sql(APARTMENT_ID)}, '2026-01', 250000,
  'non_commercial', 64.5, 3875.97, 'overdue', '2026-02-15', 0, ${sql(TENANT_ID)}
);

INSERT INTO finance_access (id, user_id, access_level, granted_by, tenant_id)
VALUES ('e2e-finance-manager', 'e2e-user-manager', 'view_only', 'e2e-user-admin', ${sql(TENANT_ID)});

INSERT OR REPLACE INTO categories (id, name_ru, name_uz, specialization, is_active, tenant_id) VALUES
  ('plumber', 'Сантехника', 'Santexnika', 'plumber', 1, ${sql(TENANT_ID)}),
  ('electrician', 'Электрика', 'Elektr', 'electrician', 1, ${sql(TENANT_ID)});

`;
}
