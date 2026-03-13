// UK CRM API - Cloudflare Workers with D1
// Modular architecture: imports from middleware/, utils/, cache, monitoring

// --- External modules ---
import {
  cachedQuery,
  cachedQueryWithArgs,
  invalidateOnChange,
  getCacheStats,
  CacheTTL,
  CachePrefix,
} from './cache';
import {
  metricsAggregator,
  withMonitoring,
  healthCheck,
  AlertManager,
  logAnalyticsEvent,
} from './monitoring';

// --- Internal modules (extracted from this file) ---
import type { Env, User } from './types';
import { route, matchRoute } from './router';
import { setCorsOrigin, getCurrentCorsOrigin, corsHeaders } from './middleware/cors';
import { getUser } from './middleware/auth';
import { getTenantId, setTenantForRequest, getTenantSlug, setCurrentTenant, getCurrentTenant } from './middleware/tenant';
import { getCached, setCache, invalidateCache } from './middleware/cache-local';
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from './middleware/rateLimit';
import { json, error, generateId, isManagement, isAdminLevel, getPaginationParams, createPaginatedResponse } from './utils/helpers';
import { encryptPassword, decryptPassword, hashPassword, verifyPassword } from './utils/crypto';


// Helper: Fetch meeting with agenda items and schedule options
async function getMeetingWithDetails(env: Env, meetingId: string, tenantId?: string): Promise<any> {
  const meeting = await env.DB.prepare(
    `SELECT * FROM meetings WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
  ).bind(meetingId, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return null;

  // Fetch agenda items
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(meetingId).all();

  // Fetch schedule options with vote counts
  const { results: scheduleOptions } = await env.DB.prepare(
    `SELECT so.*, COALESCE(SUM(sv.vote_weight), 0) as vote_weight, COUNT(sv.id) as vote_count
     FROM meeting_schedule_options so
     LEFT JOIN meeting_schedule_votes sv ON so.id = sv.option_id
     WHERE so.meeting_id = ?
     GROUP BY so.id
     ORDER BY so.date_time`
  ).bind(meetingId).all();

  meeting.agenda_items = agendaItems || [];
  meeting.schedule_options = scheduleOptions || [];

  return meeting;
}

// ==================== WEBSOCKET (DURABLE OBJECTS) ====================

route('GET', '/api/ws', async (request, env) => {
  const url = new URL(request.url);
  const upgradeHeader = request.headers.get('Upgrade');

  if (!upgradeHeader || upgradeHeader !== 'websocket') {
    return error('Expected WebSocket upgrade', 400);
  }

  // Authenticate user
  const tokenFromQuery = url.searchParams.get('token');
  let user: User | null = null;

  if (tokenFromQuery) {
    const result = await env.DB.prepare(
      'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
    ).bind(tokenFromQuery).first();
    user = result as User | null;
  } else {
    user = await getUser(request, env);
  }

  if (!user) {
    return error('Unauthorized', 401);
  }

  // Single global DO shard — all connections in one instance for reliable broadcasts
  const id = env.CONNECTION_MANAGER.idFromName('global');
  const stub = env.CONNECTION_MANAGER.get(id);

  // Forward request to Durable Object with user info
  const doUrl = new URL(request.url);
  doUrl.searchParams.set('userId', user.id);
  doUrl.searchParams.set('userName', user.name);
  doUrl.searchParams.set('role', user.role);
  if (user.building_id) {
    doUrl.searchParams.set('buildingId', user.building_id);
  }

  return stub.fetch(doUrl.toString(), request);
});

// ==================== AUTH ROUTES ====================

// Cache stats endpoint (для мониторинга)
route('GET', '/api/admin/cache/stats', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || user.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const stats = getCacheStats();
  return json(stats);
});

// Seed initial users (for setup) - Demo accounts for all roles
route('POST', '/api/seed', async (request, env) => {
  // Require super_admin authentication
  const authUser = await getUser(request, env);
  if (!isSuperAdmin(authUser)) return error('Access denied', 403);

  const initialUsers = [
    // Demo accounts (password: kamizo) - matching LoginPage demo buttons
    { login: 'admin', password: 'palach27', name: 'Администратор', role: 'admin', phone: '+998901234567' },
    { login: 'director', password: 'kamizo', name: 'Директор Демо', role: 'director', phone: '+998901000000' },
    { login: 'manager', password: 'kamizo', name: 'Управляющий', role: 'manager', phone: '+998901111111' },
    { login: 'department_head', password: 'kamizo', name: 'Глава отдела', role: 'department_head', phone: '+998901222222' },
    { login: 'resident', password: 'kamizo', name: 'Житель Демо', role: 'resident', phone: '+998902222222', address: 'ул. Мустакиллик, 15', apartment: '42' },
    { login: 'executor', password: 'kamizo', name: 'Исполнитель Демо', role: 'executor', phone: '+998903333333', specialization: 'plumber' },
    { login: 'dispatcher', password: 'kamizo', name: 'Диспетчер Демо', role: 'dispatcher', phone: '+998904444444' },
    { login: 'security', password: 'kamizo', name: 'Охранник Демо', role: 'security', phone: '+998905555555' },
    { login: 'advertiser', password: 'kamizo', name: 'Менеджер рекламы Демо', role: 'advertiser', phone: '+998906666666' },
  ];

  const results = [];

  for (const u of initialUsers) {
    // Check if exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE login = ?').bind(u.login).first();
    if (existing) {
      results.push({ login: u.login, status: 'exists' });
      continue;
    }

    const id = generateId();
    const passwordHash = await hashPassword(u.password);

    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, phone, specialization, address, apartment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id, u.login, passwordHash, u.name, u.role, u.phone,
      (u as any).specialization || null,
      (u as any).address || null,
      (u as any).apartment || null
    ).run();

    results.push({ login: u.login, status: 'created' });
  }

  return json({ results });
});

// POST /api/seed-kamizo-demo - create Kamizo demo tenant with full demo data
route('POST', '/api/seed-kamizo-demo', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  // Check if already exists
  const existing = await env.DB.prepare(`SELECT id FROM tenants WHERE slug = 'kamizo-demo'`).first();
  if (existing) {
    return error('Kamizo Demo tenant already exists. Delete it first to recreate.');
  }

  const tenantId = generateId();
  const features = JSON.stringify(["requests","votes","qr","rentals","notepad","reports","meetings","marketplace","vehicles","training","chat","announcements","colleagues"]);

  // 1. Create the Kamizo Demo tenant
  await env.DB.prepare(`
    INSERT INTO tenants (id, name, slug, url, admin_url, color, color_secondary, plan, features, admin_email, admin_phone)
    VALUES (?, 'Kamizo Demo', 'kamizo-demo', 'https://kamizo-demo.kamizo.uz', 'https://kamizo-demo.kamizo.uz/admin', '#f97316', '#fb923c', 'enterprise', ?, 'demo@kamizo.uz', '+998901234567')
  `).bind(tenantId, features).run();

  // 2. Create demo users
  const demoUsers = [
    { id: generateId(), login: 'demo-director', password: 'kamizo', name: 'Alisher Karimov', role: 'director', phone: '+998901000001' },
    { id: generateId(), login: 'demo-manager', password: 'kamizo', name: 'Nodira Rahimova', role: 'manager', phone: '+998901000002' },
    { id: generateId(), login: 'demo-admin', password: 'kamizo', name: 'Sardor Umarov', role: 'admin', phone: '+998901000003' },
    { id: generateId(), login: 'demo-dispatcher', password: 'kamizo', name: 'Dilnoza Azimova', role: 'dispatcher', phone: '+998901000004' },
    { id: generateId(), login: 'demo-executor', password: 'kamizo', name: 'Bobur Toshmatov', role: 'executor', phone: '+998901000005', specialization: 'plumber' },
    { id: generateId(), login: 'demo-electrician', password: 'kamizo', name: 'Jasur Mirzayev', role: 'executor', phone: '+998901000006', specialization: 'electrician' },
    { id: generateId(), login: 'demo-security', password: 'kamizo', name: 'Otabek Normatov', role: 'security', phone: '+998901000007' },
    { id: generateId(), login: 'demo-dept-head', password: 'kamizo', name: 'Rustam Xolmatov', role: 'department_head', phone: '+998901000008' },
    { id: generateId(), login: 'demo-shop', password: 'kamizo', name: 'Gulnora Tosheva', role: 'marketplace_manager', phone: '+998901000009' },
    { id: generateId(), login: 'demo-resident1', password: 'kamizo', name: 'Aziza Sultanova', role: 'resident', phone: '+998901000010', address: 'ул. Навои, 25', apartment: '12' },
    { id: generateId(), login: 'demo-resident2', password: 'kamizo', name: 'Farhod Ismoilov', role: 'resident', phone: '+998901000011', address: 'ул. Навои, 25', apartment: '45' },
    { id: generateId(), login: 'demo-resident3', password: 'kamizo', name: 'Malika Abdullayeva', role: 'resident', phone: '+998901000012', address: 'ул. Амира Темура, 10', apartment: '78' },
    { id: generateId(), login: 'demo-tenant', password: 'kamizo', name: 'Shahlo Nazarova', role: 'tenant', phone: '+998901000013', address: 'ул. Навои, 25', apartment: '67' },
  ];

  for (const u of demoUsers) {
    const passwordHash = await hashPassword(u.password);
    const passwordPlain = await encryptPassword(u.password, env.ENCRYPTION_KEY);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, specialization, address, apartment, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).bind(
      u.id, u.login, passwordHash, passwordPlain, u.name, u.role, u.phone,
      (u as any).specialization || null,
      (u as any).address || null,
      (u as any).apartment || null,
      tenantId
    ).run();
  }

  // Get user IDs by login for references
  const findDemoUser = (login: string) => demoUsers.find(u => u.login === login)!;
  const director = findDemoUser('demo-director');
  const manager = findDemoUser('demo-manager');
  const executor = findDemoUser('demo-executor');
  const electrician = findDemoUser('demo-electrician');
  const resident1 = findDemoUser('demo-resident1');
  const resident2 = findDemoUser('demo-resident2');
  const resident3 = findDemoUser('demo-resident3');
  const security = findDemoUser('demo-security');
  const demoTenant = findDemoUser('demo-tenant');

  // 3. Create demo buildings (4 total)
  const building1Id = generateId();
  const building2Id = generateId();
  const building3Id = generateId();
  const building4Id = generateId();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Навои Резиденс', 'ул. Навои, 25', 16, 4, 128, 12500.0, 2021, 'monolith', 1, 4, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building1Id, tenantId).run();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Темур Плаза', 'ул. Амира Темура, 10', 12, 2, 48, 5200.0, 2019, 'brick', 1, 2, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building2Id, tenantId).run();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Мирзо Улугбек', 'ул. Мирзо Улугбека, 42', 9, 3, 72, 6800.0, 2023, 'monolith', 1, 3, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building3Id, tenantId).run();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Сахил Парк', 'пр. Бунёдкор, 18', 20, 6, 240, 22000.0, 2025, 'monolith', 1, 6, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building4Id, tenantId).run();

  // 4. Create demo apartments
  const apartments = [
    // Building 1 - ЖК Навои Резиденс
    { id: generateId(), building_id: building1Id, number: '12', floor: 3, total_area: 72.5, rooms: 3, status: 'occupied', primary_owner_id: resident1.id },
    { id: generateId(), building_id: building1Id, number: '45', floor: 8, total_area: 55.0, rooms: 2, status: 'occupied', primary_owner_id: resident2.id },
    { id: generateId(), building_id: building1Id, number: '67', floor: 12, total_area: 95.0, rooms: 4, status: 'rented' },
    // Building 2 - ЖК Темур Плаза
    { id: generateId(), building_id: building2Id, number: '78', floor: 6, total_area: 48.0, rooms: 2, status: 'occupied', primary_owner_id: resident3.id },
    { id: generateId(), building_id: building2Id, number: '31', floor: 4, total_area: 62.0, rooms: 3, status: 'vacant' },
    // Building 3 - ЖК Мирзо Улугбек
    { id: generateId(), building_id: building3Id, number: '15', floor: 4, total_area: 68.0, rooms: 3, status: 'occupied' },
    { id: generateId(), building_id: building3Id, number: '28', floor: 7, total_area: 42.0, rooms: 1, status: 'occupied' },
    { id: generateId(), building_id: building3Id, number: '33', floor: 9, total_area: 85.0, rooms: 4, status: 'vacant' },
    // Building 4 - ЖК Сахил Парк
    { id: generateId(), building_id: building4Id, number: '101', floor: 5, total_area: 110.0, rooms: 4, status: 'occupied' },
    { id: generateId(), building_id: building4Id, number: '156', floor: 12, total_area: 75.0, rooms: 3, status: 'occupied' },
    { id: generateId(), building_id: building4Id, number: '189', floor: 15, total_area: 58.0, rooms: 2, status: 'rented' },
    { id: generateId(), building_id: building4Id, number: '220', floor: 18, total_area: 130.0, rooms: 5, status: 'occupied' },
  ];

  for (const apt of apartments) {
    await env.DB.prepare(`
      INSERT INTO apartments (id, building_id, number, floor, total_area, rooms, status, primary_owner_id, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(apt.id, apt.building_id, apt.number, apt.floor, apt.total_area, apt.rooms, apt.status, apt.primary_owner_id || null, tenantId).run();
  }

  // 5. Create rental apartment (apt 67 for rent)
  const rentalAptId = generateId();
  await env.DB.prepare(`
    INSERT INTO rental_apartments (id, name, address, apartment, owner_id, is_active, tenant_id, created_at, updated_at)
    VALUES (?, 'Квартира 67, ЖК Навои Резиденс', 'ул. Навои, 25', '67', ?, 1, ?, datetime('now'), datetime('now'))
  `).bind(rentalAptId, director.id, tenantId).run();

  // 6. Create demo vehicles
  const vehicles = [
    { id: generateId(), user_id: resident1.id, plate_number: '01 A 777 AA', brand: 'Chevrolet', model: 'Malibu', color: 'Белый', year: 2023, vehicle_type: 'car' },
    { id: generateId(), user_id: resident2.id, plate_number: '01 B 123 BB', brand: 'Kia', model: 'K5', color: 'Серебристый', year: 2022, vehicle_type: 'car' },
    { id: generateId(), user_id: resident3.id, plate_number: '01 C 456 CC', brand: 'Hyundai', model: 'Tucson', color: 'Чёрный', year: 2024, vehicle_type: 'suv' },
  ];

  for (const v of vehicles) {
    await env.DB.prepare(`
      INSERT INTO vehicles (id, user_id, plate_number, brand, model, color, year, vehicle_type, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(v.id, v.user_id, v.plate_number, v.brand, v.model, v.color, v.year, v.vehicle_type, tenantId).run();
  }

  // 7. Create demo executors in executors table
  const executorRecordId = generateId();
  const electricianRecordId = generateId();
  await env.DB.prepare(`
    INSERT INTO executors (id, user_id, specialization, status, rating, completed_count, created_at)
    VALUES (?, ?, 'plumber', 'available', 4.8, 47, datetime('now'))
  `).bind(executorRecordId, executor.id).run();

  await env.DB.prepare(`
    INSERT INTO executors (id, user_id, specialization, status, rating, completed_count, created_at)
    VALUES (?, ?, 'electrician', 'available', 4.9, 35, datetime('now'))
  `).bind(electricianRecordId, electrician.id).run();

  // 8. Create demo requests (different statuses for full cycle)
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  const requests = [
    { id: generateId(), number: 1001, request_number: 'KD-1001', resident_id: resident1.id, category_id: 'plumbing', title: 'Течёт кран на кухне', description: 'Кран на кухне постоянно капает, нужно заменить прокладку или весь смеситель', priority: 'medium', status: 'new', created_at: threeHoursAgo },
    { id: generateId(), number: 1002, request_number: 'KD-1002', resident_id: resident2.id, category_id: 'electrical', title: 'Не работает розетка в прихожей', description: 'Розетка в коридоре перестала работать после скачка напряжения', priority: 'high', status: 'assigned', executor_id: electrician.id, created_at: oneDayAgo },
    { id: generateId(), number: 1003, request_number: 'KD-1003', resident_id: resident3.id, category_id: 'plumbing', title: 'Засор канализации', description: 'Вода не уходит в ванной комнате, засорилась труба', priority: 'urgent', status: 'in_progress', executor_id: executor.id, created_at: twoDaysAgo, started_at: oneDayAgo },
    { id: generateId(), number: 1004, request_number: 'KD-1004', resident_id: resident1.id, category_id: 'electrical', title: 'Замена автомата в щитке', description: 'Автоматический выключатель в электрощитке выбивает при включении стиральной машины', priority: 'high', status: 'completed', executor_id: electrician.id, created_at: twoDaysAgo, started_at: twoDaysAgo, completed_at: oneDayAgo, rating: 5, feedback: 'Отлично! Быстро и качественно.' },
  ];

  for (const r of requests) {
    await env.DB.prepare(`
      INSERT INTO requests (id, number, request_number, resident_id, category_id, title, description, priority, status, executor_id, created_at, updated_at, started_at, completed_at, rating, feedback, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      r.id, r.number, r.request_number, r.resident_id, r.category_id, r.title, r.description,
      r.priority, r.status, r.executor_id || null,
      r.created_at, r.created_at,
      (r as any).started_at || null, (r as any).completed_at || null,
      (r as any).rating || null, (r as any).feedback || null,
      tenantId
    ).run();
  }

  // 9. Create demo guest access codes (QR)
  const qrCodes = [
    { id: generateId(), user_id: resident1.id, qr_token: `kamizo-demo-qr-${Date.now()}-1`, visitor_type: 'guest', visitor_name: 'Камола Рашидова', access_type: 'single_use', status: 'active', resident_name: resident1.name },
    { id: generateId(), user_id: resident2.id, qr_token: `kamizo-demo-qr-${Date.now()}-2`, visitor_type: 'courier', visitor_name: 'Яндекс Доставка', access_type: 'day', status: 'active', resident_name: resident2.name },
  ];

  for (const qr of qrCodes) {
    await env.DB.prepare(`
      INSERT INTO guest_access_codes (id, user_id, qr_token, visitor_type, visitor_name, access_type, status, resident_name, valid_from, valid_until, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+7 days'), ?, datetime('now'))
    `).bind(qr.id, qr.user_id, qr.qr_token, qr.visitor_type, qr.visitor_name, qr.access_type, qr.status, qr.resident_name, tenantId).run();
  }

  // 10. Create demo meeting
  const meetingId = generateId();
  const futureDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T18:00:00';
  await env.DB.prepare(`
    INSERT INTO meetings (id, number, building_id, building_address, description, organizer_type, organizer_id, organizer_name, format, status, confirmed_date_time, location, voting_unit, quorum_percent, total_area, tenant_id, created_at, updated_at)
    VALUES (?, 1, ?, 'ул. Навои, 25', 'Годовое общее собрание собственников ЖК Навои Резиденс. Обсуждение бюджета на 2026 год, ремонт подъездов и благоустройство двора.', 'uk', ?, 'Kamizo Demo', 'offline', 'voting_open', ?, 'Актовый зал, 1 этаж', 'apartment', 51, 12500.0, ?, datetime('now'), datetime('now'))
  `).bind(meetingId, building1Id, director.id, futureDate, tenantId).run();

  // Create agenda items for the meeting
  const agendaItems = [
    { id: generateId(), title: 'Утверждение бюджета на 2026 год', description: 'Рассмотрение и утверждение сметы расходов на содержание и обслуживание общего имущества на 2026 год', order_num: 1 },
    { id: generateId(), title: 'Капитальный ремонт подъездов', description: 'Принятие решения о проведении ремонта подъездов 1-4 с заменой дверей, покраской стен и обновлением освещения', order_num: 2 },
    { id: generateId(), title: 'Благоустройство придомовой территории', description: 'Установка детской площадки, скамеек и озеленение двора', order_num: 3 },
  ];

  for (const item of agendaItems) {
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_items (id, meeting_id, title, description, item_order, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(item.id, meetingId, item.title, item.description, item.order_num, tenantId).run();
  }

  // 11. Create demo announcements
  const announcements = [
    { id: generateId(), title: 'Плановое отключение горячей воды', content: 'Уважаемые жители! В связи с проведением профилактических работ 15 марта с 9:00 до 18:00 будет отключена горячая вода. Приносим извинения за неудобства.', type: 'maintenance', priority: 'high' },
    { id: generateId(), title: 'Субботник во дворе', content: 'Приглашаем всех жителей на субботник 20 марта в 10:00. Будем сажать деревья, устанавливать скамейки и убирать территорию. Перчатки и инструменты предоставляются.', type: 'event', priority: 'normal' },
    { id: generateId(), title: 'Новый график работы консьержа', content: 'С 1 апреля консьерж-служба работает в режиме: Пн-Пт 8:00-22:00, Сб-Вс 9:00-21:00. По вопросам доступа в ночное время звоните на горячую линию.', type: 'info', priority: 'normal' },
  ];

  for (const ann of announcements) {
    await env.DB.prepare(`
      INSERT INTO announcements (id, title, content, created_by, type, priority, target_type, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'all', 1, ?, datetime('now'), datetime('now'))
    `).bind(ann.id, ann.title, ann.content, manager.id, ann.type, ann.priority, tenantId).run();
  }

  // 12. Create past completed meeting (for full cycle demo)
  const pastMeetingId = generateId();
  const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T18:00:00';
  await env.DB.prepare(`
    INSERT INTO meetings (id, number, building_id, building_address, description, organizer_type, organizer_id, organizer_name, format, status, confirmed_date_time, location, voting_unit, quorum_percent, total_area, tenant_id, created_at, updated_at)
    VALUES (?, 2, ?, 'ул. Амира Темура, 10', 'Внеочередное собрание по вопросу установки шлагбаума на придомовой территории. Результат: решение принято большинством голосов.', 'uk', ?, 'Kamizo Demo', 'offline', 'completed', ?, 'Холл 1 этажа', 'apartment', 51, 5200.0, ?, datetime('now', '-30 days'), datetime('now', '-28 days'))
  `).bind(pastMeetingId, building2Id, director.id, pastDate, tenantId).run();

  const pastAgendaItems = [
    { id: generateId(), title: 'Установка шлагбаума', description: 'Обсуждение необходимости установки автоматического шлагбаума на въезде во двор для ограничения парковки посторонних', order_num: 1 },
    { id: generateId(), title: 'Выбор подрядчика', description: 'Рассмотрение предложений от трёх компаний-установщиков шлагбаумов', order_num: 2 },
  ];

  for (const item of pastAgendaItems) {
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_items (id, meeting_id, title, description, item_order, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '-30 days'))
    `).bind(item.id, pastMeetingId, item.title, item.description, item.order_num, tenantId).run();
  }

  // 13. Create demo marketplace categories and products
  const catHousehold = generateId();
  const catPlumbing = generateId();
  const catElectrical = generateId();
  const catPersonalCare = generateId();
  const catGroceries = generateId();
  const catBeverages = generateId();
  const catCleaning = generateId();

  await env.DB.prepare(`
    INSERT INTO marketplace_categories (id, name_ru, name_uz, icon, sort_order, is_active, tenant_id) VALUES
    (?, 'Продукты', 'Oziq-ovqat', 'shopping-cart', 1, 1, ?),
    (?, 'Напитки', 'Ichimliklar', 'coffee', 2, 1, ?),
    (?, 'Личная гигиена', 'Shaxsiy gigiena', 'heart', 3, 1, ?),
    (?, 'Бытовая химия', 'Maishiy kimyo', 'sparkles', 4, 1, ?),
    (?, 'Хозтовары', 'Xo''jalik mollari', 'package', 5, 1, ?),
    (?, 'Сантехника', 'Santexnika', 'wrench', 6, 1, ?),
    (?, 'Электрика', 'Elektrika', 'zap', 7, 1, ?)
  `).bind(
    catGroceries, tenantId, catBeverages, tenantId, catPersonalCare, tenantId,
    catCleaning, tenantId, catHousehold, tenantId, catPlumbing, tenantId, catElectrical, tenantId
  ).run();

  const products = [
    // Продукты (Groceries) — чистые продуктовые фото
    { id: generateId(), cat: catGroceries, name_ru: 'Соль поваренная 1 кг', name_uz: 'Osh tuzi 1 kg', price: 5000, stock: 200, desc_ru: 'Мелкая поваренная соль высшего сорта', desc_uz: 'Oliy navli mayda osh tuzi', image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Сахар белый 1 кг', name_uz: 'Oq shakar 1 kg', price: 14000, stock: 150, desc_ru: 'Рафинированный белый сахар-песок', desc_uz: 'Tozalangan oq shakar', image: 'https://images.unsplash.com/photo-1595568139907-d42f4c2c4e63?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Масло подсолнечное 1л', name_uz: 'Kungaboqar yog\'i 1l', price: 28000, stock: 80, desc_ru: 'Рафинированное подсолнечное масло для жарки и салатов', desc_uz: 'Tozalangan kungaboqar yog\'i', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Рис девзира 1 кг', name_uz: 'Devzira guruch 1 kg', price: 32000, stock: 100, desc_ru: 'Узбекский рис девзира для плова', desc_uz: 'Palov uchun o\'zbek devzira guruchi', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Макароны спагетти 500г', name_uz: 'Spagetti makaron 500g', price: 12000, stock: 120, desc_ru: 'Макаронные изделия из твёрдых сортов пшеницы', desc_uz: 'Qattiq bug\'doydan tayyorlangan makaron', image: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Мука пшеничная 2 кг', name_uz: 'Bug\'doy uni 2 kg', price: 18000, stock: 90, desc_ru: 'Мука высшего сорта для выпечки', desc_uz: 'Oliy navli pishirish uchun un', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Чай зелёный 100 пакетиков', name_uz: 'Yashil choy 100 paket', price: 25000, old_price: 32000, stock: 60, desc_ru: 'Ароматный зелёный чай в пакетиках', desc_uz: 'Xushbo\'y yashil choy paketlarda', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop&auto=format&q=80', featured: true },

    // Напитки (Beverages)
    { id: generateId(), cat: catBeverages, name_ru: 'Вода питьевая 5л', name_uz: 'Ichimlik suvi 5l', price: 10000, stock: 200, desc_ru: 'Очищенная питьевая вода в бутылке', desc_uz: 'Tozalangan ichimlik suvi', image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catBeverages, name_ru: 'Сок апельсиновый 1л', name_uz: 'Apelsin sharbati 1l', price: 18000, stock: 50, desc_ru: 'Натуральный апельсиновый сок прямого отжима', desc_uz: 'Tabiiy apelsin sharbati', image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catBeverages, name_ru: 'Молоко 3.2% 1л', name_uz: 'Sut 3.2% 1l', price: 16000, stock: 40, desc_ru: 'Пастеризованное молоко 3.2% жирности', desc_uz: 'Pasterizatsiya qilingan sut 3.2%', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=400&fit=crop&auto=format&q=80' },

    // Личная гигиена (Personal care) — флаконы на белом фоне
    { id: generateId(), cat: catPersonalCare, name_ru: 'Шампунь для волос 400мл', name_uz: 'Soch uchun shampun 400ml', price: 35000, old_price: 42000, stock: 45, desc_ru: 'Питательный шампунь для всех типов волос с кератином', desc_uz: 'Barcha turdagi sochlar uchun oziqlantiruvchi shampun', image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Гель для душа 500мл', name_uz: 'Dush uchun gel 500ml', price: 30000, stock: 60, desc_ru: 'Увлажняющий гель для душа с алоэ вера', desc_uz: 'Aloe vera bilan namlantiruvchi dush geli', image: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Мыло жидкое 300мл', name_uz: 'Suyuq sovun 300ml', price: 15000, stock: 80, desc_ru: 'Антибактериальное жидкое мыло для рук', desc_uz: 'Qo\'llar uchun antibakterial suyuq sovun', image: 'https://images.unsplash.com/photo-1584305574647-0cc949a2bb9e?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Зубная паста 100мл', name_uz: 'Tish pastasi 100ml', price: 22000, stock: 70, desc_ru: 'Отбеливающая зубная паста с фтором', desc_uz: 'Ftorli oqartiruvchi tish pastasi', image: 'https://images.unsplash.com/photo-1559590086-c3f5b0891609?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Дезодорант спрей 150мл', name_uz: 'Dezodorant sprey 150ml', price: 28000, stock: 55, desc_ru: 'Дезодорант-антиперспирант 48 часов защиты', desc_uz: '48 soatlik himoya dezodorant-antiperspirant', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Туалетная бумага 12 рулонов', name_uz: 'Hojatxona qog\'ozi 12 rulon', price: 38000, old_price: 45000, stock: 100, desc_ru: 'Трёхслойная мягкая туалетная бумага', desc_uz: 'Uch qatlamli yumshoq hojatxona qog\'ozi', image: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&h=400&fit=crop&auto=format&q=80' },

    // Бытовая химия (Cleaning)
    { id: generateId(), cat: catCleaning, name_ru: 'Средство для мытья посуды 500мл', name_uz: 'Idish yuvish vositasi 500ml', price: 18000, stock: 90, desc_ru: 'Концентрированное средство с ароматом лимона', desc_uz: 'Limon xushbo\'yidagi konsentrlangan vosita', image: 'https://images.unsplash.com/photo-1556909172-8c2f041fca1e?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catCleaning, name_ru: 'Стиральный порошок 3 кг', name_uz: 'Kir yuvish kukuni 3 kg', price: 55000, old_price: 65000, stock: 40, desc_ru: 'Универсальный стиральный порошок для белого и цветного белья', desc_uz: 'Oq va rangli kiyimlar uchun universal kir yuvish kukuni', image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catCleaning, name_ru: 'Средство для мытья полов 1л', name_uz: 'Pol yuvish vositasi 1l', price: 22000, stock: 65, desc_ru: 'Универсальное средство для мытья полов и кафеля', desc_uz: 'Pol va kafel uchun universal yuvish vositasi', image: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catCleaning, name_ru: 'Средство для стёкол 500мл', name_uz: 'Oyna uchun vosita 500ml', price: 15000, stock: 75, desc_ru: 'Средство для мытья стёкол и зеркал без разводов', desc_uz: 'Oyna va ko\'zgularni dog\'siz yuvish vositasi', image: 'https://images.unsplash.com/photo-1528740561666-dc2479dc08ab?w=400&h=400&fit=crop&auto=format&q=80' },

    // Хозтовары (Household)
    { id: generateId(), cat: catHousehold, name_ru: 'Мусорные пакеты 120л (10 шт)', name_uz: 'Chiqindi paketlari 120l (10 dona)', price: 15000, stock: 50, desc_ru: 'Прочные мусорные пакеты для больших контейнеров', desc_uz: 'Katta idishlar uchun mustahkam chiqindi paketlari', image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catHousehold, name_ru: 'Губки для посуды (5 шт)', name_uz: 'Idish yuvish shimgichlari (5 dona)', price: 8000, stock: 120, desc_ru: 'Набор кухонных губок с абразивной стороной', desc_uz: 'Abraziv tomoni bor oshxona shimgichlari to\'plami', image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catHousehold, name_ru: 'Перчатки резиновые (пара)', name_uz: 'Rezina qo\'lqoplar (juft)', price: 10000, stock: 100, desc_ru: 'Хозяйственные перчатки для уборки', desc_uz: 'Tozalash uchun xo\'jalik qo\'lqoplari', image: 'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=400&h=400&fit=crop&auto=format&q=80' },

    // Сантехника (Plumbing)
    { id: generateId(), cat: catPlumbing, name_ru: 'Смеситель для кухни', name_uz: 'Oshxona uchun aralashtirgich', price: 185000, old_price: 220000, stock: 8, desc_ru: 'Однорычажный смеситель из нержавеющей стали с гибким изливом', desc_uz: 'Zanglamaydigan po\'latdan yasalgan tutqichli aralashtirgich', image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catPlumbing, name_ru: 'Гибкая подводка 1/2" 80см', name_uz: 'Egiluvchan quvur 1/2" 80sm', price: 12000, stock: 100, desc_ru: 'Надёжная подводка для подключения смесителей и бачков', desc_uz: 'Aralashtirgich va bachokni ulash uchun ishonchli quvur', image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&h=400&fit=crop&auto=format&q=80' },

    // Электрика (Electrical)
    { id: generateId(), cat: catElectrical, name_ru: 'Автоматический выключатель 16А', name_uz: 'Avtomatik uzgich 16A', price: 35000, stock: 30, desc_ru: 'Автомат для защиты электрической цепи от перегрузки', desc_uz: 'Elektr zanjirani ortiqcha yuklanishdan himoyalash uchun avtomat', image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catElectrical, name_ru: 'Светодиодная лампа E27 12Вт', name_uz: 'LED lampa E27 12Vt', price: 18000, old_price: 25000, stock: 200, desc_ru: 'Энергосберегающая лампа тёплого белого света, 3000K', desc_uz: 'Iliq oq nurli energiya tejovchi lampa, 3000K', image: 'https://images.unsplash.com/photo-1533090368676-1fd25485db88?w=400&h=400&fit=crop&auto=format&q=80' },
  ];

  for (const p of products) {
    await env.DB.prepare(`
      INSERT INTO marketplace_products (id, category_id, name_ru, name_uz, description_ru, description_uz, price, old_price, unit, stock_quantity, image_url, min_order_quantity, is_active, is_featured, created_by, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'шт', ?, ?, 1, 1, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(p.id, p.cat, p.name_ru, p.name_uz, p.desc_ru, (p as any).desc_uz || null, p.price, (p as any).old_price || null, p.stock, (p as any).image || null, (p as any).featured ? 1 : 0, manager.id, tenantId).run();
  }

  // 14. Create general chat channel with demo messages
  const generalChannelId = generateId();
  await env.DB.prepare(`
    INSERT INTO chat_channels (id, type, name, description, building_id, created_by, tenant_id, created_at)
    VALUES (?, 'building', 'ЖК Навои Резиденс — Общий чат', 'Общий чат жителей ЖК Навои Резиденс', ?, ?, ?, datetime('now'))
  `).bind(generalChannelId, building1Id, manager.id, tenantId).run();

  const chatMessages = [
    { sender: manager.id, content: 'Добро пожаловать в общий чат ЖК Навои Резиденс! Здесь вы можете задавать вопросы и получать оперативную информацию.', ago: '-2 days' },
    { sender: resident1.id, content: 'Здравствуйте! Подскажите, когда будет работать детская площадка?', ago: '-1 day' },
    { sender: manager.id, content: 'Здравствуйте, Азиза! Детская площадка откроется после завершения благоустройства — ориентировочно через 2 недели.', ago: '-1 day' },
    { sender: resident2.id, content: 'А можно установить камеры на парковке? Уже второй раз кто-то царапает машину.', ago: '-12 hours' },
    { sender: manager.id, content: 'Фарход, вопрос по камерам вынесем на ближайшее собрание. Пока что рекомендуем зафиксировать повреждения и написать заявку.', ago: '-10 hours' },
  ];

  for (const msg of chatMessages) {
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_id, content, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', ?))
    `).bind(generateId(), generalChannelId, msg.sender, msg.content, tenantId, msg.ago).run();
  }

  // 15. Create demo notes (for notepad feature)
  const notes = [
    { id: generateId(), user_id: manager.id, title: 'Список задач на неделю', content: '1. Проверить лифты в подъездах 2 и 3\n2. Согласовать смету на ремонт кровли\n3. Провести инвентаризацию инструментов\n4. Подготовить отчёт за февраль' },
    { id: generateId(), user_id: director.id, title: 'Контакты подрядчиков', content: 'Электрик: +998 90 123-45-67 (Акбар)\nСантехник: +998 90 234-56-78 (Баходир)\nКлининг: +998 90 345-67-89 (Сервис Плюс)' },
  ];

  for (const note of notes) {
    await env.DB.prepare(`
      INSERT INTO notes (id, user_id, title, content, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(note.id, note.user_id, note.title, note.content, tenantId).run();
  }

  // 16. Create additional QR codes for fuller demo
  const additionalQrCodes = [
    { id: generateId(), user_id: resident3.id, qr_token: `kamizo-demo-qr-${Date.now()}-3`, visitor_type: 'guest', visitor_name: 'Мастер по ремонту', access_type: 'single_use', status: 'active', resident_name: resident3.name },
    { id: generateId(), user_id: resident1.id, qr_token: `kamizo-demo-qr-${Date.now()}-4`, visitor_type: 'guest', visitor_name: 'Родственники (семья Каримовых)', access_type: 'recurring', status: 'active', resident_name: resident1.name },
  ];

  for (const qr of additionalQrCodes) {
    await env.DB.prepare(`
      INSERT INTO guest_access_codes (id, user_id, qr_token, visitor_type, visitor_name, access_type, status, resident_name, valid_from, valid_until, tenant_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now', '+30 days'), ?, datetime('now'))
    `).bind(qr.id, qr.user_id, qr.qr_token, qr.visitor_type, qr.visitor_name, qr.access_type, qr.status, qr.resident_name, tenantId).run();
  }

  return json({
    success: true,
    tenant_id: tenantId,
    slug: 'kamizo-demo',
    users_created: demoUsers.length,
    buildings_created: 4,
    apartments_created: apartments.length,
    vehicles_created: vehicles.length,
    requests_created: requests.length,
    qr_codes_created: qrCodes.length + additionalQrCodes.length,
    meetings_created: 2,
    announcements_created: announcements.length,
    products_created: products.length,
    chat_messages_created: chatMessages.length,
    notes_created: notes.length,
    message: 'Kamizo Demo tenant created with all demo data!'
  }, 201);
});

// Auth: Login
route('POST', '/api/auth/login', async (request, env) => {
  // Check rate limit (by IP before authentication)
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(env, identifier, 'POST:/api/auth/login');

  if (!rateLimit.allowed) {
    const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    return new Response(JSON.stringify({
      error: `Too many login attempts. Try again in ${resetIn} seconds.`
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        'Retry-After': resetIn.toString()
      }
    });
  }

  const { login, password } = await request.json() as { login: string; password: string };

  if (!login || !password) {
    return error('Login and password required');
  }

  // Fetch user with password hash (filter by tenant if on a subdomain)
  // On main domain: find non-tenant users (super_admin) or kamizo-demo users
  // On subdomain: find users belonging to that tenant OR super_admin users (tenant_id IS NULL)
  const tenantId = getTenantId(request);
  let userWithHash = await env.DB.prepare(
    `SELECT id, login, phone, name, role, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, password_hash, password_changed_at, contract_signed_at, account_type, tenant_id FROM users WHERE login = ? ${tenantId ? "AND (tenant_id = ? OR (role = 'super_admin' AND (tenant_id IS NULL OR tenant_id = '')))" : "AND (tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...[login.trim(), ...(tenantId ? [tenantId] : [])]).first() as any;

  // On main domain, also try any demo tenant for accounts starting with 'demo-'
  if (!userWithHash && !tenantId && login.trim().startsWith('demo-')) {
    userWithHash = await env.DB.prepare(
      `SELECT u.id, u.login, u.phone, u.name, u.role, u.specialization, u.address, u.apartment, u.building_id, u.branch, u.building, u.entrance, u.floor, u.total_area, u.password_hash, u.password_changed_at, u.contract_signed_at, u.account_type, u.tenant_id FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.login = ? AND t.is_demo = 1 LIMIT 1`
    ).bind(login.trim()).first() as any;
  }

  if (!userWithHash) {
    return error('Invalid credentials', 401);
  }

  // Verify password using new secure method (supports both legacy SHA-256 and new PBKDF2)
  const isValidPassword = await verifyPassword(password, userWithHash.password_hash);

  if (!isValidPassword) {
    return error('Invalid credentials', 401);
  }

  // Auto-migrate legacy or old-format password hashes to new 10k-iteration format on successful login
  const parts = userWithHash.password_hash.split(':');
  const needsRehash = !userWithHash.password_hash.includes(':') || // legacy SHA-256
    (parts.length === 2) || // old PBKDF2-100k without iteration prefix
    (parts.length === 3 && parseInt(parts[0], 10) !== 10000); // different iteration count
  if (needsRehash) {
    const newHash = await hashPassword(password);
    await env.DB.prepare('UPDATE users SET password_hash = ?, last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(newHash, userWithHash.id).run();
  } else {
    await env.DB.prepare('UPDATE users SET last_login_at = datetime(\'now\') WHERE id = ?')
      .bind(userWithHash.id).run();
  }

  // Remove password_hash from response
  const { password_hash, ...user } = userWithHash;

  // On main domain, derive tenant from user's own tenant_id for data isolation
  if (!tenantId) {
    if (user.tenant_id) {
      setTenantForRequest(request, { id: user.tenant_id });
    } else if (user.role !== 'super_admin') {
      setTenantForRequest(request, { id: '__no_tenant__' });
    }
  }

  // Check if feature-gated role is enabled for this tenant
  const featureGatedRoles: Record<string, string> = { advertiser: 'advertiser' };
  if (tenantId && featureGatedRoles[user.role]) {
    const tenantData = await env.DB.prepare('SELECT features FROM tenants WHERE id = ?').bind(tenantId).first() as any;
    const features: string[] = tenantData?.features ? JSON.parse(tenantData.features) : [];
    if (!features.includes(featureGatedRoles[user.role])) {
      return error('Ваш аккаунт деактивирован. Обратитесь к администратору.', 403);
    }
  }

  // Create response with rate limit headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'X-RateLimit-Limit': '5',
    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
    'X-RateLimit-Reset': rateLimit.resetAt.toString()
  };

  return new Response(JSON.stringify({ user, token: user.id }), {
    status: 200,
    headers
  });
});

// Auth: Register (protected - only admin/manager can create users)
route('POST', '/api/auth/register', async (request, env) => {
  // SECURITY: Require authentication
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized - login required', 401);
  }

  // SECURITY: Only admin, director, manager, and department_head can create users
  if (authUser.role !== 'admin' && authUser.role !== 'director' && authUser.role !== 'manager' && authUser.role !== 'department_head') {
    return error('Only admin, director, manager, or department head can create users', 403);
  }

  const body = await request.json() as any;
  const { login, password, name, role = 'resident', phone, address, apartment, building_id, entrance, floor, specialization, branch, building } = body;

  if (!login || !password || !name) {
    return error('Login, password, and name required');
  }

  // SECURITY: Only super_admin can create admin accounts (directors cannot create admins)
  if (role === 'admin' && !isSuperAdmin(authUser)) {
    return error('Only super admin can create admin accounts', 403);
  }

  // SECURITY: Only admin can create director accounts
  if (role === 'director' && authUser.role !== 'admin') {
    return error('Only admin can create director accounts', 403);
  }

  // SECURITY: Only admin or director can create manager accounts (including advertiser)
  if (['manager', 'advertiser'].includes(role) && !isAdminLevel(authUser)) {
    return error('Only admin or director can create manager accounts', 403);
  }

  // SECURITY: Department head can only create executors of their own department
  if (authUser.role === 'department_head') {
    if (!isExecutorRole(role)) {
      return error('Department head can only create executors', 403);
    }
    if (specialization !== authUser.specialization) {
      return error('Department head can only create executors in their own department', 403);
    }
  }

  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE login = ? ${tenantId ? 'AND tenant_id = ?' : "AND (tenant_id IS NULL OR tenant_id = '')"}`
  ).bind(...[login.trim(), ...(tenantId ? [tenantId] : [])]).first();
  if (existing) {
    return error('Login already exists');
  }

  const id = generateId();
  const passwordHash = await hashPassword(password);

  // Store encrypted password only for staff roles (for admin convenience)
  const staffRoles = ['manager', 'department_head', 'executor', 'security', 'advertiser'];
  const passwordPlain = staffRoles.includes(role) ? await encryptPassword(password, env.ENCRYPTION_KEY) : null;

  await env.DB.prepare(`
    INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, login.trim(), passwordHash, passwordPlain, name, role, phone || null, address || null, apartment || null, building_id || null, entrance || null, floor || null, specialization || null, branch || null, building || null, tenantId).run();

  // Auto-create apartment record if resident has building_id + apartment number
  if (building_id && apartment && (role === 'resident' || role === 'tenant')) {
    try {
      const tenantId2 = getTenantId(request);
      const existingApt = await env.DB.prepare(
        `SELECT id FROM apartments WHERE building_id = ? AND number = ? ${tenantId2 ? 'AND tenant_id = ?' : ''}`
      ).bind(building_id, String(apartment), ...(tenantId2 ? [tenantId2] : [])).first() as any;

      if (!existingApt) {
        // Find entrance_id by entrance number
        let entranceId = null;
        if (entrance) {
          const ent = await env.DB.prepare(
            `SELECT id FROM entrances WHERE building_id = ? AND number = ? ${tenantId2 ? 'AND tenant_id = ?' : ''}`
          ).bind(building_id, parseInt(entrance), ...(tenantId2 ? [tenantId2] : [])).first() as any;
          if (ent) entranceId = ent.id;
        }

        const aptId = generateId();
        await env.DB.prepare(`
          INSERT INTO apartments (id, building_id, entrance_id, number, floor, status, primary_owner_id, tenant_id)
          VALUES (?, ?, ?, ?, ?, 'occupied', ?, ?)
        `).bind(aptId, building_id, entranceId, String(apartment), floor ? parseInt(floor) : null, id, tenantId2 || null).run();
      } else {
        // Update existing apartment owner
        await env.DB.prepare('UPDATE apartments SET primary_owner_id = ?, status = ? WHERE id = ?')
          .bind(id, 'occupied', existingApt.id).run();
      }
    } catch (e) {
      console.error('Auto-create apartment failed:', e);
    }
  }

  return json({ user: { id, login, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, password } }, 201);
});

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
      // UPDATE existing user with new data (building_id, apartment, address, etc.)
      await env.DB.prepare(`
        UPDATE users SET
          name = ?, address = ?, apartment = ?, building_id = ?, entrance = ?, floor = ?,
          updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        u.name, u.address || null, u.apartment || null, u.building_id || null,
        u.entrance || null, u.floor || null, existing.id
      ).run();

      // Also update password if provided
      if (u.password) {
        const passwordHash = await hashPassword(u.password);
        const encPwd = await encryptPassword(u.password, env.ENCRYPTION_KEY);
        await env.DB.prepare('UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?')
          .bind(passwordHash, encPwd, existing.id).run();
      }

      updated.push({ id: existing.id, login: u.login, name: u.name });
    } else {
      // CREATE new user
      const id = generateId();
      const rawPwd = u.password || 'kamizo';
      const passwordHash = await hashPassword(rawPwd);
      const encPwd = await encryptPassword(rawPwd, env.ENCRYPTION_KEY);

      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, address, apartment, building_id, entrance, floor, total_area, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id, u.login.trim(), passwordHash, encPwd, u.name, 'resident',
        u.phone || null, u.address || null, u.apartment || null, u.building_id || null, u.entrance || null, u.floor || null, u.total_area || null, getTenantId(request)
      ).run();

      created.push({ id, login: u.login, name: u.name });
    }

    // Link data to apartment: update total_area and create personal_account
    const userId = existing ? existing.id : created[created.length - 1]?.id;
    if (u.building_id && u.apartment && userId) {
      try {
        // Find apartment by number + building_id
        const apt = await env.DB.prepare(
          `SELECT id FROM apartments WHERE building_id = ? AND number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
        ).bind(u.building_id, String(u.apartment), ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;

        let aptId = apt?.id;

        if (apt) {
          // Update apartment total_area and primary_owner_id
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
          // Auto-create apartment if it doesn't exist
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
          // Create personal_account if login (Л/С) is provided and looks like a real account number
          const loginTrimmed = u.login?.trim();
          if (loginTrimmed && /^\d+$/.test(loginTrimmed)) {
            const existingAccount = await env.DB.prepare(
              `SELECT id FROM personal_accounts WHERE account_number = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
            ).bind(loginTrimmed, ...(bulkTenantId ? [bulkTenantId] : [])).first();

            if (!existingAccount) {
              const paId = generateId();
              await env.DB.prepare(`
                INSERT INTO personal_accounts (id, account_number, apartment_id, building_id, tenant_id)
                VALUES (?, ?, ?, ?, ?)
              `).bind(paId, loginTrimmed, aptId, u.building_id, bulkTenantId || null).run();

              // Link personal_account to apartment
              await env.DB.prepare(
                'UPDATE apartments SET personal_account_id = ? WHERE id = ?'
              ).bind(paId, aptId).run();
            }
          }
        }
      } catch (linkErr) {
        // Non-critical - don't fail the whole bulk operation
        console.error('Failed to link apartment data:', linkErr);
      }
    }
  }

  return json({ created, updated }, 201);
});

// Users: Get current user
route('GET', '/api/users/me', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  return json({ user });
});

// Users: Update profile
route('PATCH', '/api/users/me', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const updates = await request.json() as any;
  const allowed = ['phone', 'name', 'address', 'language'];
  const setClauses: string[] = [];
  const values: any[] = [];

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (setClauses.length === 0) return json({ user });

  setClauses.push('updated_at = datetime("now")');
  values.push(user.id);

  await env.DB.prepare(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`).bind(...values).run();

  // Fetch updated user
  const updatedUser = await env.DB.prepare(
    'SELECT id, login, phone, name, role, specialization, address, apartment, building_id, entrance, floor, total_area, password_changed_at, contract_signed_at FROM users WHERE id = ?'
  ).bind(user.id).first();

  return json({ user: updatedUser });
});

// Users: Mark contract as signed (for onboarding tracking)
route('POST', '/api/users/me/contract-signed', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  await env.DB.prepare('UPDATE users SET contract_signed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind(user.id).run();

  return json({ success: true, contract_signed_at: new Date().toISOString() });
});

// GET /api/contract/template - get tenant's custom contract template (.docx)
route('GET', '/api/contract/template', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('No tenant', 404);

  const tenant = await env.DB.prepare('SELECT contract_template FROM tenants WHERE id = ?').bind(tenantId).first() as any;
  if (!tenant || !tenant.contract_template) {
    return error('No custom template', 404);
  }

  // contract_template is stored as base64 data URL: "data:application/...;base64,XXXX"
  const base64Data = tenant.contract_template.split(',')[1] || tenant.contract_template;
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Response(bytes.buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': 'attachment; filename="contract_template.docx"',
      'Access-Control-Allow-Origin': '*',
    }
  });
});

// Users: Change password
route('POST', '/api/users/me/password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { current_password, new_password } = await request.json() as any;

  // Fetch current password hash
  const userWithHash = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(user.id).first() as any;

  if (!userWithHash) {
    return error('User not found', 404);
  }

  // Verify current password
  const isValid = await verifyPassword(current_password, userWithHash.password_hash);

  if (!isValid) {
    return error('Current password is incorrect', 400);
  }

  // Hash new password with PBKDF2
  const newHash = await hashPassword(new_password);
  await env.DB.prepare('UPDATE users SET password_hash = ?, password_changed_at = datetime("now"), updated_at = datetime("now") WHERE id = ?')
    .bind(newHash, user.id).run();

  return json({ success: true, password_changed_at: new Date().toISOString() });
});

// Users: Admin change password
route('POST', '/api/users/:id/password', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { new_password } = await request.json() as any;
  const newHash = await hashPassword(new_password);

  const tenantIdPwd = getTenantId(request);
  await env.DB.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ? ${tenantIdPwd ? 'AND tenant_id = ?' : ''}`).bind(newHash, params.id, ...(tenantIdPwd ? [tenantIdPwd] : [])).run();

  return json({ success: true });
});

// Users: List all users (admin/manager only)
route('GET', '/api/users', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const url = new URL(request.url);
  const role = url.searchParams.get('role');
  const building_id = url.searchParams.get('building_id');
  const pagination = getPaginationParams(url);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND tenant_id = ?';
    params.push(tenantId);
  }

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }
  if (building_id) {
    whereClause += ' AND building_id = ?';
    params.push(building_id);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT u.id, u.login, u.phone, u.name, u.role, u.specialization, u.address, u.apartment, u.building_id, u.entrance, u.floor, u.created_at,
           u.contract_signed_at, u.password_changed_at, u.last_login_at,
           (SELECT COUNT(*) FROM vehicles v WHERE v.user_id = u.id) as vehicle_count
    FROM users u
    ${whereClause}
    ORDER BY u.name
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ users: response.data, pagination: response.pagination });
});

// Users: Delete
route('DELETE', '/api/users/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDelUser = getTenantId(request);
  await env.DB.prepare(`DELETE FROM users WHERE id = ? ${tenantIdDelUser ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDelUser ? [tenantIdDelUser] : [])).run();
  return json({ success: true });
});

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
      u.name as owner_name, u.phone as owner_phone, u.login as owner_login,
      u.password_plain as owner_password
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
    ownerPassword: await decryptPassword(r.owner_password, env.ENCRYPTION_KEY),
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
      const encOwnerPwd = await encryptPassword(ownerPassword, env.ENCRYPTION_KEY);
      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(userId, ownerLogin.trim(), passwordHash, encOwnerPwd, finalOwnerName, ownerType, finalOwnerPhone || null, getTenantId(request)).run();

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
      const encOwnerPwd2 = await encryptPassword(ownerPassword, env.ENCRYPTION_KEY);
      await env.DB.prepare(`
        INSERT INTO users (id, login, password_hash, password_plain, name, role, phone, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(userId, ownerLogin.trim(), passwordHash2, encOwnerPwd2, ownerName || name, ownerType, ownerPhone || null, getTenantId(request)).run();
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

// ==================== CHAT ROUTES ====================

// Chat channels: List for user
// Оптимизировано: использует LEFT JOIN вместо множественных subqueries
route('GET', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let query: string;
  let params: any[];

  if (isManagement(user)) {
    // Admins/directors/managers see all channels with unread count
    // Оптимизировано: один JOIN для last_message вместо 4 subqueries
    // Добавлен JOIN с users, buildings и branches для получения информации о жителе
    query = `
      SELECT c.*,
        COALESCE(stats.message_count, 0) as message_count,
        lm.content as last_message,
        lm.created_at as last_message_at,
        lm.sender_id as last_sender_id,
        COALESCE(unread.cnt, 0) as unread_count,
        ru.apartment as resident_apartment,
        rb.name as resident_building_name,
        rbr.name as resident_branch_name
      FROM chat_channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as message_count FROM chat_messages GROUP BY channel_id
      ) stats ON stats.channel_id = c.id
      LEFT JOIN (
        SELECT m1.* FROM chat_messages m1
        INNER JOIN (
          SELECT channel_id, MAX(created_at) as max_date FROM chat_messages GROUP BY channel_id
        ) m2 ON m1.channel_id = m2.channel_id AND m1.created_at = m2.max_date
      ) lm ON lm.channel_id = c.id
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as cnt FROM chat_messages
        WHERE sender_id != ? AND id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        GROUP BY channel_id
      ) unread ON unread.channel_id = c.id
      LEFT JOIN users ru ON c.resident_id = ru.id
      LEFT JOIN buildings rb ON ru.building_id = rb.id
      LEFT JOIN branches rbr ON rb.branch_id = rbr.id
      ${tenantId ? 'WHERE c.tenant_id = ?' : ''}
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 100
    `;
    params = [user.id, user.id, ...(tenantId ? [tenantId] : [])];
  } else {
    // Regular users see their channels
    query = `
      SELECT c.*,
        COALESCE(stats.message_count, 0) as message_count,
        lm.content as last_message,
        lm.created_at as last_message_at
      FROM chat_channels c
      LEFT JOIN (
        SELECT channel_id, COUNT(*) as message_count FROM chat_messages GROUP BY channel_id
      ) stats ON stats.channel_id = c.id
      LEFT JOIN (
        SELECT m1.* FROM chat_messages m1
        INNER JOIN (
          SELECT channel_id, MAX(created_at) as max_date FROM chat_messages GROUP BY channel_id
        ) m2 ON m1.channel_id = m2.channel_id AND m1.created_at = m2.max_date
      ) lm ON lm.channel_id = c.id
      WHERE (c.type = 'uk_general'
        OR c.resident_id = ?
        OR c.building_id = ?
        OR c.id IN (SELECT channel_id FROM chat_participants WHERE user_id = ?))
      ${tenantId ? 'AND c.tenant_id = ?' : ''}
      ORDER BY lm.created_at DESC NULLS LAST
      LIMIT 50
    `;
    params = [user.id, user.building_id, user.id, ...(tenantId ? [tenantId] : [])];
  }

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ channels: results });
});

// ==================== Notes API ====================

// Notes: Get all notes for current user
route('GET', '/api/notes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT id, title, content, created_at, updated_at
    FROM notes
    WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    ORDER BY updated_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ notes: results });
});

// Notes: Create a new note
route('POST', '/api/notes', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as { title: string; content?: string };

  if (!body.title?.trim()) {
    return error('Title is required');
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO notes (id, user_id, title, content, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, user.id, body.title.trim(), body.content || '', getTenantId(request), now, now).run();

  return json({
    note: {
      id,
      title: body.title.trim(),
      content: body.content || '',
      created_at: now,
      updated_at: now
    }
  });
});

// Notes: Update a note
route('PUT', '/api/notes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const noteId = params?.id;
  if (!noteId) return error('Note ID required');

  // Check ownership
  const existing = await env.DB.prepare(
    `SELECT id FROM notes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(noteId, user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existing) {
    return error('Note not found or access denied', 404);
  }

  const body = await request.json() as { title?: string; content?: string };

  if (!body.title?.trim()) {
    return error('Title is required');
  }

  const now = new Date().toISOString();

  await env.DB.prepare(`
    UPDATE notes SET title = ?, content = ?, updated_at = ?
    WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.title.trim(), body.content || '', now, noteId, user.id, ...(tenantId ? [tenantId] : [])).run();

  return json({
    note: {
      id: noteId,
      title: body.title.trim(),
      content: body.content || '',
      updated_at: now
    }
  });
});

// Notes: Delete a note
route('DELETE', '/api/notes/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  const tenantId = getTenantId(request);

  const noteId = params?.id;
  if (!noteId) return error('Note ID required');

  // Check ownership and delete
  const result = await env.DB.prepare(
    `DELETE FROM notes WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(noteId, user.id, ...(tenantId ? [tenantId] : [])).run();

  if (result.meta.changes === 0) {
    return error('Note not found or access denied', 404);
  }

  return json({ success: true });
});

// Chat: Get or create private support channel
route('POST', '/api/chat/channels/support', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only residents can create support channels
  if (user.role !== 'resident') {
    return error('Only residents can create support channels', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if channel exists
  let channel = await env.DB.prepare(
    `SELECT * FROM chat_channels WHERE type = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind('private_support', user.id, ...(tenantId ? [tenantId] : [])).first();

  if (!channel) {
    const id = generateId();
    // MULTI-TENANCY: Add tenant_id on creation
    await env.DB.prepare(`
      INSERT INTO chat_channels (id, type, name, description, resident_id, tenant_id)
      VALUES (?, 'private_support', ?, ?, ?, ?)
    `).bind(id, user.name, user.apartment ? `кв. ${user.apartment}` : 'Личный чат', user.id, getTenantId(request)).run();

    channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  }

  return json(channel);
});

// Chat messages: List for channel
route('GET', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
  const before = url.searchParams.get('before'); // message ID for pagination

  // MULTI-TENANCY: Verify channel belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const ch = await env.DB.prepare('SELECT id FROM chat_channels WHERE id = ? AND tenant_id = ?').bind(channelId, tenantId).first();
    if (!ch) return error('Channel not found', 404);
  }

  // Get messages with read_by info - with pagination support
  let query = `
    SELECT m.*, u.name as sender_name, u.role as sender_role,
      (SELECT GROUP_CONCAT(user_id) FROM chat_message_reads WHERE message_id = m.id) as read_by_str
    FROM chat_messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.channel_id = ?`;

  const bindParams: any[] = [channelId];

  // If 'before' is provided, get messages before that message ID
  if (before) {
    query += ` AND m.created_at < (SELECT created_at FROM chat_messages WHERE id = ?)`;
    bindParams.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT ?`;
  bindParams.push(limit);

  const { results: messages } = await env.DB.prepare(query).bind(...bindParams).all();

  // Reverse to get chronological order (newest last)
  const orderedMessages = (messages || []).reverse();

  // Convert read_by_str to array
  const messagesWithReadBy = orderedMessages.map((m: any) => ({
    ...m,
    read_by: m.read_by_str ? m.read_by_str.split(',') : []
  }));

  // Mark as read (exclude own messages)
  // For management users: mark as read for ALL management users (shared read status)
  if (isManagement(user)) {
    // Get the channel to check if it's private_support
    const channel = await env.DB.prepare('SELECT type FROM chat_channels WHERE id = ?').bind(channelId).first() as { type: string } | null;

    if (channel?.type === 'private_support') {
      // Mark messages as read for ALL management users at once (optimized single query)
      // Uses CROSS JOIN to create all combinations of messages x management users
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT m.id, u.id
        FROM chat_messages m
        CROSS JOIN users u
        WHERE m.channel_id = ?
          AND u.role IN ('admin', 'director', 'manager', 'department_head')
          ${tenantId ? 'AND u.tenant_id = ?' : ''}
          AND m.sender_id NOT IN (SELECT id FROM users WHERE role IN ('admin', 'director', 'manager', 'department_head'))
      `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();
    } else {
      // Regular marking for non-support channels
      await env.DB.prepare(`
        INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
        SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
      `).bind(user.id, channelId, user.id).run();
    }
  } else {
    // Regular user: mark only for themselves
    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
      SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
    `).bind(user.id, channelId, user.id).run();
  }

  return json({ messages: messagesWithReadBy });
});

// Chat messages: Send
route('POST', '/api/chat/channels/:id/messages', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { content } = await request.json() as { content: string };
  if (!content) return error('Content required');
  if (content.length > 5000) return error('Message too long (max 5000 characters)');

  const tenantId = getTenantId(request);
  const id = generateId();
  const channelId = params.id;

  try {
    // MULTI-TENANCY: Add tenant_id on creation
    await env.DB.prepare(`
      INSERT INTO chat_messages (id, channel_id, sender_id, content, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, channelId, user.id, content, getTenantId(request)).run();
  } catch (e: any) {
    console.error('Failed to insert chat message:', e);
    return error(`Failed to send message: ${e.message || 'Database error'}`, 500);
  }

  const created_at = new Date().toISOString();
  const message = {
    id,
    channel_id: channelId,
    sender_id: user.id,
    sender_name: user.name,
    sender_role: user.role,
    content,
    created_at
  };

  // Send WebSocket notification for real-time chat
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);

    // Get channel info to determine recipient
    const channel = await env.DB.prepare(
      `SELECT * FROM chat_channels WHERE id = ?${tenantId ? ' AND tenant_id = ?' : ''}`
    ).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as any;

    if (channel) {
      // Build channels list for WebSocket routing
      const channels: string[] = [`chat:channel:${channelId}`];

      if (channel.type === 'private_support') {
        // Notify admin/managers and the resident
        channels.push('chat:all'); // admins/managers
        if (channel.resident_id) {
          channels.push(`chat:user:${channel.resident_id}`);
        }

        // Send push notification to recipient (resident or manager)
        // If sender is manager/admin, notify resident
        // If sender is resident, notify managers
        if (['manager', 'admin', 'department_head'].includes(user.role) && channel.resident_id) {
          // UK отвечает жителю
          sendPushNotification(env, channel.resident_id, {
            title: '💬 Ответ от УК',
            body: content.length > 100 ? content.substring(0, 100) + '...' : content,
            type: 'chat_message',
            tag: `chat-${channelId}`,
            data: { channelId, url: '/chat' },
            requireInteraction: false
          }).catch(() => {});
        } else if (user.role === 'resident') {
          // Житель пишет в УК - уведомляем менеджеров
          const { results: managers } = await env.DB.prepare(
            `SELECT id FROM users WHERE role IN ('manager', 'admin') AND is_active = 1`
          ).all();

          for (const mgr of (managers || []) as any[]) {
            sendPushNotification(env, mgr.id, {
              title: '💬 Новое сообщение от жителя',
              body: `${user.name}: ${content.length > 80 ? content.substring(0, 80) + '...' : content}`,
              type: 'chat_message',
              tag: `chat-${channelId}`,
              data: { channelId, url: '/chat' },
              requireInteraction: false
            }).catch(() => {});
          }
        }
      } else {
        // Group chat - notify all subscribers via WebSocket
        channels.push('chat:all');

        // Send push notifications to group chat participants (except sender)
        // For building_general, notify residents of that building
        if (channel.type === 'building_general' && channel.building_id) {
          const { results: residents } = await env.DB.prepare(
            `SELECT id FROM users WHERE building_id = ? AND id != ? AND role = 'resident' AND is_active = 1 LIMIT 100`
          ).bind(channel.building_id, user.id).all();

          // Send in batches to avoid blocking
          const BATCH = 10;
          for (let i = 0; i < (residents?.length || 0); i += BATCH) {
            const batch = (residents || []).slice(i, i + BATCH) as any[];
            Promise.all(batch.map(r =>
              sendPushNotification(env, r.id, {
                title: `💬 ${channel.name || 'Чат дома'}`,
                body: `${user.name}: ${content.length > 60 ? content.substring(0, 60) + '...' : content}`,
                type: 'chat_message',
                tag: `chat-group-${channelId}`,
                data: { channelId, url: '/chat' },
                requireInteraction: false
              }).catch(() => {})
            ));
          }
        }
      }

      await connManager.fetch('http://internal/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'chat_message',
          data: { message },
          channels
        })
      });
    }
  } catch (e) {
    console.error('Failed to send chat WebSocket notification:', e);
  }

  return json({ message }, 201);
});

// Chat: Create channel (general)
route('POST', '/api/chat/channels', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { type, name, description, building_id } = body;

  if (!type || !name) {
    return error('Type and name required');
  }

  const id = generateId();
  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO chat_channels (id, type, name, description, building_id, created_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, type, name, description || null, building_id || null, user.id, getTenantId(request)).run();

  const channel = await env.DB.prepare('SELECT * FROM chat_channels WHERE id = ?').bind(id).first();
  return json({ channel }, 201);
});

// Chat: Mark channel as read
route('POST', '/api/chat/channels/:id/read', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const channelId = params.id;
  const tenantId = getTenantId(request);

  // Get the channel to check if it's private_support (with tenant filter)
  const channel = await env.DB.prepare(`SELECT type FROM chat_channels WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(channelId, ...(tenantId ? [tenantId] : [])).first() as { type: string } | null;

  if (isManagement(user) && channel?.type === 'private_support') {
    // For management users reading private_support: mark as read for ALL management users
    // Optimized: use single queries with CROSS JOIN instead of loop

    // Update last_read_at for all management users at once
    await env.DB.prepare(`
      INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
      SELECT ?, id, datetime('now') FROM users WHERE role IN ('admin', 'director', 'manager') ${tenantId ? 'AND tenant_id = ?' : ''}
      ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
    `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();

    // Mark all messages as read for all management users at once
    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
      SELECT m.id, u.id
      FROM chat_messages m
      CROSS JOIN users u
      WHERE m.channel_id = ?
        AND u.role IN ('admin', 'director', 'manager')
        ${tenantId ? 'AND u.tenant_id = ?' : ''}
        AND m.sender_id NOT IN (SELECT id FROM users WHERE role IN ('admin', 'director', 'manager'))
    `).bind(channelId, ...(tenantId ? [tenantId] : [])).run();
  } else {
    // Regular user or non-support channel: mark only for themselves
    await env.DB.prepare(`
      INSERT INTO chat_channel_reads (channel_id, user_id, last_read_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(channel_id, user_id) DO UPDATE SET last_read_at = datetime('now')
    `).bind(channelId, user.id).run();

    await env.DB.prepare(`
      INSERT OR IGNORE INTO chat_message_reads (message_id, user_id)
      SELECT id, ? FROM chat_messages WHERE channel_id = ? AND sender_id != ?
    `).bind(user.id, channelId, user.id).run();
  }

  // Send read receipt via WebSocket
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);

    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'chat_read',
        data: {
          channel_id: channelId,
          user_id: user.id,
          user_name: user.name
        },
        channels: [`chat:channel:${channelId}`]
      })
    });
  } catch (e) {
    console.error('Failed to send read receipt:', e);
  }

  return json({ success: true });
});

// Chat: Get unread count for sidebar badge
route('GET', '/api/chat/unread-count', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let count = 0;

  if (isManagement(user)) {
    // Count unread messages from all private_support channels
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE c.type = 'private_support'
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        ${tenantId ? 'AND c.tenant_id = ?' : ''}
    `).bind(user.id, user.id, ...(tenantId ? [tenantId] : [])).first();
    count = (result as any)?.count || 0;
  } else if (user.role === 'resident') {
    // Count unread messages in resident's support channel
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM chat_messages m
      JOIN chat_channels c ON m.channel_id = c.id
      WHERE c.type = 'private_support'
        AND c.resident_id = ?
        AND m.sender_id != ?
        AND m.id NOT IN (SELECT message_id FROM chat_message_reads WHERE user_id = ?)
        ${tenantId ? 'AND c.tenant_id = ?' : ''}
    `).bind(user.id, user.id, user.id, ...(tenantId ? [tenantId] : [])).first();
    count = (result as any)?.count || 0;
  }

  return json({ unread_count: count });
});

// ==================== ANNOUNCEMENTS ROUTES ====================

// Announcements: List
route('GET', '/api/announcements', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const pagination = getPaginationParams(url);
  const tenantId = getTenantId(request);

  let whereClause: string;
  let params: any[] = [];

  if (isManagement(user)) {
    // Admins/directors/managers see all
    whereClause = `WHERE 1=1 ${tenantId ? 'AND tenant_id = ?' : ''}`;
    if (tenantId) params.push(tenantId);
  } else if (user.role === 'resident') {
    // Residents see announcements targeted to them
    // Logic:
    // 1. Show ALL announcements with target_type = NULL, '', 'all' (universal announcements)
    // 2. Show BRANCH-specific if user's building is in that branch
    // 3. Show BUILDING-specific if user has building_id and it matches
    // 4. Show ENTRANCE-specific if user's building AND entrance match
    // 5. Show FLOOR-specific if user's building, entrance AND floor match
    // 6. Show CUSTOM if user's login is in the list (exact match with delimiters)

    const hasBuilding = user.building_id !== null && user.building_id !== undefined;
    const userEntrance = user.entrance || null;
    const userFloor = user.floor || null;

    // Get user's branch code from their building
    let userBranchCode: string | null = null;
    if (hasBuilding) {
      const buildingInfo = await env.DB.prepare(
        `SELECT branch_code FROM buildings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
      ).bind(user.building_id, ...(tenantId ? [tenantId] : [])).first() as any;
      userBranchCode = buildingInfo?.branch_code || null;
    }

    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'residents' OR type = 'all')
        ${tenantId ? 'AND tenant_id = ?' : ''}
        AND (
          target_type IS NULL
          OR target_type = ''
          OR target_type = 'all'
          ${userBranchCode ? `OR (target_type = 'branch' AND target_branch = ?)` : ''}
          ${hasBuilding ? `OR (target_type = 'building' AND target_building_id = ?)` : ''}
          ${hasBuilding && userEntrance ? `OR (target_type = 'entrance' AND target_building_id = ? AND target_entrance = ?)` : ''}
          ${hasBuilding && userEntrance && userFloor ? `OR (target_type = 'floor' AND target_building_id = ? AND target_entrance = ? AND target_floor = ?)` : ''}
          OR (target_type = 'custom' AND ((',' || target_logins || ',') LIKE ? OR (',' || target_logins || ',') LIKE ?))
        )
    `;

    params = [];
    if (tenantId) params.push(tenantId);
    if (userBranchCode) params.push(userBranchCode);
    if (hasBuilding) params.push(user.building_id);
    if (hasBuilding && userEntrance) {
      params.push(user.building_id, userEntrance);
    }
    if (hasBuilding && userEntrance && userFloor) {
      params.push(user.building_id, userEntrance, userFloor);
    }
    // For target_type = 'custom' - match by login OR apartment number
    params.push(`%,${user.login || ''},%`);
    params.push(`%,${user.apartment || ''},%`);
  } else {
    // Employees (executors, department_heads) see employee announcements
    whereClause = `
      WHERE is_active = 1
        AND (expires_at IS NULL OR expires_at > datetime('now'))
        AND (type = 'employees' OR type = 'staff' OR type = 'all')
        ${tenantId ? 'AND tenant_id = ?' : ''}
    `;
    if (tenantId) params.push(tenantId);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM announcements ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data with view counts
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT a.*,
      (SELECT COUNT(*) FROM announcement_views WHERE announcement_id = a.id ${tenantId ? 'AND tenant_id = ?' : ''}) as view_count,
      (SELECT name FROM users WHERE id = a.created_by ${tenantId ? 'AND tenant_id = ?' : ''}) as author_name
    FROM announcements a
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const subqueryTenantIds = tenantId ? [tenantId, tenantId] : [];
  // IMPORTANT: subquery ?s appear in SELECT (before WHERE), so they must be bound FIRST
  const { results } = await env.DB.prepare(dataQuery).bind(...subqueryTenantIds, ...params, pagination.limit, offset).all();

  // For current user, check which announcements they've viewed
  const announcementIds = (results as any[]).map(a => a.id);
  let viewedByUser: Set<string> = new Set();

  if (announcementIds.length > 0) {
    const placeholders = announcementIds.map(() => '?').join(',');
    const { results: views } = await env.DB.prepare(
      `SELECT announcement_id FROM announcement_views WHERE user_id = ? AND announcement_id IN (${placeholders}) ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(user.id, ...announcementIds, ...(tenantId ? [tenantId] : [])).all();
    viewedByUser = new Set((views as any[]).map(v => v.announcement_id));
  }

  // Add viewed_by_user flag to each announcement and apply personalized content for residents
  const enrichedResults = (results as any[]).map(a => {
    let content = a.content;

    // For residents, apply personalized content if available
    if (user.role === 'resident' && a.personalized_data) {
      try {
        const personalizedData = typeof a.personalized_data === 'string'
          ? JSON.parse(a.personalized_data)
          : a.personalized_data;

        const userData = personalizedData[user.login];
        if (userData) {
          content = content
            .replace(/\{name\}/g, userData.name || user.name || '')
            .replace(/\{debt\}/g, (userData.debt || 0).toLocaleString('ru-RU'));
        }
      } catch (e) {
        console.error('Error parsing personalized_data:', e);
      }
    }

    return {
      ...a,
      content,
      viewed_by_user: viewedByUser.has(a.id),
      personalized_data: user.role === 'resident' ? undefined : a.personalized_data
    };
  });

  const response = createPaginatedResponse(enrichedResults, total || 0, pagination);

  return json({ announcements: response.data, pagination: response.pagination });
});

// Announcements: Create
route('POST', '/api/announcements', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments ? JSON.stringify(body.attachments) : null;
  // Handle personalized data for debt-based announcements (JSON object)
  const personalizedData = body.personalized_data ? JSON.stringify(body.personalized_data) : null;

  await env.DB.prepare(`
    INSERT INTO announcements (id, title, content, type, target_type, target_branch, target_building_id, target_entrance, target_floor, target_logins, priority, expires_at, attachments, personalized_data, created_by, created_at, updated_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
  `).bind(
    id, body.title, body.content, body.type || 'residents',
    body.target_type || 'all', body.target_branch || null, body.target_building_id || null,
    body.target_entrance || null, body.target_floor || null,
    body.target_logins || null, body.priority || 'normal',
    body.expires_at || null, attachments, personalizedData, authUser.id, getTenantId(request)
  ).run();

  // Send push notifications to target users
  const isUrgent = body.priority === 'urgent';
  const icon = isUrgent ? '🚨' : '📢';
  const targetType = body.target_type || 'all';

  // Get target users based on target_type and announcement type
  const tenantIdForPush = getTenantId(request);
  let targetUsers: any[] = [];

  if (body.type === 'residents' || body.type === 'all') {
    // Build query based on target_type
    let query = `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 ${tenantIdForPush ? 'AND tenant_id = ?' : ''}`;
    const params: any[] = tenantIdForPush ? [tenantIdForPush] : [];

    if (targetType === 'branch' && body.target_branch) {
      // Get all buildings in this branch, then get residents in those buildings
      query = `SELECT u.id FROM users u
               INNER JOIN buildings b ON u.building_id = b.id
               WHERE u.role = 'resident' AND u.is_active = 1 AND b.branch_code = ? ${tenantIdForPush ? 'AND u.tenant_id = ?' : ''}`;
      // Reset params for the new query
      params.length = 0;
      params.push(body.target_branch);
      if (tenantIdForPush) params.push(tenantIdForPush);
    } else if (targetType === 'building' && body.target_building_id) {
      query += ' AND building_id = ?';
      params.push(body.target_building_id);
    } else if (targetType === 'entrance' && body.target_building_id && body.target_entrance) {
      query += ' AND building_id = ? AND entrance = ?';
      params.push(body.target_building_id, body.target_entrance);
    } else if (targetType === 'floor' && body.target_building_id && body.target_entrance && body.target_floor) {
      query += ' AND building_id = ? AND entrance = ? AND floor = ?';
      params.push(body.target_building_id, body.target_entrance, body.target_floor);
    } else if (targetType === 'custom' && body.target_logins) {
      // Custom targeting by specific logins
      const logins = body.target_logins.split(',').map((l: string) => l.trim()).filter(Boolean);
      if (logins.length > 0) {
        const placeholders = logins.map(() => '?').join(',');
        query += ` AND login IN (${placeholders})`;
        params.push(...logins);
      }
    }
    // For 'all' - no additional filters

    const { results } = await env.DB.prepare(query).bind(...params).all();
    targetUsers = results as any[];
  }

  if (body.type === 'employees' || body.type === 'staff' || body.type === 'all') {
    // Get active staff members (executors, department_heads)
    const { results } = await env.DB.prepare(
      `SELECT id FROM users WHERE role IN ('executor', 'department_head') AND is_active = 1 ${tenantIdForPush ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantIdForPush ? [tenantIdForPush] : [])).all();
    targetUsers = [...targetUsers, ...(results as any[])];
  }

  // Send push to all target users (in parallel batches for performance)
  const BATCH_SIZE = 10;
  for (let i = 0; i < targetUsers.length; i += BATCH_SIZE) {
    const batch = targetUsers.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(targetUser =>
      sendPushNotification(env, targetUser.id, {
        title: `${icon} ${body.title}`,
        body: body.content.substring(0, 200) + (body.content.length > 200 ? '...' : ''),
        type: 'announcement',
        tag: `announcement-${id}`,
        data: {
          announcementId: id,
          priority: body.priority,
          targetType: targetType,
          url: '/announcements'
        },
        requireInteraction: isUrgent,
        skipInApp: true // In-app notifications created below with proper tenant_id
      }).catch(err => console.error(`[Push] Failed for user ${targetUser.id}:`, err))
    ));
  }

  console.log(`[Announcement] Created announcement ${id}, sent push to ${targetUsers.length} users`);

  // Create in-app notifications for target users
  const notificationId = generateId();
  const notificationTitle = `${icon} ${body.title}`;
  const notificationBody = body.content.substring(0, 200) + (body.content.length > 200 ? '...' : '');

  for (const targetUser of targetUsers) {
    try {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, title, body, type, data, tenant_id)
        VALUES (?, ?, ?, ?, 'announcement', ?, ?)
      `).bind(
        `${notificationId}-${targetUser.id}`,
        targetUser.id,
        notificationTitle,
        notificationBody,
        JSON.stringify({ announcementId: id, url: '/announcements' }),
        getTenantId(request)
      ).run();
    } catch (err) {
      console.error(`[Notification] Failed to create for user ${targetUser.id}:`, err);
    }
  }

  // Invalidate cache and broadcast WebSocket update
  invalidateCache('announcements:');

  try {
    const stub = env.CONNECTION_MANAGER.get(env.CONNECTION_MANAGER.idFromName('global'));
    await stub.fetch('https://internal/invalidate-cache', {
      method: 'POST',
      body: JSON.stringify({ prefix: 'announcements:' })
    });
  } catch (err) {
    console.error('[WebSocket] Failed to broadcast announcement update:', err);
  }

  return json({ id }, 201);
});

// Announcements: Update
route('PUT', '/api/announcements/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;

  // Handle attachments (JSON array of {name, url, type, size})
  const attachments = body.attachments !== undefined
    ? (body.attachments ? JSON.stringify(body.attachments) : null)
    : undefined;

  const tenantIdUpd = getTenantId(request);
  await env.DB.prepare(`
    UPDATE announcements
    SET title = COALESCE(?, title),
        content = COALESCE(?, content),
        type = COALESCE(?, type),
        priority = COALESCE(?, priority),
        target_type = ?,
        target_building_id = ?,
        target_logins = ?,
        expires_at = ?,
        attachments = COALESCE(?, attachments),
        updated_at = datetime('now')
    WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.title || null,
    body.content || null,
    body.type || null,
    body.priority || null,
    body.target_type || 'all',
    body.target_building_id || null,
    body.target_logins || null,
    body.expires_at || null,
    attachments,
    params.id,
    ...(tenantIdUpd ? [tenantIdUpd] : [])
  ).run();

  invalidateCache('announcements:');
  const updated = await env.DB.prepare(`SELECT * FROM announcements WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdUpd ? [tenantIdUpd] : [])).first();
  return json({ announcement: updated });
});

// Announcements: Delete
route('DELETE', '/api/announcements/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantIdDel = getTenantId(request);
  await env.DB.prepare(`DELETE FROM announcements WHERE id = ? ${tenantIdDel ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdDel ? [tenantIdDel] : [])).run();
  invalidateCache('announcements:');
  return json({ success: true });
});

// Announcements: Mark as viewed
route('POST', '/api/announcements/:id/view', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdView = getTenantId(request);

  // Check if already viewed
  const existing = await env.DB.prepare(
    `SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ? ${tenantIdView ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, user.id, ...(tenantIdView ? [tenantIdView] : [])).first();

  if (!existing) {
    const id = generateId();
    await env.DB.prepare(
      'INSERT INTO announcement_views (id, announcement_id, user_id, tenant_id) VALUES (?, ?, ?, ?)'
    ).bind(id, announcementId, user.id, getTenantId(request)).run();
  }

  return json({ success: true });
});

// Announcements: Get view count and viewers list with statistics
route('GET', '/api/announcements/:id/views', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const announcementId = params.id;
  const tenantIdViews = getTenantId(request);

  // Get announcement details for targeting
  const announcement = await env.DB.prepare(
    `SELECT * FROM announcements WHERE id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).first() as any;

  if (!announcement) {
    return error('Announcement not found', 404);
  }

  // Get total view count
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM announcement_views WHERE announcement_id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).first() as any;

  const viewCount = countResult?.count || 0;

  // Calculate target audience size based on targeting
  let targetAudienceSize = 0;
  let targetAudienceQuery = `SELECT COUNT(*) as count FROM users WHERE role = 'resident' ${tenantIdViews ? 'AND tenant_id = ?' : ''}`;
  const queryParams: any[] = tenantIdViews ? [tenantIdViews] : [];

  if (announcement.target_type === 'building' && announcement.target_building_id) {
    targetAudienceQuery += ' AND building_id = ?';
    queryParams.push(announcement.target_building_id);
  } else if (announcement.target_type === 'custom' && announcement.target_logins) {
    const logins = announcement.target_logins.split(',').filter(Boolean);
    if (logins.length > 0) {
      const placeholders = logins.map(() => '?').join(',');
      targetAudienceQuery += ` AND login IN (${placeholders})`;
      queryParams.push(...logins);
    }
  }
  // For 'all' or no targeting - count all residents in this tenant

  const audienceResult = await env.DB.prepare(targetAudienceQuery).bind(...queryParams).first() as any;
  targetAudienceSize = audienceResult?.count || 0;

  // Calculate percentage
  const viewPercentage = targetAudienceSize > 0 ? Math.round((viewCount / targetAudienceSize) * 100) : 0;

  // For admin/director/manager - also get list of viewers
  let viewers: any[] = [];
  if (isManagement(user)) {
    const { results } = await env.DB.prepare(`
      SELECT u.id, u.name, u.login, u.apartment, u.address, av.viewed_at
      FROM announcement_views av
      JOIN users u ON av.user_id = u.id
      WHERE av.announcement_id = ? ${tenantIdViews ? 'AND av.tenant_id = ?' : ''}
      ORDER BY av.viewed_at DESC
      LIMIT 100
    `).bind(announcementId, ...(tenantIdViews ? [tenantIdViews] : [])).all();
    viewers = results as any[];
  }

  // Check if current user has viewed
  const userViewed = await env.DB.prepare(
    `SELECT id FROM announcement_views WHERE announcement_id = ? AND user_id = ? ${tenantIdViews ? 'AND tenant_id = ?' : ''}`
  ).bind(announcementId, user.id, ...(tenantIdViews ? [tenantIdViews] : [])).first();

  return json({
    count: viewCount,
    targetAudienceSize,
    viewPercentage,
    viewers,
    userViewed: !!userViewed
  });
});

// ==================== EXECUTORS/EMPLOYEES ROUTES ====================

// Team: Get all staff (managers, department_heads, executors) - Admin and Director
// Оптимизировано: добавлены LIMIT и кэширование для 5000+ пользователей
route('GET', '/api/team', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get('role'); // 'admin', 'manager', 'department_head', 'executor'
  const search = url.searchParams.get('search');

  // Build WHERE clause - include admin role for director to see admins
  let whereClause = "WHERE u.role IN ('admin', 'manager', 'department_head', 'executor', 'advertiser')";
  const params: any[] = [];

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND u.tenant_id = ?';
    params.push(tenantId);
  }

  if (roleFilter) {
    whereClause += ' AND u.role = ?';
    params.push(roleFilter);
  }

  if (search && search.length >= 2) {
    whereClause += ' AND (u.name LIKE ? OR u.phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  // Get all staff with stats (limited to 500 max for performance)
  // Include password_plain for admin convenience
  const { results: staff } = await env.DB.prepare(`
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.is_active, u.created_at,
      u.password_plain as password,
      COALESCE(stats.completed_count, 0) as completed_count,
      COALESCE(stats.active_count, 0) as active_count,
      COALESCE(stats.avg_rating, 0) as avg_rating
    FROM users u
    LEFT JOIN (
      SELECT
        executor_id,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as active_count,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1) as avg_rating
      FROM requests
      ${tenantId ? 'WHERE tenant_id = ?' : ''}
      GROUP BY executor_id
    ) stats ON stats.executor_id = u.id
    ${whereClause}
    ORDER BY
      CASE u.role
        WHEN 'admin' THEN 0
        WHEN 'manager' THEN 1
        WHEN 'advertiser' THEN 1
        WHEN 'department_head' THEN 2
        WHEN 'executor' THEN 3
      END,
      u.name
    LIMIT 500
  `).bind(...(tenantId ? [tenantId] : []), ...params).all();

  // Decrypt passwords for display
  for (const s of staff as any[]) {
    if (s.password) s.password = await decryptPassword(s.password, env.ENCRYPTION_KEY);
  }

  // Group by role (advertiser is a manager subtype)
  const admins = staff.filter((s: any) => s.role === 'admin');
  const managers = staff.filter((s: any) => ['manager', 'advertiser'].includes(s.role));
  const departmentHeads = staff.filter((s: any) => s.role === 'department_head');
  const executors = staff.filter((s: any) => s.role === 'executor');

  return json({
    admins,
    managers,
    departmentHeads,
    executors,
    total: staff.length
  });
});

// Team: Get single staff member by ID (for live data refresh with password)
route('GET', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const staff = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at, password_plain as password
    FROM users
    WHERE id = ? AND role IN ('admin', 'manager', 'department_head', 'executor', 'director', 'advertiser')
      ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!staff) {
    return error('Staff member not found', 404);
  }

  // Decrypt password for display
  if ((staff as any).password) {
    (staff as any).password = await decryptPassword((staff as any).password, env.ENCRYPTION_KEY);
  }

  return json({ user: staff });
});

// Admin: Update any user's password (admin only)
route('POST', '/api/admin/reset-password', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can reset passwords', 403);

  const body = await request.json() as any;
  const { login, password } = body;

  if (!login || !password) {
    return error('Login and password are required');
  }

  // Find user by login (tenant-filtered)
  const tenantIdReset = getTenantId(request);
  const targetUser = await env.DB.prepare(
    `SELECT id, login, name, role FROM users WHERE login = ? ${tenantIdReset ? 'AND tenant_id = ?' : ''}`
  ).bind(login, ...(tenantIdReset ? [tenantIdReset] : [])).first() as any;

  if (!targetUser) {
    return error('User not found', 404);
  }

  // Hash and update password (encrypted)
  const hashedPassword = await hashPassword(password);
  const encResetPwd = await encryptPassword(password, env.ENCRYPTION_KEY);
  await env.DB.prepare(`
    UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ? ${tenantIdReset ? 'AND tenant_id = ?' : ''}
  `).bind(hashedPassword, encResetPwd, targetUser.id, ...(tenantIdReset ? [tenantIdReset] : [])).run();

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    success: true,
    message: `Password updated for ${targetUser.name}`,
    user: { login: targetUser.login, name: targetUser.name, role: targetUser.role }
  });
});

// Team: Update staff member
route('PATCH', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.name) { updates.push('name = ?'); values.push(body.name); }
  if (body.phone) { updates.push('phone = ?'); values.push(body.phone); }
  if (body.login) { updates.push('login = ?'); values.push(body.login); }
  // Hash password and also store plain version for admin convenience
  if (body.password) {
    const hashedPassword = await hashPassword(body.password);
    updates.push('password_hash = ?');
    values.push(hashedPassword);
    // Store encrypted password for staff roles (admin convenience)
    const encTeamPwd = await encryptPassword(body.password, env.ENCRYPTION_KEY);
    updates.push('password_plain = ?');
    values.push(encTeamPwd);
  }
  if (body.specialization) { updates.push('specialization = ?'); values.push(body.specialization); }
  if (body.status) { updates.push('status = ?'); values.push(body.status); }

  if (updates.length === 0) {
    return error('No fields to update');
  }

  // MULTI-TENANCY: Only update users from same tenant
  const tenantId = getTenantId(request);
  values.push(params.id);
  if (tenantId) {
    values.push(tenantId);
  }

  await env.DB.prepare(`
    UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(...values).run();

  // Инвалидируем кэш
  await invalidateOnChange('users', env.RATE_LIMITER);

  const updated = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at, password_plain as password
    FROM users
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  // Decrypt password for display
  if (updated && (updated as any).password) {
    (updated as any).password = await decryptPassword((updated as any).password, env.ENCRYPTION_KEY);
  }

  return json({ user: updated });
});

// Team: Delete staff member
route('DELETE', '/api/team/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if user exists and is a staff member
  const targetUser = await env.DB.prepare(
    `SELECT id, role FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!targetUser) {
    return error('User not found', 404);
  }

  // Only allow deleting staff members (not residents, admins)
  const staffRoles = ['manager', 'department_head', 'executor', 'advertiser'];
  if (!staffRoles.includes(targetUser.role)) {
    return error('Can only delete staff members', 400);
  }

  await env.DB.prepare(
    `DELETE FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({ success: true });
});

// One-time migration: encrypt existing plain passwords
route('POST', '/api/admin/migrate-passwords', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'super_admin' && user.role !== 'admin') return error('Super admin or admin only', 403);

  // Find all users with unencrypted password_plain (not starting with 'enc:')
  const { results } = await env.DB.prepare(`
    SELECT id, password_plain FROM users
    WHERE password_plain IS NOT NULL AND password_plain != '' AND password_plain NOT LIKE 'enc:%'
  `).all();

  let migrated = 0;
  for (const u of results as any[]) {
    const encrypted = await encryptPassword(u.password_plain, env.ENCRYPTION_KEY);
    await env.DB.prepare('UPDATE users SET password_plain = ? WHERE id = ?')
      .bind(encrypted, u.id).run();
    migrated++;
  }

  return json({ success: true, migrated, total: results.length });
});

// Team: Reset passwords for all staff members without password_plain
// This is a one-time admin operation to fix existing staff without visible passwords
route('POST', '/api/team/reset-all-passwords', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can perform this operation', 403);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Find all staff members without password_plain
  const staffRoles = ['manager', 'department_head', 'executor'];
  const { results: staffWithoutPassword } = await env.DB.prepare(`
    SELECT id, login, name, role FROM users
    WHERE role IN (?, ?, ?)
    AND (password_plain IS NULL OR password_plain = '')
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(...staffRoles, ...(tenantId ? [tenantId] : [])).all();

  if (!staffWithoutPassword || staffWithoutPassword.length === 0) {
    return json({ message: 'All staff members already have passwords set', updated: 0 });
  }

  // Generate and set passwords for each staff member
  const results: { id: string; login: string; name: string; password: string }[] = [];

  for (const staff of staffWithoutPassword as any[]) {
    // Generate a password based on login + role first letter + random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newPassword = `${staff.login}${staff.role.charAt(0)}${randomSuffix}`;

    // Hash and store encrypted password
    const hashedPassword = await hashPassword(newPassword);
    const encNewPwd = await encryptPassword(newPassword, env.ENCRYPTION_KEY);

    await env.DB.prepare(`
      UPDATE users SET password_hash = ?, password_plain = ? WHERE id = ?
    `).bind(hashedPassword, encNewPwd, staff.id).run();

    results.push({
      id: staff.id,
      login: staff.login,
      name: staff.name,
      password: newPassword
    });
  }

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    message: `Updated ${results.length} staff members with new passwords`,
    updated: results.length,
    staff: results
  });
});

// Staff Export — all staff as JSON
route('GET', '/api/team/export', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }
  const tenantId = getTenantId(request);
  const STAFF_ROLES = ['admin', 'director', 'manager', 'department_head', 'dispatcher', 'executor', 'security'];
  const ph = STAFF_ROLES.map(() => '?').join(',');
  const { results: staff } = await env.DB.prepare(
    `SELECT id, login, name, phone, role, specialization, password_plain, branch, is_active
     FROM users WHERE role IN (${ph}) ${tenantId ? 'AND tenant_id=?' : ''} ORDER BY role, name`
  ).bind(...STAFF_ROLES, ...(tenantId ? [tenantId] : [])).all() as any;

  return json({ exportType: 'staff', exportedAt: new Date().toISOString(), version: '1.0', staff });
});

// Staff Import — upsert staff from JSON (handles both Kamizo and old platform formats)
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
    // Old platform residents file — extract staff-role users
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

  // Pre-fetch existing logins
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
        `INSERT OR IGNORE INTO users (id,login,name,phone,password_hash,password_plain,role,specialization,branch,tenant_id,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,1)`
      ).bind(generateId(), m.login, m.name||m.login, m.phone||null, m.password_hash||'', m.password||m.password_plain||null, m.role, m.specialization||null, m.branch||null, tenantId||null)
    ));
    stats.created += chunk.length;
  }

  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK);
    await env.DB.batch(chunk.map((m: any) =>
      env.DB.prepare(`UPDATE users SET name=?,phone=?,role=?,specialization=?,password_plain=COALESCE(NULLIF(?,\\'\\'),password_plain) WHERE id=?`)
        .bind(m.name||m.login, m.phone||null, m.role, m.specialization||null, m.password||m.password_plain||'', m.id)
    ));
    stats.updated += chunk.length;
  }

  invalidateCache('users:');
  return json({ success: true, stats });
});

// Executors: List all (protected with role-based filtering)
route('GET', '/api/executors', async (request, env) => {
  // SECURITY: Require authentication
  const user = await getUser(request, env);
  if (!user) {
    return error('Unauthorized - login required', 401);
  }

  // SECURITY: Allow staff roles and residents (for rating executors) to see executors
  const allowedRoles = ['admin', 'director', 'manager', 'department_head', 'executor', 'resident', 'marketplace_manager'];
  const userRole = (user.role || '').trim().toLowerCase();
  if (!allowedRoles.includes(userRole)) {
    console.error(`[403] GET /api/executors - user role: "${user.role}", id: "${user.id}"`);
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if requesting all executors (for colleagues page)
  const url = new URL(request.url);
  const showAll = url.searchParams.get('all') === 'true';
  const pagination = getPaginationParams(url);
  const search = url.searchParams.get('search')?.toLowerCase();

  // Build WHERE clause (use u. alias for users table in JOIN query)
  let whereClause = `WHERE u.role = 'executor'`;
  const bindValues: any[] = [];

  // MULTI-TENANCY: Filter by tenant
  if (tenantId) {
    whereClause += ` AND u.tenant_id = ?`;
    bindValues.push(tenantId);
  }

  // SECURITY: Department heads only see executors in their department (specialization)
  // Unless they request all (for colleagues page)
  if (user.role === 'department_head' && user.specialization && !showAll) {
    whereClause += ` AND u.specialization = ?`;
    bindValues.push(user.specialization);
  }

  // Executors only see colleagues in their department
  // Unless they request all (for colleagues page)
  if (isExecutorRole(user.role) && user.specialization && !showAll) {
    whereClause += ` AND u.specialization = ?`;
    bindValues.push(user.specialization);
  }

  // Search filter
  if (search) {
    whereClause += ` AND (LOWER(u.name) LIKE ? OR LOWER(u.phone) LIKE ? OR LOWER(u.specialization) LIKE ?)`;
    const searchPattern = `%${search}%`;
    bindValues.push(searchPattern, searchPattern, searchPattern);
  }

  // Count total for pagination (use alias u to match whereClause)
  const countQuery = `SELECT COUNT(*) as total FROM users u ${whereClause}`;
  const countStmt = env.DB.prepare(countQuery);
  const { total } = bindValues.length > 0
    ? await countStmt.bind(...bindValues).first() as any
    : await countStmt.first() as any;

  // Paginated data query
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);

  // Include password for admin/manager/director roles only
  const includePassword = ['admin', 'director', 'manager'].includes(user.role);

  // Query with statistics from requests table
  // MULTI-TENANCY: Also filter requests stats by tenant_id
  const dataQuery = `
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.status, u.is_active, u.created_at${includePassword ? ', u.password_plain as password' : ''},
      COALESCE(stats.completed_count, 0) as completed_count,
      COALESCE(stats.active_requests, 0) as active_requests,
      COALESCE(stats.rating, 5.0) as rating,
      COALESCE(stats.avg_completion_time, 0) as avg_completion_time,
      0 as total_earnings
    FROM users u
    LEFT JOIN (
      SELECT
        executor_id,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_count,
        SUM(CASE WHEN status IN ('assigned', 'accepted', 'in_progress') THEN 1 ELSE 0 END) as active_requests,
        ROUND(AVG(CASE WHEN rating IS NOT NULL THEN rating ELSE NULL END), 1) as rating,
        ROUND(AVG(CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
          THEN (julianday(completed_at) - julianday(started_at)) * 24 * 60
          ELSE NULL END), 0) as avg_completion_time
      FROM requests
      ${tenantId ? 'WHERE tenant_id = ?' : ''}
      GROUP BY executor_id
    ) stats ON stats.executor_id = u.id
    ${whereClause}
    ORDER BY u.name
    LIMIT ? OFFSET ?
  `;

  const dataStmt = env.DB.prepare(dataQuery);
  // Note: tenantId is already in bindValues from the WHERE clause if present
  // We need to also bind it for the subquery if tenantId exists
  const subqueryBinds = tenantId ? [tenantId] : [];
  const { results } = bindValues.length > 0
    ? await dataStmt.bind(...subqueryBinds, ...bindValues, pagination.limit, offset).all()
    : await dataStmt.bind(...subqueryBinds, pagination.limit, offset).all();

  // Decrypt passwords for display
  if (includePassword) {
    for (const r of results as any[]) {
      if (r.password) r.password = await decryptPassword(r.password, env.ENCRYPTION_KEY);
    }
  }

  const response = createPaginatedResponse(results, total || 0, pagination);
  return json({ executors: response.data, pagination: response.pagination });
});

// Executors: Get single executor by ID (for live data refresh)
route('GET', '/api/executors/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Allow staff roles to view executor details
  const allowedRoles = ['admin', 'director', 'manager', 'department_head'];
  if (!allowedRoles.includes(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Include password for admin/manager/director roles only
  const includePassword = ['admin', 'director', 'manager'].includes(user.role);

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at${includePassword ? ', password_plain as password' : ''}
    FROM users
    WHERE id = ? AND role IN ('executor', 'department_head') ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!executor) {
    return error('Executor not found', 404);
  }

  // Decrypt password for display
  if (includePassword && (executor as any).password) {
    (executor as any).password = await decryptPassword((executor as any).password, env.ENCRYPTION_KEY);
  }

  return json({ executor });
});

// Executors: Update status (available/busy/offline)
route('PATCH', '/api/executors/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only executor themselves or admin/manager can update status
  if (user.id !== params.id && !['admin', 'manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const status = body.status;

  if (!['available', 'busy', 'offline'].includes(status)) {
    return error('Invalid status. Must be: available, busy, or offline');
  }

  await env.DB.prepare(`
    UPDATE users SET status = ? WHERE id = ? AND role = 'executor' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Инвалидируем кэш исполнителей
  await invalidateOnChange('users', env.RATE_LIMITER);

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ executor });
});

// Executors: Get stats for specific executor
route('GET', '/api/executors/:id/stats', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get executor info
  const executor = await env.DB.prepare(`
    SELECT id, name, specialization, status FROM users WHERE id = ? AND role = 'executor' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!executor) return error('Executor not found', 404);

  // Calculate stats from requests table
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all 6 independent stats queries in parallel
  const [totalCompleted, weekCompleted, monthCompleted, avgRating, avgTime, statusCounts] = await Promise.all([
    // Total completed
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE executor_id = ? AND status IN ('completed', 'closed') ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as Promise<{ count: number }>,
    // This week completed
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE executor_id = ? AND status IN ('completed', 'closed') AND completed_at >= ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, weekAgo, ...(tenantId ? [tenantId] : [])).first() as Promise<{ count: number }>,
    // This month completed
    env.DB.prepare(`
      SELECT COUNT(*) as count FROM requests
      WHERE executor_id = ? AND status IN ('completed', 'closed') AND completed_at >= ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, monthAgo, ...(tenantId ? [tenantId] : [])).first() as Promise<{ count: number }>,
    // Average rating from requests
    env.DB.prepare(`
      SELECT AVG(rating) as avg FROM requests
      WHERE executor_id = ? AND rating IS NOT NULL ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as Promise<{ avg: number | null }>,
    // Average completion time (in minutes)
    env.DB.prepare(`
      SELECT AVG((julianday(completed_at) - julianday(started_at)) * 24 * 60) as avg_minutes
      FROM requests
      WHERE executor_id = ? AND started_at IS NOT NULL AND completed_at IS NOT NULL ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as Promise<{ avg_minutes: number | null }>,
    // Count requests by status
    env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM requests
      WHERE executor_id = ?
      GROUP BY status
    `).bind(params.id).all(),
  ]);

  // For couriers - get delivery stats and rating from marketplace_orders
  let deliveryStats = { totalDelivered: 0, deliveredThisWeek: 0, deliveryRating: null as number | null, avgDeliveryTime: 0 };
  if ((executor as any).specialization === 'courier') {
    // Run all 4 independent courier stats queries in parallel
    const [totalDelivered, deliveredThisWeek, deliveryAvgRating, avgDeliveryTime] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) as count FROM marketplace_orders
        WHERE executor_id = ? AND status = 'delivered'
      `).bind(params.id).first() as Promise<{ count: number }>,
      env.DB.prepare(`
        SELECT COUNT(*) as count FROM marketplace_orders
        WHERE executor_id = ? AND status = 'delivered' AND delivered_at >= ?
      `).bind(params.id, weekAgo).first() as Promise<{ count: number }>,
      // Average rating from delivery orders
      env.DB.prepare(`
        SELECT AVG(rating) as avg FROM marketplace_orders
        WHERE executor_id = ? AND rating IS NOT NULL
      `).bind(params.id).first() as Promise<{ avg: number | null }>,
      // Average delivery time (from delivering_at to delivered_at) in minutes
      env.DB.prepare(`
        SELECT AVG((julianday(delivered_at) - julianday(delivering_at)) * 24 * 60) as avg_minutes
        FROM marketplace_orders
        WHERE executor_id = ? AND delivering_at IS NOT NULL AND delivered_at IS NOT NULL
      `).bind(params.id).first() as Promise<{ avg_minutes: number | null }>,
    ]);

    deliveryStats = {
      totalDelivered: totalDelivered?.count || 0,
      deliveredThisWeek: deliveredThisWeek?.count || 0,
      deliveryRating: deliveryAvgRating?.avg || null,
      avgDeliveryTime: avgDeliveryTime?.avg_minutes ? Math.round(avgDeliveryTime.avg_minutes) : 0
    };
  }

  // For couriers, use delivery rating; for others, use request rating
  const isCourier = (executor as any).specialization === 'courier';
  const finalRating = isCourier && deliveryStats.deliveryRating !== null
    ? Math.round(deliveryStats.deliveryRating * 10) / 10
    : (avgRating?.avg ? Math.round(avgRating.avg * 10) / 10 : 5.0);

  return json({
    stats: {
      totalCompleted: totalCompleted?.count || 0,
      thisWeek: weekCompleted?.count || 0,
      thisMonth: monthCompleted?.count || 0,
      rating: finalRating,
      avgCompletionTime: avgTime?.avg_minutes ? Math.round(avgTime.avg_minutes) : 0,
      statusBreakdown: statusCounts.results || [],
      // Courier-specific stats
      totalDelivered: deliveryStats.totalDelivered,
      deliveredThisWeek: deliveryStats.deliveredThisWeek,
      avgDeliveryTime: deliveryStats.avgDeliveryTime
    }
  });
});

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
  const { code, name, address, phone } = body;

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
    INSERT INTO branches (id, code, name, address, phone, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, code.toUpperCase(), name, address || null, phone || null, getTenantId(request)).run();

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

// Branches: Delete
route('DELETE', '/api/branches/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director'].includes(user.role)) {
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
  type NormalResident = { login: string; name?: string; phone?: string; apartment?: string; building?: string; password_plain?: string; password_hash?: string; role?: string; entrance?: string; floor?: string };
  type NormalStaff = { login: string; name?: string; phone?: string; role: string; specialization?: string; password_plain?: string; password_hash?: string };

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
            password_plain: res.password || null,
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
      return env.DB.prepare(
        `INSERT OR IGNORE INTO users (id,login,name,phone,password_hash,password_plain,role,apartment,building,branch,entrance,floor,specialization,tenant_id,is_active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`
      ).bind(
        generateId(), res.login, res.name||res.login, res.phone||null,
        res.password_hash||'', res.password_plain||null,
        res.role, isStaff ? null : (res.apartment||null), isStaff ? null : (res.building||null),
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
      return isStaff
        ? env.DB.prepare(`UPDATE users SET name=?,phone=?,role=?,specialization=? WHERE id=?`)
            .bind(res.name||res.login, res.phone||null, res.role, res.specialization||null, res.id)
        : env.DB.prepare(`UPDATE users SET name=?,phone=?,apartment=?,building=?,branch=? WHERE id=?`)
            .bind(res.name||res.login, res.phone||null, res.apartment||null, res.building||null, branchCode, res.id);
    });
    await env.DB.batch(stmts);
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
    async (buildingId: string) => {
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

  await env.DB.prepare(`UPDATE entrances SET ${updates.join(', ')} WHERE id = ? ${tenantIdUpd ? 'AND tenant_id = ?' : ''}`).bind(...values, ...(tenantIdUpd ? [tenantIdUpd] : [])).run();

  const updated = await env.DB.prepare('SELECT * FROM entrances WHERE id = ?').bind(params.id).first();
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
    authUser.id,
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
        SELECT id, name, phone, login, address, apartment, total_area, password_plain, role
        FROM users
        WHERE building_id = ?
        AND TRIM(apartment) = ?
        AND role IN ('resident', 'tenant')
      `).bind(apt.building_id, aptNumber).all();
      // Decrypt passwords for management view
      userResidents = await Promise.all((results || []).map(async (u: any) => {
        let decryptedPassword = null;
        if (u.password_plain) {
          try { decryptedPassword = await decryptPassword(u.password_plain, env.ENCRYPTION_KEY); } catch {}
        }
        return { ...u, password_plain: decryptedPassword ? '***' : null, password_decrypted: decryptedPassword };
      }));
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

  // Get meter's current value as previous value
  const meter = await env.DB.prepare('SELECT current_value, last_reading_date FROM meters WHERE id = ?')
    .bind(params.meterId).first() as any;

  if (!meter) return error('Meter not found', 404);

  const previousValue = meter.current_value || 0;
  const newValue = body.value;
  const consumption = newValue - previousValue;
  const readingDate = body.reading_date || body.readingDate || new Date().toISOString().split('T')[0];

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
    authUser.id,
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

// ==================== REQUESTS ROUTES ====================

// Requests: List
route('GET', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const category = url.searchParams.get('category');
  const pagination = getPaginationParams(url);

  // Build WHERE clause
  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND r.tenant_id = ?';
    params.push(tenantId);
  }

  // Filter by role
  if (user.role === 'resident') {
    whereClause += ' AND r.resident_id = ?';
    params.push(user.id);
  } else if (isExecutorRole(user.role)) {
    whereClause += ` AND (r.executor_id = ? OR (r.status = 'new' AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)))`;
    params.push(user.id);
    params.push(user.specialization || 'security');
  } else if (user.role === 'department_head' && user.specialization) {
    // SECURITY: Department heads only see requests in their department (by category specialization)
    whereClause += ` AND r.category_id IN (SELECT id FROM categories WHERE specialization = ?)`;
    params.push(user.specialization);
  }

  if (status && status !== 'all') {
    whereClause += ' AND r.status = ?';
    params.push(status);
  }

  if (category) {
    whereClause += ' AND r.category_id = ?';
    params.push(category);
  }

  // Count total
  const countQuery = `SELECT COUNT(*) as total FROM requests r ${whereClause}`;
  const { total } = await env.DB.prepare(countQuery).bind(...params).first() as any;

  // Fetch paginated data
  const offset = ((pagination.page || 1) - 1) * (pagination.limit || 50);
  const dataQuery = `
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address, u.building_id,
           eu.name as executor_name, eu.phone as executor_phone, eu.specialization as executor_specialization,
           b.name as building_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    LEFT JOIN buildings b ON u.building_id = b.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await env.DB.prepare(dataQuery).bind(...params, pagination.limit, offset).all();
  const response = createPaginatedResponse(results, total || 0, pagination);

  return json({ requests: response.data, pagination: response.pagination });
});

// Requests: Create
route('POST', '/api/requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // Determine the resident ID - managers/admins can create requests on behalf of residents
  let residentId = user.id;
  let residentData: any = null;

  // If manager/admin/director is creating request on behalf of a resident
  if (['manager', 'admin', 'director', 'department_head'].includes(user.role) && body.resident_id) {
    residentId = body.resident_id;
    // Get the actual resident's data for branch code and address
    residentData = await env.DB.prepare(
      'SELECT id, branch, building_id, address, name, phone, apartment FROM users WHERE id = ?'
    ).bind(body.resident_id).first() as any;
  }

  // Get branch code from address or building
  let branchCode = 'UK'; // Default branch code

  // Check resident or current user for branch info
  const userForBranch = residentData || await env.DB.prepare(
    'SELECT branch, building_id, address FROM users WHERE id = ?'
  ).bind(residentId).first() as any;

  if (userForBranch?.branch) {
    branchCode = userForBranch.branch.toUpperCase();
  } else if (userForBranch?.address) {
    // Try to extract branch from address
    const address = userForBranch.address.toLowerCase();
    if (address.includes('юнусобод') || address.includes('yunusobod') || address.includes('юнусота')) {
      branchCode = 'YS';
    } else if (address.includes('чиланзар') || address.includes('chilanzar')) {
      branchCode = 'CH';
    } else if (address.includes('сергели') || address.includes('sergeli')) {
      branchCode = 'SR';
    } else if (address.includes('мирзо') || address.includes('mirzo')) {
      branchCode = 'MU';
    }
  }

  // Get category code for unique numbering per service type
  // S=Сантехника, E=Электрика, L=Лифт, D=Домофон, C=Уборка, O=Охрана, X=Другое
  const categoryCodeMap: Record<string, string> = {
    'plumber': 'S',      // Сантехника
    'electrician': 'E',  // Электрика
    'elevator': 'L',     // Лифт
    'intercom': 'D',     // Домофон
    'cleaning': 'C',     // Уборка (Cleaning)
    'security': 'O',     // Охрана
    'trash': 'M',        // Мусор (Trash)
    'boiler': 'B',       // Котёл (Boiler)
    'ac': 'A',           // Кондиционер (AC)
    'gardener': 'G',     // Садовник (Gardener)
    'other': 'X',        // Другое
  };
  const categoryCode = categoryCodeMap[body.category_id] || 'X';

  // Get next request number for this branch + category combination
  // e.g., YS-L-% for all elevator requests in Yunusabad
  const prefix = `${branchCode}-${categoryCode}`;
  const tenantIdReqNum = getTenantId(request);
  const maxNum = await env.DB.prepare(
    `SELECT COALESCE(MAX(number), 1000) as max_num FROM requests WHERE request_number LIKE ? ${tenantIdReqNum ? 'AND tenant_id = ?' : ''}`
  ).bind(prefix + '-%', ...(tenantIdReqNum ? [tenantIdReqNum] : [])).first() as any;
  const number = (maxNum?.max_num || 1000) + 1;

  // Create request number with branch + category prefix (e.g., YS-L-1001)
  const requestNumber = `${prefix}-${number}`;

  await env.DB.prepare(`
    INSERT INTO requests (id, number, request_number, resident_id, category_id, title, description, priority, access_info, scheduled_at, tenant_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, number, requestNumber, residentId, body.category_id, body.title,
    body.description || null, body.priority || 'medium',
    body.access_info || null, body.scheduled_at || null, getTenantId(request)
  ).run();

  // Return the created request with user info
  const created = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? ${tenantIdReqNum ? 'AND r.tenant_id = ?' : ''}
  `).bind(id, ...(tenantIdReqNum ? [tenantIdReqNum] : [])).first() as any;

  // Notify managers and department heads about new request
  const categoryLabels: Record<string, string> = {
    'plumber': 'Сантехника', 'electrician': 'Электрика', 'elevator': 'Лифт',
    'intercom': 'Домофон', 'cleaning': 'Уборка', 'security': 'Охрана',
    'trash': 'Мусор', 'boiler': 'Котёл', 'ac': 'Кондиционер', 'courier': 'Курьер', 'gardener': 'Садовник', 'other': 'Другое'
  };
  const categoryLabel = categoryLabels[body.category_id] || body.category_id;

  // Get managers and department heads to notify
  const tenantIdForNotify = getTenantId(request);
  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'department_head') AND is_active = 1 ${tenantIdForNotify ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantIdForNotify ? [tenantIdForNotify] : [])).all();

  // Send notification to each manager (push + save to DB for bell icon)
  const reqNotifBody = `#${requestNumber} - ${body.title}. ${categoryLabel}. От: ${created?.resident_name || 'Житель'}`;
  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '📝 Новая заявка',
      body: reqNotifBody,
      type: 'request_created',
      tag: `request-new-${id}`,
      data: { requestId: id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_created', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), manager.id, '📝 Новая заявка', reqNotifBody, JSON.stringify({ request_id: id }), tenantIdForNotify).run().catch(() => {});
  }

  return json({ request: created }, 201);
});

// Requests: Update
route('PATCH', '/api/requests/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request before update for notifications
  const requestBefore = await env.DB.prepare(
    `SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.status) {
    updates.push('status = ?');
    values.push(body.status);

    if (body.status === 'in_progress') updates.push('started_at = datetime("now")');
    if (body.status === 'completed') updates.push('completed_at = datetime("now")');
  }

  if (body.executor_id !== undefined) {
    updates.push('executor_id = ?');
    values.push(body.executor_id);
  }

  if (body.rating) {
    updates.push('rating = ?');
    values.push(body.rating);
  }

  if (body.feedback) {
    updates.push('feedback = ?');
    values.push(body.feedback);
  }

  updates.push('updated_at = datetime("now")');
  values.push(params.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE requests SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  // Send notifications on status change (push + DB)
  if (body.status && requestBefore && body.status !== requestBefore.status) {
    const reqNum = requestBefore.request_number || params.id.slice(0, 8);

    // Notify resident on important status changes
    if (requestBefore.resident_id && ['in_progress', 'completed', 'pending_approval'].includes(body.status)) {
      const statusLabels: Record<string, string> = {
        in_progress: 'Работа началась',
        completed: 'Работа выполнена',
        pending_approval: 'Ожидает подтверждения'
      };
      const patchStatusBody = statusLabels[body.status] || body.status;
      sendPushNotification(env, requestBefore.resident_id, {
        title: `📋 Заявка #${reqNum}`,
        body: patchStatusBody,
        type: 'request_status',
        tag: `request-status-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: body.status === 'pending_approval'
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_status', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), requestBefore.resident_id, `📋 Заявка #${reqNum}`, patchStatusBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }

    // Notify executor when request rejected back to them
    if (requestBefore.executor_id && body.status === 'in_progress' && requestBefore.status === 'pending_approval') {
      const patchRejectBody = `Житель отклонил выполнение. Требуется доработка.`;
      sendPushNotification(env, requestBefore.executor_id, {
        title: `⚠️ Заявка #${reqNum} отклонена`,
        body: patchRejectBody,
        type: 'request_rejected',
        tag: `request-rejected-${params.id}`,
        data: { requestId: params.id, url: '/' },
        requireInteraction: true
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), requestBefore.executor_id, `⚠️ Заявка #${reqNum} отклонена`, patchRejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Assign executor
route('POST', '/api/requests/:id/assign', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || (user.role !== 'admin' && user.role !== 'director' && user.role !== 'manager' && user.role !== 'dispatcher' && !isExecutorRole(user.role) && user.role !== 'department_head')) {
    return error('Not authorized to assign requests', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const executorId = body.executor_id;

  // Get executor info
  const executor = await env.DB.prepare(
    `SELECT id, name, phone, specialization FROM users WHERE id = ? AND role = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(executorId, 'executor', ...(tenantId ? [tenantId] : [])).first() as any;

  if (!executor) {
    return error('Executor not found', 404);
  }

  // SECURITY: Department head can only assign to executors in their department
  if (user.role === 'department_head' && user.specialization && executor.specialization !== user.specialization) {
    return error('Department head can only assign to executors in their department', 403);
  }

  // Get request info before update
  const requestBefore = await env.DB.prepare(
    `SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  await env.DB.prepare(`
    UPDATE requests SET executor_id = ?, status = 'assigned', assigned_by = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(executorId, user.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Get updated request
  const updated = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, u.phone as resident_phone, u.apartment, u.address,
           eu.name as executor_name, eu.phone as executor_phone
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Send push + DB notification to executor - new request assigned
  const assignBodyExec = `Заявка #${updated?.request_number || requestBefore?.request_number}: ${updated?.title || requestBefore?.title}. Адрес: ${updated?.address || 'не указан'}`;
  await sendPushNotification(env, executorId, {
    title: '📋 Новая заявка назначена',
    body: assignBodyExec,
    type: 'request_assigned',
    tag: `request-assigned-${params.id}`,
    data: { requestId: params.id, url: '/' },
    requireInteraction: true
  });
  env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_assigned', ?, ?, ?, 0, datetime('now'), ?)`)
    .bind(generateId(), executorId, '📋 Новая заявка назначена', assignBodyExec, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

  // Send push + DB notification to resident - executor assigned
  if (requestBefore?.resident_id) {
    const assignBodyRes = `На вашу заявку #${updated?.request_number || requestBefore?.request_number} назначен исполнитель: ${executor.name}`;
    await sendPushNotification(env, requestBefore.resident_id, {
      title: '👷 Исполнитель назначен',
      body: assignBodyRes,
      type: 'request_status',
      tag: `request-executor-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_assigned', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestBefore.resident_id, '👷 Исполнитель назначен', assignBodyRes, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ request: updated });
});

// Requests: Accept (executor accepts assigned request)
route('POST', '/api/requests/:id/accept', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can accept requests', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request info before update
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  await env.DB.prepare(`
    UPDATE requests SET status = 'accepted', updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to resident - executor accepted
  if (requestData.resident_id) {
    const acceptBody = `Исполнитель ${user.name} принял вашу заявку #${requestData.request_number}. Ожидайте начала работ.`;
    await sendPushNotification(env, requestData.resident_id, {
      title: '✅ Заявка принята',
      body: acceptBody,
      type: 'request_status',
      tag: `request-accepted-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_accepted', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '✅ Заявка принята', acceptBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// Requests: Decline/Release (executor declines or releases request - returns to 'new' status)
route('POST', '/api/requests/:id/decline', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can decline requests', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { reason } = body;

  if (!reason || reason.trim().length === 0) {
    return error('Reason is required', 400);
  }

  // Get request info - must be assigned to this executor and in appropriate status
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  // Can only decline if assigned, accepted, or in_progress
  if (!['assigned', 'accepted', 'in_progress'].includes(requestData.status)) {
    return error('Cannot decline request in current status', 400);
  }

  // Update request: clear executor and return to 'new' status
  // Note: Table doesn't have assigned_at, accepted_at, decline_reason columns
  // Only: started_at, completed_at, closed_at exist
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'new',
      executor_id = NULL,
      assigned_by = NULL,
      started_at = NULL,
      updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to resident (non-blocking)
  if (requestData.resident_id) {
    const declineBodyRes = `Исполнитель ${user.name} освободил заявку #${requestData.request_number}. Причина: ${reason}. Заявка возвращена в очередь.`;
    sendPushNotification(env, requestData.resident_id, {
      title: '⚠️ Исполнитель освободил заявку',
      body: declineBodyRes,
      type: 'request_declined',
      tag: `request-declined-${params.id}`,
      data: { requestId: params.id, reason, url: '/' },
      requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_declined', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '⚠️ Исполнитель освободил заявку', declineBodyRes, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  // Notify managers and department heads
  const { results: managers } = await env.DB.prepare(
    `SELECT id FROM users WHERE role IN ('manager', 'admin', 'director', 'department_head') AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const declineBodyMgr = `${user.name} отказался от заявки #${requestData.request_number}. Причина: ${reason}`;
  for (const manager of (managers || []) as any[]) {
    sendPushNotification(env, manager.id, {
      title: '⚠️ Исполнитель отказался от заявки',
      body: declineBodyMgr,
      type: 'request_declined',
      tag: `request-declined-manager-${params.id}`,
      data: { requestId: params.id, reason, url: '/requests' },
      requireInteraction: true
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_declined', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), manager.id, '⚠️ Исполнитель отказался', declineBodyMgr, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// ==================== RESCHEDULE REQUESTS ====================

// Create reschedule request (перенос времени)
route('POST', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Only residents and executors can create reschedule requests
  if (!['resident', 'executor', 'security'].includes(user.role)) {
    return error('Only residents and executors can request reschedule', 403);
  }

  const body = await request.json() as any;
  const { proposed_date, proposed_time, reason, reason_text } = body;

  if (!proposed_date || !proposed_time || !reason) {
    return error('Missing required fields: proposed_date, proposed_time, reason', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantIdResc = getTenantId(request);

  // Get request info
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name, eu.name as executor_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    LEFT JOIN users eu ON r.executor_id = eu.id
    WHERE r.id = ? ${tenantIdResc ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdResc ? [tenantIdResc] : [])).first() as any;

  if (!requestData) {
    return error('Request not found', 404);
  }

  // Verify user is involved in this request
  const isResident = user.role === 'resident' && requestData.resident_id === user.id;
  const isExecutor = isExecutorRole(user.role) && requestData.executor_id === user.id;

  if (!isResident && !isExecutor) {
    return error('You are not involved in this request', 403);
  }

  // Check for existing pending reschedule
  const existingPending = await env.DB.prepare(`
    SELECT rr.id FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.request_id = ? AND rr.status = 'pending' ${tenantIdResc ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdResc ? [tenantIdResc] : [])).first();

  if (existingPending) {
    return error('There is already a pending reschedule request', 400);
  }

  const initiator = user.role as 'resident' | 'executor';
  const recipientId = isResident ? requestData.executor_id : requestData.resident_id;
  const recipientName = isResident ? requestData.executor_name : requestData.resident_name;
  const recipientRole = isResident ? 'executor' : 'resident';

  if (!recipientId) {
    return error('No recipient found for reschedule request', 400);
  }

  const id = generateId();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await env.DB.prepare(`
    INSERT INTO reschedule_requests (
      id, request_id, initiator, initiator_id, initiator_name,
      recipient_id, recipient_name, recipient_role,
      current_date, current_time, proposed_date, proposed_time,
      reason, reason_text, status, expires_at, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).bind(
    id, params.id, initiator, user.id, user.name,
    recipientId, recipientName, recipientRole,
    requestData.scheduled_at?.split('T')[0] || null,
    requestData.scheduled_at?.split('T')[1]?.substring(0, 5) || null,
    proposed_date, proposed_time,
    reason, reason_text || null, expiresAt, getTenantId(request)
  ).run();

  const reschedule = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ?
  `).bind(id).first();

  // Send push notification to recipient
  await sendPushNotification(env, recipientId, {
    title: '⏰ Запрос на перенос времени',
    body: `${user.name} просит перенести заявку на ${proposed_date} ${proposed_time}`,
    type: 'reschedule_requested',
    tag: `reschedule-${id}`,
    data: { rescheduleId: id, requestId: params.id },
    requireInteraction: true
  }).catch(() => {});

  return json({ reschedule }, 201);
});

// Get reschedule requests for current user (both as recipient and initiator)
route('GET', '/api/reschedule-requests', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id via requests table
  const tenantId = getTenantId(request);

  // Get pending reschedules where user is recipient OR initiator
  const { results } = await env.DB.prepare(`
    SELECT rr.*, r.title as request_title, r.status as request_status, r.number as request_number
    FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE (rr.recipient_id = ? OR rr.initiator_id = ?) AND rr.status = 'pending'
    ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY rr.created_at DESC
  `).bind(user.id, user.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ reschedules: results });
});

// Get reschedule requests for a specific request
route('GET', '/api/requests/:id/reschedule', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id via requests table
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT rr.* FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.request_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY rr.created_at DESC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ reschedules: results });
});

// Respond to reschedule request (accept/reject)
route('POST', '/api/reschedule-requests/:id/respond', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { accepted, response_note } = body;

  if (typeof accepted !== 'boolean') {
    return error('Missing required field: accepted (boolean)', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id via requests table
  const tenantId = getTenantId(request);

  // Get reschedule request
  const reschedule = await env.DB.prepare(`
    SELECT rr.* FROM reschedule_requests rr
    JOIN requests r ON rr.request_id = r.id
    WHERE rr.id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!reschedule) {
    return error('Reschedule request not found', 404);
  }

  if (reschedule.status !== 'pending') {
    return error('Reschedule request is not pending', 400);
  }

  // Verify user is the recipient
  if (reschedule.recipient_id !== user.id) {
    return error('You are not the recipient of this reschedule request', 403);
  }

  const newStatus = accepted ? 'accepted' : 'rejected';

  // Update reschedule status
  await env.DB.prepare(`
    UPDATE reschedule_requests
    SET status = ?, response_note = ?, responded_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newStatus, response_note || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  // If accepted, update the request's scheduled time
  if (accepted) {
    await env.DB.prepare(`
      UPDATE requests
      SET scheduled_at = datetime(? || 'T' || ? || ':00'),
          updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(reschedule.proposed_date, reschedule.proposed_time, reschedule.request_id, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare(`
    SELECT * FROM reschedule_requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  // Get request info for notification message
  const requestInfo = await env.DB.prepare(`
    SELECT number FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reschedule.request_id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Create notification in database
  const notificationId = generateId();
  const notificationTitle = accepted ? '✅ Перенос согласован' : '❌ Перенос отклонён';
  const notificationBody = accepted
    ? `${user.name} принял ваш запрос на перенос заявки #${requestInfo?.number || ''} на ${reschedule.proposed_date} ${reschedule.proposed_time}`
    : `${user.name} отклонил ваш запрос на перенос заявки #${requestInfo?.number || ''}${response_note ? '. Причина: ' + response_note : ''}`;

  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, message, request_id, created_at${tenantId ? ', tenant_id' : ''})
    VALUES (?, ?, ?, ?, ?, ?, datetime('now')${tenantId ? ', ?' : ''})
  `).bind(
    notificationId,
    reschedule.initiator_id,
    accepted ? 'reschedule_accepted' : 'reschedule_rejected',
    notificationTitle,
    notificationBody,
    reschedule.request_id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  // Send real-time notification via WebSocket
  try {
    const connManagerId = env.CONNECTION_MANAGER.idFromName('global');
    const connManager = env.CONNECTION_MANAGER.get(connManagerId);
    await connManager.fetch('http://internal/broadcast', {
      method: 'POST',
      body: JSON.stringify({
        type: 'notification',
        userId: reschedule.initiator_id,
        data: {
          id: notificationId,
          type: accepted ? 'reschedule_accepted' : 'reschedule_rejected',
          title: notificationTitle,
          message: notificationBody,
          requestId: reschedule.request_id,
          createdAt: new Date().toISOString()
        }
      })
    });
  } catch (e) {
    // WebSocket broadcast is non-critical
  }

  // Send push notification to initiator
  sendPushNotification(env, reschedule.initiator_id, {
    title: notificationTitle,
    body: notificationBody,
    type: 'reschedule_responded',
    tag: `reschedule-response-${params.id}`,
    data: { rescheduleId: params.id, requestId: reschedule.request_id }
  }).catch(() => {});

  return json({ reschedule: updated });
});

// Requests: Start work
route('POST', '/api/requests/:id/start', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can start work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request info before update
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  await env.DB.prepare(`
    UPDATE requests SET status = 'in_progress', started_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to resident - work started
  if (requestData.resident_id) {
    const startBody = `Исполнитель ${user.name} начал работу по заявке #${requestData.request_number}.`;
    await sendPushNotification(env, requestData.resident_id, {
      title: '🔧 Работа началась',
      body: startBody,
      type: 'request_status',
      tag: `request-started-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_started', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '🔧 Работа началась', startBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  // Notify department heads about work started
  const { results: deptHeadsStart } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const startBodyHead = `${user.name} начал работу по заявке #${requestData.request_number}`;
  for (const head of (deptHeadsStart || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '🔧 Работа началась',
      body: startBodyHead,
      type: 'request_started',
      tag: `request-started-head-${params.id}`,
      data: { requestId: params.id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_started', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), head.id, '🔧 Работа началась', startBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// Requests: Complete work (executor marks work as done, waiting for resident approval)
route('POST', '/api/requests/:id/complete', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can complete work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get request info for notification
  const requestData = await env.DB.prepare(`
    SELECT r.*, u.name as resident_name
    FROM requests r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.id = ? AND r.executor_id = ? ${tenantId ? 'AND r.tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not assigned to you', 404);
  }

  // Update status to pending_approval (waiting for resident confirmation)
  await env.DB.prepare(`
    UPDATE requests SET status = 'pending_approval', completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? AND executor_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push notification to resident - work completed, please approve
  if (requestData.resident_id) {
    const completeBody = `Исполнитель ${user.name} завершил работу по заявке #${requestData.request_number}. Пожалуйста, подтвердите выполнение и оцените работу.`;
    await sendPushNotification(env, requestData.resident_id, {
      title: '✅ Работа завершена!',
      body: completeBody,
      type: 'request_completed',
      tag: `request-completed-${params.id}`,
      data: { requestId: params.id, url: '/' },
      requireInteraction: true
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_completed', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.resident_id, '✅ Работа завершена!', completeBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  // Notify department heads about completed work
  const { results: deptHeads } = await env.DB.prepare(
    `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...(tenantId ? [tenantId] : [])).all();

  const completeBodyHead = `${user.name} завершил заявку #${requestData.request_number}. Ожидается подтверждение жителя.`;
  for (const head of (deptHeads || []) as any[]) {
    sendPushNotification(env, head.id, {
      title: '✅ Исполнитель завершил работу',
      body: completeBodyHead,
      type: 'request_completed',
      tag: `request-completed-head-${params.id}`,
      data: { requestId: params.id, url: '/requests' },
      requireInteraction: false
    }).catch(() => {});
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_completed', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), head.id, '✅ Исполнитель завершил работу', completeBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
  }

  return json({ success: true });
});

// Requests: Pause work
route('POST', '/api/requests/:id/pause', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can pause work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { reason } = body;

  // Check request exists and is in_progress
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found, not assigned to you, or not in progress', 404);
  }

  // Check if already paused
  if (requestData.is_paused) {
    return error('Request is already paused', 400);
  }

  // Update request to paused state
  await env.DB.prepare(`
    UPDATE requests
    SET is_paused = 1, paused_at = datetime('now'), pause_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reason || null, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Get updated request
  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ success: true, request: updated });
});

// Requests: Resume work
route('POST', '/api/requests/:id/resume', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Only executors can resume work', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check request exists and is paused
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND executor_id = ? AND status = 'in_progress' AND is_paused = 1 ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found, not assigned to you, or not paused', 404);
  }

  // Calculate paused duration in seconds
  const pausedAt = new Date(requestData.paused_at).getTime();
  const now = Date.now();
  const pausedDuration = Math.floor((now - pausedAt) / 1000);
  const newTotalPausedTime = (requestData.total_paused_time || 0) + pausedDuration;

  // Update request - resume work
  await env.DB.prepare(`
    UPDATE requests
    SET is_paused = 0, paused_at = NULL, pause_reason = NULL, total_paused_time = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(newTotalPausedTime, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Get updated request
  const updated = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ success: true, request: updated, pausedDuration, totalPausedTime: newTotalPausedTime });
});

// Requests: Approve (resident confirms work is done)
route('POST', '/api/requests/:id/approve', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { rating, feedback } = body;

  // Verify request belongs to this resident and is pending approval
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not pending approval', 404);
  }

  // Update status to completed (also reset any pause state)
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'completed',
      rating = ?,
      feedback = ?,
      is_paused = 0,
      paused_at = NULL,
      pause_reason = NULL,
      updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(rating || null, feedback || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to executor - work approved
  if (requestData.executor_id) {
    const ratingText = rating ? ` Оценка: ${'⭐'.repeat(rating)}` : '';
    const approveBody = `Житель подтвердил выполнение заявки #${requestData.request_number}.${ratingText}`;
    await sendPushNotification(env, requestData.executor_id, {
      title: '🎉 Работа подтверждена!',
      body: approveBody,
      type: 'request_approved',
      tag: `request-approved-${params.id}`,
      data: { requestId: params.id, rating, url: '/' },
      requireInteraction: false
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '🎉 Работа подтверждена!', approveBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    // Get executor name for notification
    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(requestData.executor_id).first() as any;

    // Notify department heads about approved work with rating
    const { results: deptHeads } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all();

    const ratingStars = rating ? '⭐'.repeat(rating) : 'без оценки';
    const approveBodyHead = `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number} подтверждена. ${ratingStars}`;
    for (const head of (deptHeads || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '✅ Заявка закрыта',
        body: approveBodyHead,
        type: 'request_approved',
        tag: `request-approved-head-${params.id}`,
        data: { requestId: params.id, rating, url: '/requests' },
        requireInteraction: false
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_approved', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), head.id, '✅ Заявка закрыта', approveBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Reject (resident rejects work, sends back to executor)
route('POST', '/api/requests/:id/reject', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const { reason } = body;

  if (!reason || reason.trim().length === 0) {
    return error('Reason is required', 400);
  }

  // Verify request belongs to this resident and is pending approval
  const requestData = await env.DB.prepare(`
    SELECT * FROM requests WHERE id = ? AND resident_id = ? AND status = 'pending_approval' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!requestData) {
    return error('Request not found or not pending approval', 404);
  }

  // Get current rejection count
  const currentCount = requestData.rejection_count || 0;

  // Update status back to in_progress
  await env.DB.prepare(`
    UPDATE requests SET
      status = 'in_progress',
      rejection_reason = ?,
      rejection_count = ?,
      updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(reason, currentCount + 1, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  // Send push + DB notification to executor - work rejected
  if (requestData.executor_id) {
    const rejectBody = `Житель отклонил работу по заявке #${requestData.request_number}. Причина: ${reason}`;
    await sendPushNotification(env, requestData.executor_id, {
      title: '❌ Работа отклонена',
      body: rejectBody,
      type: 'request_rejected',
      tag: `request-rejected-${params.id}`,
      data: { requestId: params.id, reason, url: '/' },
      requireInteraction: true
    });
    env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
      .bind(generateId(), requestData.executor_id, '❌ Работа отклонена', rejectBody, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});

    // Get executor name for notification to department heads
    const executor = await env.DB.prepare('SELECT name FROM users WHERE id = ?')
      .bind(requestData.executor_id).first() as any;

    // Notify department heads about rejected work
    const { results: deptHeadsReject } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'department_head' AND is_active = 1 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(...(tenantId ? [tenantId] : [])).all();

    const rejectBodyHead = `${executor?.name || 'Исполнитель'} - заявка #${requestData.request_number}. Причина: ${reason}`;
    for (const head of (deptHeadsReject || []) as any[]) {
      sendPushNotification(env, head.id, {
        title: '❌ Работа отклонена жителем',
        body: rejectBodyHead,
        type: 'request_rejected',
        tag: `request-rejected-head-${params.id}`,
        data: { requestId: params.id, reason, url: '/requests' },
        requireInteraction: true
      }).catch(() => {});
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'request_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), head.id, '❌ Работа отклонена жителем', rejectBodyHead, JSON.stringify({ request_id: params.id }), tenantId).run().catch(() => {});
    }
  }

  return json({ success: true });
});

// Requests: Cancel
route('POST', '/api/requests/:id/cancel', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const reason = body.reason || 'Без причины';

  // Get request data
  const requestData = await env.DB.prepare(`SELECT * FROM requests WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  if (!requestData) return error('Request not found', 404);

  // Check permissions
  // Residents can cancel only before work starts (new, assigned, accepted)
  // Managers/Admins can cancel any request not completed
  const isResident = user.role === 'resident';
  const canResidentCancel = ['new', 'assigned', 'accepted'].includes(requestData.status as string);
  const canManagerCancel = requestData.status !== 'completed';

  if (isResident && requestData.resident_id !== user.id) {
    return error('Forbidden', 403);
  }

  if (isResident && !canResidentCancel) {
    return error('Cannot cancel request in this status', 400);
  }

  if (!isResident && !canManagerCancel) {
    return error('Cannot cancel completed request', 400);
  }

  const cancelledBy = isResident ? 'resident' : user.role;

  await env.DB.prepare(`
    UPDATE requests
    SET status = 'cancelled',
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Add to history
  await env.DB.prepare(`
    INSERT INTO request_history (id, request_id, user_id, action, old_status, new_status, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    params.id,
    user.id,
    'cancelled',
    requestData.status,
    'cancelled',
    `Отменена (${cancelledBy}): ${reason}`
  ).run();

  // Send notification to executor if assigned
  if (requestData.executor_id && !isResident) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(
      generateId(),
      requestData.executor_id,
      'Заявка отменена',
      `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`,
      getTenantId(request)
    ).run();
  }

  // Send notification to resident if cancelled by manager/admin
  if (!isResident && requestData.resident_id) {
    await env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, created_at, tenant_id)
      VALUES (?, ?, 'request_cancelled', ?, ?, datetime('now'), ?)
    `).bind(
      generateId(),
      requestData.resident_id,
      'Заявка отменена',
      `Заявка #${requestData.request_number || requestData.number} была отменена. Причина: ${reason}`,
      getTenantId(request)
    ).run();
  }

  invalidateCache('requests');

  return json({ success: true });
});

// Requests: Rate (legacy endpoint, now uses approve)
route('POST', '/api/requests/:id/rate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE requests SET rating = ?, feedback = ?, status = 'completed', updated_at = datetime('now')
    WHERE id = ? AND resident_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.rating, body.feedback || null, params.id, user.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== WORK ORDERS ROUTES ====================

// Work Orders: List
route('GET', '/api/work-orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const priority = url.searchParams.get('priority');
  const buildingId = url.searchParams.get('building_id');

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  if (tenantId) {
    whereClause += ' AND wo.tenant_id = ?';
    params.push(tenantId);
  }

  if (status && status !== 'all') {
    whereClause += ' AND wo.status = ?';
    params.push(status);
  }

  if (type && type !== 'all') {
    whereClause += ' AND wo.type = ?';
    params.push(type);
  }

  if (priority && priority !== 'all') {
    whereClause += ' AND wo.priority = ?';
    params.push(priority);
  }

  if (buildingId) {
    whereClause += ' AND wo.building_id = ?';
    params.push(buildingId);
  }

  const { results } = await env.DB.prepare(`
    SELECT wo.*,
           b.name as building_name,
           u.name as assigned_to_name, u.phone as assigned_to_phone,
           cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id
    LEFT JOIN users cu ON wo.created_by = cu.id
    ${whereClause}
    ORDER BY wo.created_at DESC
  `).bind(...params).all();

  return json({ workOrders: results });
});

// Work Orders: Create
route('POST', '/api/work-orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY
  const tenantId = getTenantId(request);

  // Auto-generate work order number: НР-YYYY-NNN
  const year = new Date().getFullYear();
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM work_orders WHERE tenant_id = ?`
  ).bind(tenantId).first() as any;
  const count = (countResult?.count || 0) + 1;
  const number = `НР-${year}-${String(count).padStart(3, '0')}`;

  await env.DB.prepare(`
    INSERT INTO work_orders (id, tenant_id, number, title, description, type, priority, status, building_id, apartment_id, assigned_to, scheduled_date, scheduled_time, estimated_duration, materials, checklist, notes, request_id, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(
    id, tenantId, number, body.title, body.description || null,
    body.type || 'planned', body.priority || 'medium', body.status || 'pending',
    body.building_id || null, body.apartment_id || null, body.assigned_to || null,
    body.scheduled_date || null, body.scheduled_time || null,
    body.estimated_duration || 60,
    body.materials ? JSON.stringify(body.materials) : null,
    body.checklist ? JSON.stringify(body.checklist) : null,
    body.notes || null, body.request_id || null, user.id
  ).run();

  const created = await env.DB.prepare(`
    SELECT wo.*, b.name as building_name, u.name as assigned_to_name, cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id
    LEFT JOIN users cu ON wo.created_by = cu.id
    WHERE wo.id = ? ${tenantId ? 'AND wo.tenant_id = ?' : ''}
  `).bind(id, ...(tenantId ? [tenantId] : [])).first();

  return json({ workOrder: created }, 201);
});

// Work Orders: Update
route('PATCH', '/api/work-orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (body.title !== undefined) { updates.push('title = ?'); values.push(body.title); }
  if (body.description !== undefined) { updates.push('description = ?'); values.push(body.description); }
  if (body.type !== undefined) { updates.push('type = ?'); values.push(body.type); }
  if (body.priority !== undefined) { updates.push('priority = ?'); values.push(body.priority); }
  if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
  if (body.building_id !== undefined) { updates.push('building_id = ?'); values.push(body.building_id); }
  if (body.apartment_id !== undefined) { updates.push('apartment_id = ?'); values.push(body.apartment_id); }
  if (body.assigned_to !== undefined) { updates.push('assigned_to = ?'); values.push(body.assigned_to); }
  if (body.scheduled_date !== undefined) { updates.push('scheduled_date = ?'); values.push(body.scheduled_date); }
  if (body.scheduled_time !== undefined) { updates.push('scheduled_time = ?'); values.push(body.scheduled_time); }
  if (body.estimated_duration !== undefined) { updates.push('estimated_duration = ?'); values.push(body.estimated_duration); }
  if (body.actual_duration !== undefined) { updates.push('actual_duration = ?'); values.push(body.actual_duration); }
  if (body.materials !== undefined) { updates.push('materials = ?'); values.push(JSON.stringify(body.materials)); }
  if (body.checklist !== undefined) { updates.push('checklist = ?'); values.push(JSON.stringify(body.checklist)); }
  if (body.notes !== undefined) { updates.push('notes = ?'); values.push(body.notes); }
  if (body.request_id !== undefined) { updates.push('request_id = ?'); values.push(body.request_id); }

  if (updates.length === 0) return error('No fields to update', 400);

  updates.push('updated_at = datetime("now")');
  values.push(params!.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  const updated = await env.DB.prepare(`
    SELECT wo.*, b.name as building_name, u.name as assigned_to_name, cu.name as created_by_name
    FROM work_orders wo
    LEFT JOIN buildings b ON wo.building_id = b.id
    LEFT JOIN users u ON wo.assigned_to = u.id
    LEFT JOIN users cu ON wo.created_by = cu.id
    WHERE wo.id = ? ${tenantId ? 'AND wo.tenant_id = ?' : ''}
  `).bind(params!.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ workOrder: updated });
});

// Work Orders: Change status (with auto-timestamps)
route('POST', '/api/work-orders/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  const body = await request.json() as any;
  const newStatus = body.status;

  if (!newStatus || !['pending', 'scheduled', 'in_progress', 'completed', 'cancelled'].includes(newStatus)) {
    return error('Invalid status', 400);
  }

  const updates: string[] = ['status = ?', 'updated_at = datetime("now")'];
  const values: any[] = [newStatus];

  // Auto-set timestamps based on status transition
  if (newStatus === 'in_progress') {
    updates.push('started_at = datetime("now")');
  }
  if (newStatus === 'completed') {
    updates.push('completed_at = datetime("now")');
    // Calculate actual_duration if started_at exists
    const wo = await env.DB.prepare(
      `SELECT started_at FROM work_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(params!.id, ...(tenantId ? [tenantId] : [])).first() as any;
    if (wo?.started_at) {
      const startedAt = new Date(wo.started_at).getTime();
      const now = Date.now();
      const durationMinutes = Math.round((now - startedAt) / 60000);
      updates.push('actual_duration = ?');
      values.push(durationMinutes);
    }
  }

  values.push(params!.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(`UPDATE work_orders SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();

  return json({ success: true });
});

// Work Orders: Delete
route('DELETE', '/api/work-orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);

  await env.DB.prepare(
    `DELETE FROM work_orders WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params!.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== CATEGORIES ROUTES ====================

route('GET', '/api/categories', async (request, env) => {
  const tenantId = getTenantId(request);
  // Кэшируем категории на 24 часа (статические данные)
  const cacheKey = `${CachePrefix.CATEGORIES_ALL}:${tenantId || 'global'}`;
  const results = await cachedQuery(
    cacheKey,
    CacheTTL.CATEGORIES,
    async () => {
      const { results } = await env.DB.prepare(`SELECT * FROM categories WHERE is_active = 1 ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`).bind(...(tenantId ? [tenantId] : [])).all();
      return results;
    },
    env.RATE_LIMITER
  );

  return json(results, 200, 'public, max-age=86400'); // 24 hours
});

// ==================== RATINGS ROUTES ====================

// Ratings: Create
route('POST', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO employee_ratings (id, executor_id, resident_id, quality, speed, politeness, comment)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.executor_id, user.id, body.quality, body.speed, body.politeness, body.comment || null).run();

  return json({ id }, 201);
});

// Ratings: Get for user
route('GET', '/api/ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const { results } = await env.DB.prepare(`
    SELECT * FROM employee_ratings WHERE resident_id = ?
  `).bind(user.id).all();

  return json(results);
});

// ==================== UK SATISFACTION RATINGS ====================

// Submit monthly UK satisfaction rating
route('POST', '/api/uk-ratings', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { overall, cleanliness, responsiveness, communication, comment } = body;

  if (!overall || overall < 1 || overall > 5) {
    return error('Invalid overall rating', 400);
  }

  const tenantId = getTenantId(request) || 'default';
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const id = crypto.randomUUID();

  try {
    await env.DB.prepare(`
      INSERT INTO uk_satisfaction_ratings (id, resident_id, tenant_id, period, overall, cleanliness, responsiveness, communication, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(resident_id, tenant_id, period) DO UPDATE SET
        overall = excluded.overall,
        cleanliness = excluded.cleanliness,
        responsiveness = excluded.responsiveness,
        communication = excluded.communication,
        comment = excluded.comment,
        created_at = datetime('now')
    `).bind(id, user.id, tenantId, period, overall, cleanliness || null, responsiveness || null, communication || null, comment || null).run();

    return json({ success: true, period });
  } catch (e: any) {
    return error('Failed to submit rating: ' + e.message, 500);
  }
});

// Get current user's UK rating for current month
route('GET', '/api/uk-ratings/my', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantId = getTenantId(request) || 'default';
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const result = await env.DB.prepare(`
    SELECT * FROM uk_satisfaction_ratings WHERE resident_id = ? AND tenant_id = ? AND period = ?
  `).bind(user.id, tenantId, period).first();

  return json({ rating: result || null, period });
});

// Get UK rating summary (admin/director/manager)
route('GET', '/api/uk-ratings/summary', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'manager', 'director', 'department_head'].includes(user.role)) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request) || 'default';
  const url = new URL(request.url);
  const months = parseInt(url.searchParams.get('months') || '6');

  // Get monthly averages for the last N months
  const { results: monthlyData } = await env.DB.prepare(`
    SELECT
      period,
      COUNT(*) as total_votes,
      ROUND(AVG(overall), 2) as avg_overall,
      ROUND(AVG(cleanliness), 2) as avg_cleanliness,
      ROUND(AVG(responsiveness), 2) as avg_responsiveness,
      ROUND(AVG(communication), 2) as avg_communication
    FROM uk_satisfaction_ratings
    WHERE tenant_id = ?
    GROUP BY period
    ORDER BY period DESC
    LIMIT ?
  `).bind(tenantId, months).all();

  // Get current month stats
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1);
  const prevPeriod = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  const currentMonth = monthlyData.find((m: any) => m.period === currentPeriod);
  const previousMonth = monthlyData.find((m: any) => m.period === prevPeriod);

  // Calculate trend
  let trend = 0;
  if (currentMonth && previousMonth) {
    trend = Math.round(((currentMonth as any).avg_overall - (previousMonth as any).avg_overall) / (previousMonth as any).avg_overall * 100);
  }

  // Get recent comments
  const { results: recentComments } = await env.DB.prepare(`
    SELECT r.comment, r.overall, r.period, r.created_at, u.name as resident_name
    FROM uk_satisfaction_ratings r
    LEFT JOIN users u ON r.resident_id = u.id
    WHERE r.tenant_id = ? AND r.comment IS NOT NULL AND r.comment != ''
    ORDER BY r.created_at DESC
    LIMIT 10
  `).bind(tenantId).all();

  return json({
    monthly: monthlyData,
    current: currentMonth || null,
    previous: previousMonth || null,
    trend,
    recentComments,
    currentPeriod,
  });
});

// ==================== TRAINING SYSTEM ROUTES ====================

// Training Partners: List all
route('GET', '/api/training/partners', async (request, env) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  let whereClause = tenantId ? 'WHERE tenant_id = ?' : '';
  const params: any[] = tenantId ? [tenantId] : [];

  if (activeOnly) {
    whereClause += (whereClause ? ' AND ' : 'WHERE ') + 'is_active = 1';
  }

  const query = `SELECT * FROM training_partners ${whereClause} ORDER BY name`;
  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ partners: results });
});

// Training Partners: Get by ID
route('GET', '/api/training/partners/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const partner = await env.DB.prepare(`SELECT * FROM training_partners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!partner) {
    return error('Partner not found', 404);
  }
  return json({ partner });
});

// Training Partners: Create
route('POST', '/api/training/partners', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO training_partners (
      id, name, position, specialization, email, phone, bio, avatar_url, is_active, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.name,
    body.position || null,
    body.specialization || null,
    body.email || null,
    body.phone || null,
    body.bio || null,
    body.avatar_url || body.avatarUrl || null,
    body.is_active !== false ? 1 : 0,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?').bind(id).first();
  return json({ partner: created }, 201);
});

// Training Partners: Update
route('PATCH', '/api/training/partners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'name', db: 'name' },
    { api: 'position', db: 'position' },
    { api: 'specialization', db: 'specialization' },
    { api: 'email', db: 'email' },
    { api: 'phone', db: 'phone' },
    { api: 'bio', db: 'bio' },
    { api: 'avatarUrl', db: 'avatar_url' },
    { api: 'avatar_url', db: 'avatar_url' },
    { api: 'isActive', db: 'is_active' },
    { api: 'is_active', db: 'is_active' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      if (field.db === 'is_active') {
        values.push(body[field.api] ? 1 : 0);
      } else {
        values.push(body[field.api]);
      }
    }
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    const tenantId = getTenantId(request);
    await env.DB.prepare(`
      UPDATE training_partners SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_partners WHERE id = ?').bind(params.id).first();
  return json({ partner: updated });
});

// Training Partners: Delete
route('DELETE', '/api/training/partners/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM training_partners WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Training Proposals: List
route('GET', '/api/training/proposals', async (request, env) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const partnerId = url.searchParams.get('partner_id') || url.searchParams.get('partnerId');
  const authorId = url.searchParams.get('author_id') || url.searchParams.get('authorId');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  let query = 'SELECT * FROM training_proposals WHERE 1=1';
  const params: any[] = [];

  if (tenantId) {
    query += ' AND tenant_id = ?';
    params.push(tenantId);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (partnerId) {
    query += ' AND partner_id = ?';
    params.push(partnerId);
  }
  if (authorId) {
    query += ' AND author_id = ?';
    params.push(authorId);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Get vote counts and registered counts for each proposal
  const proposalsWithCounts = await Promise.all(results.map(async (p: any) => {
    const [voteCount, regCount] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM training_votes WHERE proposal_id = ?').bind(p.id).first(),
      env.DB.prepare('SELECT COUNT(*) as count FROM training_registrations WHERE proposal_id = ?').bind(p.id).first()
    ]);
    return {
      ...p,
      vote_count: (voteCount as any)?.count || 0,
      registered_count: (regCount as any)?.count || 0,
      preferred_time_slots: p.preferred_time_slots ? JSON.parse(p.preferred_time_slots) : []
    };
  }));

  return json({ proposals: proposalsWithCounts });
});

// Training Proposals: Get by ID with full details
route('GET', '/api/training/proposals/:id', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(`SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  // Get votes, registrations, feedback
  const [votes, registrations, feedback] = await Promise.all([
    env.DB.prepare('SELECT * FROM training_votes WHERE proposal_id = ? ORDER BY voted_at DESC')
      .bind(params.id).all(),
    env.DB.prepare('SELECT * FROM training_registrations WHERE proposal_id = ? ORDER BY registered_at DESC')
      .bind(params.id).all(),
    env.DB.prepare('SELECT * FROM training_feedback WHERE proposal_id = ? ORDER BY created_at DESC')
      .bind(params.id).all()
  ]);

  return json({
    proposal: {
      ...proposal,
      preferred_time_slots: proposal.preferred_time_slots ? JSON.parse(proposal.preferred_time_slots) : [],
      votes: votes.results,
      registrations: registrations.results,
      feedback: feedback.results
    }
  });
});

// Training Proposals: Create
route('POST', '/api/training/proposals', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const id = generateId();

  // Get default vote threshold from settings
  const thresholdSetting = await env.DB.prepare(
    "SELECT value FROM training_settings WHERE key = 'vote_threshold'"
  ).first() as any;
  const voteThreshold = parseInt(thresholdSetting?.value || '5');

  // Get partner name
  const partner = await env.DB.prepare('SELECT name FROM training_partners WHERE id = ?')
    .bind(body.partner_id || body.partnerId).first() as any;

  if (!partner) {
    return error('Partner not found', 404);
  }

  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO training_proposals (
      id, topic, description,
      author_id, author_name, is_author_anonymous,
      partner_id, partner_name,
      format, preferred_time_slots, vote_threshold, status, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'voting', ?)
  `).bind(
    id,
    body.topic,
    body.description || null,
    authUser.id,
    authUser.name,
    body.is_author_anonymous || body.isAuthorAnonymous ? 1 : 0,
    body.partner_id || body.partnerId,
    partner.name,
    body.format || 'offline',
    JSON.stringify(body.preferred_time_slots || body.preferredTimeSlots || []),
    voteThreshold,
    getTenantId(request)
  ).run();

  // Create notification for all employees about new proposal
  const notifyAll = await env.DB.prepare(
    "SELECT value FROM training_settings WHERE key = 'notify_all_on_new_proposal'"
  ).first() as any;

  if (notifyAll?.value === 'true') {
    const notifId = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'new_proposal', ?, 'all', 'employee', ?, ?)
    `).bind(
      notifId, id,
      'Новое предложение тренинга',
      `Предложена тема: "${body.topic}"`
    ).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(id).first();
  return json({ proposal: created }, 201);
});

// Training Proposals: Update
route('PATCH', '/api/training/proposals/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'topic', db: 'topic' },
    { api: 'description', db: 'description' },
    { api: 'format', db: 'format' },
    { api: 'status', db: 'status' },
    { api: 'scheduledDate', db: 'scheduled_date' },
    { api: 'scheduled_date', db: 'scheduled_date' },
    { api: 'scheduledTime', db: 'scheduled_time' },
    { api: 'scheduled_time', db: 'scheduled_time' },
    { api: 'scheduledLocation', db: 'scheduled_location' },
    { api: 'scheduled_location', db: 'scheduled_location' },
    { api: 'scheduledLink', db: 'scheduled_link' },
    { api: 'scheduled_link', db: 'scheduled_link' },
    { api: 'maxParticipants', db: 'max_participants' },
    { api: 'max_participants', db: 'max_participants' },
    { api: 'partnerResponse', db: 'partner_response' },
    { api: 'partner_response', db: 'partner_response' },
    { api: 'partnerResponseNote', db: 'partner_response_note' },
    { api: 'partner_response_note', db: 'partner_response_note' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      values.push(body[field.api]);
    }
  }

  if (body.preferredTimeSlots || body.preferred_time_slots) {
    updates.push('preferred_time_slots = ?');
    values.push(JSON.stringify(body.preferredTimeSlots || body.preferred_time_slots));
  }

  if (body.partnerResponse || body.partner_response) {
    updates.push("partner_response_at = datetime('now')");
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);

    const tenantId = getTenantId(request);
    await env.DB.prepare(`
      UPDATE training_proposals SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values, ...(tenantId ? [tenantId] : [])).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Proposals: Delete
route('DELETE', '/api/training/proposals/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const tenantId = getTenantId(request);
  await env.DB.prepare(`DELETE FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Training Proposals: Schedule
route('POST', '/api/training/proposals/:id/schedule', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const existingProposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existingProposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE training_proposals
    SET status = 'scheduled',
        scheduled_date = ?,
        scheduled_time = ?,
        scheduled_location = ?,
        scheduled_link = ?,
        max_participants = ?,
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.scheduledDate || body.scheduled_date,
    body.scheduledTime || body.scheduled_time,
    body.scheduledLocation || body.scheduled_location || null,
    body.scheduledLink || body.scheduled_link || null,
    body.maxParticipants || body.max_participants || null,
    params.id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  // Notify all voters about scheduling
  const proposal = await env.DB.prepare('SELECT topic FROM training_proposals WHERE id = ?')
    .bind(params.id).first() as any;
  const { results: votes } = await env.DB.prepare('SELECT DISTINCT voter_id FROM training_votes WHERE proposal_id = ?')
    .bind(params.id).all();

  for (const vote of votes) {
    const notifId = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'training_scheduled', ?, ?, 'employee', ?, ?)
    `).bind(
      notifId, params.id, (vote as any).voter_id,
      'Тренинг запланирован',
      `Тренинг "${proposal.topic}" состоится ${body.scheduledDate || body.scheduled_date} в ${body.scheduledTime || body.scheduled_time}`
    ).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Proposals: Complete
route('POST', '/api/training/proposals/:id/complete', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const existingProposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!existingProposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  // Get actual participants count
  const regCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM training_registrations WHERE proposal_id = ? AND attended = 1'
  ).bind(params.id).first() as any;

  await env.DB.prepare(`
    UPDATE training_proposals
    SET status = 'completed',
        completed_at = datetime('now'),
        actual_participants_count = ?,
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(
    body.actualParticipantsCount || body.actual_participants_count || regCount?.count || 0,
    params.id,
    ...(tenantId ? [tenantId] : [])
  ).run();

  // Update partner's trainings_conducted count
  const proposal = await env.DB.prepare('SELECT partner_id FROM training_proposals WHERE id = ?')
    .bind(params.id).first() as any;

  if (proposal) {
    await env.DB.prepare(`
      UPDATE training_partners
      SET trainings_conducted = trainings_conducted + 1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(proposal.partner_id).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM training_proposals WHERE id = ?').bind(params.id).first();
  return json({ proposal: updated });
});

// Training Votes: Add vote
route('POST', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Verify proposal belongs to tenant
  const proposal = await env.DB.prepare(
    `SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  // Check if already voted
  const existing = await env.DB.prepare(
    'SELECT id FROM training_votes WHERE proposal_id = ? AND voter_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Already voted', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_votes (
      id, proposal_id, voter_id, voter_name, participation_intent, is_anonymous
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.proposalId,
    authUser.id,
    authUser.name,
    body.participationIntent || body.participation_intent || 'definitely',
    body.isAnonymous || body.is_anonymous ? 1 : 0
  ).run();

  // Check if threshold reached
  const voteCount = await env.DB.prepare('SELECT COUNT(*) as count FROM training_votes WHERE proposal_id = ?')
    .bind(params.proposalId).first() as any;

  if (proposal && proposal.status === 'voting' && voteCount.count >= proposal.vote_threshold) {
    // Update status to review
    await env.DB.prepare(`
      UPDATE training_proposals SET status = 'review', updated_at = datetime('now') WHERE id = ?
    `).bind(params.proposalId).run();

    // Notify admin
    const notifId1 = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'threshold_reached', ?, 'admin', 'admin', ?, ?)
    `).bind(
      notifId1, params.proposalId,
      'Порог голосов достигнут',
      `Предложение "${proposal.topic}" набрало необходимое количество голосов`
    ).run();

    // Notify partner
    const notifId2 = generateId();
    await env.DB.prepare(`
      INSERT INTO training_notifications (
        id, type, proposal_id, recipient_id, recipient_role, title, message
      ) VALUES (?, 'threshold_reached', ?, ?, 'partner', ?, ?)
    `).bind(
      notifId2, params.proposalId, proposal.partner_id,
      'Приглашение провести тренинг',
      `Вас выбрали лектором для тренинга "${proposal.topic}"`
    ).run();
  }

  const created = await env.DB.prepare('SELECT * FROM training_votes WHERE id = ?').bind(id).first();
  return json({ vote: created }, 201);
});

// Training Votes: Remove vote
route('DELETE', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  await env.DB.prepare(
    'DELETE FROM training_votes WHERE proposal_id = ? AND voter_id = ?'
  ).bind(params.proposalId, authUser.id).run();

  return json({ success: true });
});

// Training Votes: Get for proposal
route('GET', '/api/training/proposals/:proposalId/votes', async (request, env, params) => {
  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM training_votes WHERE proposal_id = ? ORDER BY voted_at DESC'
  ).bind(params.proposalId).all();

  return json({ votes: results });
});

// Training Registrations: Register
route('POST', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  // Check if already registered
  const existing = await env.DB.prepare(
    'SELECT id FROM training_registrations WHERE proposal_id = ? AND user_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Already registered', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_registrations (id, proposal_id, user_id, user_name)
    VALUES (?, ?, ?, ?)
  `).bind(id, params.proposalId, authUser.id, authUser.name).run();

  const created = await env.DB.prepare('SELECT * FROM training_registrations WHERE id = ?').bind(id).first();
  return json({ registration: created }, 201);
});

// Training Registrations: Unregister
route('DELETE', '/api/training/proposals/:proposalId/register', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  await env.DB.prepare(
    'DELETE FROM training_registrations WHERE proposal_id = ? AND user_id = ?'
  ).bind(params.proposalId, authUser.id).run();

  return json({ success: true });
});

// Training Registrations: Confirm attendance
route('POST', '/api/training/proposals/:proposalId/attendance/:userId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  await env.DB.prepare(`
    UPDATE training_registrations
    SET attended = 1, attendance_confirmed_at = datetime('now')
    WHERE proposal_id = ? AND user_id = ?
  `).bind(params.proposalId, params.userId).run();

  return json({ success: true });
});

// Training Feedback: Add
route('POST', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT * FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const body = await request.json() as any;

  // Check if already submitted feedback
  const existing = await env.DB.prepare(
    'SELECT id FROM training_feedback WHERE proposal_id = ? AND reviewer_id = ?'
  ).bind(params.proposalId, authUser.id).first();

  if (existing) {
    return error('Feedback already submitted', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO training_feedback (
      id, proposal_id, reviewer_id, reviewer_name, is_anonymous,
      rating, content_rating, presenter_rating, usefulness_rating, comment
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    params.proposalId,
    authUser.id,
    authUser.name,
    body.isAnonymous || body.is_anonymous ? 1 : 0,
    body.rating,
    body.contentRating || body.content_rating || null,
    body.presenterRating || body.presenter_rating || null,
    body.usefulnessRating || body.usefulness_rating || null,
    body.comment || null
  ).run();

  // Update partner's average rating
  const avgRating = await env.DB.prepare(`
    SELECT AVG(rating) as avg FROM training_feedback f
    JOIN training_proposals p ON f.proposal_id = p.id
    WHERE p.partner_id = ?
  `).bind(proposal.partner_id).first() as any;

  await env.DB.prepare(`
    UPDATE training_partners SET average_rating = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(avgRating?.avg || 0, proposal.partner_id).run();

  const created = await env.DB.prepare('SELECT * FROM training_feedback WHERE id = ?').bind(id).first();
  return json({ feedback: created }, 201);
});

// Training Feedback: Get for proposal
route('GET', '/api/training/proposals/:proposalId/feedback', async (request, env, params) => {
  // MULTI-TENANCY: Verify proposal belongs to tenant
  const tenantId = getTenantId(request);
  const proposal = await env.DB.prepare(
    `SELECT id FROM training_proposals WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.proposalId, ...(tenantId ? [tenantId] : [])).first();

  if (!proposal) {
    return error('Proposal not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM training_feedback WHERE proposal_id = ? ORDER BY created_at DESC'
  ).bind(params.proposalId).all();

  return json({ feedback: results });
});

// Training Notifications: Get for user
route('GET', '/api/training/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id via proposals table
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let query = `
    SELECT tn.* FROM training_notifications tn
    LEFT JOIN training_proposals tp ON tn.proposal_id = tp.id
    WHERE (tn.recipient_id = ? OR tn.recipient_id = 'all')
    ${tenantId ? 'AND (tp.tenant_id = ? OR tp.id IS NULL)' : ''}
  `;

  if (isAdminLevel(authUser)) {
    query = `
      SELECT tn.* FROM training_notifications tn
      LEFT JOIN training_proposals tp ON tn.proposal_id = tp.id
      WHERE (tn.recipient_id = ? OR tn.recipient_id = 'all' OR tn.recipient_id = 'admin')
      ${tenantId ? 'AND (tp.tenant_id = ? OR tp.id IS NULL)' : ''}
    `;
  }

  if (unreadOnly) {
    query += ' AND tn.is_read = 0';
  }

  query += ' ORDER BY tn.created_at DESC LIMIT 100';

  const { results } = await env.DB.prepare(query).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();
  return json({ notifications: results });
});

// Training Notifications: Mark as read
route('POST', '/api/training/notifications/:id/read', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify notification belongs to tenant via proposals
  const tenantId = getTenantId(request);
  if (tenantId) {
    const notif = await env.DB.prepare(`
      SELECT tn.id FROM training_notifications tn
      LEFT JOIN training_proposals tp ON tn.proposal_id = tp.id
      WHERE tn.id = ? AND (tp.tenant_id = ? OR tp.id IS NULL)
    `).bind(params.id, tenantId).first();

    if (!notif) {
      return error('Notification not found', 404);
    }
  }

  await env.DB.prepare('UPDATE training_notifications SET is_read = 1 WHERE id = ?')
    .bind(params.id).run();

  return json({ success: true });
});

// Training Notifications: Mark all as read
route('POST', '/api/training/notifications/read-all', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Only update notifications belonging to tenant
  const tenantId = getTenantId(request);

  if (tenantId) {
    await env.DB.prepare(`
      UPDATE training_notifications SET is_read = 1
      WHERE (recipient_id = ? OR recipient_id = 'all')
      AND id IN (
        SELECT tn.id FROM training_notifications tn
        LEFT JOIN training_proposals tp ON tn.proposal_id = tp.id
        WHERE tp.tenant_id = ? OR tp.id IS NULL
      )
    `).bind(authUser.id, tenantId).run();

    if (isAdminLevel(authUser)) {
      await env.DB.prepare(`
        UPDATE training_notifications SET is_read = 1
        WHERE recipient_id = 'admin'
        AND id IN (
          SELECT tn.id FROM training_notifications tn
          LEFT JOIN training_proposals tp ON tn.proposal_id = tp.id
          WHERE tp.tenant_id = ? OR tp.id IS NULL
        )
      `).bind(tenantId).run();
    }
  } else {
    await env.DB.prepare(`
      UPDATE training_notifications SET is_read = 1
      WHERE recipient_id = ? OR recipient_id = 'all'
    `).bind(authUser.id).run();

    if (isAdminLevel(authUser)) {
      await env.DB.prepare(`
        UPDATE training_notifications SET is_read = 1 WHERE recipient_id = 'admin'
      `).run();
    }
  }

  return json({ success: true });
});

// Training Settings: Get all
route('GET', '/api/training/settings', async (request, env) => {
  const { results } = await env.DB.prepare('SELECT * FROM training_settings').all();

  // Convert to object
  const settings: Record<string, any> = {};
  for (const row of results) {
    const r = row as any;
    // Parse boolean values
    if (r.value === 'true') settings[r.key] = true;
    else if (r.value === 'false') settings[r.key] = false;
    else if (!isNaN(Number(r.value))) settings[r.key] = Number(r.value);
    else settings[r.key] = r.value;
  }

  return json({ settings });
});

// Training Settings: Update
route('PATCH', '/api/training/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;

  for (const [key, value] of Object.entries(body)) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO training_settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
    `).bind(key, String(value)).run();
  }

  return json({ success: true });
});

// Training Stats
route('GET', '/api/training/stats', async (request, env) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const [
    totalProposals,
    votingProposals,
    scheduledTrainings,
    completedTrainings,
    totalVotes,
    totalRegistrations,
    avgRating
  ] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals ${tenantId ? 'WHERE tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals WHERE status = 'voting' ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals WHERE status = 'scheduled' ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_proposals WHERE status = 'completed' ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_votes tv JOIN training_proposals tp ON tv.proposal_id = tp.id ${tenantId ? 'WHERE tp.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM training_registrations tr JOIN training_proposals tp ON tr.proposal_id = tp.id ${tenantId ? 'WHERE tp.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first(),
    env.DB.prepare(`SELECT AVG(tf.rating) as avg FROM training_feedback tf JOIN training_proposals tp ON tf.proposal_id = tp.id ${tenantId ? 'WHERE tp.tenant_id = ?' : ''}`).bind(...(tenantId ? [tenantId] : [])).first()
  ]);

  return json({
    stats: {
      totalProposals: (totalProposals as any)?.count || 0,
      votingProposals: (votingProposals as any)?.count || 0,
      scheduledTrainings: (scheduledTrainings as any)?.count || 0,
      completedTrainings: (completedTrainings as any)?.count || 0,
      totalVotes: (totalVotes as any)?.count || 0,
      totalParticipants: (totalRegistrations as any)?.count || 0,
      averageRating: (avgRating as any)?.avg || 0
    }
  });
});

// ==================== MEETING SYSTEM ROUTES ====================

// Helper: Generate vote hash
const generateVoteHash = (data: any): string => {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(16, '0');
};

// Helper: Generate OTP code
const generateOTPCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Meetings: List (with caching for performance)
route('GET', '/api/meetings', async (request, env) => {
  const url = new URL(request.url);
  let buildingId = url.searchParams.get('building_id');
  const status = url.searchParams.get('status');
  const organizerId = url.searchParams.get('organizer_id');
  const onlyActive = url.searchParams.get('only_active') === 'true'; // ✅ NEW: Filter for active meetings only
  const tenantId = getTenantId(request);

  // ✅ FIX: For residents, automatically filter by their building
  const authUser = await getUser(request, env);
  if (authUser?.role === 'resident' && authUser.building_id) {
    buildingId = authUser.building_id; // Force filter by user's building
  }

  // ✅ OPTIMIZED: Cache key includes only_active flag and user's building for residents
  const cacheKey = `meetings:${buildingId || 'all'}:${status || 'all'}:${organizerId || 'all'}:${onlyActive ? 'active' : 'all'}:${tenantId || 'no-tenant'}`;
  const cached = getCached<any>(cacheKey);
  if (cached) {
    return json({ meetings: cached });
  }

  let query = 'SELECT * FROM meetings WHERE 1=1';
  const params: any[] = [];

  if (tenantId) {
    query += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  if (buildingId) {
    query += ' AND building_id = ?';
    params.push(buildingId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  if (organizerId) {
    query += ' AND organizer_id = ?';
    params.push(organizerId);
  }

  // ✅ NEW: Filter only active meetings (includes draft for creators/admins)
  if (onlyActive) {
    query += ` AND status IN ('draft', 'pending_moderation', 'schedule_poll_open', 'schedule_confirmed', 'voting_open', 'voting_closed', 'results_published', 'protocol_generated', 'protocol_approved')`;
  }

  // ✅ OPTIMIZED: Reduced limit for active-only queries
  const limit = onlyActive ? 20 : 50;
  query += ` ORDER BY created_at DESC LIMIT ${limit}`;

  const { results } = await env.DB.prepare(query).bind(...params).all();

  // Batch fetch related data for all meetings at once (reduces N+1)
  const meetingIds = results.map((m: any) => m.id);

  if (meetingIds.length === 0) {
    return json({ meetings: [] });
  }

  // Parallel fetch all related data (including agenda votes)
  const [allOptions, allAgenda, allParticipation, allAgendaVotes] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meeting_schedule_options WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT * FROM meeting_agenda_items WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) ORDER BY item_order`).bind(...meetingIds).all(),
    env.DB.prepare(`SELECT meeting_id, COUNT(DISTINCT user_id) as count FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) GROUP BY meeting_id`).bind(...meetingIds).all(),
    // Fetch agenda votes to show voting progress (include vote_weight for participation calc)
    env.DB.prepare(`SELECT meeting_id, agenda_item_id, choice, voter_id, vote_weight FROM meeting_vote_records WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')}) AND is_revote = 0`).bind(...meetingIds).all()
  ]);

  // Get votes for options in batch (include vote_weight for proper weighting)
  // Note: use user_id as primary key (NOT NULL), voter_id is nullable legacy
  const optionIds = (allOptions.results as any[]).map(o => o.id);
  let allVotes: any[] = [];
  if (optionIds.length > 0) {
    const votesResult = await env.DB.prepare(
      `SELECT option_id, user_id, vote_weight FROM meeting_schedule_votes WHERE option_id IN (${optionIds.map(() => '?').join(',')})`
    ).bind(...optionIds).all();
    allVotes = votesResult.results as any[];
  }

  // Build lookup maps for O(1) access
  const optionsMap = new Map<string, any[]>();
  for (const opt of allOptions.results as any[]) {
    if (!optionsMap.has(opt.meeting_id)) optionsMap.set(opt.meeting_id, []);
    const optionVotes = allVotes.filter(v => v.option_id === opt.id);
    const totalWeight = optionVotes.reduce((sum, v) => sum + (v.vote_weight || 0), 0);
    optionsMap.get(opt.meeting_id)!.push({
      ...opt,
      votes: optionVotes.map(v => v.user_id),
      voteWeight: totalWeight, // Total area (sq.m) voting for this option
      voteCount: optionVotes.length // Count of voters
    });
  }

  // Group agenda votes by meeting_id and agenda_item_id
  const agendaVotesMap = new Map<string, Map<string, { for: string[], against: string[], abstain: string[] }>>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!agendaVotesMap.has(vote.meeting_id)) {
      agendaVotesMap.set(vote.meeting_id, new Map());
    }
    const meetingVotes = agendaVotesMap.get(vote.meeting_id)!;
    if (!meetingVotes.has(vote.agenda_item_id)) {
      meetingVotes.set(vote.agenda_item_id, { for: [], against: [], abstain: [] });
    }
    const itemVotes = meetingVotes.get(vote.agenda_item_id)!;
    if (vote.choice in itemVotes) {
      itemVotes[vote.choice as 'for' | 'against' | 'abstain'].push(vote.voter_id);
    }
  }

  const agendaMap = new Map<string, any[]>();
  for (const item of allAgenda.results as any[]) {
    if (!agendaMap.has(item.meeting_id)) agendaMap.set(item.meeting_id, []);
    // Get votes for this agenda item
    const meetingVotes = agendaVotesMap.get(item.meeting_id);
    const itemVotes = meetingVotes?.get(item.id) || { for: [], against: [], abstain: [] };
    agendaMap.get(item.meeting_id)!.push({
      ...item,
      votes_for_area: itemVotes.for.length,
      votes_against_area: itemVotes.against.length,
      votes_abstain_area: itemVotes.abstain.length,
    });
  }

  const participationMap = new Map<string, number>();
  for (const p of allParticipation.results as any[]) {
    participationMap.set(p.meeting_id, p.count);
  }

  // Get list of participated voters for each meeting
  const participatedVotersResult = await env.DB.prepare(
    `SELECT DISTINCT meeting_id, user_id FROM meeting_participated_voters WHERE meeting_id IN (${meetingIds.map(() => '?').join(',')})`
  ).bind(...meetingIds).all();

  const participatedVotersMap = new Map<string, string[]>();
  for (const p of participatedVotersResult.results as any[]) {
    if (!participatedVotersMap.has(p.meeting_id)) {
      participatedVotersMap.set(p.meeting_id, []);
    }
    participatedVotersMap.get(p.meeting_id)!.push(p.user_id);
  }

  // Calculate real-time participation_percent per meeting from vote weights
  const votedAreaMap = new Map<string, number>();
  for (const vote of allAgendaVotes.results as any[]) {
    const key = `${vote.meeting_id}:${vote.voter_id}`;
    if (!votedAreaMap.has(vote.meeting_id)) {
      votedAreaMap.set(vote.meeting_id, 0);
    }
    // Track unique voters per meeting for area calculation
    const voterKey = `__voter_${vote.meeting_id}:${vote.voter_id}`;
    if (!votedAreaMap.has(voterKey)) {
      votedAreaMap.set(voterKey, 1);
      votedAreaMap.set(vote.meeting_id, (votedAreaMap.get(vote.meeting_id) || 0) + (Number(vote.vote_weight) || 0));
    }
  }

  // Build final response
  const meetingsWithDetails = results.map((m: any) => {
    const totalArea = Number(m.total_area) || 0;
    const votedArea = votedAreaMap.get(m.id) || 0;
    const realTimePercent = totalArea > 0 ? Math.min((votedArea / totalArea) * 100, 100) : 0;
    return {
      ...m,
      materials: m.materials ? JSON.parse(m.materials) : [],
      scheduleOptions: optionsMap.get(m.id) || [],
      agendaItems: agendaMap.get(m.id) || [],
      participated_count: participationMap.get(m.id) || 0,
      participated_voters: participatedVotersMap.get(m.id) || [],
      // Real-time area-based participation (override stale DB value)
      participation_percent: realTimePercent,
      quorum_reached: realTimePercent >= (Number(m.quorum_percent) || 50),
    };
  });

  // Cache for 10 seconds
  setCache(cacheKey, meetingsWithDetails, 10000);

  return json({ meetings: meetingsWithDetails });
});

// Meetings: Get by ID with full details
route('GET', '/api/meetings/:id', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // ✅ OPTIMIZED: Get all related data in parallel (batch queries)
  const [scheduleOptions, agendaItems, eligibleVoters, participatedVoters, allScheduleVotes, allAgendaVotes, protocol] = await Promise.all([
    env.DB.prepare(`SELECT * FROM meeting_schedule_options WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order`).bind(params.id).all(),
    env.DB.prepare(`SELECT user_id, apartment_id, ownership_share FROM meeting_eligible_voters WHERE meeting_id = ?`).bind(params.id).all(),
    env.DB.prepare(`SELECT DISTINCT user_id, MIN(first_vote_at) as first_vote_at FROM meeting_participated_voters WHERE meeting_id = ? GROUP BY user_id`).bind(params.id).all(),

    // ✅ NEW: Single query for ALL schedule votes (include vote_weight)
    // Note: use user_id as primary key (NOT NULL), voter_id is nullable
    env.DB.prepare(`
      SELECT option_id, user_id, voter_name, vote_weight
      FROM meeting_schedule_votes
      WHERE meeting_id = ?
    `).bind(params.id).all(),

    // ✅ NEW: Single query for ALL agenda votes (include vote_weight, exclude revotes)
    env.DB.prepare(`
      SELECT agenda_item_id, choice, voter_id, vote_weight
      FROM meeting_vote_records
      WHERE meeting_id = ? AND is_revote = 0
    `).bind(params.id).all(),

    meeting.protocol_id ? env.DB.prepare(`SELECT * FROM meeting_protocols WHERE id = ?`).bind(meeting.protocol_id).first() : null
  ]);

  // ✅ OPTIMIZED: Group votes in memory (O(n) instead of N+1 queries)
  // Group schedule votes by option_id with weights
  const votesByOption = new Map<string, { voters: string[], totalWeight: number }>();
  for (const vote of allScheduleVotes.results as any[]) {
    if (!votesByOption.has(vote.option_id)) {
      votesByOption.set(vote.option_id, { voters: [], totalWeight: 0 });
    }
    const optVotes = votesByOption.get(vote.option_id)!;
    optVotes.voters.push(vote.user_id);
    optVotes.totalWeight += (vote.vote_weight || 0);
  }

  // Group agenda votes by item and choice with weights
  const votesByAgenda = new Map<string, {
    for: { voters: string[], weight: number },
    against: { voters: string[], weight: number },
    abstain: { voters: string[], weight: number }
  }>();
  for (const vote of allAgendaVotes.results as any[]) {
    if (!votesByAgenda.has(vote.agenda_item_id)) {
      votesByAgenda.set(vote.agenda_item_id, {
        for: { voters: [], weight: 0 },
        against: { voters: [], weight: 0 },
        abstain: { voters: [], weight: 0 }
      });
    }
    const agendaVotes = votesByAgenda.get(vote.agenda_item_id)!;
    const choice = vote.choice as 'for' | 'against' | 'abstain';
    if (choice in agendaVotes) {
      agendaVotes[choice].voters.push(vote.voter_id);
      agendaVotes[choice].weight += (vote.vote_weight || 0);
    }
  }

  // Calculate total voted weight for participation
  const totalVotedWeight = Array.from(votesByAgenda.values()).reduce((max, v) => {
    const itemTotal = v.for.weight + v.against.weight + v.abstain.weight;
    return Math.max(max, itemTotal);
  }, 0);

  // Build final result
  const optionsWithVotes = scheduleOptions.results.map((opt: any) => {
    const votes = votesByOption.get(opt.id) || { voters: [], totalWeight: 0 };
    return {
      ...opt,
      votes: votes.voters,
      voteWeight: votes.totalWeight,
      voteCount: votes.voters.length
    };
  });

  const agendaWithVotes = agendaItems.results.map((item: any) => {
    const votes = votesByAgenda.get(item.id) || {
      for: { voters: [], weight: 0 },
      against: { voters: [], weight: 0 },
      abstain: { voters: [], weight: 0 }
    };
    const totalItemWeight = votes.for.weight + votes.against.weight + votes.abstain.weight;
    return {
      ...item,
      // Parse attachments JSON
      attachments: item.attachments ? (() => { try { return JSON.parse(item.attachments); } catch { return []; } })() : [],
      // Return numeric weights for proper calculations
      votesFor: votes.for.weight,
      votesAgainst: votes.against.weight,
      votesAbstain: votes.abstain.weight,
      // Also include counts for display
      votesForCount: votes.for.voters.length,
      votesAgainstCount: votes.against.voters.length,
      votesAbstainCount: votes.abstain.voters.length,
      // Total for this item
      totalVotedWeight: totalItemWeight,
      // Voters for debugging/admin view
      votersFor: votes.for.voters,
      votersAgainst: votes.against.voters,
      votersAbstain: votes.abstain.voters
    };
  });

  // Calculate participation metrics
  const participationPercent = meeting.total_area > 0
    ? (totalVotedWeight / meeting.total_area) * 100
    : 0;
  const quorumReached = participationPercent >= (meeting.quorum_percent || 50);

  return json({
    meeting: {
      ...meeting,
      materials: meeting.materials ? JSON.parse(meeting.materials) : [],
      scheduleOptions: optionsWithVotes,
      agendaItems: agendaWithVotes,
      eligibleVoters: eligibleVoters.results.map((v: any) => v.user_id),
      participatedVoters: participatedVoters.results.map((v: any) => v.user_id),
      // Real-time calculated stats
      votedArea: totalVotedWeight,
      participationPercent,
      quorumReached,
      protocol
    }
  });
});

// Meetings: Create
route('POST', '/api/meetings', async (request, env) => {
  console.log('[Meeting] POST /api/meetings called');
  try {
    const authUser = await getUser(request, env);
    console.log('[Meeting] Auth user:', authUser?.id, authUser?.name);
    if (!authUser) {
      return error('Unauthorized', 401);
    }

    let body: any;
    try {
      body = await request.json();
    } catch (e: any) {
      console.error('[Meeting] JSON parse error:', e);
      return error('Invalid JSON body: ' + e.message, 400);
    }

    console.log('[Meeting] Request body keys:', Object.keys(body || {}));

    const id = generateId();

    // Get building settings
    const buildingId = body.building_id || body.buildingId;
    if (!buildingId) {
      return error('building_id is required', 400);
    }

    console.log('[Meeting] Building ID:', buildingId);

    const tenantId = getTenantId(request);
    const settings = await env.DB.prepare(
      'SELECT * FROM meeting_building_settings WHERE building_id = ?'
    ).bind(buildingId).first() as any;

    console.log('[Meeting] Settings:', JSON.stringify(settings));

    const votingUnit = settings?.voting_unit || 'apartment';
    const quorumPercent = settings?.default_quorum_percent || 50;
    const requireModeration = settings?.require_moderation !== 0;

  // Calculate total_area from all residents in this building (sum of total_area)
  // This is critical for quorum calculation per Uzbekistan law
  const areaResult = await env.DB.prepare(`
    SELECT COALESCE(SUM(total_area), 0) as total_area, COUNT(*) as total_count
    FROM users
    WHERE building_id = ? AND role = 'resident' AND total_area > 0 ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;

  const totalArea = areaResult?.total_area || 0;
  const totalEligibleCount = areaResult?.total_count || 0;

  // Get meeting number for this building
  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM meetings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(buildingId, ...(tenantId ? [tenantId] : [])).first() as any;
  const meetingNumber = (countResult?.count || 0) + 1;

  // Initial status:
  // - For UK (management): directly open schedule poll
  // - For residents with moderation: draft (needs approval)
  // - For residents without moderation: schedule_poll_open
  const organizerType = body.organizer_type || body.organizerType || 'uk';
  let initialStatus = 'schedule_poll_open'; // Default: open poll immediately
  if (organizerType === 'resident' && requireModeration) {
    initialStatus = 'pending_moderation'; // Residents need approval
  }

  // Calculate schedule poll end date
  const pollDays = settings?.schedule_poll_duration_days || 3;
  const pollEndDate = new Date();
  pollEndDate.setDate(pollEndDate.getDate() + pollDays);
  pollEndDate.setHours(23, 59, 59, 999);

  // Set schedule_poll_opened_at if status is schedule_poll_open
  const schedulePollOpenedAt = initialStatus === 'schedule_poll_open' ? new Date().toISOString() : null;

  try {
    await env.DB.prepare(`
      INSERT INTO meetings (
        id, number, building_id, building_address, description,
        organizer_type, organizer_id, organizer_name,
        format, status,
        schedule_poll_ends_at, schedule_poll_opened_at,
        location,
        voting_unit, quorum_percent, allow_revote, require_otp, show_intermediate_results,
        materials,
        total_area, total_eligible_count, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      meetingNumber,
      buildingId,
      body.building_address || body.buildingAddress || '',
      body.description || null,
      organizerType,
      authUser.id,
      authUser.name,
      body.format || 'offline',
      initialStatus,
      pollEndDate.toISOString(),
      schedulePollOpenedAt,
      body.location || null,
      votingUnit,
      quorumPercent,
      1, // allow_revote
      1, // require_otp
      0, // show_intermediate_results
      JSON.stringify(body.materials || []),
      totalArea, // Total building area in sq.m for quorum calculation
      totalEligibleCount, // Total number of eligible voters (residents with total_area)
      getTenantId(request)
    ).run();
  } catch (e: any) {
    console.error('[Meeting] Error inserting meeting:', e);
    return error('Failed to create meeting: ' + e.message, 500);
  }

  // Create schedule options (3 options, starting 10 days from now)
  // Use user-provided meeting_time if available, otherwise fall back to settings or default
  const meetingTime = body.meeting_time || body.meetingTime || settings?.default_meeting_time || '19:00';
  const defaultTime = meetingTime;
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() + 10);

  try {
    for (let i = 0; i < 3; i++) {
      const optionDate = new Date(baseDate);
      optionDate.setDate(optionDate.getDate() + i);

      // Format date as YYYY-MM-DD and append user's selected time directly
      // This preserves the exact time user selected without timezone conversion
      const year = optionDate.getFullYear();
      const month = String(optionDate.getMonth() + 1).padStart(2, '0');
      const day = String(optionDate.getDate()).padStart(2, '0');
      const dateTimeStr = `${year}-${month}-${day}T${defaultTime}:00`;

      const optId = generateId();
      await env.DB.prepare(`
        INSERT INTO meeting_schedule_options (id, meeting_id, date_time, tenant_id)
        VALUES (?, ?, ?, ?)
      `).bind(optId, id, dateTimeStr, getTenantId(request)).run();
    }
  } catch (e: any) {
    console.error('[Meeting] Error inserting schedule options:', e);
    return error('Failed to create schedule options: ' + e.message, 500);
  }

  // Create agenda items
  const agendaItems = body.agenda_items || body.agendaItems || [];
  try {
    for (let i = 0; i < agendaItems.length; i++) {
      const item = agendaItems[i];
      const itemId = generateId();
      const attachmentsJson = item.attachments
        ? (typeof item.attachments === 'string' ? item.attachments : JSON.stringify(item.attachments))
        : null;
      await env.DB.prepare(`
        INSERT INTO meeting_agenda_items (id, meeting_id, item_order, title, description, description_extended, attachments, threshold, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        itemId,
        id,
        i + 1,
        item.title,
        item.description || null,
        item.description_extended || item.descriptionExtended || null,
        attachmentsJson,
        item.threshold || 'simple_majority',
        getTenantId(request)
      ).run();
    }
  } catch (e: any) {
    console.error('[Meeting] Error inserting agenda items:', e);
    return error('Failed to create agenda items: ' + e.message, 500);
  }

  // Invalidate meetings cache
  invalidateCache('meetings:');

  const created = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Send push notifications AND in-app notifications to building residents - meeting announced
  if (body.building_id && body.status === 'schedule_poll_open') {
    try {
      const { results: residents } = await env.DB.prepare(
        'SELECT id FROM users WHERE role = ? AND building_id = ?'
      ).bind('resident', body.building_id).all();

      for (const resident of residents as any[]) {
        // In-app notification (stored in DB for viewing in app)
        const notifId = generateId();
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
          VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))
        `).bind(
          notifId,
          resident.id,
          '📢 Новое собрание объявлено',
          `Назначено собрание жильцов дома ${body.building_address || ''}. Примите участие в выборе даты!`,
          JSON.stringify({ meetingId: id, url: '/meetings' })
        ).run();

        // Push notification
        await sendPushNotification(env, resident.id, {
          title: '📢 Новое собрание объявлено',
          body: `Назначено собрание жильцов дома ${body.building_address || ''}. Примите участие в выборе даты!`,
          type: 'meeting',
          tag: `meeting-announced-${id}`,
          data: {
            meetingId: id,
            url: '/meetings'
          },
          requireInteraction: true
        }).catch(() => {});
      }

      console.log(`[Meeting] Created meeting ${id}, sent notifications to ${residents.length} residents`);
    } catch (e: any) {
      console.error('[Meeting] Error sending notifications:', e);
      // Don't fail the request if notifications fail
    }
  }

  return json({ meeting: created }, 201);
  } catch (e: any) {
    console.error('[Meeting] FATAL ERROR creating meeting:', e);
    return error('Meeting creation failed: ' + (e.message || String(e)), 500);
  }
});

// Meetings: Update
route('PATCH', '/api/meetings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = [
    { api: 'status', db: 'status' },
    { api: 'location', db: 'location' },
    { api: 'format', db: 'format' },
    { api: 'confirmedDateTime', db: 'confirmed_date_time' },
    { api: 'confirmed_date_time', db: 'confirmed_date_time' },
    { api: 'quorumPercent', db: 'quorum_percent' },
    { api: 'quorum_percent', db: 'quorum_percent' },
    { api: 'totalEligibleCount', db: 'total_eligible_count' },
    { api: 'total_eligible_count', db: 'total_eligible_count' },
    { api: 'participationPercent', db: 'participation_percent' },
    { api: 'participation_percent', db: 'participation_percent' },
    { api: 'cancellationReason', db: 'cancellation_reason' },
    { api: 'cancellation_reason', db: 'cancellation_reason' },
  ];

  for (const field of fields) {
    if (body[field.api] !== undefined) {
      updates.push(`${field.db} = ?`);
      values.push(body[field.api]);
    }
  }

  if (body.materials) {
    updates.push('materials = ?');
    values.push(JSON.stringify(body.materials));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    if (tenantId) values.push(tenantId);

    await env.DB.prepare(`
      UPDATE meetings SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Submit for moderation
route('POST', '/api/meetings/:id/submit', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    UPDATE meetings SET status = 'pending_moderation', updated_at = datetime('now')
    WHERE id = ? AND status = 'draft' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Approve
route('POST', '/api/meetings/:id/approve', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get meeting info before update
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_poll_open',
        moderated_at = datetime('now'),
        moderated_by = ?,
        schedule_poll_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(authUser.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Send push notifications AND in-app notifications to building residents - meeting announced
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind('resident', meeting.building_id, ...(tenantId ? [tenantId] : [])).all();

    for (const resident of residents as any[]) {
      // In-app notification (stored in DB for viewing in app)
      const notifId = generateId();
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at)
        VALUES (?, ?, 'meeting', ?, ?, ?, 0, datetime('now'))
      `).bind(
        notifId,
        resident.id,
        '📢 Новое собрание объявлено',
        `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`,
        JSON.stringify({ meetingId: params.id, url: '/meetings' })
      ).run();

      // Push notification
      await sendPushNotification(env, resident.id, {
        title: '📢 Новое собрание объявлено',
        body: `Назначено собрание жильцов дома ${meeting.building_address || ''}. Примите участие в выборе даты!`,
        type: 'meeting',
        tag: `meeting-announced-${params.id}`,
        data: {
          meetingId: params.id,
          url: '/meetings'
        },
        requireInteraction: true
      });
    }
  }

  return json({ meeting: updated });
});

// Meetings: Reject
route('POST', '/api/meetings/:id/reject', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'cancelled',
        cancelled_at = datetime('now'),
        cancellation_reason = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'pending_moderation' ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Rejected by moderator', params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  // Notify building residents about meeting rejection
  if (updated?.building_id) {
    const { results: residents } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(updated.building_id, ...(tenantId ? [tenantId] : [])).all();

    const rejectMeetingBody = `Собрание "${updated.title || ''}" отклонено. Причина: ${body.reason || 'не указана'}`;
    for (const resident of (residents || []) as any[]) {
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting_rejected', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), resident.id, '❌ Собрание отклонено', rejectMeetingBody, JSON.stringify({ meeting_id: params.id }), tenantId).run().catch(() => {});
      sendPushNotification(env, resident.id, {
        title: '❌ Собрание отклонено',
        body: rejectMeetingBody,
        type: 'meeting_rejected',
        tag: `meeting-rejected-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Open schedule poll
route('POST', '/api/meetings/:id/open-schedule-poll', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_poll_open',
        schedule_poll_opened_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status IN ('draft', 'pending_moderation') ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ meeting: updated });
});

// Meetings: Confirm schedule
route('POST', '/api/meetings/:id/confirm-schedule', async (request, env, params) => {
  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const mtg = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.id, tenantId).first();
    if (!mtg) return error('Meeting not found', 404);
  }

  const body = await request.json() as any;
  const selectedOptionId = body.option_id || body.optionId;

  let confirmedDateTime: string;
  let selectedOption: any;

  if (selectedOptionId) {
    const option = await env.DB.prepare(
      'SELECT date_time FROM meeting_schedule_options WHERE id = ?'
    ).bind(selectedOptionId).first() as any;
    confirmedDateTime = option?.date_time;
    selectedOption = option;
  } else {
    // Auto-select based on votes weighted by area (1 кв.м = 1 голос)
    const { results } = await env.DB.prepare(`
      SELECT o.id, o.date_time,
             COUNT(v.id) as vote_count,
             COALESCE(SUM(v.vote_weight), 0) as vote_weight_total
      FROM meeting_schedule_options o
      LEFT JOIN meeting_schedule_votes v ON o.id = v.option_id
      WHERE o.meeting_id = ?
      GROUP BY o.id
      ORDER BY vote_weight_total DESC, vote_count DESC
      LIMIT 1
    `).bind(params.id).all();
    selectedOption = results[0] as any;
    confirmedDateTime = selectedOption?.date_time;
  }

  if (!confirmedDateTime) {
    return error('No schedule option found', 400);
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'schedule_confirmed',
        confirmed_date_time = ?,
        schedule_confirmed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'schedule_poll_open'
  `).bind(confirmedDateTime, params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Meetings: Open voting
route('POST', '/api/meetings/:id/open-voting', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get meeting info before update
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  // Calculate total_area from building residents if not already set
  let totalArea = meeting.total_area || 0;
  let totalEligibleCount = meeting.total_eligible_count || 0;
  if (meeting.building_id && totalArea <= 0) {
    const buildingStats = await env.DB.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(total_area), 0) as total_area
       FROM users WHERE building_id = ? AND role = 'resident' AND total_area > 0 ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(meeting.building_id, ...(tenantId ? [tenantId] : [])).first() as any;
    totalArea = buildingStats?.total_area || 0;
    totalEligibleCount = buildingStats?.count || 0;
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'voting_open',
        voting_opened_at = datetime('now'),
        total_area = ?,
        total_eligible_count = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'schedule_confirmed'
  `).bind(totalArea, totalEligibleCount, params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  // Send push notifications to building residents - voting opened
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = ? AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind('resident', meeting.building_id, ...(tenantId ? [tenantId] : [])).all();

    for (const resident of residents as any[]) {
      await sendPushNotification(env, resident.id, {
        title: '🗳️ Голосование открыто!',
        body: `Голосование на собрании жильцов дома ${meeting.building_address || ''} началось. Примите участие!`,
        type: 'meeting',
        tag: `meeting-voting-${params.id}`,
        data: {
          meetingId: params.id,
          url: '/meetings'
        },
        requireInteraction: true
      });
    }
  }

  return json({ meeting: updated });
});

// Meetings: Close voting
route('POST', '/api/meetings/:id/close-voting', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Meeting not found or voting not open', 400);
  }

  // Calculate participation by AREA (кв.м) according to Uzbekistan law
  // Quorum = SUM of DISTINCT voter areas / total building area >= quorum_percent
  const [votedAreaResult, participatedCount] = await Promise.all([
    env.DB.prepare('SELECT COALESCE(SUM(weight), 0) as voted_area FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id)').bind(params.id).first(),
    env.DB.prepare('SELECT COUNT(DISTINCT voter_id) as count FROM meeting_vote_records WHERE meeting_id = ?').bind(params.id).first()
  ]) as any[];

  const votedArea = votedAreaResult?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participated = participatedCount?.count || 0;

  // Quorum by AREA (as per Uzbekistan law: 1 sq.m = 1 vote)
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= meeting.quorum_percent;

  // Calculate results for each agenda item using AREA-based voting
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ?'
  ).bind(params.id).all();

  for (const item of agendaItems) {
    const i = item as any;
    // Get votes weighted by area (кв.м)
    const [votesFor, votesAgainst, votesAbstain] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'for' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'against' AND is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(vote_weight), 0) as weight FROM meeting_vote_records WHERE agenda_item_id = ? AND choice = 'abstain' AND is_revote = 0").bind(i.id).first()
    ]) as any[];

    const forWeight = votesFor?.weight || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotedWeight = forWeight + againstWeight + abstainWeight;

    let isApproved = 0;

    if (quorumReached && totalVotedWeight > 0) {
      if (i.threshold === 'qualified_majority' || i.threshold === 'two_thirds') {
        // Квалифицированное большинство: 2/3 от ОБЩЕЙ площади дома
        isApproved = forWeight >= (totalArea * 2 / 3) ? 1 : 0;
      } else if (i.threshold === 'three_quarters') {
        // 3/4 от общей площади
        isApproved = forWeight >= (totalArea * 3 / 4) ? 1 : 0;
      } else if (i.threshold === 'unanimous') {
        // Единогласно
        isApproved = (againstWeight === 0 && abstainWeight === 0 && forWeight > 0) ? 1 : 0;
      } else {
        // simple_majority: более 50% от проголосовавших
        isApproved = forWeight > (totalVotedWeight / 2) ? 1 : 0;
      }
    }

    // Update agenda item with vote totals (using _area columns per schema)
    await env.DB.prepare(`
      UPDATE meeting_agenda_items
      SET is_approved = ?,
          votes_for_area = ?,
          votes_against_area = ?,
          votes_abstain_area = ?
      WHERE id = ?
    `).bind(isApproved, forWeight, againstWeight, abstainWeight, i.id).run();
  }

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'voting_closed',
        voting_closed_at = datetime('now'),
        participated_count = ?,
        voted_area = ?,
        participation_percent = ?,
        quorum_reached = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(participated, votedArea, participationPercent, quorumReached ? 1 : 0, params.id).run();

  // Expire all pending/viewed reconsideration requests for this meeting
  await env.DB.prepare(`
    UPDATE meeting_vote_reconsideration_requests
    SET status = 'expired', expired_at = datetime('now')
    WHERE meeting_id = ? AND status IN ('pending', 'viewed')
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  // Send push notifications to building residents - voting closed, results ready
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    const quorumStatus = quorumReached ? 'Кворум достигнут!' : 'Кворум не достигнут.';
    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, {
        title: '🗳️ Голосование завершено',
        body: `Голосование по собранию жильцов завершено. ${quorumStatus} Участие: ${participationPercent.toFixed(1)}%`,
        type: 'meeting',
        tag: `meeting-closed-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Publish results
route('POST', '/api/meetings/:id/publish-results', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Get meeting info before update
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;
  if (!meeting) return error('Meeting not found', 404);

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'results_published',
        results_published_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ? AND status = 'voting_closed'
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await getMeetingWithDetails(env, params.id, tenantId);

  // Send push notifications to building residents - results published
  if (meeting?.building_id) {
    const { results: residents } = await env.DB.prepare(
      'SELECT id FROM users WHERE role = ? AND building_id = ?'
    ).bind('resident', meeting.building_id).all();

    for (const resident of (residents || []) as any[]) {
      sendPushNotification(env, resident.id, {
        title: '📊 Результаты голосования опубликованы',
        body: `Результаты собрания жильцов ${meeting.building_address || ''} доступны для просмотра.`,
        type: 'meeting',
        tag: `meeting-results-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: false
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Generate protocol
route('POST', '/api/meetings/:id/generate-protocol', async (request, env, params) => {
  try {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Only admin, director, manager can generate protocol
  if (!['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // If protocol already exists, delete it to regenerate
  if (meeting.protocol_id) {
    await env.DB.prepare('DELETE FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).run();
  }

  const protocolId = generateId();
  const protocolNumber = `${meeting.number}/${new Date().getFullYear()}`;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.id).all();

  // Build protocol content
  let content = `# ПРОТОКОЛ №${meeting.number}\n`;
  content += `## Общего собрания собственников помещений\n`;
  content += `### ${meeting.building_address}\n\n`;
  content += `**Дата проведения:** ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU') : 'Не указана'}\n\n`;
  content += `**Формат:** ${meeting.format === 'online' ? 'Онлайн' : meeting.format === 'offline' ? 'Очное' : 'Смешанное'}\n\n`;
  content += `**Организатор:** ${meeting.organizer_name}\n\n`;
  content += `---\n\n## КВОРУМ\n\n`;
  content += `- Общая площадь дома: ${meeting.total_area?.toFixed(2) || 0} кв.м\n`;
  content += `- Площадь проголосовавших: ${meeting.voted_area?.toFixed(2) || 0} кв.м\n`;
  content += `- Количество проголосовавших: ${meeting.participated_count || 0} чел.\n`;
  content += `- Процент участия (по площади): ${meeting.participation_percent?.toFixed(1) || 0}%\n`;
  content += `- Кворум ${meeting.quorum_reached ? '**ДОСТИГНУТ**' : '**НЕ ДОСТИГНУТ**'}\n\n`;
  content += `---\n\n## ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ\n\n`;

  for (const item of agendaItems) {
    const i = item as any;
    // Use actual apartment area from users table instead of stored vote_weight
    const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
      env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight
        FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id
        WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0
      `).bind(i.id).first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight
        FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id
        WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0
      `).bind(i.id).first(),
      env.DB.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight
        FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id
        WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0
      `).bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all()
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalVotes = forCount + againstCount + abstainCount;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    // ✅ FIX: Calculate percentages by WEIGHT (sq.m), not by vote count
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    // Determine threshold label
    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (>60%)',
      two_thirds: '2/3 голосов (>66.67%)',
      three_quarters: '3/4 голосов (>75%)',
      unanimous: 'Единогласно (100%)'
    };

    content += `### ${i.item_order}. ${i.title}\n\n`;
    if (i.description) content += `${i.description}\n\n`;
    content += `**Порог принятия:** ${thresholdLabels[i.threshold] || 'Простое большинство'}\n\n`;
    content += `**Результаты голосования:**\n`;
    // ✅ FIX: Show correct percentages by area (weight), and show all percentages
    content += `- За: ${forCount} голосов (${forWeight.toFixed(2)} кв.м, ${percentForByWeight.toFixed(1)}%)\n`;
    content += `- Против: ${againstCount} голосов (${againstWeight.toFixed(2)} кв.м, ${percentAgainstByWeight.toFixed(1)}%)\n`;
    content += `- Воздержались: ${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м, ${percentAbstainByWeight.toFixed(1)}%)\n\n`;

    // Include comments if any
    if (comments.results && comments.results.length > 0) {
      const objections = (comments.results as any[]).filter(c => c.comment_type === 'objection');
      const regularComments = (comments.results as any[]).filter(c => c.comment_type !== 'objection');

      if (objections.length > 0) {
        content += `**Возражения участников (голосовали ПРОТИВ):**\n\n`;
        for (const c of objections) {
          content += `> ⚠️ "${c.content}"\n`;
          content += `> — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}\n\n`;
          if (c.counter_proposal) {
            content += `> 💡 **Альтернативное предложение:** ${c.counter_proposal}\n\n`;
          }
        }
      }
      if (regularComments.length > 0) {
        content += `**Комментарии участников:**\n\n`;
        for (const c of regularComments) {
          content += `> "${c.content}"\n`;
          content += `> — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}\n\n`;
        }
      }
    }

    content += `**РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}**\n\n`;
  }

  // Add participants list - use actual area from users table
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT DISTINCT
      v.voter_id, v.voter_name, v.apartment_number,
      COALESCE(u.total_area, v.vote_weight) as vote_weight,
      MIN(v.voted_at) as voted_at
    FROM meeting_vote_records v
    LEFT JOIN users u ON u.id = v.voter_id
    WHERE v.meeting_id = ? AND v.is_revote = 0
    GROUP BY v.voter_id ORDER BY v.voter_name
  `).bind(params.id).all();

  content += `---\n\n## ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ\n\n`;
  content += `| № | ФИО | Квартира | Площадь (кв.м) | Время голоса |\n`;
  content += `|---|-----|----------|----------------|---------------|\n`;
  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    content += `| ${idx + 1} | ${v.voter_name} | ${v.apartment_number || '-'} | ${v.vote_weight || '-'} | ${new Date(v.voted_at).toLocaleString('ru-RU')} |\n`;
  }

  content += `\n---\n\n## ПОДПИСИ\n\n`;
  content += `Протокол сформирован автоматически системой УК\n`;
  content += `Дата формирования: ${new Date().toLocaleString('ru-RU')}\n`;
  content += `\n_Председатель собрания: ____________________\n`;
  content += `\n_Секретарь: ____________________\n`;
  content += `\n_Члены счётной комиссии: ____________________\n`;

  const protocolHash = generateVoteHash({ meetingId: params.id, generatedAt: new Date().toISOString() });

  await env.DB.prepare(`
    INSERT INTO meeting_protocols (id, meeting_id, protocol_number, content, protocol_hash, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(protocolId, params.id, protocolNumber, content, protocolHash, getTenantId(request)).run();

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'protocol_generated',
        protocol_id = ?,
        protocol_generated_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(protocolId, params.id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(protocolId).first();
  return json({ protocol }, 201);
  } catch (err: any) {
    console.error('Generate protocol error:', err?.message, err?.stack);
    return error(`Protocol generation failed: ${err?.message}`, 500);
  }
});

// Meetings: Approve protocol
route('POST', '/api/meetings/:id/approve-protocol', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const signatureHash = generateVoteHash({ userId: authUser.id, signedAt: new Date().toISOString() });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET signed_by_uk_user_id = ?,
        signed_by_uk_name = ?,
        signed_by_uk_role = ?,
        signed_by_uk_at = datetime('now'),
        uk_signature_hash = ?
    WHERE id = ?
  `).bind(authUser.id, authUser.name, authUser.role, signatureHash, meeting.protocol_id).run();

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'protocol_approved',
        protocol_approved_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).bind(params.id).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first();
  return json({ meeting: updated });
});

// Protocol: Sign as chairman (resident who leads the meeting)
route('POST', '/api/meetings/:id/protocol/sign-chairman', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  // Get user's apartment info
  const userInfo = await env.DB.prepare(
    'SELECT apartment FROM users WHERE id = ? AND building_id = ?'
  ).bind(authUser.id, meeting.building_id).first() as any;

  const signatureHash = generateVoteHash({
    userId: authUser.id,
    role: 'chairman',
    signedAt: new Date().toISOString()
  });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET chairman_user_id = ?,
        chairman_name = ?,
        chairman_apartment = ?,
        chairman_signed_at = datetime('now'),
        chairman_signature_hash = ?
    WHERE id = ?
  `).bind(
    authUser.id,
    authUser.name,
    userInfo?.apartment || null,
    signatureHash,
    meeting.protocol_id
  ).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Protocol: Sign as secretary
route('POST', '/api/meetings/:id/protocol/sign-secretary', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(`SELECT protocol_id, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const userInfo = await env.DB.prepare(
    'SELECT apartment FROM users WHERE id = ? AND building_id = ?'
  ).bind(authUser.id, meeting.building_id).first() as any;

  const signatureHash = generateVoteHash({
    userId: authUser.id,
    role: 'secretary',
    signedAt: new Date().toISOString()
  });

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET secretary_user_id = ?,
        secretary_name = ?,
        secretary_apartment = ?,
        secretary_signed_at = datetime('now'),
        secretary_signature_hash = ?
    WHERE id = ?
  `).bind(
    authUser.id,
    authUser.name,
    userInfo?.apartment || null,
    signatureHash,
    meeting.protocol_id
  ).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Protocol: Set counting commission members
route('POST', '/api/meetings/:id/protocol/counting-commission', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  // body.members should be array of { userId, name, apartment }
  const members = body.members || [];

  await env.DB.prepare(`
    UPDATE meeting_protocols
    SET counting_commission = ?
    WHERE id = ?
  `).bind(JSON.stringify(members), meeting.protocol_id).run();

  invalidateCache('meetings:');
  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first();
  return json({ protocol });
});

// Meetings: Cancel
route('POST', '/api/meetings/:id/cancel', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  await env.DB.prepare(`
    UPDATE meetings
    SET status = 'cancelled',
        cancelled_at = datetime('now'),
        cancellation_reason = ?,
        updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Cancelled', params.id, ...(tenantId ? [tenantId] : [])).run();

  invalidateCache('meetings:');
  const updated = await env.DB.prepare('SELECT * FROM meetings WHERE id = ?').bind(params.id).first() as any;

  // Notify building residents about meeting cancellation
  if (updated?.building_id) {
    const { results: residentsCancel } = await env.DB.prepare(
      `SELECT id FROM users WHERE role = 'resident' AND is_active = 1 AND building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
    ).bind(updated.building_id, ...(tenantId ? [tenantId] : [])).all();

    const cancelMeetingBody = `Собрание "${updated.title || ''}" отменено. ${body.reason ? 'Причина: ' + body.reason : ''}`;
    for (const resident of (residentsCancel || []) as any[]) {
      env.DB.prepare(`INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id) VALUES (?, ?, 'meeting_cancelled', ?, ?, ?, 0, datetime('now'), ?)`)
        .bind(generateId(), resident.id, '❌ Собрание отменено', cancelMeetingBody, JSON.stringify({ meeting_id: params.id }), tenantId).run().catch(() => {});
      sendPushNotification(env, resident.id, {
        title: '❌ Собрание отменено',
        body: cancelMeetingBody,
        type: 'meeting_cancelled',
        tag: `meeting-cancelled-${params.id}`,
        data: { meetingId: params.id, url: '/meetings' },
        requireInteraction: true
      }).catch(() => {});
    }
  }

  return json({ meeting: updated });
});

// Meetings: Delete
route('DELETE', '/api/meetings/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Verify meeting exists
  const meeting = await env.DB.prepare(
    `SELECT id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get agenda item IDs for cascading to comments
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT id FROM meeting_agenda_items WHERE meeting_id = ?'
  ).bind(params.id).all();
  const agendaIds = agendaItems.map((a: any) => a.id);

  // Delete all related data (cascade)
  try {
    if (agendaIds.length > 0) {
      const placeholders = agendaIds.map(() => '?').join(',');
      await env.DB.prepare(
        `DELETE FROM meeting_agenda_comments WHERE agenda_item_id IN (${placeholders})`
      ).bind(...agendaIds).run();
    }
    await env.DB.prepare('DELETE FROM meeting_vote_reconsideration_requests WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_vote_records WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_agenda_items WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_schedule_votes WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_schedule_options WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_otp_records WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_protocols WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_eligible_voters WHERE meeting_id = ?').bind(params.id).run();
    await env.DB.prepare('DELETE FROM meeting_participated_voters WHERE meeting_id = ?').bind(params.id).run();

    // Finally delete the meeting itself
    await env.DB.prepare(`DELETE FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
    invalidateCache('meetings:');
    return json({ success: true });
  } catch (err: any) {
    console.error('Meeting delete error:', err.message);
    return error(`Failed to delete meeting: ${err.message}`, 500);
  }
});

// Schedule voting
route('POST', '/api/meetings/:meetingId/schedule-votes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;
  const optionId = body.option_id || body.optionId;

  // Get meeting info and user's apartment area for weighted voting
  const meeting = await env.DB.prepare(
    `SELECT building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Собрание не найдено', 404);
  }

  // Get user's apartment area for vote weight (default to 50 if not set)
  const userInfo = await env.DB.prepare(
    'SELECT total_area FROM users WHERE id = ?'
  ).bind(authUser.id).first() as any;

  // Use 50 as default if total_area is not set
  const voteWeight = userInfo?.total_area || 50;

  // Remove existing vote and add new one (upsert)
  // Note: table has both user_id (NOT NULL) and voter_id columns - use user_id as primary
  await env.DB.prepare(
    'DELETE FROM meeting_schedule_votes WHERE meeting_id = ? AND user_id = ?'
  ).bind(params.meetingId, authUser.id).run();

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_schedule_votes (id, meeting_id, option_id, user_id, voter_id, voter_name, vote_weight, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, params.meetingId, optionId, authUser.id, authUser.id, authUser.name, voteWeight, getTenantId(request)).run();

  // Update meeting's updated_at to trigger WebSocket broadcast
  await env.DB.prepare(`
    UPDATE meetings SET updated_at = datetime('now') WHERE id = ?
  `).bind(params.meetingId).run();

  invalidateCache('meetings:');

  return json({ success: true, voteWeight });
});

// Get schedule vote by user
route('GET', '/api/meetings/:meetingId/schedule-votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const vote = await env.DB.prepare(
    'SELECT option_id FROM meeting_schedule_votes WHERE meeting_id = ? AND user_id = ?'
  ).bind(params.meetingId, authUser.id).first() as any;

  return json({ optionId: vote?.option_id || null });
});

// Agenda voting
route('POST', '/api/meetings/:meetingId/agenda/:agendaItemId/vote', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const body = await request.json() as any;

  // Check if meeting is open for voting
  const meeting = await env.DB.prepare(
    `SELECT status, require_otp, building_id, allow_revote FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Voting is not open', 400);
  }

  // Check if user is eligible to vote (must be resident of this building)
  const eligibleVoter = await env.DB.prepare(`
    SELECT ev.*, u.apartment, u.total_area
    FROM meeting_eligible_voters ev
    JOIN users u ON u.id = ev.user_id
    WHERE ev.meeting_id = ? AND ev.user_id = ?
  `).bind(params.meetingId, authUser.id).first() as any;

  // If no explicit eligible voters list, check if user is resident of the building
  let apartmentArea = body.ownership_share || body.ownershipShare || null;
  let apartmentNumber = body.apartment_number || body.apartmentNumber || null;

  if (!eligibleVoter) {
    // Check if user is resident of the meeting's building
    const userBuilding = await env.DB.prepare(
      'SELECT apartment, total_area FROM users WHERE id = ? AND building_id = ? AND role = ?'
    ).bind(authUser.id, meeting.building_id, 'resident').first() as any;

    if (!userBuilding) {
      return error('You are not eligible to vote in this meeting', 403);
    }

    apartmentArea = apartmentArea || userBuilding.total_area;
    if (!apartmentArea || apartmentArea <= 0) {
      return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    }
    apartmentNumber = apartmentNumber || userBuilding.apartment;
  } else {
    // Use eligible voter data or user's total_area
    apartmentArea = apartmentArea || eligibleVoter.total_area;
    if (!apartmentArea || apartmentArea <= 0) {
      return error('Площадь квартиры не указана. Обратитесь к администратору для обновления данных.', 400);
    }
    apartmentNumber = apartmentNumber || eligibleVoter.apartment;
  }

  // Check for existing vote
  const existingVote = await env.DB.prepare(
    'SELECT id, choice FROM meeting_vote_records WHERE meeting_id = ? AND agenda_item_id = ? AND voter_id = ? AND is_revote = 0'
  ).bind(params.meetingId, params.agendaItemId, authUser.id).first() as any;

  // Create vote hash for audit trail
  const voteHash = generateVoteHash({
    meetingId: params.meetingId,
    agendaItemId: params.agendaItemId,
    voterId: authUser.id,
    choice: body.choice,
    votedAt: new Date().toISOString()
  });

  if (existingVote) {
    // Check if revote is allowed
    if (!meeting.allow_revote) {
      return error('Revoting is not allowed for this meeting', 400);
    }

    // UPDATE existing vote in-place (avoids UNIQUE constraint issue)
    // Previous choice is preserved in the reconsideration requests table
    await env.DB.prepare(`
      UPDATE meeting_vote_records
      SET choice = ?, vote = ?, vote_hash = ?, voted_at = datetime('now'),
          vote_weight = ?, verification_method = ?, otp_verified = ?
      WHERE id = ?
    `).bind(
      body.choice,
      body.choice,
      voteHash,
      apartmentArea,
      body.verification_method || body.verificationMethod || 'login',
      body.otp_verified || body.otpVerified ? 1 : 0,
      existingVote.id
    ).run();
  } else {
    // Insert new vote with vote_weight = apartment area
    const id = generateId();
    await env.DB.prepare(`
      INSERT INTO meeting_vote_records (
        id, meeting_id, agenda_item_id,
        user_id, vote, voter_id, voter_name, apartment_id, apartment_number, ownership_share, vote_weight,
        choice, verification_method, otp_verified, vote_hash, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      params.meetingId,
      params.agendaItemId,
      authUser.id,           // user_id (NOT NULL)
      body.choice,           // vote (NOT NULL) - same as choice
      authUser.id,           // voter_id
      authUser.name,
      body.apartment_id || body.apartmentId || null,
      apartmentNumber,
      apartmentArea,
      apartmentArea, // vote_weight = apartment area in sq.m (1 кв.м = 1 голос)
      body.choice,
      body.verification_method || body.verificationMethod || 'login',
      body.otp_verified || body.otpVerified ? 1 : 0,
      voteHash,
      getTenantId(request)
    ).run();

    // Track participated voter (check first, table may lack UNIQUE constraint)
    const alreadyParticipated = await env.DB.prepare(
      `SELECT 1 FROM meeting_participated_voters WHERE meeting_id = ? AND user_id = ? LIMIT 1`
    ).bind(params.meetingId, authUser.id).first();
    if (!alreadyParticipated) {
      await env.DB.prepare(
        `INSERT INTO meeting_participated_voters (meeting_id, user_id, tenant_id) VALUES (?, ?, ?)`
      ).bind(params.meetingId, authUser.id, getTenantId(request)).run();
    }
  }

  // Save comment/objection if provided (auto-type: 'objection' for against votes)
  const comment = body.comment?.trim();
  const counterProposal = body.counter_proposal?.trim() || null;
  const commentType = body.comment_type || (body.choice === 'against' ? 'objection' : 'comment');
  if ((comment && comment.length > 0) || (counterProposal && counterProposal.length > 0)) {
    const commentId = generateId();
    const voterData = eligibleVoter || await env.DB.prepare(
      'SELECT apartment FROM users WHERE id = ?'
    ).bind(authUser.id).first() as any;
    await env.DB.prepare(`
      INSERT INTO meeting_agenda_comments (
        id, agenda_item_id, meeting_id, resident_id, resident_name, apartment_number,
        content, comment_type, counter_proposal, include_in_protocol, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).bind(
      commentId,
      params.agendaItemId,
      params.meetingId,
      authUser.id,
      authUser.name,
      apartmentNumber || voterData?.apartment || null,
      comment || 'Голосовал(а) ПРОТИВ',
      commentType,
      counterProposal,
      getTenantId(request)
    ).run();
  }

  // Update any pending reconsideration requests if vote changed
  if (existingVote && existingVote.choice !== body.choice) {
    await env.DB.prepare(`
      UPDATE meeting_vote_reconsideration_requests
      SET status = 'vote_changed',
          responded_at = datetime('now'),
          new_vote = ?
      WHERE meeting_id = ?
        AND agenda_item_id = ?
        AND resident_id = ?
        AND status IN ('pending', 'viewed')
    `).bind(body.choice, params.meetingId, params.agendaItemId, authUser.id).run();
  }

  return json({ success: true, voteHash, voteWeight: apartmentArea });
});

// Get user's votes for meeting
route('GET', '/api/meetings/:meetingId/votes/me', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ? AND voter_id = ?'
  ).bind(params.meetingId, authUser.id).all();

  return json({ votes: results });
});

// ==================== VOTE RECONSIDERATION REQUEST ENDPOINTS ====================

// Get "against" votes for an agenda item (for УК to see who voted against)
route('GET', '/api/meetings/:meetingId/agenda/:agendaItemId/votes/against', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Only managers/directors can view against votes
  if (!['manager', 'director', 'admin'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  // MULTI-TENANCY: Check if meeting exists and belongs to tenant
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(
    `SELECT id, status FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get all "against" votes with resident info and reconsideration request counts
  const { results: againstVotes } = await env.DB.prepare(`
    SELECT
      vr.id as vote_id,
      vr.voter_id,
      vr.voter_name,
      vr.apartment_number,
      vr.vote_weight,
      vr.voted_at,
      u.phone,
      u.total_area,
      (SELECT comment FROM meeting_agenda_comments
       WHERE agenda_item_id = ? AND user_id = vr.voter_id
       ORDER BY created_at DESC LIMIT 1) as comment,
      (SELECT COUNT(*) FROM meeting_vote_reconsideration_requests
       WHERE agenda_item_id = ? AND resident_id = vr.voter_id) as request_count
    FROM meeting_vote_records vr
    LEFT JOIN users u ON u.id = vr.voter_id
    WHERE vr.meeting_id = ?
      AND vr.agenda_item_id = ?
      AND vr.choice = 'against'
      AND vr.is_revote = 0
    ORDER BY vr.vote_weight DESC
  `).bind(params.agendaItemId, params.agendaItemId, params.meetingId, params.agendaItemId).all();

  // Add can_send_request flag (max 2 per resident per agenda item)
  const votesWithFlags = (againstVotes || []).map((v: any) => ({
    ...v,
    can_send_request: meeting.status === 'voting_open' && v.request_count < 2
  }));

  return json({ votes: votesWithFlags });
});

// Send reconsideration request to a resident
route('POST', '/api/meetings/:meetingId/reconsideration-requests', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Only managers/directors can send requests
  if (!['manager', 'director', 'admin'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  const body = await request.json() as any;
  const { agenda_item_id, resident_id, reason, message_to_resident } = body;

  if (!agenda_item_id || !resident_id || !reason) {
    return error('Missing required fields', 400);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if meeting is in voting_open status
  const meeting = await env.DB.prepare(
    `SELECT id, status, building_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting || meeting.status !== 'voting_open') {
    return error('Voting is not open', 400);
  }

  // Get the resident's current vote
  const currentVote = await env.DB.prepare(`
    SELECT vr.*, u.apartment
    FROM meeting_vote_records vr
    JOIN users u ON u.id = vr.voter_id
    WHERE vr.meeting_id = ?
      AND vr.agenda_item_id = ?
      AND vr.voter_id = ?
      AND vr.is_revote = 0
  `).bind(params.meetingId, agenda_item_id, resident_id).first() as any;

  if (!currentVote) {
    return error('Resident has not voted on this item', 400);
  }

  // Check max 2 requests per resident per agenda item
  const existingRequests = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM meeting_vote_reconsideration_requests
    WHERE agenda_item_id = ? AND resident_id = ?
  `).bind(agenda_item_id, resident_id).first() as any;

  if (existingRequests.count >= 2) {
    return error('Maximum 2 requests per resident per agenda item', 400);
  }

  // Create the reconsideration request
  const requestId = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_vote_reconsideration_requests (
      id, meeting_id, agenda_item_id, resident_id, apartment_id,
      requested_by_user_id, requested_by_role, reason, message_to_resident,
      vote_at_request_time, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).bind(
    requestId,
    params.meetingId,
    agenda_item_id,
    resident_id,
    currentVote.apartment || currentVote.apartment_number || '',
    authUser.id,
    authUser.role,
    reason,
    message_to_resident || null,
    currentVote.choice
  ).run();

  // Get agenda item title for notification
  const agendaItem = await env.DB.prepare(
    'SELECT title FROM meeting_agenda_items WHERE id = ?'
  ).bind(agenda_item_id).first() as any;

  // Send push notification to resident
  sendPushNotification(env, resident_id, {
    title: '🗳️ Просьба пересмотреть голос',
    body: `УК просит вас пересмотреть голос по вопросу: "${agendaItem?.title || 'Голосование'}"`,
    type: 'meeting',
    tag: `reconsider-${requestId}`,
    data: { meetingId: params.meetingId, requestId, url: '/meetings' },
    requireInteraction: true
  }).catch(() => {});

  // Create in-app notification
  const notificationId = generateId();
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data)
    VALUES (?, ?, 'meeting', ?, ?, ?)
  `).bind(
    notificationId,
    resident_id,
    'Просьба пересмотреть голос',
    message_to_resident || `УК просит вас пересмотреть голос по вопросу собрания`,
    JSON.stringify({ meetingId: params.meetingId, agendaItemId: agenda_item_id, requestId })
  ).run();

  return json({ success: true, requestId });
});

// Get resident's pending reconsideration requests
route('GET', '/api/meetings/reconsideration-requests/me', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const tenantId = getTenantId(request);
  const { results: requests } = await env.DB.prepare(`
    SELECT
      r.*,
      m.status as meeting_status,
      ai.title as agenda_item_title,
      ai.description as agenda_item_description,
      u.name as requested_by_name
    FROM meeting_vote_reconsideration_requests r
    JOIN meetings m ON m.id = r.meeting_id
    JOIN meeting_agenda_items ai ON ai.id = r.agenda_item_id
    LEFT JOIN users u ON u.id = r.requested_by_user_id
    WHERE r.resident_id = ?
      AND r.status IN ('pending', 'viewed')
      AND m.status = 'voting_open'
      ${tenantId ? 'AND m.tenant_id = ?' : ''}
    ORDER BY r.created_at DESC
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ requests: requests || [] });
});

// Mark reconsideration request as viewed
route('POST', '/api/meetings/reconsideration-requests/:requestId/view', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Verify this request belongs to the user and tenant
  const tenantId = getTenantId(request);
  const request_record = await env.DB.prepare(
    `SELECT r.* FROM meeting_vote_reconsideration_requests r
     JOIN meetings m ON m.id = r.meeting_id
     WHERE r.id = ? AND r.resident_id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}`
  ).bind(params.requestId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!request_record) {
    return error('Request not found', 404);
  }

  if (request_record.status === 'pending') {
    await env.DB.prepare(`
      UPDATE meeting_vote_reconsideration_requests
      SET status = 'viewed', viewed_at = datetime('now')
      WHERE id = ?
    `).bind(params.requestId).run();
  }

  return json({ success: true });
});

// Ignore/dismiss reconsideration request
route('POST', '/api/meetings/reconsideration-requests/:requestId/ignore', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Verify this request belongs to the user and tenant
  const tenantId = getTenantId(request);
  const request_record = await env.DB.prepare(
    `SELECT r.* FROM meeting_vote_reconsideration_requests r
     JOIN meetings m ON m.id = r.meeting_id
     WHERE r.id = ? AND r.resident_id = ? ${tenantId ? 'AND m.tenant_id = ?' : ''}`
  ).bind(params.requestId, authUser.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!request_record) {
    return error('Request not found', 404);
  }

  await env.DB.prepare(`
    UPDATE meeting_vote_reconsideration_requests
    SET status = 'ignored', responded_at = datetime('now')
    WHERE id = ?
  `).bind(params.requestId).run();

  return json({ success: true });
});

// Get reconsideration request statistics for a meeting (for УК)
route('GET', '/api/meetings/:meetingId/reconsideration-requests/stats', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  if (!['manager', 'director', 'admin'].includes(authUser.role)) {
    return error('Forbidden', 403);
  }

  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'viewed' THEN 1 ELSE 0 END) as viewed,
      SUM(CASE WHEN status = 'vote_changed' THEN 1 ELSE 0 END) as vote_changed,
      SUM(CASE WHEN status = 'ignored' THEN 1 ELSE 0 END) as ignored,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired
    FROM meeting_vote_reconsideration_requests
    WHERE meeting_id = ?
  `).bind(params.meetingId).first() as any;

  const conversionRate = stats.total > 0
    ? ((stats.vote_changed || 0) / stats.total * 100).toFixed(1)
    : '0';

  return json({
    stats: {
      ...stats,
      conversion_rate: conversionRate
    }
  });
});

// ==================== END VOTE RECONSIDERATION ENDPOINTS ====================

// Real-time voting stats (for polling during active voting)
route('GET', '/api/meetings/:meetingId/stats', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const meeting = await env.DB.prepare(
    `SELECT id, status, total_area, quorum_percent, voted_area, participation_percent, quorum_reached FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  // Get current voting stats by area (distinct voters only)
  const [votedAreaResult, participantCount, agendaStats] = await Promise.all([
    env.DB.prepare(`
      SELECT COALESCE(SUM(weight), 0) as voted_area
      FROM (SELECT voter_id, MAX(vote_weight) as weight FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0 GROUP BY voter_id)
    `).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT COUNT(DISTINCT voter_id) as count
      FROM meeting_vote_records
      WHERE meeting_id = ?
    `).bind(params.meetingId).first(),
    env.DB.prepare(`
      SELECT
        ai.id,
        ai.title,
        ai.threshold,
        COALESCE(SUM(CASE WHEN vr.choice = 'for' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_for,
        COALESCE(SUM(CASE WHEN vr.choice = 'against' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_against,
        COALESCE(SUM(CASE WHEN vr.choice = 'abstain' AND vr.is_revote = 0 THEN vr.vote_weight ELSE 0 END), 0) as votes_abstain,
        COUNT(DISTINCT CASE WHEN vr.is_revote = 0 THEN vr.voter_id END) as voter_count
      FROM meeting_agenda_items ai
      LEFT JOIN meeting_vote_records vr ON vr.agenda_item_id = ai.id
      WHERE ai.meeting_id = ?
      GROUP BY ai.id
      ORDER BY ai.item_order
    `).bind(params.meetingId).all()
  ]) as any[];

  const votedArea = (votedAreaResult as any)?.voted_area || 0;
  const totalArea = meeting.total_area || 0;
  const participationPercent = totalArea > 0 ? (votedArea / totalArea) * 100 : 0;
  const quorumReached = participationPercent >= (meeting.quorum_percent || 50);

  return json({
    meetingId: params.meetingId,
    status: meeting.status,
    totalArea,
    votedArea,
    participationPercent: Math.round(participationPercent * 100) / 100,
    quorumPercent: meeting.quorum_percent || 50,
    quorumReached,
    participantCount: (participantCount as any)?.count || 0,
    agendaItems: (agendaStats.results || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      threshold: item.threshold,
      votesFor: item.votes_for || 0,
      votesAgainst: item.votes_against || 0,
      votesAbstain: item.votes_abstain || 0,
      voterCount: item.voter_count || 0,
      totalVoted: (item.votes_for || 0) + (item.votes_against || 0) + (item.votes_abstain || 0)
    })),
    timestamp: new Date().toISOString()
  });
});

// OTP: Request
route('POST', '/api/meetings/otp/request', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;
  const code = generateOTPCode();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 5);

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_otp_records (
      id, user_id, phone, code, purpose, meeting_id, agenda_item_id, expires_at, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    authUser.id,
    body.phone || authUser.phone,
    code,
    body.purpose || 'agenda_vote',
    body.meeting_id || body.meetingId || null,
    body.agenda_item_id || body.agendaItemId || null,
    expiresAt.toISOString(),
    getTenantId(request)
  ).run();

  // In production, send SMS here
  console.log(`[OTP] Code ${code} sent to ${body.phone || authUser.phone} for user ${authUser.id}`);

  return json({ otpId: id, expiresAt: expiresAt.toISOString() });
});

// OTP: Verify
route('POST', '/api/meetings/otp/verify', async (request, env) => {
  const body = await request.json() as any;
  const otpId = body.otp_id || body.otpId;
  const code = body.code;

  const otp = await env.DB.prepare(
    'SELECT * FROM meeting_otp_records WHERE id = ?'
  ).bind(otpId).first() as any;

  if (!otp) {
    return json({ verified: false, error: 'OTP not found' });
  }

  if (otp.is_used) {
    return json({ verified: false, error: 'OTP already used' });
  }

  if (new Date(otp.expires_at) < new Date()) {
    return json({ verified: false, error: 'OTP expired' });
  }

  if (otp.attempts >= otp.max_attempts) {
    return json({ verified: false, error: 'Max attempts exceeded' });
  }

  if (otp.code === code) {
    await env.DB.prepare(`
      UPDATE meeting_otp_records
      SET is_used = 1, verified_at = datetime('now')
      WHERE id = ?
    `).bind(otpId).run();

    return json({ verified: true });
  } else {
    await env.DB.prepare(`
      UPDATE meeting_otp_records SET attempts = attempts + 1 WHERE id = ?
    `).bind(otpId).run();

    return json({ verified: false, error: 'Invalid code' });
  }
});

// Building settings: Get
route('GET', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const settings = await env.DB.prepare(
    `SELECT * FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  if (!settings) {
    // Return defaults
    return json({
      settings: {
        building_id: params.buildingId,
        voting_unit: 'apartment',
        default_quorum_percent: 50,
        schedule_poll_duration_days: 3,
        voting_duration_hours: 48,
        allow_resident_initiative: 1,
        require_moderation: 1,
        default_meeting_time: '19:00',
        reminder_hours_before: [48, 2],
        notification_channels: ['in_app', 'push']
      }
    });
  }

  return json({
    settings: {
      ...settings,
      reminder_hours_before: settings.reminder_hours_before ? JSON.parse(settings.reminder_hours_before as string) : [48, 2],
      notification_channels: settings.notification_channels ? JSON.parse(settings.notification_channels as string) : ['in_app', 'push']
    }
  });
});

// Building settings: Update
route('PATCH', '/api/meetings/building-settings/:buildingId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const body = await request.json() as any;

  // Check if settings exist
  const tenantId = getTenantId(request);
  const existing = await env.DB.prepare(
    `SELECT building_id FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  if (existing) {
    const updates: string[] = [];
    const values: any[] = [];

    const fields = [
      { api: 'votingUnit', db: 'voting_unit' },
      { api: 'voting_unit', db: 'voting_unit' },
      { api: 'defaultQuorumPercent', db: 'default_quorum_percent' },
      { api: 'default_quorum_percent', db: 'default_quorum_percent' },
      { api: 'schedulePollDurationDays', db: 'schedule_poll_duration_days' },
      { api: 'schedule_poll_duration_days', db: 'schedule_poll_duration_days' },
      { api: 'votingDurationHours', db: 'voting_duration_hours' },
      { api: 'voting_duration_hours', db: 'voting_duration_hours' },
      { api: 'defaultMeetingTime', db: 'default_meeting_time' },
      { api: 'default_meeting_time', db: 'default_meeting_time' },
    ];

    for (const field of fields) {
      if (body[field.api] !== undefined) {
        updates.push(`${field.db} = ?`);
        values.push(body[field.api]);
      }
    }

    if (body.allowResidentInitiative !== undefined || body.allow_resident_initiative !== undefined) {
      updates.push('allow_resident_initiative = ?');
      values.push((body.allowResidentInitiative || body.allow_resident_initiative) ? 1 : 0);
    }

    if (body.requireModeration !== undefined || body.require_moderation !== undefined) {
      updates.push('require_moderation = ?');
      values.push((body.requireModeration || body.require_moderation) ? 1 : 0);
    }

    if (body.reminderHoursBefore || body.reminder_hours_before) {
      updates.push('reminder_hours_before = ?');
      values.push(JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before));
    }

    if (body.notificationChannels || body.notification_channels) {
      updates.push('notification_channels = ?');
      values.push(JSON.stringify(body.notificationChannels || body.notification_channels));
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      values.push(params.buildingId);

      await env.DB.prepare(`
        UPDATE meeting_building_settings SET ${updates.join(', ')} WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
      `).bind(...values, ...(tenantId ? [tenantId] : [])).run();
    }
  } else {
    // Insert new
    await env.DB.prepare(`
      INSERT INTO meeting_building_settings (
        building_id, voting_unit, default_quorum_percent,
        schedule_poll_duration_days, voting_duration_hours,
        allow_resident_initiative, require_moderation,
        default_meeting_time, reminder_hours_before, notification_channels, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      params.buildingId,
      body.votingUnit || body.voting_unit || 'apartment',
      body.defaultQuorumPercent || body.default_quorum_percent || 50,
      body.schedulePollDurationDays || body.schedule_poll_duration_days || 3,
      body.votingDurationHours || body.voting_duration_hours || 48,
      (body.allowResidentInitiative || body.allow_resident_initiative) !== false ? 1 : 0,
      (body.requireModeration || body.require_moderation) !== false ? 1 : 0,
      body.defaultMeetingTime || body.default_meeting_time || '19:00',
      JSON.stringify(body.reminderHoursBefore || body.reminder_hours_before || [48, 2]),
      JSON.stringify(body.notificationChannels || body.notification_channels || ['in_app', 'push']),
      getTenantId(request)
    ).run();
  }

  const updated = await env.DB.prepare(
    `SELECT * FROM meeting_building_settings WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.buildingId, ...(tenantId ? [tenantId] : [])).first();

  return json({ settings: updated });
});

// Voting units: List by building
route('GET', '/api/meetings/voting-units', async (request, env) => {
  const url = new URL(request.url);
  const buildingId = url.searchParams.get('building_id') || url.searchParams.get('buildingId');

  if (!buildingId) {
    return error('building_id required', 400);
  }

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT * FROM meeting_voting_units WHERE building_id = ? ${tenantId ? 'AND tenant_id = ?' : ''} ORDER BY apartment_number`
  ).bind(buildingId, ...(tenantId ? [tenantId] : [])).all();

  return json({
    votingUnits: results.map((u: any) => ({
      ...u,
      coOwnerIds: u.co_owner_ids ? JSON.parse(u.co_owner_ids) : []
    }))
  });
});

// Voting units: Create
route('POST', '/api/meetings/voting-units', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO meeting_voting_units (
      id, building_id, apartment_id, apartment_number,
      owner_id, owner_name, co_owner_ids,
      ownership_share, total_area, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.building_id || body.buildingId,
    body.apartment_id || body.apartmentId || null,
    body.apartment_number || body.apartmentNumber,
    body.owner_id || body.ownerId || null,
    body.owner_name || body.ownerName || null,
    JSON.stringify(body.co_owner_ids || body.coOwnerIds || []),
    body.ownership_share || body.ownershipShare || 100,
    body.total_area || body.totalArea || null,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(id).first();
  return json({ votingUnit: created }, 201);
});

// Voting units: Verify
route('POST', '/api/meetings/voting-units/:id/verify', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  await env.DB.prepare(`
    UPDATE meeting_voting_units
    SET is_verified = 1, verified_at = datetime('now'), verified_by = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(authUser.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  const updated = await env.DB.prepare('SELECT * FROM meeting_voting_units WHERE id = ?').bind(params.id).first();
  return json({ votingUnit: updated });
});

// Eligible voters: Set for meeting
route('POST', '/api/meetings/:meetingId/eligible-voters', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  const body = await request.json() as any;
  const voters = body.voters || [];

  // Clear existing
  await env.DB.prepare(
    'DELETE FROM meeting_eligible_voters WHERE meeting_id = ?'
  ).bind(params.meetingId).run();

  // Insert new
  for (const voter of voters) {
    await env.DB.prepare(`
      INSERT INTO meeting_eligible_voters (meeting_id, user_id, apartment_id, ownership_share, tenant_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      params.meetingId,
      voter.user_id || voter.userId,
      voter.apartment_id || voter.apartmentId || null,
      voter.ownership_share || voter.ownershipShare || 100,
      getTenantId(request)
    ).run();
  }

  // Update total count
  await env.DB.prepare(`
    UPDATE meetings SET total_eligible_count = ?, updated_at = datetime('now') WHERE id = ?
  `).bind(voters.length, params.meetingId).run();

  return json({ success: true, count: voters.length });
});

// Get vote records for meeting (audit)
route('GET', '/api/meetings/:meetingId/vote-records', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Admin/Manager access required', 403);
  }

  // MULTI-TENANCY: Verify meeting belongs to tenant
  const tenantId = getTenantId(request);
  if (tenantId) {
    const m = await env.DB.prepare('SELECT id FROM meetings WHERE id = ? AND tenant_id = ?').bind(params.meetingId, tenantId).first();
    if (!m) return error('Meeting not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM meeting_vote_records WHERE meeting_id = ? ORDER BY voted_at'
  ).bind(params.meetingId).all();

  return json({ voteRecords: results });
});

// Get protocol
route('GET', '/api/meetings/:meetingId/protocol', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT protocol_id FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting?.protocol_id) {
    return error('Protocol not found', 404);
  }

  const protocol = await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?')
    .bind(meeting.protocol_id).first();

  return json({ protocol });
});

// Get protocol as HTML (for PDF generation on client side)
route('GET', '/api/meetings/:meetingId/protocol/html', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique voters (deduplicated by voter_id)
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT voter_id, voter_name, apartment_number, MAX(vote_weight) as vote_weight, MIN(voted_at) as voted_at
    FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0
    GROUP BY voter_id ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Build HTML for PDF
  let html = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Протокол собрания №${meeting.number}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; padding: 20mm; max-width: 210mm; }
    h1 { text-align: center; font-size: 16pt; margin-bottom: 10px; }
    h2 { font-size: 14pt; margin: 20px 0 10px; border-bottom: 1px solid #333; padding-bottom: 5px; }
    h3 { font-size: 12pt; margin: 15px 0 8px; }
    p { margin: 5px 0; }
    .header { text-align: center; margin-bottom: 30px; }
    .header p { margin: 3px 0; }
    .section { margin: 15px 0; }
    .quorum { background: #f5f5f5; padding: 10px; border-radius: 5px; margin: 10px 0; }
    .quorum.reached { background: #e8f5e9; border-left: 4px solid #4caf50; }
    .quorum.not-reached { background: #ffebee; border-left: 4px solid #f44336; }
    .agenda-item { margin: 15px 0; padding: 10px; background: #fafafa; border-radius: 5px; }
    .votes { display: flex; gap: 20px; margin: 10px 0; }
    .vote-block { flex: 1; }
    .decision { font-weight: bold; font-size: 14pt; margin: 10px 0; padding: 8px; text-align: center; }
    .decision.approved { background: #e8f5e9; color: #2e7d32; }
    .decision.rejected { background: #ffebee; color: #c62828; }
    .comments { margin: 10px 0; padding: 10px; background: #fff8e1; border-left: 3px solid #ffc107; }
    .comment { margin: 8px 0; font-style: italic; }
    .comment-author { font-size: 10pt; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    th, td { border: 1px solid #333; padding: 5px 8px; text-align: left; }
    th { background: #f0f0f0; }
    .signatures { margin-top: 40px; }
    .signature-line { margin: 20px 0; display: flex; justify-content: space-between; }
    .signature-line span { border-bottom: 1px solid #333; min-width: 200px; display: inline-block; }
    .footer { margin-top: 30px; font-size: 10pt; color: #666; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
    @media print {
      body { padding: 15mm; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ПРОТОКОЛ №${meeting.number}</h1>
    <p><strong>Общего собрания собственников помещений</strong></p>
    <p>многоквартирного дома по адресу:</p>
    <p><strong>${meeting.building_address || 'Адрес не указан'}</strong></p>
  </div>

  <div class="section">
    <p><strong>Дата проведения:</strong> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p>
    <p><strong>Форма проведения:</strong> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p>
    <p><strong>Инициатор собрания:</strong> ${meeting.organizer_name || 'Управляющая компания'}</p>
  </div>

  <h2>СВЕДЕНИЯ О КВОРУМЕ</h2>
  <div class="quorum ${meeting.quorum_reached ? 'reached' : 'not-reached'}">
    <p><strong>Общая площадь помещений дома:</strong> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p>
    <p><strong>Площадь проголосовавших:</strong> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p>
    <p><strong>Количество правомочных голосующих:</strong> ${meeting.total_eligible_count || 0}</p>
    <p><strong>Приняло участие:</strong> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p>
    <p><strong>Кворум:</strong> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p>
  </div>

  <h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>
`;

  // Add agenda items
  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain, comments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all()
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    // Use weight-based percentages (sq.m area per Uzbekistan law)
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (2/3)',
      two_thirds: '2/3 голосов',
      three_quarters: '3/4 голосов',
      unanimous: 'Единогласно'
    };

    html += `
  <div class="agenda-item">
    <h3>${i.item_order}. ${i.title}</h3>
    ${i.description ? `<p>${i.description}</p>` : ''}
    <p><em>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</em></p>

    <div class="votes">
      <div class="vote-block">
        <strong>ЗА:</strong> ${forCount} голосов (${forWeight.toFixed(2)} кв.м) — ${percentForByWeight.toFixed(1)}%
      </div>
      <div class="vote-block">
        <strong>ПРОТИВ:</strong> ${againstCount} голосов (${againstWeight.toFixed(2)} кв.м) — ${percentAgainstByWeight.toFixed(1)}%
      </div>
      <div class="vote-block">
        <strong>ВОЗДЕРЖАЛИСЬ:</strong> ${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м) — ${percentAbstainByWeight.toFixed(1)}%
      </div>
    </div>
`;

    // Add comments
    if (comments.results && comments.results.length > 0) {
      html += `
    <div class="comments">
      <p><strong>Доводы участников:</strong></p>
`;
      for (const c of comments.results) {
        const comment = c as any;
        html += `
      <div class="comment">
        "${comment.content}"
        <div class="comment-author">— ${comment.resident_name}${comment.apartment_number ? `, кв. ${comment.apartment_number}` : ''}</div>
      </div>
`;
      }
      html += `    </div>`;
    }

    html += `
    <div class="decision ${i.is_approved ? 'approved' : 'rejected'}">
      РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}
    </div>
  </div>
`;
  }

  // Add participants table
  html += `
  <h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>ФИО</th>
        <th>Квартира</th>
        <th>Площадь (кв.м)</th>
        <th>Время голосования</th>
      </tr>
    </thead>
    <tbody>
`;

  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    html += `
      <tr>
        <td>${idx + 1}</td>
        <td>${v.voter_name}</td>
        <td>${v.apartment_number || '-'}</td>
        <td>${v.vote_weight || '-'}</td>
        <td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td>
      </tr>
`;
  }

  html += `
    </tbody>
  </table>

  <div class="signatures">
    <h2>ПОДПИСИ</h2>
    <div class="signature-line">
      <span>Председатель собрания:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
    <div class="signature-line">
      <span>Секретарь:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
    <div class="signature-line">
      <span>Члены счётной комиссии:</span>
      <span>____________________</span>
      <span>____________________</span>
    </div>
  </div>

  <div class="footer">
    <p>Протокол сформирован автоматически системой УК</p>
    <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
    ${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}
  </div>

  <script class="no-print">
    // Auto-print when opened
    // window.onload = () => window.print();
  </script>
</body>
</html>
`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    }
  });
});

// Get protocol as DOC file (Word document)
route('GET', '/api/meetings/:meetingId/protocol/doc', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(`SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`)
    .bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique voters (deduplicated by voter_id)
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT voter_id, voter_name, apartment_number, MAX(vote_weight) as vote_weight, MIN(voted_at) as voted_at
    FROM meeting_vote_records WHERE meeting_id = ? AND is_revote = 0
    GROUP BY voter_id ORDER BY voter_name
  `).bind(params.meetingId).all();

  // Build Word-compatible HTML (MHTML format for better Word compatibility)
  let docContent = `
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]>
  <xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>100</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml>
  <![endif]-->
  <style>
    @page {
      size: A4;
      margin: 2cm;
    }
    body {
      font-family: 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.5;
    }
    h1 {
      text-align: center;
      font-size: 16pt;
      margin-bottom: 10pt;
    }
    h2 {
      font-size: 14pt;
      margin-top: 20pt;
      margin-bottom: 10pt;
      border-bottom: 1pt solid #333;
      padding-bottom: 5pt;
    }
    h3 {
      font-size: 12pt;
      margin-top: 15pt;
      margin-bottom: 8pt;
    }
    p {
      margin: 5pt 0;
    }
    .header {
      text-align: center;
      margin-bottom: 30pt;
    }
    .section {
      margin: 15pt 0;
    }
    .quorum {
      background-color: #f5f5f5;
      padding: 10pt;
      margin: 10pt 0;
      border-left: 4pt solid #4caf50;
    }
    .agenda-item {
      margin: 15pt 0;
      padding: 10pt;
      background-color: #fafafa;
    }
    .decision {
      font-weight: bold;
      font-size: 14pt;
      margin: 10pt 0;
      padding: 8pt;
      text-align: center;
    }
    .decision-approved {
      background-color: #e8f5e9;
      color: #2e7d32;
    }
    .decision-rejected {
      background-color: #ffebee;
      color: #c62828;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10pt 0;
      font-size: 10pt;
    }
    th, td {
      border: 1pt solid #333;
      padding: 5pt 8pt;
      text-align: left;
    }
    th {
      background-color: #f0f0f0;
    }
    .signatures {
      margin-top: 40pt;
    }
    .signature-line {
      margin: 30pt 0;
    }
    .footer {
      margin-top: 30pt;
      font-size: 10pt;
      color: #666;
      text-align: center;
      border-top: 1pt solid #ccc;
      padding-top: 10pt;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>ПРОТОКОЛ №${meeting.number}</h1>
    <p><b>Общего собрания собственников помещений</b></p>
    <p>многоквартирного дома по адресу:</p>
    <p><b>${meeting.building_address || 'Адрес не указан'}</b></p>
  </div>

  <div class="section">
    <p><b>Дата проведения:</b> ${meeting.confirmed_date_time ? new Date(meeting.confirmed_date_time).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Не указана'}</p>
    <p><b>Форма проведения:</b> ${meeting.format === 'online' ? 'Заочное голосование (онлайн)' : meeting.format === 'offline' ? 'Очное собрание' : 'Очно-заочное'}</p>
    <p><b>Инициатор собрания:</b> ${meeting.organizer_name || 'Управляющая компания'}</p>
  </div>

  <h2>СВЕДЕНИЯ О КВОРУМЕ</h2>
  <div class="quorum">
    <p><b>Общая площадь помещений дома:</b> ${meeting.total_area ? meeting.total_area.toFixed(2) + ' кв.м' : 'Не указана'}</p>
    <p><b>Площадь проголосовавших:</b> ${meeting.voted_area ? meeting.voted_area.toFixed(2) + ' кв.м' : '-'}</p>
    <p><b>Количество правомочных голосующих:</b> ${meeting.total_eligible_count || 0}</p>
    <p><b>Приняло участие:</b> ${meeting.participated_count || 0} (${(meeting.participation_percent || 0).toFixed(1)}%)</p>
    <p><b>Кворум:</b> ${meeting.quorum_reached ? '✓ ДОСТИГНУТ' : '✗ НЕ ДОСТИГНУТ'}</p>
  </div>

  <h2>ПОВЕСТКА ДНЯ И РЕЗУЛЬТАТЫ ГОЛОСОВАНИЯ</h2>
`;

  // Add agenda items
  for (const item of agendaItems) {
    const i = item as any;
    const [votesFor, votesAgainst, votesAbstain, docComments] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'for' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'against' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT COUNT(*) as count, COALESCE(SUM(COALESCE(u.total_area, v.vote_weight)), 0) as weight FROM meeting_vote_records v LEFT JOIN users u ON u.id = v.voter_id WHERE v.agenda_item_id = ? AND v.choice = 'abstain' AND v.is_revote = 0").bind(i.id).first(),
      env.DB.prepare("SELECT * FROM meeting_agenda_comments WHERE agenda_item_id = ? ORDER BY created_at").bind(i.id).all(),
    ]) as any[];

    const forCount = votesFor?.count || 0;
    const forWeight = votesFor?.weight || 0;
    const againstCount = votesAgainst?.count || 0;
    const againstWeight = votesAgainst?.weight || 0;
    const abstainCount = votesAbstain?.count || 0;
    const abstainWeight = votesAbstain?.weight || 0;
    const totalWeight = forWeight + againstWeight + abstainWeight;
    // Use weight-based percentages (sq.m = vote weight per Uzbekistan law)
    const percentForByWeight = totalWeight > 0 ? (forWeight / totalWeight) * 100 : 0;
    const percentAgainstByWeight = totalWeight > 0 ? (againstWeight / totalWeight) * 100 : 0;
    const percentAbstainByWeight = totalWeight > 0 ? (abstainWeight / totalWeight) * 100 : 0;

    const thresholdLabels: Record<string, string> = {
      simple_majority: 'Простое большинство (>50%)',
      qualified_majority: 'Квалифицированное большинство (2/3)',
      two_thirds: '2/3 голосов',
      three_quarters: '3/4 голосов',
      unanimous: 'Единогласно'
    };

    // Build objections HTML
    const objections = (docComments?.results || []).filter((c: any) => c.comment_type === 'objection');
    const regularComments = (docComments?.results || []).filter((c: any) => c.comment_type !== 'objection');
    let objHtml = '';
    if (objections.length > 0) {
      objHtml += `<p><b>Возражения участников (голосовали ПРОТИВ):</b></p>`;
      for (const c of objections as any[]) {
        objHtml += `<blockquote>⚠️ "${c.content}" — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}`;
        if (c.counter_proposal) objHtml += `<br/>💡 <b>Альтернативное предложение:</b> ${c.counter_proposal}`;
        objHtml += `</blockquote>`;
      }
    }
    if (regularComments.length > 0) {
      objHtml += `<p><b>Комментарии участников:</b></p>`;
      for (const c of regularComments as any[]) {
        objHtml += `<blockquote>"${c.content}" — ${c.resident_name || 'Участник'}${c.apartment_number ? `, кв. ${c.apartment_number}` : ''}</blockquote>`;
      }
    }

    docContent += `
  <div class="agenda-item">
    <h3>${i.item_order}. ${i.title}</h3>
    ${i.description ? `<p>${i.description}</p>` : ''}
    <p><i>Порог принятия: ${thresholdLabels[i.threshold] || 'Простое большинство'}</i></p>

    <table>
      <tr>
        <th>ЗА</th>
        <th>ПРОТИВ</th>
        <th>ВОЗДЕРЖАЛИСЬ</th>
      </tr>
      <tr>
        <td>${forCount} голосов (${forWeight.toFixed(2)} кв.м) — ${percentForByWeight.toFixed(1)}%</td>
        <td>${againstCount} голосов (${againstWeight.toFixed(2)} кв.м) — ${percentAgainstByWeight.toFixed(1)}%</td>
        <td>${abstainCount} голосов (${abstainWeight.toFixed(2)} кв.м) — ${percentAbstainByWeight.toFixed(1)}%</td>
      </tr>
    </table>

    ${objHtml}

    <div class="decision ${i.is_approved ? 'decision-approved' : 'decision-rejected'}">
      РЕШЕНИЕ: ${i.is_approved ? 'ПРИНЯТО' : 'НЕ ПРИНЯТО'}
    </div>
  </div>
`;
  }

  // Add participants table
  docContent += `
  <h2>ПРИЛОЖЕНИЕ: РЕЕСТР ПРОГОЛОСОВАВШИХ</h2>
  <table>
    <tr>
      <th>№</th>
      <th>ФИО</th>
      <th>Квартира</th>
      <th>Площадь (кв.м)</th>
      <th>Время голосования</th>
    </tr>
`;

  for (let idx = 0; idx < voteRecords.length; idx++) {
    const v = voteRecords[idx] as any;
    docContent += `
    <tr>
      <td>${idx + 1}</td>
      <td>${v.voter_name}</td>
      <td>${v.apartment_number || '-'}</td>
      <td>${v.vote_weight || '-'}</td>
      <td>${new Date(v.voted_at).toLocaleString('ru-RU')}</td>
    </tr>
`;
  }

  docContent += `
  </table>

  <div class="signatures">
    <h2>ПОДПИСИ</h2>
    <div class="signature-line">
      <p>Председатель собрания: ______________________ / ______________________ /</p>
    </div>
    <div class="signature-line">
      <p>Секретарь: ______________________ / ______________________ /</p>
    </div>
    <div class="signature-line">
      <p>Члены счётной комиссии: ______________________ / ______________________ /</p>
    </div>
  </div>

  <div class="footer">
    <p>Протокол сформирован автоматически системой УК</p>
    <p>Дата формирования: ${new Date().toLocaleString('ru-RU')}</p>
    ${protocol?.protocol_hash ? `<p>Хеш документа: ${protocol.protocol_hash}</p>` : ''}
  </div>
</body>
</html>
`;

  const filename = `protocol_${meeting.number}_${new Date().toISOString().split('T')[0]}.doc`;

  return new Response(docContent, {
    headers: {
      'Content-Type': 'application/msword',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
    }
  });
});

// Get protocol data as JSON for frontend DOCX generation
route('GET', '/api/meetings/:meetingId/protocol/data', async (request, env, params) => {
  const tenantId = getTenantId(request);
  const meeting = await env.DB.prepare(
    `SELECT * FROM meetings WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.meetingId, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!meeting) {
    return error('Meeting not found', 404);
  }

  const protocol = meeting.protocol_id
    ? await env.DB.prepare('SELECT * FROM meeting_protocols WHERE id = ?').bind(meeting.protocol_id).first() as any
    : null;

  // Get agenda items with results
  const { results: agendaItems } = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_items WHERE meeting_id = ? ORDER BY item_order'
  ).bind(params.meetingId).all();

  // Get unique vote records (for participant list) - JOIN with users for actual area
  const { results: voteRecords } = await env.DB.prepare(`
    SELECT v.voter_id, v.voter_name, v.apartment_number,
      COALESCE(u.total_area, v.vote_weight) as vote_weight,
      MIN(v.voted_at) as voted_at
    FROM meeting_vote_records v
    LEFT JOIN users u ON u.id = v.voter_id
    WHERE v.meeting_id = ? AND (v.is_revote = 0 OR v.is_revote IS NULL)
    GROUP BY v.voter_id
    ORDER BY v.voter_name
  `).bind(params.meetingId).all();

  // Get votes by each agenda item (for detailed voting tables) with comments
  const votesByItem: Record<string, any[]> = {};
  for (const item of agendaItems) {
    const { results: itemVotes } = await env.DB.prepare(`
      SELECT
        v.voter_id, v.voter_name, v.apartment_number,
        COALESCE(u.total_area, v.vote_weight) as vote_weight,
        v.choice, v.voted_at,
        c.comment as comment
      FROM meeting_vote_records v
      LEFT JOIN users u ON u.id = v.voter_id
      LEFT JOIN meeting_agenda_comments c ON
        c.agenda_item_id = v.agenda_item_id AND
        c.user_id = v.voter_id
      WHERE v.agenda_item_id = ? AND (v.is_revote = 0 OR v.is_revote IS NULL)
      ORDER BY v.voter_name
    `).bind((item as any).id).all();
    votesByItem[(item as any).id] = itemVotes;
  }

  // Recalculate voted_area from actual unique voters to avoid stale stored data
  const actualVotedArea = voteRecords.reduce((sum: number, r: any) => sum + (Number(r.vote_weight) || 0), 0);
  const actualParticipatedCount = voteRecords.length;
  const totalArea = Number(meeting.total_area) || 1;
  const actualParticipationPercent = (actualVotedArea / totalArea) * 100;

  return json({
    meeting: {
      ...meeting,
      voted_area: actualVotedArea,
      participated_count: actualParticipatedCount,
      participation_percent: Math.min(actualParticipationPercent, 100),
    },
    agendaItems,
    voteRecords,
    votesByItem,
    protocolHash: protocol?.protocol_hash
  });
});

// ==================== AGENDA COMMENTS ROUTES ====================

// Get comments for agenda item
route('GET', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const { results } = await env.DB.prepare(`
    SELECT * FROM meeting_agenda_comments
    WHERE agenda_item_id = ?
    ORDER BY created_at DESC
  `).bind(params.agendaItemId).all();

  return json({ comments: results });
});

// Add comment to agenda item
route('POST', '/api/agenda/:agendaItemId/comments', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  const body = await request.json() as any;

  // Get the meeting_id from agenda item
  const agendaItem = await env.DB.prepare(
    'SELECT meeting_id FROM meeting_agenda_items WHERE id = ?'
  ).bind(params.agendaItemId).first() as any;

  if (!agendaItem) {
    return error('Agenda item not found', 404);
  }

  // Check if meeting is in voting state
  const meeting = await env.DB.prepare(
    'SELECT status FROM meetings WHERE id = ?'
  ).bind(agendaItem.meeting_id).first() as any;

  if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) {
    return error('Comments are only allowed during voting', 400);
  }

  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO meeting_agenda_comments (id, agenda_item_id, user_id, comment, tenant_id)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
    id,
    params.agendaItemId,
    authUser.id,
    body.content || body.comment,
    getTenantId(request)
  ).run();

  const created = await env.DB.prepare(
    'SELECT * FROM meeting_agenda_comments WHERE id = ?'
  ).bind(id).first();

  return json({ comment: created }, 201);
});

// Delete own comment
route('DELETE', '/api/comments/:commentId', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) {
    return error('Unauthorized', 401);
  }

  // Check ownership
  const comment = await env.DB.prepare(
    'SELECT user_id, agenda_item_id FROM meeting_agenda_comments WHERE id = ?'
  ).bind(params.commentId).first() as any;

  if (!comment) {
    return error('Comment not found', 404);
  }

  // Only owner or admin can delete
  if (comment.user_id !== authUser.id && authUser.role !== 'admin') {
    return error('Not authorized to delete this comment', 403);
  }

  // Check if meeting is still in voting state (need to get meeting_id via agenda_item)
  const agendaItem = await env.DB.prepare(
    'SELECT meeting_id FROM meeting_agenda_items WHERE id = ?'
  ).bind(comment.agenda_item_id).first() as any;

  if (agendaItem) {
    const meeting = await env.DB.prepare(
      'SELECT status FROM meetings WHERE id = ?'
    ).bind(agendaItem.meeting_id).first() as any;

    if (!meeting || !['voting_open', 'schedule_poll_open'].includes(meeting.status)) {
      return error('Cannot delete comments after voting ends', 400);
    }
  }

  await env.DB.prepare('DELETE FROM meeting_agenda_comments WHERE id = ?')
    .bind(params.commentId).run();

  return json({ success: true });
});

// ==================== STATS ROUTES ====================

// Stats helper function
async function getStats(env: Env, request: Request) {
  const tenantId = getTenantId(request);
  const tenantFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tenantWhere = tenantId ? ' WHERE tenant_id = ?' : '';
  const bind = tenantId ? [tenantId] : [];

  const stats = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'new'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status IN ('assigned', 'in_progress')${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM requests WHERE status = 'completed'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'resident'${tenantFilter}`).bind(...bind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM users WHERE role = 'executor'${tenantFilter}`).bind(...bind).first(),
  ]);

  return {
    new_requests: (stats[0] as any)?.count || 0,
    in_progress: (stats[1] as any)?.count || 0,
    completed: (stats[2] as any)?.count || 0,
    total_residents: (stats[3] as any)?.count || 0,
    total_executors: (stats[4] as any)?.count || 0,
  };
}

route('GET', '/api/stats', async (request, env) => {
  return json(await getStats(env, request));
});

// Alias for /api/stats/dashboard (frontend compatibility)
route('GET', '/api/stats/dashboard', async (request, env) => {
  return json(await getStats(env, request));
});

// ==================== SETTINGS ROUTES ====================

// Get all settings
route('GET', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { results } = await env.DB.prepare('SELECT key, value, updated_at FROM settings').all();

  // Convert to key-value object
  const settings: Record<string, any> = {};
  for (const row of results as any[]) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return json({ settings });
});

// Get single setting
route('GET', '/api/settings/:key', async (request, env, params) => {
  const setting = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(params.key).first();

  if (!setting) {
    return json({ value: null });
  }

  try {
    return json({ value: JSON.parse((setting as any).value) });
  } catch {
    return json({ value: (setting as any).value });
  }
});

// Set/update setting
route('PUT', '/api/settings/:key', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);

  await env.DB.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
  `).bind(params.key, value, value).run();

  return json({ success: true, key: params.key });
});

// Bulk update settings
route('POST', '/api/settings', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as Record<string, any>;

  const statements = Object.entries(body).map(([key, val]) => {
    const value = typeof val === 'string' ? val : JSON.stringify(val);
    return env.DB.prepare(`
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT (key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `).bind(key, value, value);
  });

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  return json({ success: true });
});

// ==================== NOTIFICATIONS ROUTES ====================

// Get notifications for current user
route('GET', '/api/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const unreadOnly = url.searchParams.get('unread') === 'true';

  let query = `SELECT * FROM notifications WHERE user_id = ? ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`;
  if (unreadOnly) {
    query += ' AND is_read = 0';
  }
  query += ' ORDER BY created_at DESC LIMIT ?';

  const { results } = await env.DB.prepare(query).bind(authUser.id, ...(tenantId ? [tenantId] : []), limit).all();

  // Parse data field
  const notifications = (results as any[]).map(n => ({
    ...n,
    data: n.data ? JSON.parse(n.data) : null,
    is_read: Boolean(n.is_read),
  }));

  return json({ notifications });
});

// Get unread count
route('GET', '/api/notifications/count', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const result = await env.DB.prepare(
    `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0 ${tenantId ? 'AND (tenant_id = ? OR tenant_id IS NULL)' : ''}`
  ).bind(authUser.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ count: (result as any)?.count || 0 });
});

// Create notification (management only)
route('POST', '/api/notifications', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Management access required', 403);

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    body.user_id,
    body.type,
    body.title,
    body.body || null,
    body.data ? JSON.stringify(body.data) : null,
    getTenantId(request) || null
  ).run();

  return json({ id, success: true });
});

// Mark notification as read
route('PATCH', '/api/notifications/:id/read', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, authUser.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// Mark all notifications as read
route('POST', '/api/notifications/read-all', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `UPDATE notifications SET is_read = 1 WHERE user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(authUser.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// Delete notification
route('DELETE', '/api/notifications/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const tenantId = getTenantId(request);
  await env.DB.prepare(
    `DELETE FROM notifications WHERE id = ? AND user_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, authUser.id, ...(tenantId ? [tenantId] : [])).run();

  return json({ success: true });
});

// ==================== FILE UPLOAD ROUTES ====================
// Simple file upload that converts files to base64 data URLs
// Max file size: 5MB, supports images and documents

route('POST', '/api/upload', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
  const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // Handle FormData upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return error('No file provided', 400);
      }

      if (file.size > MAX_FILE_SIZE) {
        return error('File too large. Maximum size is 5MB', 400);
      }

      if (!ALLOWED_TYPES.includes(file.type)) {
        return error('File type not allowed', 400);
      }

      // Convert to base64 data URL (chunked to handle large files)
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 32768;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
      }
      const base64 = btoa(binary);
      const dataUrl = `data:${file.type};base64,${base64}`;

      return json({
        success: true,
        file: {
          name: file.name,
          url: dataUrl,
          type: file.type,
          size: file.size
        }
      });
    } else if (contentType.includes('application/json')) {
      // Handle base64 JSON upload
      const body = await request.json() as any;

      if (!body.data || !body.name || !body.type) {
        return error('Missing required fields: data, name, type', 400);
      }

      // Validate file type
      if (!ALLOWED_TYPES.includes(body.type)) {
        return error('File type not allowed', 400);
      }

      // Calculate base64 size (approximate)
      const base64Size = Math.ceil(body.data.length * 0.75);
      if (base64Size > MAX_FILE_SIZE) {
        return error('File too large. Maximum size is 5MB', 400);
      }

      // The data should already be base64, just add data URL prefix if needed
      const dataUrl = body.data.startsWith('data:')
        ? body.data
        : `data:${body.type};base64,${body.data}`;

      return json({
        success: true,
        file: {
          name: body.name,
          url: dataUrl,
          type: body.type,
          size: body.size || base64Size
        }
      });
    } else {
      return error('Unsupported content type. Use multipart/form-data or application/json', 400);
    }
  } catch (e) {
    console.error('[Upload] Error:', e);
    return error('Failed to process upload', 500);
  }
});

// ==================== WEB PUSH SUBSCRIPTION ROUTES ====================

// VAPID keys for Web Push (newly generated)
const VAPID_PUBLIC_KEY = 'BMTJw9s4vAY9Bzb05L8--r0XUDirigcJ0_yTTGuCLZL2uk8693U82ef7LLlWyLf9T-3PucveTAjYS_I36uv7RY4';
const VAPID_PRIVATE_KEY = 'Iryr3rbGuDTBPiBCH07-NCqEzwufF-EOcBIK--DJ9yk';

// Push: Subscribe
route('POST', '/api/push/subscribe', async (request, env) => {
  console.log('[Push] Subscribe request received');

  const authUser = await getUser(request, env);
  if (!authUser) {
    console.log('[Push] Subscribe failed: User not authenticated');
    return error('Unauthorized', 401);
  }

  console.log(`[Push] User ${authUser.id} (${authUser.name}) attempting to subscribe`);

  let body: { endpoint: string; keys: { p256dh: string; auth: string } };
  try {
    body = await request.json() as { endpoint: string; keys: { p256dh: string; auth: string } };
  } catch (e) {
    console.error('[Push] Failed to parse request body:', e);
    return error('Invalid JSON body', 400);
  }

  console.log('[Push] Subscription data:', {
    hasEndpoint: !!body.endpoint,
    endpointStart: body.endpoint?.substring(0, 60),
    hasP256dh: !!body.keys?.p256dh,
    hasAuth: !!body.keys?.auth,
    p256dhLength: body.keys?.p256dh?.length,
    authLength: body.keys?.auth?.length
  });

  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    console.log('[Push] Invalid subscription data - missing fields');
    return error('Invalid subscription data', 400);
  }

  const id = generateId();

  try {
    // Upsert subscription (update if endpoint exists)
    await env.DB.prepare(`
      INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at, last_used_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(endpoint) DO UPDATE SET
        user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        last_used_at = datetime('now')
    `).bind(id, authUser.id, body.endpoint, body.keys.p256dh, body.keys.auth).run();

    console.log(`[Push] SUCCESS! User ${authUser.id} subscribed, endpoint: ${body.endpoint.substring(0, 60)}...`);

    // Verify subscription was saved
    const saved = await env.DB.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').bind(authUser.id).first();
    console.log('[Push] Verified saved subscription:', saved ? 'EXISTS' : 'NOT FOUND');

    return json({ success: true, subscriptionId: id });
  } catch (dbError) {
    console.error('[Push] Database error saving subscription:', dbError);
    return error('Failed to save subscription', 500);
  }
});

// Push: Unsubscribe
route('POST', '/api/push/unsubscribe', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  await env.DB.prepare(
    'DELETE FROM push_subscriptions WHERE user_id = ?'
  ).bind(authUser.id).run();

  console.log(`[Push] User ${authUser.id} unsubscribed`);

  return json({ success: true });
});

// Push: Get subscription status
route('GET', '/api/push/status', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const subscription = await env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE user_id = ?'
  ).bind(authUser.id).first();

  return json({
    subscribed: !!subscription,
    subscription: subscription ? {
      endpoint: (subscription as any).endpoint,
      createdAt: (subscription as any).created_at,
      lastUsedAt: (subscription as any).last_used_at
    } : null
  });
});

// Push: Get VAPID public key
route('GET', '/api/push/vapid-key', async () => {
  return json({ publicKey: VAPID_PUBLIC_KEY });
});

// ==================== WEB PUSH IMPLEMENTATION ====================
// Using proper Web Push with VAPID authentication for Cloudflare Workers

// Helper: Base64 URL encode
function b64UrlEncode(data: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Helper: Base64 URL decode
function b64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Helper: Concatenate Uint8Arrays
function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// Create VAPID JWT token for authentication
async function createVapidAuthHeader(
  endpoint: string,
  subject: string,
  publicKey: string,
  privateKey: string
): Promise<{ authorization: string; cryptoKey: string }> {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  // JWT Header
  const header = { typ: 'JWT', alg: 'ES256' };
  const headerB64 = b64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));

  // JWT Payload
  const now = Math.floor(Date.now() / 1000);
  const jwtPayload = {
    aud: audience,
    exp: now + 12 * 60 * 60,
    sub: subject
  };
  const payloadB64 = b64UrlEncode(new TextEncoder().encode(JSON.stringify(jwtPayload)));

  // Import private key for signing
  const privateKeyBytes = b64UrlDecode(privateKey);

  // Create JWK from raw private key
  const publicKeyBytes = b64UrlDecode(publicKey);
  const x = publicKeyBytes.slice(1, 33);
  const y = publicKeyBytes.slice(33, 65);

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: b64UrlEncode(x),
    y: b64UrlEncode(y),
    d: b64UrlEncode(privateKeyBytes),
  };

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  // Sign JWT
  const unsignedToken = `${headerB64}.${payloadB64}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  // Convert DER signature to raw format (64 bytes)
  const signatureBytes = new Uint8Array(signature);
  const signatureB64 = b64UrlEncode(signatureBytes);

  const jwt = `${unsignedToken}.${signatureB64}`;

  return {
    authorization: `vapid t=${jwt}, k=${publicKey}`,
    cryptoKey: publicKey
  };
}

// Encrypt payload using Web Push encryption (RFC 8291 - aes128gcm)
async function encryptPushPayload(
  payload: string,
  p256dhKey: string,
  authSecret: string
): Promise<{ body: Uint8Array; headers: Record<string, string> }> {
  // Decode subscriber keys
  const subscriberPubKey = b64UrlDecode(p256dhKey);
  const auth = b64UrlDecode(authSecret);

  // Generate local ephemeral key pair
  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  ) as CryptoKeyPair;

  // Export local public key
  const localPubKeyRaw = await crypto.subtle.exportKey('raw', localKeyPair.publicKey) as ArrayBuffer;
  const localPubKey = new Uint8Array(localPubKeyRaw);

  // Import subscriber public key
  const subscriberKey = await crypto.subtle.importKey(
    'raw',
    subscriberPubKey,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  // Derive shared secret via ECDH
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: subscriberKey } as any,
    localKeyPair.privateKey,
    256
  );

  // Generate random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Create info for HKDF
  const keyInfoPrefix = new TextEncoder().encode('WebPush: info\0');
  const keyInfo = concatUint8Arrays(keyInfoPrefix, subscriberPubKey, localPubKey);

  // Import shared secret as HKDF key
  const sharedSecretKey = await crypto.subtle.importKey(
    'raw',
    sharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive IKM (Input Key Material)
  const ikm = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: auth, info: keyInfo },
    sharedSecretKey,
    256
  );

  // Import IKM for further derivation
  const ikmKey = await crypto.subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveBits']
  );

  // Derive Content Encryption Key (CEK)
  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: cekInfo },
    ikmKey,
    128
  );

  // Derive Nonce
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt, info: nonceInfo },
    ikmKey,
    96
  );

  // Import CEK for AES-GCM encryption
  const cekKey = await crypto.subtle.importKey(
    'raw',
    cek,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // Pad payload (add delimiter byte 0x02)
  const payloadBytes = new TextEncoder().encode(payload);
  const paddedPayload = new Uint8Array(payloadBytes.length + 1);
  paddedPayload.set(payloadBytes);
  paddedPayload[payloadBytes.length] = 2; // Padding delimiter

  // Encrypt
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: new Uint8Array(nonce) },
    cekKey,
    paddedPayload
  );

  // Build aes128gcm content
  // Format: salt (16) + rs (4) + idlen (1) + keyid (65) + ciphertext
  const recordSize = 4096;
  const header = new Uint8Array(86); // 16 + 4 + 1 + 65
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = 65; // Key ID length (uncompressed EC point)
  header.set(localPubKey, 21);

  const body = concatUint8Arrays(header, new Uint8Array(encrypted));

  return {
    body,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400'
    }
  };
}

// Send Web Push notification
async function sendWebPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payloadJson: string
): Promise<{ success: boolean; status?: number; error?: string }> {
  console.log(`[Push] Sending to endpoint: ${endpoint.substring(0, 60)}...`);
  console.log(`[Push] p256dh length: ${p256dh.length}, auth length: ${auth.length}`);

  try {
    // Create VAPID authorization
    console.log('[Push] Creating VAPID auth header...');
    const vapid = await createVapidAuthHeader(
      endpoint,
      `mailto:${env.VAPID_EMAIL || 'admin@kamizo.uz'}`,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    console.log('[Push] VAPID auth created successfully');

    // Encrypt payload
    console.log('[Push] Encrypting payload...');
    const { body, headers } = await encryptPushPayload(payloadJson, p256dh, auth);
    console.log(`[Push] Payload encrypted, body size: ${body.length} bytes`);

    // Send request
    console.log('[Push] Sending HTTP request to push service...');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Authorization': vapid.authorization
      },
      body
    });

    console.log(`[Push] Response status: ${response.status}`);

    if (response.ok || response.status === 201) {
      console.log(`[Push] SUCCESS! Status: ${response.status}`);
      return { success: true, status: response.status };
    }

    const errorText = await response.text();
    console.error(`[Push] FAILED ${response.status}: ${errorText}`);
    return { success: false, status: response.status, error: errorText };
  } catch (err) {
    console.error('[Push] EXCEPTION:', err);
    return { success: false, error: String(err) };
  }
}

// Helper function to send push notification (for internal use)
async function sendPushNotification(
  env: Env,
  userId: string,
  notification: {
    title: string;
    body: string;
    icon?: string;
    tag?: string;
    type?: string;
    data?: Record<string, any>;
    requireInteraction?: boolean;
    skipInApp?: boolean;
    tenantId?: string | null;
  }
): Promise<boolean> {
  // Get user's push subscriptions
  const { results } = await env.DB.prepare(
    'SELECT * FROM push_subscriptions WHERE user_id = ?'
  ).bind(userId).all();

  if (!results || results.length === 0) {
    console.log(`[Push] No subscriptions for user ${userId}`);
    return false;
  }

  const payload = JSON.stringify({
    title: notification.title,
    body: notification.body,
    icon: notification.icon || '/favicon.ico',
    badge: '/favicon.ico',
    tag: notification.tag || 'kamizo-' + Date.now(),
    type: notification.type,
    data: notification.data || {},
    requireInteraction: notification.requireInteraction ?? true,
    vibrate: [200, 100, 200]
  });

  let successCount = 0;

  for (const sub of results as any[]) {
    try {
      // Send real Web Push notification
      const result = await sendWebPush(
        sub.endpoint,
        sub.p256dh,
        sub.auth,
        payload
      );

      if (result.success) {
        // Update last_used_at on success
        await env.DB.prepare(
          'UPDATE push_subscriptions SET last_used_at = datetime(\'now\') WHERE id = ?'
        ).bind(sub.id).run();

        successCount++;
        console.log(`[Push] Successfully sent to user ${userId}`);
      } else {
        console.error(`[Push] Failed for user ${userId}: ${result.error}`);

        // Remove invalid subscriptions (410 Gone or 404 Not Found)
        if (result.status === 410 || result.status === 404) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
          console.log(`[Push] Removed expired subscription for user ${userId}`);
        }
      }
    } catch (err) {
      console.error(`[Push] Error sending to ${sub.endpoint}:`, err);
    }
  }

  // Store in-app notification (unless caller handles it separately via skipInApp flag)
  if (!notification.skipInApp) {
    const notifId = generateId();
    try {
      const existingNotif = notification.tag
        ? await env.DB.prepare(
            `SELECT id FROM notifications WHERE user_id = ? AND data LIKE ? AND created_at > datetime('now', '-1 minute')`
          ).bind(userId, `%"tag":"${notification.tag}"%`).first()
        : null;

      if (!existingNotif) {
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
          VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'), ?)
        `).bind(
          notifId,
          userId,
          notification.type || 'push',
          notification.title,
          notification.body,
          JSON.stringify({ ...notification.data, tag: notification.tag }),
          notification.tenantId || null
        ).run();
      }
    } catch (e) {
      console.error('[Notification] Failed to store in-app notification:', e);
    }
  }

  return successCount > 0;
}

// Push: Send test notification (for debugging)
route('POST', '/api/push/test', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const sent = await sendPushNotification(env, authUser.id, {
    title: '🔔 Тестовое уведомление',
    body: 'Push уведомления работают! Это тестовое сообщение от Kamizo.',
    type: 'test',
    tag: 'test-notification',
    data: { url: '/' }
  });

  return json({ success: sent, message: sent ? 'Notification sent' : 'No subscriptions found' });
});

// Push: Send notification to specific user (admin only)
route('POST', '/api/push/send', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as {
    userId: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, any>;
  };

  if (!body.userId || !body.title || !body.body) {
    return error('userId, title, and body are required', 400);
  }

  const sent = await sendPushNotification(env, body.userId, {
    title: body.title,
    body: body.body,
    type: body.type,
    data: body.data,
    requireInteraction: true
  });

  return json({ success: sent });
});

// Push: Broadcast notification to multiple users (admin only)
route('POST', '/api/push/broadcast', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !['admin', 'director', 'manager'].includes(authUser.role)) {
    return error('Admin access required', 403);
  }

  const body = await request.json() as {
    userIds?: string[];
    role?: string;
    buildingId?: string;
    title: string;
    body: string;
    type?: string;
    data?: Record<string, any>;
  };

  if (!body.title || !body.body) {
    return error('title and body are required', 400);
  }

  let userIds: string[] = [];

  if (body.userIds) {
    userIds = body.userIds;
  } else if (body.role || body.buildingId) {
    // Get users by criteria
    let query = 'SELECT id FROM users WHERE 1=1';
    const params: string[] = [];

    if (body.role) {
      query += ' AND role = ?';
      params.push(body.role);
    }
    if (body.buildingId) {
      query += ' AND building_id = ?';
      params.push(body.buildingId);
    }

    const { results } = await env.DB.prepare(query).bind(...params).all();
    userIds = (results as any[]).map(u => u.id);
  }

  let sentCount = 0;
  for (const userId of userIds) {
    const sent = await sendPushNotification(env, userId, {
      title: body.title,
      body: body.body,
      type: body.type || 'broadcast',
      data: body.data,
      requireInteraction: true
    });
    if (sent) sentCount++;
  }

  return json({ success: true, sentCount, totalUsers: userIds.length });
});

// Send notification to multiple users
route('POST', '/api/notifications/broadcast', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const body = await request.json() as any;
  const { user_ids, type, title, body: notifBody, data } = body;

  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return error('user_ids array required', 400);
  }

  const statements = user_ids.map((userId: string) => {
    const id = generateId();
    return env.DB.prepare(`
      INSERT INTO notifications (id, user_id, type, title, body, data)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(id, userId, type, title, notifBody || null, data ? JSON.stringify(data) : null);
  });

  await env.DB.batch(statements);

  return json({ success: true, count: user_ids.length });
});

// ==================== ADVERTISING PLATFORM (ПОЛЕЗНЫЕ КОНТАКТЫ) ====================
// Рекламная платформа с купонами
// - advertiser (менеджер рекламы): создаёт объявления, видит статистику, проверяет и активирует купоны
// - residents: только просмотр и получение купонов

// Helper: Generate 6-character coupon code (letters + numbers)
function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Get ad categories
route('GET', '/api/ads/categories', async (request, env) => {
  try {
    const { results } = await env.DB.prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM ads WHERE category_id = c.id AND is_active = 1) as active_ads_count
       FROM ad_categories c ORDER BY sort_order`
    ).all();
    return json({ categories: results });
  } catch (err: any) {
    console.error('Error fetching categories:', err.message);
    return error(`Database error: ${err.message}`, 500);
  }
});

// ==================== ADVERTISER (ukreklama) ENDPOINTS ====================

// Helper: Check if user is advertiser (account_type or role)
function isAdvertiser(user: any): boolean {
  return user?.account_type === 'advertiser' || user?.role === 'advertiser';
}


// Get advertiser dashboard stats
route('GET', '/api/ads/dashboard', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'active') as active_ads,
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'expired') as expired_ads,
      (SELECT COUNT(*) FROM ads WHERE created_by = ? AND status = 'draft') as draft_ads,
      (SELECT SUM(views_count) FROM ads WHERE created_by = ?) as total_views,
      (SELECT SUM(coupons_issued) FROM ads WHERE created_by = ?) as total_coupons_issued,
      (SELECT SUM(coupons_activated) FROM ads WHERE created_by = ?) as total_coupons_activated
  `).bind(authUser.id, authUser.id, authUser.id, authUser.id, authUser.id, authUser.id).first();

  // Ads expiring soon (within 3 days)
  const { results: expiringSoon } = await env.DB.prepare(`
    SELECT id, title, expires_at
    FROM ads
    WHERE created_by = ? AND status = 'active'
      AND datetime(expires_at) BETWEEN datetime('now') AND datetime('now', '+3 days')
    ORDER BY expires_at ASC
    LIMIT 10
  `).bind(authUser.id).all();

  return json({ stats, expiringSoon });
});

// Get all ads for advertiser
route('GET', '/api/ads/my', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = `
    SELECT a.*, c.name_ru as category_name, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.created_by = ?
  `;
  const params: any[] = [authUser.id];

  if (status) {
    query += ` AND a.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY a.created_at DESC`;

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return json({ ads: results });
});

// Create new ad
route('POST', '/api/ads', async (request, env) => {
  try {
    const authUser = await getUser(request, env);
    if (!authUser || !isAdvertiser(authUser)) {
      return error('Advertiser access required', 403);
    }

    const body = await request.json() as any;

    if (!body.category_id || !body.title || !body.phone) {
      return error('category_id, title, and phone are required', 400);
    }

    // Calculate dates based on duration_type
    const now = new Date();
    let startsAt = body.starts_at || now.toISOString();
    let expiresAt = body.expires_at;

    if (!expiresAt) {
      const expDate = new Date(startsAt);
      switch (body.duration_type) {
        case 'week':
          expDate.setDate(expDate.getDate() + 7);
          break;
        case '2weeks':
          expDate.setDate(expDate.getDate() + 14);
          break;
        case '3months':
          expDate.setMonth(expDate.getMonth() + 3);
          break;
        case '6months':
          expDate.setMonth(expDate.getMonth() + 6);
          break;
        case 'year':
          expDate.setFullYear(expDate.getFullYear() + 1);
          break;
        default: // month
          expDate.setMonth(expDate.getMonth() + 1);
      }
      expiresAt = expDate.toISOString();
    }

    const id = generateId();

    await env.DB.prepare(`
      INSERT INTO ads (
        id, advertiser_id, category_id, title, description, phone, phone2, telegram, instagram, facebook, website,
        address, work_hours, work_days, logo_url, photos, discount_percent, badges,
        target_type, target_branches, target_buildings, starts_at, expires_at, duration_type, status, created_by, tenant_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      authUser.id,
      body.category_id,
      body.title,
      body.description || null,
      body.phone,
      body.phone2 || null,
      body.telegram || null,
      body.instagram || null,
      body.facebook || null,
      body.website || null,
      body.address || null,
      body.work_hours || null,
      body.work_days || null,
      body.logo_url || null,
      body.photos ? JSON.stringify(body.photos) : null,
      body.discount_percent || 0,
      body.badges ? JSON.stringify(body.badges) : null,
      body.target_type || 'all',
      body.target_branches ? JSON.stringify(body.target_branches) : '[]',
      body.target_buildings ? JSON.stringify(body.target_buildings) : '[]',
      startsAt,
      expiresAt,
      body.duration_type || 'month',
      body.status || 'active',
      authUser.id,
      getTenantId(request)
    ).run();

    const created = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(id).first();
    return json({ ad: created }, 201);
  } catch (err: any) {
    console.error('Error creating ad:', err.message);
    return error(`Failed to create ad: ${err.message}`, 500);
  }
});

// Update ad
route('PATCH', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT * FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['category_id', 'title', 'description', 'phone', 'phone2', 'telegram', 'instagram', 'facebook', 'website',
    'address', 'work_hours', 'work_days', 'logo_url', 'discount_percent', 'target_type',
    'starts_at', 'expires_at', 'duration_type', 'status'];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field]);
    }
  }

  // JSON fields
  if (body.photos !== undefined) {
    updates.push('photos = ?');
    values.push(JSON.stringify(body.photos));
  }
  if (body.badges !== undefined) {
    updates.push('badges = ?');
    values.push(JSON.stringify(body.badges));
  }
  if (body.target_branches !== undefined) {
    updates.push('target_branches = ?');
    values.push(JSON.stringify(body.target_branches));
  }
  if (body.target_buildings !== undefined) {
    updates.push('target_buildings = ?');
    values.push(JSON.stringify(body.target_buildings));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    await env.DB.prepare(`UPDATE ads SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const updated = await env.DB.prepare('SELECT * FROM ads WHERE id = ?').bind(params.id).first();
  return json({ ad: updated });
});

// Delete ad
route('DELETE', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  // Archive instead of delete
  await env.DB.prepare("UPDATE ads SET status = 'archived' WHERE id = ?").bind(params.id).run();
  return json({ success: true });
});

// Get coupon history for an ad
route('GET', '/api/ads/:id/coupons', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Advertiser access required', 403);
  }

  const ad = await env.DB.prepare('SELECT id FROM ads WHERE id = ? AND created_by = ?')
    .bind(params.id, authUser.id).first();

  if (!ad) {
    return error('Ad not found', 404);
  }

  const { results } = await env.DB.prepare(`
    SELECT c.*, u.name as user_name, u.phone as user_phone,
      checker.name as activated_by_name
    FROM ad_coupons c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users checker ON c.activated_by = checker.id
    WHERE c.ad_id = ?
    ORDER BY c.issued_at DESC
    LIMIT 100
  `).bind(params.id).all();

  return json({ coupons: results });
});

// ==================== COUPON MANAGEMENT ENDPOINTS ====================

// Check coupon (get info without activating)
route('GET', '/api/coupons/check/:code', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const code = params.code.toUpperCase();

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const coupon = await env.DB.prepare(`
    SELECT c.*,
      a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      u.name as user_name, u.phone as user_phone
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.code = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
  `).bind(code, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!coupon) {
    return error('Купон не найден', 404);
  }

  // Check if expired
  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return json({
      coupon,
      valid: false,
      reason: 'Срок действия купона истёк'
    });
  }

  if (coupon.status === 'activated') {
    return json({
      coupon,
      valid: false,
      reason: `Купон уже активирован ${new Date(coupon.activated_at).toLocaleString('ru-RU')}`
    });
  }

  if (coupon.status === 'cancelled') {
    return json({
      coupon,
      valid: false,
      reason: 'Купон отменён'
    });
  }

  return json({
    coupon,
    valid: true,
    discount_percent: coupon.discount_percent
  });
});

// Activate coupon
route('POST', '/api/coupons/activate/:code', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Coupon checker access required', 403);
  }

  const code = params.code.toUpperCase();
  const body = await request.json() as any;
  const amount = body.amount || 0;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const coupon = await env.DB.prepare(`
    SELECT c.*, a.id as ad_id
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    WHERE c.code = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
  `).bind(code, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!coupon) {
    return error('Купон не найден', 404);
  }

  if (coupon.status !== 'issued') {
    return error('Купон уже использован или недействителен', 400);
  }

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return error('Срок действия купона истёк', 400);
  }

  const discountAmount = amount * (coupon.discount_percent / 100);

  // Activate coupon
  await env.DB.prepare(`
    UPDATE ad_coupons SET
      status = 'activated',
      activated_at = datetime('now'),
      activated_by = ?,
      activation_amount = ?,
      discount_amount = ?
    WHERE code = ?
  `).bind(authUser.id, amount, discountAmount, code).run();

  // Update ad stats
  await env.DB.prepare(`
    UPDATE ads SET coupons_activated = coupons_activated + 1 WHERE id = ?
  `).bind(coupon.ad_id).run();

  const updated = await env.DB.prepare('SELECT * FROM ad_coupons WHERE code = ?').bind(code).first();

  return json({
    success: true,
    coupon: updated,
    discount_amount: discountAmount,
    final_amount: amount - discountAmount
  });
});

// Get activation history for checker
route('GET', '/api/coupons/history', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || !isAdvertiser(authUser)) {
    return error('Coupon checker access required', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, u.name as user_name
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN users u ON c.user_id = u.id
    WHERE c.activated_by = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.activated_at DESC
    LIMIT 100
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ activations: results });
});

// ==================== RESIDENT (жители) ENDPOINTS ====================

// Get active ads for residents (public viewing)
route('GET', '/api/ads', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search')?.toLowerCase();

  // Get user's branch for targeting - try from user.branch first, then from building
  let userBranch = (authUser as any).branch;
  if (!userBranch && (authUser as any).building_id) {
    const building = await env.DB.prepare(
      'SELECT branch_code FROM buildings WHERE id = ?'
    ).bind((authUser as any).building_id).first() as any;
    userBranch = building?.branch_code;
  }
  userBranch = userBranch || 'YS'; // Default fallback
  const now = new Date().toISOString();

  const userTenantId = (authUser as any).tenant_id;

  let query = `
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon,
      (SELECT COUNT(*) FROM ad_coupons WHERE ad_id = a.id AND user_id = ?) as user_has_coupon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.status = 'active'
      AND (a.starts_at IS NULL OR ? >= a.starts_at)
      AND (a.expires_at IS NULL OR ? <= a.expires_at)
      AND (a.target_type IS NULL OR a.target_type = '' OR a.target_type = 'all'
           OR (a.target_type = 'branches' AND (a.target_branches IS NULL OR a.target_branches = '[]' OR a.target_branches LIKE ?)))
  `;
  const params: any[] = [authUser.id, now, now, `%${userBranch}%`];

  // Filter by tenant: show tenant-specific ads OR enabled platform ads for this tenant
  if (userTenantId) {
    query += ` AND (
      a.tenant_id = ?
      OR (a.tenant_id IS NULL AND EXISTS (
        SELECT 1 FROM ad_tenant_assignments ata
        WHERE ata.ad_id = a.id AND ata.tenant_id = ? AND ata.enabled = 1
      ))
    )`;
    params.push(userTenantId, userTenantId);
  }

  if (categoryId) {
    query += ` AND a.category_id = ?`;
    params.push(categoryId);
  }

  if (search) {
    query += ` AND (LOWER(a.title) LIKE ? OR LOWER(a.description) LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }

  // Order: recommended first, then by views
  query += ` ORDER BY json_extract(a.badges, '$.recommended') DESC, a.views_count DESC, a.created_at DESC`;

  try {
    const { results } = await env.DB.prepare(query).bind(...params).all();

    // Parse JSON fields
    const ads = results.map((ad: any) => ({
      ...ad,
      badges: ad.badges ? JSON.parse(ad.badges) : {},
      photos: ad.photos ? JSON.parse(ad.photos) : [],
      target_branches: ad.target_branches ? JSON.parse(ad.target_branches) : []
    }));

    return json({ ads });
  } catch (err: any) {
    console.error('Error fetching ads:', err.message, 'Query:', query, 'Params:', params);
    return error(`Database error: ${err.message}`, 500);
  }
});

// GET /api/ads/assigned - admin/manager/director sees platform ads assigned to their tenant
route('GET', '/api/ads/assigned', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (!['admin', 'manager', 'director'].includes(authUser.role)) return error('Access denied', 403);

  const tenantId = (authUser as any).tenant_id;
  if (!tenantId) return json({ ads: [] });

  const { results } = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon,
      ata.enabled as tenant_enabled, ata.assigned_at
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    JOIN ad_tenant_assignments ata ON ata.ad_id = a.id AND ata.tenant_id = ?
    WHERE a.tenant_id IS NULL AND a.status != 'archived'
    ORDER BY a.created_at DESC
  `).bind(tenantId).all();

  const ads = (results || []).map((ad: any) => ({
    ...ad,
    badges: ad.badges ? JSON.parse(ad.badges) : {},
    photos: ad.photos ? JSON.parse(ad.photos) : [],
  }));

  return json({ ads });
});

// Get single ad details
route('GET', '/api/ads/:id', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const ad = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.name_uz as category_name_uz, c.icon as category_icon
    FROM ads a
    JOIN ad_categories c ON a.category_id = c.id
    WHERE a.id = ?
  `).bind(params.id).first() as any;

  if (!ad) {
    return error('Ad not found', 404);
  }

  // Record view (once per user per day)
  const viewId = generateId();
  try {
    await env.DB.prepare(`
      INSERT INTO ad_views (id, ad_id, user_id) VALUES (?, ?, ?)
    `).bind(viewId, params.id, authUser.id).run();

    // Update view count
    await env.DB.prepare(`UPDATE ads SET views_count = views_count + 1 WHERE id = ?`).bind(params.id).run();
  } catch (e) {
    // Ignore duplicate view errors (UNIQUE constraint)
  }

  // Check if user already has a coupon
  const existingCoupon = await env.DB.prepare(`
    SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?
  `).bind(params.id, authUser.id).first();

  // Parse JSON fields
  ad.badges = ad.badges ? JSON.parse(ad.badges) : {};
  ad.photos = ad.photos ? JSON.parse(ad.photos) : [];

  return json({
    ad,
    userCoupon: existingCoupon
  });
});

// Get coupon for an ad (resident only)
route('POST', '/api/ads/:id/get-coupon', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);
  if (authUser.role !== 'resident') {
    return error('Only residents can get coupons', 403);
  }

  const now = new Date().toISOString();
  const ad = await env.DB.prepare(`
    SELECT * FROM ads WHERE id = ? AND status = 'active'
    AND (starts_at IS NULL OR ? >= starts_at)
    AND (expires_at IS NULL OR ? <= expires_at)
  `).bind(params.id, now, now).first() as any;

  if (!ad) {
    return error('Ad not found or not active', 404);
  }

  if (!ad.discount_percent || ad.discount_percent <= 0) {
    return error('This ad has no discount', 400);
  }

  // Check if user already has a coupon for this ad
  const existing = await env.DB.prepare(`
    SELECT * FROM ad_coupons WHERE ad_id = ? AND user_id = ?
  `).bind(params.id, authUser.id).first();

  if (existing) {
    return json({ coupon: existing, message: 'Вы уже получили купон на эту акцию' });
  }

  // Generate unique coupon code
  let code: string;
  let attempts = 0;
  do {
    code = generateCouponCode();
    const exists = await env.DB.prepare('SELECT id FROM ad_coupons WHERE code = ?').bind(code).first();
    if (!exists) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    return error('Failed to generate unique code', 500);
  }

  const couponId = generateId();

  await env.DB.prepare(`
    INSERT INTO ad_coupons (id, ad_id, user_id, code, discount_percent, discount_value, expires_at, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(couponId, params.id, authUser.id, code, ad.discount_percent, ad.discount_percent || 0, ad.expires_at, getTenantId(request)).run();

  // Update ad stats
  await env.DB.prepare(`UPDATE ads SET coupons_issued = coupons_issued + 1 WHERE id = ?`).bind(params.id).run();

  const coupon = await env.DB.prepare('SELECT * FROM ad_coupons WHERE id = ?').bind(couponId).first();

  return json({
    coupon,
    message: `Ваш промокод: ${code}. Скидка ${ad.discount_percent}%`
  }, 201);
});

// Get user's coupons
route('GET', '/api/my-coupons', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT c.*, a.title as ad_title, a.phone as ad_phone, a.description as ad_description,
      a.logo_url, cat.name_ru as category_name
    FROM ad_coupons c
    JOIN ads a ON c.ad_id = a.id
    JOIN ad_categories cat ON a.category_id = cat.id
    WHERE c.user_id = ? ${tenantId ? 'AND c.tenant_id = ?' : ''}
    ORDER BY c.issued_at DESC
  `).bind(authUser.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ coupons: results });
});

// ==================== MAIN HANDLER ====================

// ==================== MONITORING & HEALTH ENDPOINTS ====================

// Health Check
route('GET', '/api/health', async (request, env) => {
  const health = await healthCheck(env);
  const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 503;
  return json(health, status);
});


// Tenant Config (returns current tenant's configuration)
route('GET', '/api/tenant/config', async (request, env) => {
  const tenant = getCurrentTenant();
  if (!tenant) {
    return json({ tenant: null, features: [] });
  }

  try {
    const features = JSON.parse(tenant.features || '[]');
    return json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        color: tenant.color,
        color_secondary: tenant.color_secondary,
        plan: tenant.plan,
        logo: tenant.logo || null,
        is_demo: tenant.is_demo === 1 || tenant.is_demo === true,
        show_useful_contacts_banner: tenant.show_useful_contacts_banner !== 0 ? 1 : 0,
        show_marketplace_banner: tenant.show_marketplace_banner !== 0 ? 1 : 0,
      },
      features
    });
  } catch (error) {
    console.error('Error parsing tenant features:', error);
    return json({ tenant: null, features: [] });
  }
});

// Metrics Dashboard (Admin only)
route('GET', '/api/admin/metrics', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const stats = metricsAggregator.getAggregatedStats();
  const cacheStats = getCacheStats();

  // Check thresholds and send alerts if needed
  AlertManager.checkThresholds(stats);

  return json({
    performance: stats,
    cache: cacheStats,
    health: await healthCheck(env),
  });
});

// Performance Metrics (detailed)
route('GET', '/api/admin/metrics/performance', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');

  const perfMetrics = endpoint
    ? metricsAggregator.getPerformanceMetrics(endpoint)
    : metricsAggregator.getPerformanceMetrics();

  return json({
    metrics: perfMetrics,
    aggregated: metricsAggregator.getAggregatedStats(),
  });
});

// Error Logs (Admin only)
route('GET', '/api/admin/metrics/errors', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  const errors = metricsAggregator.getErrors();

  return json({
    total: errors.length,
    errors: errors.slice(-50), // Last 50 errors
  });
});

// Clear metrics (Admin only)
route('POST', '/api/admin/metrics/clear', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  metricsAggregator.clear();

  return json({ message: 'Metrics cleared successfully' });
});

// Reset/Clear all requests (Admin only)
route('POST', '/api/admin/requests/reset', async (request, env) => {
  const authUser = await getUser(request, env);
  if (!authUser || authUser.role !== 'admin') {
    return error('Admin access required', 403);
  }

  try {
    // Delete request history first (FK constraint)
    await env.DB.prepare('DELETE FROM request_history').run();

    // Delete messages related to requests
    await env.DB.prepare('DELETE FROM messages').run();

    // Delete all requests
    await env.DB.prepare('DELETE FROM requests').run();

    // Reset request number sequence
    await env.DB.prepare(`
      UPDATE settings SET value = '0' WHERE key = 'last_request_number'
    `).run();

    // Invalidate caches
    await invalidateOnChange('requests', env.RATE_LIMITER);

    return json({ message: 'All requests have been deleted successfully' });
  } catch (err: any) {
    console.error('Error resetting requests:', err);
    return error('Failed to reset requests: ' + err.message, 500);
  }
});

// Frontend Error Reporting (Public - errors from React)
route('POST', '/api/admin/monitoring/frontend-error', async (request, env) => {
  try {
    const body = await request.json() as any;

    // Log frontend error
    console.error('🔴 Frontend Error:', {
      timestamp: body.timestamp,
      error: body.error?.message,
      url: body.url,
      userId: body.userId,
      userAgent: body.userAgent,
    });

    // Store in metrics aggregator
    metricsAggregator.logError({
      message: `[Frontend] ${body.error?.message || 'Unknown error'}`,
      endpoint: body.url || 'unknown',
      method: 'FRONTEND',
      timestamp: Date.now(),
      stack: body.error?.stack,
      userAgent: body.userAgent,
      userId: body.userId,
    });

    // Send to Cloudflare Analytics if available
    if (env.ENVIRONMENT === 'production') {
      logAnalyticsEvent(request, 'frontend_error', {
        error_name: body.error?.name || 'UnknownError',
        error_message: body.error?.message || 'Unknown error',
        url: body.url,
        userId: body.userId,
      });
    }

    return json({ message: 'Error logged successfully' });
  } catch (err) {
    console.error('Failed to log frontend error:', err);
    return error('Failed to log error', 500);
  }
});

// ==================== MARKETPLACE API ====================

// Marketplace: Get categories
route('GET', '/api/marketplace/categories', async (request, env) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT * FROM marketplace_categories WHERE is_active = 1 ${tenantId ? "AND (tenant_id = ? OR tenant_id IS NULL OR tenant_id = '')" : ''}
    ORDER BY sort_order
  `).bind(...(tenantId ? [tenantId] : [])).all();
  return json({ categories: results });
});

// Marketplace: Get products (with filtering)
route('GET', '/api/marketplace/products', async (request, env) => {
  const url = new URL(request.url);
  const categoryId = url.searchParams.get('category');
  const search = url.searchParams.get('search');
  const featured = url.searchParams.get('featured');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let whereClause = 'WHERE p.is_active = 1';
  const params: any[] = [];

  if (tenantId) {
    whereClause += ' AND p.tenant_id = ?';
    params.push(tenantId);
  }

  if (categoryId) {
    whereClause += ' AND p.category_id = ?';
    params.push(categoryId);
  }
  if (search) {
    whereClause += ' AND (p.name_ru LIKE ? OR p.name_uz LIKE ? OR p.description_ru LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (featured === 'true') {
    whereClause += ' AND p.is_featured = 1';
  }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_products p ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    ${whereClause}
    ORDER BY p.is_featured DESC, p.orders_count DESC, p.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  return json({
    products: results,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
});

// Marketplace: Get single product
route('GET', '/api/marketplace/products/:id', async (request, env, params) => {
  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const product = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.name_uz as category_name_uz, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.id = ? ${tenantId ? 'AND p.tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!product) return error('Product not found', 404);

  // Get reviews
  const { results: reviews } = await env.DB.prepare(`
    SELECT r.*, u.name as user_name
    FROM marketplace_reviews r
    LEFT JOIN users u ON r.user_id = u.id
    WHERE r.product_id = ? AND r.is_visible = 1 ${tenantId ? 'AND r.tenant_id = ?' : ''}
    ORDER BY r.created_at DESC
    LIMIT 10
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ product, reviews });
});

// Marketplace: Cart - Get
route('GET', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCart = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT c.*, p.name_ru, p.name_uz, p.price, p.old_price, p.image_url, p.stock_quantity, p.unit,
           cat.name_ru as category_name_ru, cat.icon as category_icon
    FROM marketplace_cart c
    JOIN marketplace_products p ON c.product_id = p.id
    LEFT JOIN marketplace_categories cat ON p.category_id = cat.id
    WHERE c.user_id = ? ${tenantIdCart ? 'AND p.tenant_id = ?' : ''}
    ORDER BY c.created_at DESC
  `).bind(user.id, ...(tenantIdCart ? [tenantIdCart] : [])).all();

  const total = (results as any[]).reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const itemsCount = (results as any[]).reduce((sum, item) => sum + item.quantity, 0);

  return json({ cart: results, total, itemsCount });
});

// Marketplace: Cart - Add/Update item
route('POST', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCart = getTenantId(request);
  const body = await request.json() as any;
  const { product_id, quantity = 1 } = body;

  if (!product_id || typeof quantity !== 'number' || quantity < 1) {
    return error('Invalid product or quantity');
  }

  // Check product exists and in stock (tenant-filtered)
  const product = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? AND is_active = 1 ${tenantIdCart ? 'AND tenant_id = ?' : ''}`).bind(product_id, ...(tenantIdCart ? [tenantIdCart] : [])).first() as any;
  if (!product) return error('Product not found', 404);

  // Get current quantity in cart (if any)
  const existingCartItem = await env.DB.prepare(`
    SELECT quantity FROM marketplace_cart WHERE user_id = ? AND product_id = ?
  `).bind(user.id, product_id).first() as any;

  // Calculate total reserved stock from ALL users' carts for this product (excluding current user's existing quantity)
  const reservedStock = await env.DB.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total FROM marketplace_cart
    WHERE product_id = ? AND user_id != ? ${tenantIdCart ? 'AND tenant_id = ?' : ''}
  `).bind(product_id, user.id, ...(tenantIdCart ? [tenantIdCart] : [])).first() as any;

  const otherUsersReserved = reservedStock?.total || 0;
  const availableStock = product.stock_quantity - otherUsersReserved;

  if (availableStock < quantity) {
    return error(`Недостаточно товара. Доступно: ${Math.max(0, availableStock)} шт.`, 400);
  }

  // Upsert cart item
  await env.DB.prepare(`
    INSERT INTO marketplace_cart (id, user_id, product_id, quantity, created_at, updated_at, tenant_id)
    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = ?, updated_at = datetime('now')
  `).bind(generateId(), user.id, product_id, quantity, tenantIdCart, quantity).run();

  return json({ success: true });
});

// Marketplace: Cart - Remove item
route('DELETE', '/api/marketplace/cart/:productId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCartDel = getTenantId(request);
  if (tenantIdCartDel) {
    // Only delete if product belongs to this tenant
    await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? AND product_id IN (SELECT id FROM marketplace_products WHERE id = ? AND tenant_id = ?)`).bind(user.id, params.productId, tenantIdCartDel).run();
  } else {
    await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
  }
  return json({ success: true });
});

// Marketplace: Cart - Clear
route('DELETE', '/api/marketplace/cart', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCartClear = getTenantId(request);
  await env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ? ${tenantIdCartClear ? 'AND tenant_id = ?' : ''}`).bind(user.id, ...(tenantIdCartClear ? [tenantIdCartClear] : [])).run();
  return json({ success: true });
});

// Marketplace: Create order
route('POST', '/api/marketplace/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  try {
    const body = await request.json() as any;
    const { delivery_date, delivery_time_slot, delivery_notes, payment_method } = body;

    const tenantIdOrder = getTenantId(request);
    console.log('[Marketplace Order] Creating order for user:', user.id, user.name);
    console.log('[Marketplace Order] Request body:', body);

    // Get cart items with current stock (tenant-filtered via products)
    const { results: cartItems } = await env.DB.prepare(`
      SELECT c.*, p.name_ru, p.price, p.image_url, p.stock_quantity
      FROM marketplace_cart c
      JOIN marketplace_products p ON c.product_id = p.id
      WHERE c.user_id = ? ${tenantIdOrder ? 'AND p.tenant_id = ?' : ''}
    `).bind(user.id, ...(tenantIdOrder ? [tenantIdOrder] : [])).all() as { results: any[] };

    console.log('[Marketplace Order] Cart items found:', cartItems?.length || 0);

    if (!cartItems || cartItems.length === 0) {
      console.log('[Marketplace Order] ERROR: Cart is empty');
      return error('Cart is empty', 400);
    }

    // Validate stock availability BEFORE creating order
    const outOfStockItems: string[] = [];
    for (const item of cartItems) {
      if (item.stock_quantity < item.quantity) {
        outOfStockItems.push(`${item.name_ru} (доступно: ${item.stock_quantity}, в корзине: ${item.quantity})`);
      }
    }
    if (outOfStockItems.length > 0) {
      console.log('[Marketplace Order] ERROR: Insufficient stock for items:', outOfStockItems);
      return error(`Недостаточно товара на складе: ${outOfStockItems.join(', ')}`, 400);
    }

    // Calculate totals
    const totalAmount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = totalAmount >= 100000 ? 0 : 15000; // Free delivery over 100k
    const finalAmount = totalAmount + deliveryFee;

    // Generate order number (MP-YYYYMMDD-XXXX)
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderCount = await env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE order_number LIKE ? ${tenantIdOrder ? 'AND tenant_id = ?' : ''}`).bind(`MP-${today}%`, ...(tenantIdOrder ? [tenantIdOrder] : [])).first() as any;
    const orderNumber = `MP-${today}-${String((orderCount?.count || 0) + 1).padStart(4, '0')}`;

    const orderId = generateId();

    // Use batch to ensure atomicity - all operations succeed or all fail
    const statements = [];

    // 1. Create order (MULTI-TENANCY: Add tenant_id)
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_orders (
        id, order_number, user_id, status, total_amount, delivery_fee, final_amount,
        delivery_address, delivery_apartment, delivery_entrance, delivery_floor, delivery_phone,
        delivery_date, delivery_time_slot, delivery_notes, payment_method, tenant_id
      ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      orderId, orderNumber, user.id, totalAmount, deliveryFee, finalAmount,
      user.address || '', user.apartment || '', user.entrance || '', user.floor || '', user.phone || '',
      delivery_date || null, delivery_time_slot || null, delivery_notes || null, payment_method || 'cash', getTenantId(request)
    ));

    // 2. Create order items and update stock atomically
    for (const item of cartItems) {
      // Insert order item
      statements.push(env.DB.prepare(`
        INSERT INTO marketplace_order_items (id, order_id, product_id, product_name, product_image, quantity, unit_price, total_price, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(generateId(), orderId, item.product_id, item.name_ru, item.image_url, item.quantity, item.price, item.price * item.quantity, getTenantId(request)));

      // Update stock with validation to prevent negative values
      statements.push(env.DB.prepare(`
        UPDATE marketplace_products
        SET orders_count = orders_count + 1,
            stock_quantity = CASE
              WHEN stock_quantity >= ? THEN stock_quantity - ?
              ELSE stock_quantity
            END
        WHERE id = ? AND stock_quantity >= ? ${tenantIdOrder ? 'AND tenant_id = ?' : ''}
      `).bind(item.quantity, item.quantity, item.product_id, item.quantity, ...(tenantIdOrder ? [tenantIdOrder] : [])));
    }

    // 3. Add order history
    statements.push(env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, 'new', 'Заказ создан', ?, ?)
    `).bind(generateId(), orderId, user.id, getTenantId(request)));

    // 4. Clear cart
    statements.push(env.DB.prepare(`DELETE FROM marketplace_cart WHERE user_id = ?`).bind(user.id));

    // Execute all statements as a batch (atomic transaction)
    await env.DB.batch(statements);

    // Create notification for managers (DB + push)
    const managers = await env.DB.prepare(`SELECT id FROM users WHERE role IN ('admin', 'director', 'manager', 'marketplace_manager') ${tenantIdOrder ? 'AND tenant_id = ?' : ''}`).bind(...(tenantIdOrder ? [tenantIdOrder] : [])).all() as { results: any[] };
    const orderNotifBody = `Заказ ${orderNumber} на сумму ${finalAmount.toLocaleString()} сум`;
    for (const manager of (managers.results || [])) {
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), manager.id, orderNotifBody, JSON.stringify({ order_id: orderId }), getTenantId(request)).run();
      sendPushNotification(env, manager.id, {
        title: '🛒 Новый заказ',
        body: orderNotifBody,
        type: 'marketplace_order',
        tag: `order-new-${orderId}`,
        data: { orderId, url: '/marketplace' },
        requireInteraction: true
      }).catch(() => {});
    }

    console.log('[Marketplace Order] Order created successfully:', orderNumber);
    return json({ order: { id: orderId, order_number: orderNumber, final_amount: finalAmount } }, 201);
  } catch (e: any) {
    console.error('[Marketplace Order] ERROR:', e.message, e.stack);
    return error(e.message || 'Failed to create order', 500);
  }
});

// Marketplace: Get user orders
route('GET', '/api/marketplace/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  let whereClause = 'WHERE o.user_id = ?';
  const params: any[] = [user.id];

  if (tenantId) {
    whereClause += ' AND o.tenant_id = ?';
    params.push(tenantId);
  }

  if (status) {
    whereClause += ' AND o.status = ?';
    params.push(status);
  }

  const { results } = await env.DB.prepare(`
    SELECT o.*,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    ${whereClause}
    ORDER BY o.created_at DESC
  `).bind(...params).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Marketplace: Get single order with items
route('GET', '/api/marketplace/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND (user_id = ? OR ? IN ('admin', 'director', 'manager', 'marketplace_manager'))
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, user.role, ...(tenantId ? [tenantId] : [])).first();

  if (!order) return error('Order not found', 404);

  const { results: items } = await env.DB.prepare(`
    SELECT * FROM marketplace_order_items WHERE order_id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  const { results: history } = await env.DB.prepare(`
    SELECT h.*, u.name as changed_by_name
    FROM marketplace_order_history h
    LEFT JOIN users u ON h.changed_by = u.id
    WHERE h.order_id = ? ${tenantId ? 'AND h.tenant_id = ?' : ''}
    ORDER BY h.created_at DESC
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ order, items, history });
});

// Marketplace: Get order items (for manager dashboard)
route('GET', '/api/marketplace/orders/:id/items', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdItems = getTenantId(request);

  // Allow marketplace managers and admins to view order items
  if (!['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    // For regular users, check if it's their order
    const order = await env.DB.prepare(`
      SELECT id FROM marketplace_orders WHERE id = ? AND user_id = ? ${tenantIdItems ? 'AND tenant_id = ?' : ''}
    `).bind(params.id, user.id, ...(tenantIdItems ? [tenantIdItems] : [])).first();

    if (!order) return error('Access denied', 403);
  } else if (tenantIdItems) {
    // For managers, verify the order belongs to this tenant
    const order = await env.DB.prepare(`SELECT id FROM marketplace_orders WHERE id = ? AND tenant_id = ?`).bind(params.id, tenantIdItems).first();
    if (!order) return error('Order not found', 404);
  }

  const { results: items } = await env.DB.prepare(`
    SELECT * FROM marketplace_order_items WHERE order_id = ?
  `).bind(params.id).all();

  return json({ items });
});

// Marketplace: Cancel order (by user)
route('POST', '/api/marketplace/orders/:id/cancel', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdCancel = getTenantId(request);
  const body = await request.json() as any;
  const order = await env.DB.prepare(`SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantIdCancel ? [tenantIdCancel] : [])).first() as any;

  if (!order) return error('Order not found', 404);
  if (!['new', 'confirmed'].includes(order.status)) {
    return error('Cannot cancel order in this status');
  }

  // Get order items to return stock
  const orderItems = await env.DB.prepare(`
    SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantIdCancel ? [tenantIdCancel] : [])).all() as { results: { product_id: string, quantity: number }[] };

  // Return stock for each item
  for (const item of (orderItems.results || [])) {
    await env.DB.prepare(`
      UPDATE marketplace_products
      SET stock_quantity = stock_quantity + ?
      WHERE id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}
    `).bind(item.quantity, item.product_id, ...(tenantIdCancel ? [tenantIdCancel] : [])).run();
  }

  await env.DB.prepare(`
    UPDATE marketplace_orders SET status = 'cancelled', cancelled_at = datetime('now'), cancellation_reason = ?, updated_at = datetime('now')
    WHERE id = ? ${tenantIdCancel ? 'AND tenant_id = ?' : ''}
  `).bind(body.reason || 'Отменено покупателем', params.id, ...(tenantIdCancel ? [tenantIdCancel] : [])).run();

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'cancelled', ?, ?, ?)
  `).bind(generateId(), params.id, body.reason || 'Отменено покупателем', user.id, tenantIdCancel).run();

  return json({ success: true });
});

// Marketplace: Rate order
route('POST', '/api/marketplace/orders/:id/rate', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const body = await request.json() as any;
  const { rating, review } = body;

  // Validate rating value
  if (typeof rating !== 'number' || rating < 1 || rating > 5) {
    return error('Рейтинг должен быть от 1 до 5', 400);
  }

  const tenantIdRate = getTenantId(request);
  const order = await env.DB.prepare(`SELECT * FROM marketplace_orders WHERE id = ? AND user_id = ? AND status = 'delivered' ${tenantIdRate ? 'AND tenant_id = ?' : ''}`).bind(params.id, user.id, ...(tenantIdRate ? [tenantIdRate] : [])).first() as any;
  if (!order) return error('Order not found or not delivered', 404);

  // Prevent double rating
  if (order.rating) {
    return error('Вы уже оценили этот заказ', 400);
  }

  await env.DB.prepare(`UPDATE marketplace_orders SET rating = ?, review = ? WHERE id = ? ${tenantIdRate ? 'AND tenant_id = ?' : ''}`).bind(rating, review || null, params.id, ...(tenantIdRate ? [tenantIdRate] : [])).run();
  return json({ success: true });
});

// Marketplace: Favorites - Get
route('GET', '/api/marketplace/favorites', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const tenantIdFav = getTenantId(request);
  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_favorites f
    JOIN marketplace_products p ON f.product_id = p.id
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE f.user_id = ? ${tenantIdFav ? 'AND p.tenant_id = ?' : ''}
    ORDER BY f.created_at DESC
  `).bind(user.id, ...(tenantIdFav ? [tenantIdFav] : [])).all();

  return json({ favorites: results });
});

// Marketplace: Favorites - Toggle
route('POST', '/api/marketplace/favorites/:productId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  // Verify product belongs to this tenant
  const tenantIdFavToggle = getTenantId(request);
  if (tenantIdFavToggle) {
    const product = await env.DB.prepare(`SELECT id FROM marketplace_products WHERE id = ? AND tenant_id = ?`).bind(params.productId, tenantIdFavToggle).first();
    if (!product) return error('Product not found', 404);
  }

  const existing = await env.DB.prepare(`SELECT id FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).first();

  if (existing) {
    await env.DB.prepare(`DELETE FROM marketplace_favorites WHERE user_id = ? AND product_id = ?`).bind(user.id, params.productId).run();
    return json({ favorited: false });
  } else {
    await env.DB.prepare(`INSERT INTO marketplace_favorites (id, user_id, product_id, tenant_id) VALUES (?, ?, ?, ?)`).bind(generateId(), user.id, params.productId, tenantIdFavToggle).run();
    return json({ favorited: true });
  }
});

// ==================== MARKETPLACE MANAGER API ====================

// Manager: Get all orders
route('GET', '/api/marketplace/admin/orders', async (request, env) => {
  const user = await getUser(request, env);
  const userRoleNorm = (user?.role || '').trim().toLowerCase();
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(userRoleNorm)) {
    console.error(`[403] GET /api/marketplace/admin/orders - user role: "${user?.role}", id: "${user?.id}"`);
    return error('Access denied', 403);
  }

  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  let whereClause = 'WHERE 1=1';
  const params: any[] = [];

  if (tenantId) {
    whereClause += ' AND o.tenant_id = ?';
    params.push(tenantId);
  }

  if (status) {
    whereClause += ' AND o.status = ?';
    params.push(status);
  }

  const countResult = await env.DB.prepare(`SELECT COUNT(*) as total FROM marketplace_orders o ${whereClause}`).bind(...params).first() as any;
  const total = countResult?.total || 0;

  params.push(limit, offset);
  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      e.name as executor_name, e.phone as executor_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    LEFT JOIN users e ON o.executor_id = e.id
    ${whereClause}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params).all();

  // Fetch items for each order to avoid N+1 on frontend
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

// Manager: Update order status or assign executor
route('PATCH', '/api/marketplace/admin/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantIdAdmOrd = getTenantId(request);
  const body = await request.json() as any;
  const { status, comment, executor_id } = body;

  // If assigning executor
  if (executor_id !== undefined) {
    // Update executor_id and also set status to confirmed
    await env.DB.prepare(`
      UPDATE marketplace_orders SET executor_id = ?, assigned_at = datetime('now'), status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
    `).bind(executor_id, params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).run();

    // Add status change to history
    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, 'confirmed', 'Назначен исполнитель', ?, ?)
    `).bind(generateId(), params.id, user.id, getTenantId(request)).run();

    // Notify executor about new order (DB + push)
    if (executor_id) {
      const order = await env.DB.prepare(`SELECT order_number, user_id FROM marketplace_orders WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).first() as any;
      const execOrderBody = `Вам назначен заказ ${order?.order_number || ''}`;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Новый заказ', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), executor_id, execOrderBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
      sendPushNotification(env, executor_id, {
        title: '🛒 Новый заказ назначен',
        body: execOrderBody,
        type: 'marketplace_order',
        tag: `order-assigned-${params.id}`,
        data: { orderId: params.id, url: '/' },
        requireInteraction: true
      }).catch(() => {});

      // Notify customer that order is confirmed (DB + push)
      if (order?.user_id) {
        const custConfirmBody = `Заказ ${order.order_number} подтверждён`;
        await env.DB.prepare(`
          INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
          VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
        `).bind(generateId(), order.user_id, custConfirmBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
        sendPushNotification(env, order.user_id, {
          title: '🛒 Заказ подтверждён',
          body: custConfirmBody,
          type: 'marketplace_order',
          tag: `order-status-${params.id}`,
          data: { orderId: params.id, url: '/' },
          requireInteraction: false
        }).catch(() => {});
      }
    }

    return json({ success: true });
  }

  // If updating status
  if (status) {
    const validStatuses = ['confirmed', 'preparing', 'ready', 'delivering', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return error('Invalid status');
    }

    // If cancelling order, return stock
    if (status === 'cancelled') {
      const currentOrder = await env.DB.prepare(`SELECT status FROM marketplace_orders WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).first() as any;
      // Only return stock if order wasn't already cancelled
      if (currentOrder && currentOrder.status !== 'cancelled') {
        const orderItems = await env.DB.prepare(`
          SELECT product_id, quantity FROM marketplace_order_items WHERE order_id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
        `).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).all() as { results: { product_id: string, quantity: number }[] };

        for (const item of (orderItems.results || [])) {
          await env.DB.prepare(`
            UPDATE marketplace_products
            SET stock_quantity = stock_quantity + ?
            WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
          `).bind(item.quantity, item.product_id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).run();
        }
      }
    }

    const statusField = status === 'cancelled' ? 'cancelled_at' :
                        status === 'confirmed' ? 'confirmed_at' :
                        status === 'preparing' ? 'preparing_at' :
                        status === 'ready' ? 'ready_at' :
                        status === 'delivering' ? 'delivering_at' :
                        status === 'delivered' ? 'delivered_at' : null;

    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).run();

    await env.DB.prepare(`
      INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(generateId(), params.id, status, comment || null, user.id, getTenantId(request)).run();

    // Notify user (DB + push)
    const order = await env.DB.prepare(`SELECT user_id, order_number FROM marketplace_orders WHERE id = ? ${tenantIdAdmOrd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdAdmOrd ? [tenantIdAdmOrd] : [])).first() as any;
    if (order) {
      const statusLabels: Record<string, string> = {
        confirmed: 'подтверждён',
        preparing: 'готовится',
        ready: 'готов к выдаче',
        delivering: 'доставляется',
        delivered: 'доставлен',
        cancelled: 'отменён'
      };
      const orderStatusBody = `Заказ ${order.order_number} ${statusLabels[status]}`;
      await env.DB.prepare(`
        INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
        VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
      `).bind(generateId(), order.user_id, orderStatusBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
      sendPushNotification(env, order.user_id, {
        title: status === 'cancelled' ? '❌ Заказ отменён' : '🛒 Статус заказа',
        body: orderStatusBody,
        type: 'marketplace_order',
        tag: `order-status-${params.id}`,
        data: { orderId: params.id, url: '/' },
        requireInteraction: status === 'delivered' || status === 'cancelled'
      }).catch(() => {});
    }
  }

  return json({ success: true });
});

// Executor: Get my marketplace orders
route('GET', '/api/marketplace/executor/orders', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status NOT IN ('delivered', 'cancelled')
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY
      CASE o.status
        WHEN 'confirmed' THEN 1
        WHEN 'preparing' THEN 2
        WHEN 'ready' THEN 3
        WHEN 'delivering' THEN 4
        ELSE 5
      END,
      o.created_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Executor (courier): Get delivered marketplace orders
route('GET', '/api/marketplace/executor/delivered', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // Only couriers have delivered orders
  if (user.specialization !== 'courier') {
    return json({ orders: [] });
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id = ? AND o.status = 'delivered'
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY o.delivered_at DESC, o.updated_at DESC
  `).bind(user.id, ...(tenantId ? [tenantId] : [])).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Executor (courier): Get available marketplace orders to take
route('GET', '/api/marketplace/executor/available', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // Only couriers can take marketplace orders
  if (user.specialization !== 'courier') {
    return json({ orders: [] });
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT o.*, u.name as user_name, u.phone as user_phone,
      (SELECT COUNT(*) FROM marketplace_order_items WHERE order_id = o.id) as items_count
    FROM marketplace_orders o
    LEFT JOIN users u ON o.user_id = u.id
    WHERE o.executor_id IS NULL AND o.status = 'new'
    ${tenantId ? 'AND o.tenant_id = ?' : ''}
    ORDER BY o.created_at ASC
  `).bind(...(tenantId ? [tenantId] : [])).all();

  // Fetch items for each order
  const ordersWithItems = await Promise.all((results || []).map(async (order: any) => {
    const { results: items } = await env.DB.prepare(`
      SELECT id, product_id, product_name, product_image, quantity, unit_price, total_price
      FROM marketplace_order_items WHERE order_id = ?
    `).bind(order.id).all();
    return { ...order, items: items || [] };
  }));

  return json({ orders: ordersWithItems });
});

// Executor (courier): Take a marketplace order
route('POST', '/api/marketplace/executor/orders/:id/take', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // Only couriers can take marketplace orders
  if (user.specialization !== 'courier') {
    return error('Only couriers can take marketplace orders', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Check if order exists and is available
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id IS NULL AND status = 'new'
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) {
    return error('Order not available or already taken', 404);
  }

  // Assign order to this courier and set status to confirmed
  await env.DB.prepare(`
    UPDATE marketplace_orders
    SET executor_id = ?, assigned_at = datetime('now'), status = 'confirmed', confirmed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(user.id, params.id, ...(tenantId ? [tenantId] : [])).run();

  // Add to history
  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, 'confirmed', 'Курьер взял заказ', ?, ?)
  `).bind(generateId(), params.id, user.id, tenantId).run();

  // Notify customer (DB + push)
  const execTakeBody = `Заказ ${order.order_number} подтверждён`;
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
  `).bind(generateId(), order.user_id, execTakeBody, JSON.stringify({ order_id: params.id }), tenantId).run();
  sendPushNotification(env, order.user_id, {
    title: '🛒 Заказ подтверждён',
    body: execTakeBody,
    type: 'marketplace_order',
    tag: `order-status-${params.id}`,
    data: { orderId: params.id, url: '/' },
    requireInteraction: false
  }).catch(() => {});

  return json({ success: true });
});

// Executor: Update order status (accept, prepare, deliver)
route('PATCH', '/api/marketplace/executor/orders/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !isExecutorRole(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  // Verify this order is assigned to this executor
  const order = await env.DB.prepare(`
    SELECT * FROM marketplace_orders WHERE id = ? AND executor_id = ?
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, user.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!order) {
    return error('Order not found or not assigned to you', 404);
  }

  const body = await request.json() as any;
  const { status, comment } = body;

  // Executor can only move to certain statuses
  // Flow: confirmed -> preparing -> ready -> delivering -> delivered
  const allowedTransitions: Record<string, string[]> = {
    'confirmed': ['preparing'],
    'preparing': ['ready'],
    'ready': ['delivering'],
    'delivering': ['delivered']
  };

  const allowed = allowedTransitions[order.status];
  if (!allowed || !allowed.includes(status)) {
    return error(`Cannot change status from ${order.status} to ${status}`);
  }

  const statusField = status === 'preparing' ? 'preparing_at' :
                      status === 'ready' ? 'ready_at' :
                      status === 'delivering' ? 'delivering_at' :
                      status === 'delivered' ? 'delivered_at' : null;

  if (statusField) {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, ${statusField} = datetime('now'), updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();
  } else {
    await env.DB.prepare(`
      UPDATE marketplace_orders SET status = ?, updated_at = datetime('now')
      WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
    `).bind(status, params.id, ...(tenantId ? [tenantId] : [])).run();
  }

  await env.DB.prepare(`
    INSERT INTO marketplace_order_history (id, order_id, status, comment, changed_by, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(generateId(), params.id, status, comment || null, user.id, getTenantId(request)).run();

  // Notify customer (DB + push)
  const statusLabels: Record<string, string> = {
    preparing: 'готовится',
    ready: 'готов к выдаче',
    delivering: 'доставляется',
    delivered: 'доставлен'
  };
  const execStatusBody = `Заказ ${order.order_number} ${statusLabels[status]}`;
  await env.DB.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, data, is_read, created_at, tenant_id)
    VALUES (?, ?, 'marketplace_order', 'Статус заказа', ?, ?, 0, datetime('now'), ?)
  `).bind(generateId(), order.user_id, execStatusBody, JSON.stringify({ order_id: params.id }), getTenantId(request)).run();
  sendPushNotification(env, order.user_id, {
    title: status === 'delivered' ? '✅ Заказ доставлен' : '🛒 Статус заказа',
    body: execStatusBody,
    type: 'marketplace_order',
    tag: `order-status-${params.id}`,
    data: { orderId: params.id, url: '/' },
    requireInteraction: status === 'delivered'
  }).catch(() => {});

  return json({ success: true });
});

// Manager: Dashboard stats
route('GET', '/api/marketplace/admin/dashboard', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const today = new Date().toISOString().slice(0, 10);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const tFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tBind = tenantId ? [tenantId] : [];

  const [newOrders, preparingOrders, deliveringOrders, todayOrders, todayRevenue, totalProducts] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'new'${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status IN ('confirmed', 'preparing', 'ready')${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE status = 'delivering'${tFilter}`).bind(...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_orders WHERE date(created_at) = ?${tFilter}`).bind(today, ...tBind).first(),
    env.DB.prepare(`SELECT COALESCE(SUM(final_amount), 0) as total FROM marketplace_orders WHERE date(created_at) = ? AND status != 'cancelled'${tFilter}`).bind(today, ...tBind).first(),
    env.DB.prepare(`SELECT COUNT(*) as count FROM marketplace_products WHERE is_active = 1${tFilter}`).bind(...tBind).first()
  ]);

  return json({
    stats: {
      new_orders: (newOrders as any)?.count || 0,
      preparing_orders: (preparingOrders as any)?.count || 0,
      delivering_orders: (deliveringOrders as any)?.count || 0,
      today_orders: (todayOrders as any)?.count || 0,
      today_revenue: (todayRevenue as any)?.total || 0,
      total_products: (totalProducts as any)?.count || 0
    }
  });
});

// Manager: Marketplace Reports (for Director)
route('GET', '/api/marketplace/admin/reports', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const url = new URL(request.url);
  const startDate = url.searchParams.get('start_date') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const endDate = url.searchParams.get('end_date') || new Date().toISOString().slice(0, 10);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  const tFilter = tenantId ? ' AND tenant_id = ?' : '';
  const tFilterO = tenantId ? ' AND o.tenant_id = ?' : '';
  const tBind = tenantId ? [tenantId] : [];

  try {
    // Overall stats for period
    const overallStats = await env.DB.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN delivery_fee ELSE 0 END), 0) as total_delivery_fees,
        COALESCE(AVG(CASE WHEN rating IS NOT NULL THEN rating END), 0) as avg_rating,
        COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as rated_orders
      FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter}
    `).bind(startDate, endDate, ...tBind).first() as any;

    // Top selling products
    const topProducts = await env.DB.prepare(`
      SELECT
        oi.product_id,
        oi.product_name,
        p.image_url,
        SUM(oi.quantity) as total_sold,
        SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON oi.order_id = o.id
      LEFT JOIN marketplace_products p ON oi.product_id = p.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY oi.product_id, oi.product_name
      ORDER BY total_revenue DESC
      LIMIT 20
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Sales by category
    const categoryStats = await env.DB.prepare(`
      SELECT
        COALESCE(c.name_ru, 'Без категории') as category_name,
        SUM(oi.quantity) as total_sold,
        SUM(oi.total_price) as total_revenue,
        COUNT(DISTINCT oi.order_id) as order_count
      FROM marketplace_order_items oi
      JOIN marketplace_orders o ON oi.order_id = o.id
      LEFT JOIN marketplace_products p ON oi.product_id = p.id
      LEFT JOIN marketplace_categories c ON p.category_id = c.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY c.id, c.name_ru
      ORDER BY total_revenue DESC
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Daily sales (for chart)
    const dailySales = await env.DB.prepare(`
      SELECT
        date(created_at) as date,
        COUNT(*) as orders,
        SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END) as revenue
      FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter}
      GROUP BY date(created_at)
      ORDER BY date(created_at)
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Orders by status
    const ordersByStatus = await env.DB.prepare(`
      SELECT
        status,
        COUNT(*) as count
      FROM marketplace_orders
      WHERE date(created_at) BETWEEN ? AND ?${tFilter}
      GROUP BY status
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Top customers
    const topCustomers = await env.DB.prepare(`
      SELECT
        u.id as user_id,
        u.name as user_name,
        u.phone as user_phone,
        COUNT(o.id) as order_count,
        SUM(o.final_amount) as total_spent
      FROM marketplace_orders o
      JOIN users u ON o.user_id = u.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY u.id, u.name, u.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    // Executor performance (couriers)
    const executorStats = await env.DB.prepare(`
      SELECT
        u.id as executor_id,
        u.name as executor_name,
        COUNT(o.id) as delivered_count,
        COALESCE(AVG(o.rating), 0) as avg_rating
      FROM marketplace_orders o
      JOIN users u ON o.executor_id = u.id
      WHERE o.status = 'delivered' AND date(o.created_at) BETWEEN ? AND ?${tFilterO}
      GROUP BY u.id, u.name
      ORDER BY delivered_count DESC
    `).bind(startDate, endDate, ...tBind).all() as { results: any[] };

    return json({
      period: { start_date: startDate, end_date: endDate },
      overall: overallStats,
      top_products: topProducts.results || [],
      categories: categoryStats.results || [],
      daily_sales: dailySales.results || [],
      orders_by_status: ordersByStatus.results || [],
      top_customers: topCustomers.results || [],
      executor_stats: executorStats.results || [],
    });
  } catch (err: any) {
    console.error('Marketplace reports error:', err);
    return error('Failed to generate report', 500);
  }
});

// Manager: Products CRUD
route('GET', '/api/marketplace/admin/products', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const { results } = await env.DB.prepare(`
    SELECT p.*, c.name_ru as category_name_ru, c.icon as category_icon
    FROM marketplace_products p
    LEFT JOIN marketplace_categories c ON p.category_id = c.id
    WHERE p.is_active = 1 ${tenantId ? 'AND p.tenant_id = ?' : ''}
    ORDER BY p.created_at DESC
  `).bind(...(tenantId ? [tenantId] : [])).all();

  return json({ products: results });
});

route('POST', '/api/marketplace/admin/products', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  // MULTI-TENANCY: Add tenant_id on creation
  await env.DB.prepare(`
    INSERT INTO marketplace_products (
      id, category_id, name_ru, name_uz, description_ru, description_uz,
      price, old_price, unit, stock_quantity, min_order_quantity, max_order_quantity,
      weight, weight_unit, image_url, images, is_active, is_featured, created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.category_id, body.name_ru, body.name_uz || body.name_ru,
    body.description_ru || null, body.description_uz || null,
    body.price, body.old_price || null, body.unit || 'шт',
    body.stock_quantity || 0, body.min_order_quantity || 1, body.max_order_quantity || null,
    body.weight || null, body.weight_unit || 'кг',
    body.image_url || null, body.images ? JSON.stringify(body.images) : null,
    body.is_active !== false ? 1 : 0, body.is_featured ? 1 : 0, user.id, getTenantId(request)
  ).run();

  const tenantIdProd = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? ${tenantIdProd ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantIdProd ? [tenantIdProd] : [])).first();
  return json({ product: created }, 201);
});

route('PATCH', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  // Note: is_active is intentionally excluded to prevent accidental deactivation during edits
  // Use DELETE endpoint to deactivate products
  const fields = ['category_id', 'name_ru', 'name_uz', 'description_ru', 'description_uz', 'price', 'old_price', 'unit', 'stock_quantity', 'min_order_quantity', 'max_order_quantity', 'weight', 'weight_unit', 'image_url', 'is_featured'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_featured' ? (body[field] ? 1 : 0) : body[field]);
    }
  }
  if (body.images) {
    updates.push('images = ?');
    values.push(JSON.stringify(body.images));
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  if (updates.length > 0) {
    updates.push('updated_at = datetime("now")');
    values.push(params.id);
    if (tenantId) values.push(tenantId);
    await env.DB.prepare(`UPDATE marketplace_products SET ${updates.join(', ')} WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM marketplace_products WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).first();
  return json({ product: updated });
});

route('DELETE', '/api/marketplace/admin/products/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);
  await env.DB.prepare(`UPDATE marketplace_products SET is_active = 0 WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantId ? [tenantId] : [])).run();
  return json({ success: true });
});

// Upload image for product (base64)
route('POST', '/api/marketplace/admin/upload-image', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  try {
    const contentType = request.headers.get('Content-Type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('image') as File;

      if (!file) {
        return error('No image file provided', 400);
      }

      // Sanitize filename - remove path traversal and dangerous characters
      const originalName = file.name || 'image';
      const sanitizedName = originalName
        .replace(/\.\./g, '') // Remove path traversal
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // Remove dangerous characters
        .replace(/^\.+/, ''); // Remove leading dots

      // Validate file type by both MIME type and extension
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const fileExtension = sanitizedName.toLowerCase().match(/\.[^.]+$/)?.[0] || '';

      if (!allowedTypes.includes(file.type)) {
        return error('Invalid file type. Allowed: JPEG, PNG, GIF, WEBP', 400);
      }

      // If there's an extension, validate it matches the MIME type
      if (fileExtension && !allowedExtensions.includes(fileExtension)) {
        return error('Invalid file extension. Allowed: .jpg, .jpeg, .png, .gif, .webp', 400);
      }

      // Max 5MB
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        return error('File too large. Maximum size: 5MB', 400);
      }

      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
      const dataUrl = `data:${file.type};base64,${base64}`;

      return json({ image_url: dataUrl });
    } else {
      return error('Content-Type must be multipart/form-data', 400);
    }
  } catch (err) {
    console.error('Image upload error:', err);
    return error('Failed to upload image', 500);
  }
});

// Manager: Categories CRUD
route('POST', '/api/marketplace/admin/categories', async (request, env) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const body = await request.json() as any;
  const id = generateId();

  await env.DB.prepare(`
    INSERT INTO marketplace_categories (id, name_ru, name_uz, icon, parent_id, sort_order, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.name_ru, body.name_uz || body.name_ru, body.icon || '📦', body.parent_id || null, body.sort_order || 99, getTenantId(request)).run();

  const tenantIdCat = getTenantId(request);
  const created = await env.DB.prepare(`SELECT * FROM marketplace_categories WHERE id = ? ${tenantIdCat ? 'AND tenant_id = ?' : ''}`).bind(id, ...(tenantIdCat ? [tenantIdCat] : [])).first();
  return json({ category: created }, 201);
});

route('PATCH', '/api/marketplace/admin/categories/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user || !['admin', 'director', 'manager', 'marketplace_manager'].includes(user.role)) {
    return error('Access denied', 403);
  }

  const tenantIdCatUpd = getTenantId(request);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  const fields = ['name_ru', 'name_uz', 'icon', 'parent_id', 'sort_order', 'is_active'];
  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }

  if (updates.length > 0) {
    values.push(params.id);
    if (tenantIdCatUpd) values.push(tenantIdCatUpd);
    await env.DB.prepare(`UPDATE marketplace_categories SET ${updates.join(', ')} WHERE id = ? ${tenantIdCatUpd ? 'AND tenant_id = ?' : ''}`).bind(...values).run();
  }

  const updated = await env.DB.prepare(`SELECT * FROM marketplace_categories WHERE id = ? ${tenantIdCatUpd ? 'AND tenant_id = ?' : ''}`).bind(params.id, ...(tenantIdCatUpd ? [tenantIdCatUpd] : [])).first();
  return json({ category: updated });
});

// ==================== SUPER ADMIN BANNERS ====================

// GET /api/super-admin/banners - list all banners
route('GET', '/api/super-admin/banners', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  const { results } = await env.DB.prepare('SELECT * FROM super_banners ORDER BY sort_order, created_at DESC').all();
  return json({ banners: results });
});

// GET /api/banners?placement=marketplace - public, get active banners for a placement
route('GET', '/api/banners', async (request, env) => {
  const url = new URL(request.url);
  const placement = url.searchParams.get('placement') || 'marketplace';
  const { results } = await env.DB.prepare('SELECT * FROM super_banners WHERE is_active = 1 AND placement = ? ORDER BY sort_order, created_at DESC').bind(placement).all();
  return json({ banners: results });
});

// POST /api/super-admin/banners - create banner
route('POST', '/api/super-admin/banners', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  const body = await request.json() as any;
  const id = generateId();
  await env.DB.prepare(`
    INSERT INTO super_banners (id, title, description, image_url, link_url, placement, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, body.title, body.description || null, body.image_url || null, body.link_url || null, body.placement || 'marketplace', body.is_active !== false ? 1 : 0, body.sort_order || 0).run();
  const banner = await env.DB.prepare('SELECT * FROM super_banners WHERE id = ?').bind(id).first();
  return json({ banner }, 201);
});

// PATCH /api/super-admin/banners/:id - update banner
route('PATCH', '/api/super-admin/banners/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];
  for (const [key, dbField] of Object.entries({ title: 'title', description: 'description', image_url: 'image_url', link_url: 'link_url', placement: 'placement', is_active: 'is_active', sort_order: 'sort_order' })) {
    if (body[key] !== undefined) {
      updates.push(`${dbField} = ?`);
      values.push(typeof body[key] === 'boolean' ? (body[key] ? 1 : 0) : body[key]);
    }
  }
  if (updates.length === 0) return json({ success: true });
  updates.push("updated_at = datetime('now')");
  values.push(params.id);
  await env.DB.prepare(`UPDATE super_banners SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  const banner = await env.DB.prepare('SELECT * FROM super_banners WHERE id = ?').bind(params.id).first();
  return json({ banner });
});

// DELETE /api/super-admin/banners/:id
route('DELETE', '/api/super-admin/banners/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);
  await env.DB.prepare('DELETE FROM super_banners WHERE id = ?').bind(params.id).run();
  return json({ success: true });
});

// ==================== SUPER ADMIN ADS MANAGEMENT ====================

// GET /api/super-admin/ads - list all ads across all tenants
route('GET', '/api/super-admin/ads', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT a.*, c.name_ru as category_name, c.icon as category_icon,
      t.name as tenant_name, t.slug as tenant_slug,
      u.name as creator_name,
      (SELECT COUNT(*) FROM ad_tenant_assignments ata WHERE ata.ad_id = a.id) as assigned_tenants_count,
      (SELECT GROUP_CONCAT(t2.name, ', ') FROM ad_tenant_assignments ata2
        JOIN tenants t2 ON ata2.tenant_id = t2.id WHERE ata2.ad_id = a.id) as assigned_tenant_names
    FROM ads a
    LEFT JOIN ad_categories c ON a.category_id = c.id
    LEFT JOIN tenants t ON a.tenant_id = t.id
    LEFT JOIN users u ON a.created_by = u.id
    ORDER BY a.created_at DESC
  `).all();

  return json({ ads: results || [] });
});

// POST /api/super-admin/ads - create ONE platform ad and assign to selected tenants
route('POST', '/api/super-admin/ads', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  if (!body.category_id || !body.title || !body.phone) {
    return error('category_id, title, and phone are required', 400);
  }

  const targetTenantIds: string[] = body.target_tenant_ids || [];
  if (targetTenantIds.length === 0) {
    return error('Select at least one УК', 400);
  }

  const now = new Date();
  const startsAt = body.starts_at || now.toISOString();
  let expiresAt = body.expires_at;
  if (!expiresAt) {
    const expDate = new Date(startsAt);
    switch (body.duration_type) {
      case 'week': expDate.setDate(expDate.getDate() + 7); break;
      case '2weeks': expDate.setDate(expDate.getDate() + 14); break;
      case '3months': expDate.setMonth(expDate.getMonth() + 3); break;
      case '6months': expDate.setMonth(expDate.getMonth() + 6); break;
      case 'year': expDate.setFullYear(expDate.getFullYear() + 1); break;
      default: expDate.setMonth(expDate.getMonth() + 1);
    }
    expiresAt = expDate.toISOString();
  }

  // Create ONE platform ad (tenant_id = NULL means it belongs to the platform)
  const adId = generateId();
  await env.DB.prepare(`
    INSERT INTO ads (
      id, category_id, title, description, phone, phone2, telegram, instagram, facebook, website,
      address, work_hours, work_days, logo_url, photos, discount_percent, badges,
      target_type, target_branches, target_buildings, starts_at, expires_at, duration_type, status, created_by, tenant_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).bind(
    adId, body.category_id, body.title, body.description || null,
    body.phone, body.phone2 || null, body.telegram || null, body.instagram || null,
    body.facebook || null, body.website || null, body.address || null,
    body.work_hours || null, body.work_days || null, body.logo_url || null,
    body.photos ? JSON.stringify(body.photos) : null,
    body.discount_percent || 0, body.badges ? JSON.stringify(body.badges) : null,
    body.target_type || 'all',
    body.target_branches ? JSON.stringify(body.target_branches) : '[]',
    body.target_buildings ? JSON.stringify(body.target_buildings) : '[]',
    startsAt, expiresAt, body.duration_type || 'month',
    body.status || 'active', user.id
  ).run();

  // Create assignment records (one per tenant, enabled by default)
  for (const tenantId of targetTenantIds) {
    const assignId = generateId();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO ad_tenant_assignments (id, ad_id, tenant_id, enabled)
      VALUES (?, ?, ?, 1)
    `).bind(assignId, adId, tenantId).run();
  }

  return json({ created: 1, id: adId, assigned_tenants: targetTenantIds.length }, 201);
});

// GET /api/super-admin/ads/:id/tenants - list tenant assignments for a platform ad
route('GET', '/api/super-admin/ads/:id/tenants', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results: assignments } = await env.DB.prepare(`
    SELECT ata.tenant_id, ata.enabled, ata.assigned_at,
      t.name as tenant_name, t.slug as tenant_slug, t.color, t.color_secondary
    FROM ad_tenant_assignments ata
    JOIN tenants t ON ata.tenant_id = t.id
    WHERE ata.ad_id = ?
    ORDER BY t.name
  `).bind(params.id).all();

  const { results: allTenants } = await env.DB.prepare(`
    SELECT id, name, slug, color, color_secondary FROM tenants ORDER BY name
  `).all();

  return json({ assignments: assignments || [], all_tenants: allTenants || [] });
});

// POST /api/super-admin/ads/:id/assign-tenants - replace tenant assignments
route('POST', '/api/super-admin/ads/:id/assign-tenants', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const tenantIds: string[] = body.tenant_ids || [];

  // Remove tenants not in new list
  if (tenantIds.length > 0) {
    const placeholders = tenantIds.map(() => '?').join(',');
    await env.DB.prepare(
      `DELETE FROM ad_tenant_assignments WHERE ad_id = ? AND tenant_id NOT IN (${placeholders})`
    ).bind(params.id, ...tenantIds).run();
  } else {
    await env.DB.prepare(`DELETE FROM ad_tenant_assignments WHERE ad_id = ?`).bind(params.id).run();
  }

  // Insert new assignments (preserve existing enabled state via INSERT OR IGNORE)
  for (const tenantId of tenantIds) {
    const assignId = generateId();
    await env.DB.prepare(`
      INSERT OR IGNORE INTO ad_tenant_assignments (id, ad_id, tenant_id, enabled)
      VALUES (?, ?, ?, 1)
    `).bind(assignId, params.id, tenantId).run();
  }

  return json({ success: true, assigned: tenantIds.length });
});

// PATCH /api/super-admin/ads/:id/tenants/:tenantId - toggle enabled for a specific tenant
// Callable by: super_admin (any tenant) OR admin/manager/director of that tenant
route('PATCH', '/api/super-admin/ads/:id/tenants/:tenantId', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);

  const isSA = isSuperAdmin(user);
  const isOwnTenant = ['admin', 'manager', 'director'].includes(user.role) &&
    (user as any).tenant_id === params.tenantId;

  if (!isSA && !isOwnTenant) return error('Access denied', 403);

  const body = await request.json() as any;
  const enabled = body.enabled ? 1 : 0;

  await env.DB.prepare(`
    UPDATE ad_tenant_assignments SET enabled = ? WHERE ad_id = ? AND tenant_id = ?
  `).bind(enabled, params.id, params.tenantId).run();

  return json({ success: true, enabled });
});

// DELETE /api/super-admin/ads/:id - delete ad
route('DELETE', '/api/super-admin/ads/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  await env.DB.prepare(`DELETE FROM ads WHERE id = ?`).bind(params.id).run();
  return json({ success: true });
});

// PATCH /api/super-admin/ads/:id/status - toggle ad status
route('PATCH', '/api/super-admin/ads/:id/status', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  await env.DB.prepare(`UPDATE ads SET status = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(body.status, params.id).run();

  return json({ success: true });
});

// GET /api/super-admin/ads/:id/views - who viewed this ad
route('GET', '/api/super-admin/ads/:id/views', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT v.id, v.created_at as viewed_at, u.name as user_name, u.phone as user_phone,
      u.apartment_number, u.role
    FROM ad_views v
    JOIN users u ON v.user_id = u.id
    WHERE v.ad_id = ?
    ORDER BY v.created_at DESC
    LIMIT 200
  `).bind(params.id).all();

  return json({ views: results || [] });
});

// GET /api/super-admin/ads/:id/coupons - coupons for this ad
route('GET', '/api/super-admin/ads/:id/coupons', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const { results } = await env.DB.prepare(`
    SELECT c.*, u.name as user_name, u.phone as user_phone,
      checker.name as activated_by_name
    FROM ad_coupons c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN users checker ON c.activated_by = checker.id
    WHERE c.ad_id = ?
    ORDER BY c.issued_at DESC
    LIMIT 200
  `).bind(params.id).all();

  return json({ coupons: results || [] });
});

// ==================== TENANTS API (SUPER ADMIN ONLY) ====================
// Helper to check super_admin role
function isExecutorRole(role: string): boolean {
  return role === 'executor' || role === 'security';
}

function isSuperAdmin(user: any): boolean {
  return user?.role === 'super_admin';
}

// GET /api/tenants - list all tenants
route('GET', '/api/tenants', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const result = await env.DB.prepare(`SELECT * FROM tenants ORDER BY created_at DESC`).all();
  return json({ tenants: result.results || [] });
});

// POST /api/tenants - create tenant
route('POST', '/api/tenants', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  if (!body.name || !body.slug || !body.url) {
    return error('name, slug, and url are required');
  }

  // Check slug uniqueness
  const existing = await env.DB.prepare(`SELECT id FROM tenants WHERE slug = ?`).bind(body.slug).first();
  if (existing) return error('Tenant with this slug already exists');

  const id = generateId();
  const features = body.features ? JSON.stringify(body.features) : '["requests","votes","qr","rentals","notepad","reports"]';

  await env.DB.prepare(`
    INSERT INTO tenants (id, name, slug, url, admin_url, color, color_secondary, plan, features, admin_email, admin_phone, logo, contract_template)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, body.name, body.slug, body.url, body.admin_url || null,
    body.color || '#6366f1', body.color_secondary || '#a855f7',
    body.plan || 'basic', features,
    body.admin_email || null, body.admin_phone || null,
    body.logo || null, body.contract_template || null
  ).run();

  // Create initial director user for the tenant
  let directorCreated = false;
  if (body.director_login && body.director_password && body.director_name) {
    const directorId = generateId();
    const passwordHash = await hashPassword(body.director_password);
    const directorPasswordPlain = await encryptPassword(body.director_password, env.ENCRYPTION_KEY);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, password_plain, name, role, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'director', 1, ?, datetime('now'), datetime('now'))
    `).bind(directorId, body.director_login, passwordHash, directorPasswordPlain, body.director_name, id).run();
    directorCreated = true;
  }

  // Create initial admin user for the tenant
  let adminCreated = false;
  if (body.admin_login && body.admin_password && body.admin_name) {
    const adminId = generateId();
    const adminPasswordHash = await hashPassword(body.admin_password);
    const adminPasswordPlain = await encryptPassword(body.admin_password, env.ENCRYPTION_KEY);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, password_plain, name, role, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'admin', 1, ?, datetime('now'), datetime('now'))
    `).bind(adminId, body.admin_login, adminPasswordHash, adminPasswordPlain, body.admin_name, id).run();
    adminCreated = true;
  }

  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(id).first();
  return json({ tenant, directorCreated, adminCreated }, 201);
});

// PATCH /api/tenants/:id - update tenant
route('PATCH', '/api/tenants/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const existing = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(params.id).first();
  if (!existing) return error('Tenant not found', 404);

  const body = await request.json() as any;

  // Check slug uniqueness if changing slug
  if (body.slug && body.slug !== (existing as any).slug) {
    const slugTaken = await env.DB.prepare(`SELECT id FROM tenants WHERE slug = ? AND id != ?`).bind(body.slug, params.id).first();
    if (slugTaken) return error('Tenant with this slug already exists');
    // Auto-update url and admin_url when slug changes
    const baseDomain = env.BASE_DOMAIN || 'kamizo.uz';
    if (!body.url) body.url = `https://${body.slug}.${baseDomain}`;
    if (!body.admin_url) body.admin_url = `https://${body.slug}.${baseDomain}/admin`;
  }

  const fields = ['name', 'slug', 'url', 'admin_url', 'color', 'color_secondary', 'plan', 'admin_email', 'admin_phone', 'users_count', 'requests_count', 'votes_count', 'qr_count', 'revenue', 'is_active', 'logo', 'contract_template'];
  const updates: string[] = [];
  const values: any[] = [];

  for (const field of fields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'is_active' ? (body[field] ? 1 : 0) : body[field]);
    }
  }

  if (body.features !== undefined) {
    updates.push('features = ?');
    values.push(JSON.stringify(body.features));
  }

  if (updates.length > 0) {
    updates.push("updated_at = datetime('now')");
    values.push(params.id);
    await env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  }

  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(params.id).first();
  return json({ tenant });
});

// DELETE /api/tenants/:id - delete tenant
route('DELETE', '/api/tenants/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const existing = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(params.id).first();
  if (!existing) return error('Tenant not found', 404);

  await env.DB.prepare(`DELETE FROM tenants WHERE id = ?`).bind(params.id).run();
  return json({ success: true });
});

// GET /api/super-admin/tenants/:id/details - detailed tenant data for super admin
route('GET', '/api/super-admin/tenants/:id/details', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const tenantId = params.id;
  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(tenantId).first();
  if (!tenant) return error('Tenant not found', 404);

  try {
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab') || 'stats';

    // Safe count query helper - returns 0 if table/column doesn't exist
    const safeCount = async (sql: string, binds: any[]) => {
      try {
        const result = await env.DB.prepare(sql).bind(...binds).first();
        return Number((result as any)?.cnt || 0);
      } catch (e) {
        console.error('safeCount failed:', sql, e);
        return 0;
      }
    };

    // Always return stats (each query is individually safe)
    const [residents, requests, votes, qr_codes, buildings, staff] = await Promise.all([
      safeCount(`SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND role = 'resident'`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM requests WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM meetings WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM guest_access_codes WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM buildings WHERE tenant_id = ?`, [tenantId]),
      safeCount(`SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ? AND role NOT IN ('resident', 'director')`, [tenantId]),
    ]);

    const stats = { residents, requests, votes, qr_codes, buildings, staff };

    let tabData: any = [];

    // Safe query helper - returns empty array on failure
    const safeQuery = async (sql: string, binds: any[]) => {
      try {
        const result = await env.DB.prepare(sql).bind(...binds).all();
        return result.results || [];
      } catch (e) {
        console.error('safeQuery failed:', sql, e);
        return [];
      }
    };

    if (tab === 'requests') {
      tabData = await safeQuery(`
        SELECT r.id, r.title, r.status, r.priority, r.category, r.created_at,
               u.name as creator_name, e.name as executor_name
        FROM requests r
        LEFT JOIN users u ON r.user_id = u.id
        LEFT JOIN users e ON r.assigned_to = e.id
        WHERE r.tenant_id = ?
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'residents') {
      tabData = await safeQuery(`
        SELECT u.id, u.name, u.phone, u.login, u.building_id, u.apartment, u.created_at,
               b.address as building_address
        FROM users u
        LEFT JOIN buildings b ON u.building_id = b.id
        WHERE u.tenant_id = ? AND u.role = 'resident'
        ORDER BY u.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'votes') {
      tabData = await safeQuery(`
        SELECT m.id, m.title, m.status, m.meeting_type, m.scheduled_date, m.created_at,
               u.name as creator_name
        FROM meetings m
        LEFT JOIN users u ON m.created_by = u.id
        WHERE m.tenant_id = ?
        ORDER BY m.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'qr') {
      tabData = await safeQuery(`
        SELECT g.id, g.code, g.guest_name, g.status, g.valid_from, g.valid_until, g.created_at,
               u.name as creator_name
        FROM guest_access_codes g
        LEFT JOIN users u ON g.user_id = u.id
        WHERE g.tenant_id = ?
        ORDER BY g.created_at DESC
        LIMIT 50
      `, [tenantId]);
    } else if (tab === 'staff') {
      tabData = await safeQuery(`
        SELECT u.id, u.name, u.phone, u.login, u.role, u.specialization, u.status, u.created_at
        FROM users u
        WHERE u.tenant_id = ? AND u.role NOT IN ('resident')
        ORDER BY
          CASE u.role
            WHEN 'director' THEN 1
            WHEN 'admin' THEN 2
            WHEN 'manager' THEN 3
            WHEN 'department_head' THEN 4
            WHEN 'executor' THEN 5
            ELSE 6
          END,
          u.created_at DESC
        LIMIT 100
      `, [tenantId]);
    } else if (tab === 'settings') {
      try {
        tabData = {
          features: JSON.parse((tenant as any).features || '[]'),
          plan: (tenant as any).plan,
          color: (tenant as any).color,
          color_secondary: (tenant as any).color_secondary,
          is_active: (tenant as any).is_active,
        };
      } catch (e) {
        tabData = { features: [], plan: 'basic' };
      }
    }

    return json({ tenant, stats, tabData });
  } catch (err: any) {
    console.error('Tenant details error:', err?.message || err, err?.stack);
    return error(`Failed to load tenant details: ${err?.message || 'Unknown error'}`, 500);
  }
});

// POST /api/super-admin/impersonate/:tenantId - get admin credentials for auto-login
route('POST', '/api/super-admin/impersonate/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const tenantId = params.id;
  const tenant = await env.DB.prepare(`SELECT * FROM tenants WHERE id = ?`).bind(tenantId).first() as any;
  if (!tenant) return error('Tenant not found', 404);

  // Find admin user for this tenant (prefer admin, fallback to director)
  const adminUser = await env.DB.prepare(
    `SELECT id, login, name, role, phone, specialization, address, apartment, building_id, branch, building, entrance, floor, total_area, account_type, tenant_id
     FROM users WHERE tenant_id = ? AND role IN ('admin', 'director') AND is_active = 1
     ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'director' THEN 2 ELSE 3 END
     LIMIT 1`
  ).bind(tenantId).first() as any;

  if (!adminUser) return error('No admin user found for this tenant', 404);

  return json({ user: adminUser, token: adminUser.id, tenantUrl: tenant.url });
});

// GET /api/super-admin/users - list all users across all tenants with credentials (super_admin only)
route('GET', '/api/super-admin/users', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const role = url.searchParams.get('role') || '';
  const tenantSlug = url.searchParams.get('tenant') || '';
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '50');

  let whereClause = "WHERE 1=1";
  const params: any[] = [];

  if (search) {
    whereClause += " AND (u.login LIKE ? OR u.name LIKE ? OR u.phone LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  if (role) {
    whereClause += " AND u.role = ?";
    params.push(role);
  }
  if (tenantSlug) {
    whereClause += " AND t.slug = ?";
    params.push(tenantSlug);
  }

  const countResult = await env.DB.prepare(
    `SELECT COUNT(*) as total FROM users u LEFT JOIN tenants t ON u.tenant_id = t.id ${whereClause}`
  ).bind(...params).first() as any;
  const total = countResult?.total || 0;

  const offset = (page - 1) * limit;
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.login, u.password_hash as password, u.name, u.phone, u.role, u.specialization,
           u.tenant_id, t.name as tenant_name, t.slug as tenant_slug,
           u.branch, u.building, u.created_at, u.is_active
    FROM users u
    LEFT JOIN tenants t ON u.tenant_id = t.id
    ${whereClause}
    ORDER BY t.name, u.role, u.name
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return json({ users: results, total, page, limit });
});

// PATCH /api/super-admin/tenants/:id/banners - toggle coming soon banners
route('PATCH', '/api/super-admin/tenants/:id/banners', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  const body = await request.json() as any;
  const updates: string[] = [];
  const values: any[] = [];

  if (typeof body.show_useful_contacts_banner === 'boolean' || typeof body.show_useful_contacts_banner === 'number') {
    updates.push('show_useful_contacts_banner = ?');
    values.push(body.show_useful_contacts_banner ? 1 : 0);
  }
  if (typeof body.show_marketplace_banner === 'boolean' || typeof body.show_marketplace_banner === 'number') {
    updates.push('show_marketplace_banner = ?');
    values.push(body.show_marketplace_banner ? 1 : 0);
  }

  if (updates.length === 0) return error('No fields to update', 400);

  await env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .bind(...values, params.id).run();

  const tenant = await env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(params.id).first();
  return json({ success: true, tenant });
});

// GET /api/super-admin/analytics - cross-tenant analytics
route('GET', '/api/super-admin/analytics', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return error('Access denied', 403);

  try {
    // Helper: build time-series queries for a given period
    const timeQueries = (groupExpr: string, periodAlias: string, dateFilter: string) => [
      env.DB.prepare(`SELECT ${groupExpr} as period, COUNT(*) as count FROM users WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
      env.DB.prepare(`SELECT ${groupExpr} as period, COUNT(*) as count FROM requests WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
      env.DB.prepare(`SELECT ${groupExpr} as period, COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as revenue, COUNT(*) as orders FROM marketplace_orders WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
      env.DB.prepare(`SELECT ${groupExpr} as period, COUNT(*) as count FROM buildings WHERE created_at >= ${dateFilter} GROUP BY ${groupExpr} ORDER BY period`).all(),
    ];

    const [
      perTenantResult, planResult, tenantsResult,
      // Daily (last 30 days)
      udRes, rdRes, revdRes, bdRes,
      // Weekly (last 12 weeks)
      uwRes, rwRes, revwRes, bwRes,
      // Monthly (last 12 months)
      umRes, rmRes, revmRes, bmRes,
    ] = await Promise.all([
      // Per-tenant real counts
      env.DB.prepare(`
        SELECT
          t.id, t.name, t.slug, t.plan, t.is_active,
          COALESCE(u.cnt, 0) as users_count,
          COALESCE(r.cnt, 0) as requests_count,
          COALESCE(b.cnt, 0) as buildings_count,
          COALESCE(o.revenue, 0) as revenue
        FROM tenants t
        LEFT JOIN (SELECT tenant_id, COUNT(*) as cnt FROM users GROUP BY tenant_id) u ON u.tenant_id = t.id
        LEFT JOIN (SELECT tenant_id, COUNT(*) as cnt FROM requests GROUP BY tenant_id) r ON r.tenant_id = t.id
        LEFT JOIN (SELECT tenant_id, COUNT(*) as cnt FROM buildings GROUP BY tenant_id) b ON b.tenant_id = t.id
        LEFT JOIN (SELECT tenant_id, COALESCE(SUM(CASE WHEN status = 'delivered' THEN final_amount ELSE 0 END), 0) as revenue FROM marketplace_orders GROUP BY tenant_id) o ON o.tenant_id = t.id
        ORDER BY u.cnt DESC
      `).all(),
      env.DB.prepare(`SELECT plan, COUNT(*) as count FROM tenants GROUP BY plan`).all(),
      env.DB.prepare(`SELECT features FROM tenants`).all(),
      // Daily
      ...timeQueries("date(created_at)", "day", "date('now', '-30 days')"),
      // Weekly
      ...timeQueries("strftime('%Y-W%W', created_at)", "week", "date('now', '-84 days')"),
      // Monthly
      ...timeQueries("strftime('%Y-%m', created_at)", "month", "date('now', '-12 months')"),
    ]);

    const perTenant = (perTenantResult.results || []) as any[];
    const planDistribution = (planResult.results || []) as any[];

    // Calculate totals
    const totals = perTenant.reduce((acc: any, t: any) => ({
      users: acc.users + Number(t.users_count || 0),
      requests: acc.requests + Number(t.requests_count || 0),
      buildings: acc.buildings + Number(t.buildings_count || 0),
      revenue: acc.revenue + Number(t.revenue || 0),
    }), { users: 0, requests: 0, buildings: 0, revenue: 0 });
    totals.tenants = perTenant.length;

    // Parse feature usage from tenants
    const featureUsage: Record<string, number> = {};
    for (const t of (tenantsResult.results || []) as any[]) {
      try {
        const features = JSON.parse(t.features || '[]');
        for (const f of features) {
          featureUsage[f] = (featureUsage[f] || 0) + 1;
        }
      } catch {}
    }
    const featureUsageArr = Object.entries(featureUsage).map(([feature, count]) => ({ feature, count }));

    // Merge time-series data for a given period
    const mergeGrowth = (usersR: any, requestsR: any, revenueR: any, buildingsR: any) => {
      const u = (usersR.results || []) as any[];
      const r = (requestsR.results || []) as any[];
      const rev = (revenueR.results || []) as any[];
      const b = (buildingsR.results || []) as any[];
      const allPeriods = new Set([
        ...u.map((x: any) => x.period),
        ...r.map((x: any) => x.period),
        ...rev.map((x: any) => x.period),
        ...b.map((x: any) => x.period),
      ]);
      return Array.from(allPeriods).sort().map(p => ({
        period: p,
        users: Number(u.find((x: any) => x.period === p)?.count || 0),
        requests: Number(r.find((x: any) => x.period === p)?.count || 0),
        revenue: Number(rev.find((x: any) => x.period === p)?.revenue || 0),
        orders: Number(rev.find((x: any) => x.period === p)?.orders || 0),
        buildings: Number(b.find((x: any) => x.period === p)?.count || 0),
      }));
    };

    return json({
      analytics: {
        totals,
        perTenant,
        planDistribution,
        featureUsage: featureUsageArr,
        growth: {
          daily: mergeGrowth(udRes, rdRes, revdRes, bdRes),
          weekly: mergeGrowth(uwRes, rwRes, revwRes, bwRes),
          monthly: mergeGrowth(umRes, rmRes, revmRes, bmRes),
        },
      }
    });
  } catch (err: any) {
    console.error('Super admin analytics error:', err);
    return error('Failed to load analytics', 500);
  }
});

// ==================== DB MIGRATIONS ====================
// Track which migrations have been run in this worker instance
const migrationsRun = new Set<string>();

async function runMigrations(env: Env) {
  // Only run migrations once per worker instance
  if (migrationsRun.has('all_migrations')) return;

  try {
    // Migration 1: Create tenants table if not exists
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS tenants (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          slug TEXT UNIQUE NOT NULL,
          url TEXT NOT NULL,
          admin_url TEXT,
          color TEXT DEFAULT '#6366f1',
          color_secondary TEXT DEFAULT '#a855f7',
          plan TEXT DEFAULT 'basic' CHECK (plan IN ('basic', 'pro', 'enterprise')),
          features TEXT DEFAULT '["requests","votes","qr","rentals","notepad","reports"]',
          admin_email TEXT,
          admin_phone TEXT,
          logo TEXT,
          users_count INTEGER DEFAULT 0,
          requests_count INTEGER DEFAULT 0,
          votes_count INTEGER DEFAULT 0,
          qr_count INTEGER DEFAULT 0,
          revenue REAL DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      console.log('Migration: Created tenants table');
    } catch (e) {
      // Table might already exist, ignore
    }

    // Migration: Add logo column to tenants
    try {
      const tenantInfo = await env.DB.prepare(`PRAGMA table_info(tenants)`).all();
      const tenantCols = (tenantInfo.results || []).map((col: any) => col.name);
      if (!tenantCols.includes('logo')) {
        await env.DB.prepare(`ALTER TABLE tenants ADD COLUMN logo TEXT`).run();
        console.log('Migration: Added logo column to tenants');
      }
      // Migration: Add is_demo flag to tenants (replaces slug-based demo checks)
      if (!tenantCols.includes('is_demo')) {
        await env.DB.prepare(`ALTER TABLE tenants ADD COLUMN is_demo INTEGER DEFAULT 0`).run();
        await env.DB.prepare(`UPDATE tenants SET is_demo = 1 WHERE slug IN ('kamizo-demo', 'demo')`).run();
        console.log('Migration: Added is_demo column to tenants');
      }
    } catch (e) {}

    // Migration: Add contract_template column to tenants
    try {
      const tenantInfo2 = await env.DB.prepare(`PRAGMA table_info(tenants)`).all();
      const tenantCols2 = (tenantInfo2.results || []).map((col: any) => col.name);
      if (!tenantCols2.includes('contract_template')) {
        await env.DB.prepare(`ALTER TABLE tenants ADD COLUMN contract_template TEXT`).run();
        console.log('Migration: Added contract_template column to tenants');
      }
    } catch (e) {}

    // Migration: Fix users login UNIQUE constraint (global → per-tenant)
    try {
      const indexList = await env.DB.prepare(`PRAGMA index_list(users)`).all();
      const hasCompositeIndex = (indexList.results || []).some((idx: any) =>
        idx.name === 'idx_users_login_tenant'
      );

      if (!hasCompositeIndex) {
        console.log('Migration: Fixing users login UNIQUE constraint for multi-tenancy...');

        // Get existing column names dynamically
        const tableInfo = await env.DB.prepare(`PRAGMA table_info(users)`).all();
        const existingCols = (tableInfo.results || []).map((col: any) => col.name as string);
        console.log('Existing users columns:', existingCols.join(', '));

        // All known columns in the new table
        const newTableCols = [
          'id', 'login', 'phone', 'password_hash', 'password_plain', 'name', 'role',
          'specialization', 'email', 'avatar_url', 'address', 'apartment', 'building_id',
          'entrance', 'floor', 'branch', 'building', 'language', 'is_active', 'qr_code',
          'contract_signed_at', 'agreed_to_terms_at', 'contract_number', 'contract_start_date',
          'contract_end_date', 'contract_type', 'total_area', 'password_changed_at',
          'account_type', 'status', 'tenant_id', 'created_at', 'updated_at'
        ];

        // Only copy columns that exist in both old and new tables
        const commonCols = existingCols.filter(c => newTableCols.includes(c));
        const colList = commonCols.join(', ');

        // Disable foreign keys before table recreation
        await env.DB.prepare(`PRAGMA foreign_keys=OFF`).run();

        await env.DB.batch([
          env.DB.prepare(`CREATE TABLE users_new (
            id TEXT PRIMARY KEY,
            login TEXT NOT NULL,
            phone TEXT,
            password_hash TEXT NOT NULL DEFAULT '',
            password_plain TEXT,
            name TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT 'resident',
            specialization TEXT,
            email TEXT,
            avatar_url TEXT,
            address TEXT,
            apartment TEXT,
            building_id TEXT,
            entrance TEXT,
            floor TEXT,
            branch TEXT,
            building TEXT,
            language TEXT DEFAULT 'ru',
            is_active INTEGER DEFAULT 1,
            qr_code TEXT,
            contract_signed_at TEXT,
            agreed_to_terms_at TEXT,
            contract_number TEXT,
            contract_start_date TEXT,
            contract_end_date TEXT,
            contract_type TEXT DEFAULT 'standard',
            total_area REAL,
            password_changed_at TEXT,
            account_type TEXT DEFAULT 'standard',
            status TEXT DEFAULT 'available',
            tenant_id TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
          )`),
          env.DB.prepare(`INSERT INTO users_new (${colList}) SELECT ${colList} FROM users`),
          env.DB.prepare(`DROP TABLE users`),
          env.DB.prepare(`ALTER TABLE users_new RENAME TO users`),
          env.DB.prepare(`CREATE UNIQUE INDEX idx_users_login_tenant ON users(login, COALESCE(tenant_id, '___global___'))`),
          env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)`),
          env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`),
        ]);

        // Re-enable foreign keys
        await env.DB.prepare(`PRAGMA foreign_keys=ON`).run();

        console.log('Migration: Fixed users login constraint - now unique per tenant');
      }
    } catch (e) {
      console.error('Migration error (users login unique):', e);
    }

    // Migration 2: Add pause-related columns to requests table
    try {
      const tableInfo = await env.DB.prepare(`PRAGMA table_info(requests)`).all();
      const columns = (tableInfo.results || []).map((col: any) => col.name);

      // Add is_paused column if not exists
      if (!columns.includes('is_paused')) {
        await env.DB.prepare(`ALTER TABLE requests ADD COLUMN is_paused INTEGER DEFAULT 0`).run();
        console.log('Migration: Added is_paused column to requests');
      }

      // Add paused_at column if not exists
      if (!columns.includes('paused_at')) {
        await env.DB.prepare(`ALTER TABLE requests ADD COLUMN paused_at TEXT`).run();
        console.log('Migration: Added paused_at column to requests');
      }

      // Add total_paused_time column if not exists
      if (!columns.includes('total_paused_time')) {
        await env.DB.prepare(`ALTER TABLE requests ADD COLUMN total_paused_time INTEGER DEFAULT 0`).run();
        console.log('Migration: Added total_paused_time column to requests');
      }
    } catch (e) {
      // Table might not exist yet, ignore
    }

    // Migration: Add tenant_id to meeting sub-tables that were missed in 0003
    try {
      const meetingSubTables = [
        'meeting_schedule_options',
        'meeting_schedule_votes',
        'meeting_participated_voters',
        'meeting_eligible_voters',
        'meeting_protocols',
        'meeting_voting_units',
        'meeting_building_settings',
        'meeting_otp_records',
        'meeting_agenda_comments',
      ];

      for (const table of meetingSubTables) {
        try {
          const info = await env.DB.prepare(`PRAGMA table_info(${table})`).all();
          const cols = (info.results || []).map((c: any) => c.name);
          if (cols.length > 0 && !cols.includes('tenant_id')) {
            await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN tenant_id TEXT`).run();
            console.log(`Migration: Added tenant_id to ${table}`);
          }
        } catch (e) {
          // Table might not exist yet
        }
      }
    } catch (e) {
      console.error('Migration error (meeting tenant_id):', e);
    }

    // Migration: Create meeting_vote_reconsideration_requests table
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS meeting_vote_reconsideration_requests (
          id TEXT PRIMARY KEY,
          meeting_id TEXT NOT NULL,
          agenda_item_id TEXT NOT NULL,
          resident_id TEXT NOT NULL,
          apartment_id TEXT NOT NULL,
          requested_by_user_id TEXT NOT NULL,
          requested_by_role TEXT NOT NULL,
          reason TEXT NOT NULL,
          message_to_resident TEXT,
          vote_at_request_time TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          viewed_at TEXT,
          responded_at TEXT,
          new_vote TEXT,
          expired_at TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_meeting ON meeting_vote_reconsideration_requests(meeting_id)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_resident ON meeting_vote_reconsideration_requests(resident_id)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_status ON meeting_vote_reconsideration_requests(status)`).run();
      await env.DB.prepare(`CREATE INDEX IF NOT EXISTS idx_reconsider_resident_agenda ON meeting_vote_reconsideration_requests(resident_id, agenda_item_id)`).run();
      console.log('Migration: Created meeting_vote_reconsideration_requests table');
    } catch (e) {
      // Table might already exist
    }

    // Migration: Add is_revote column to meeting_vote_records
    try {
      const voteInfo = await env.DB.prepare(`PRAGMA table_info(meeting_vote_records)`).all();
      const voteCols = (voteInfo.results || []).map((c: any) => c.name);
      if (voteCols.length > 0 && !voteCols.includes('is_revote')) {
        await env.DB.prepare(`ALTER TABLE meeting_vote_records ADD COLUMN is_revote INTEGER DEFAULT 0`).run();
        console.log('Migration: Added is_revote to meeting_vote_records');
      }
      if (voteCols.length > 0 && !voteCols.includes('previous_vote_id')) {
        await env.DB.prepare(`ALTER TABLE meeting_vote_records ADD COLUMN previous_vote_id TEXT`).run();
        console.log('Migration: Added previous_vote_id to meeting_vote_records');
      }
    } catch (e) {}

    // Migration: Fix duplicate entries in meeting_participated_voters and add UNIQUE index
    try {
      const pvTableExists = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_participated_voters'`).first();
      if (pvTableExists) {
        const idxResult = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='idx_meeting_participated_unique'`).first();
        if (!idxResult) {
          // Delete duplicates: keep only the row with earliest rowid per (meeting_id, user_id)
          await env.DB.prepare(`
            DELETE FROM meeting_participated_voters
            WHERE rowid NOT IN (
              SELECT MIN(rowid) FROM meeting_participated_voters GROUP BY meeting_id, user_id
            )
          `).run();
          // Create unique index to prevent future duplicates
          await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_participated_unique ON meeting_participated_voters(meeting_id, user_id)`).run();
          console.log('Migration: Deduplicated meeting_participated_voters and added UNIQUE index');
        }
      }
    } catch (e) {
      console.error('Migration: meeting_participated_voters dedup error:', e);
    }

    // Migration: Backfill tenant_id on orphaned child records
    // Records created before multi-tenancy have NULL tenant_id but their parent has one
    try {
      const needsBackfill = await env.DB.prepare(`
        SELECT COUNT(*) as count FROM entrances WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)
      `).first() as any;

      if (needsBackfill?.count > 0) {
        console.log(`Migration: Backfilling tenant_id on ${needsBackfill.count} orphaned entrances...`);
        await env.DB.batch([
          // Entrances: inherit tenant_id from their building
          env.DB.prepare(`UPDATE entrances SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = entrances.building_id) WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
          // Apartments: inherit tenant_id from their building
          env.DB.prepare(`UPDATE apartments SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = apartments.building_id) WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
          // Building documents: inherit from building
          env.DB.prepare(`UPDATE building_documents SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = building_documents.building_id) WHERE tenant_id IS NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
          // Users with building_id: inherit from their building
          env.DB.prepare(`UPDATE users SET tenant_id = (SELECT tenant_id FROM buildings WHERE id = users.building_id) WHERE tenant_id IS NULL AND building_id IS NOT NULL AND building_id IN (SELECT id FROM buildings WHERE tenant_id IS NOT NULL)`),
        ]);
        console.log('Migration: Backfilled tenant_id on orphaned records');
      }
    } catch (e) {
      console.error('Migration error (backfill tenant_id):', e);
    }

    // Migration: Create super_banners table
    try {
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS super_banners (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          image_url TEXT,
          link_url TEXT,
          placement TEXT NOT NULL DEFAULT 'marketplace',
          is_active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        )
      `).run();
      console.log('Migration: Created super_banners table');
    } catch (e) {
      // Table might already exist
    }

    migrationsRun.add('all_migrations');
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// ==================== MAIN HANDLER ====================

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
    // Run DB migrations (only once per worker instance)
    try {
      await runMigrations(env);
    } catch (migrationError) {
      console.error('Critical: runMigrations threw unhandled exception:', migrationError);
      // Continue — don't fail requests due to migration issues
    }

    // Set CORS origin for this request
    setCorsOrigin(request);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        }
      });
    }

    const url = new URL(request.url);

    // Detect tenant from hostname
    const tenantSlug = getTenantSlug(url.hostname);
    if (tenantSlug) {
      try {
        const tenant = await env.DB.prepare(`
          SELECT * FROM tenants WHERE slug = ? AND is_active = 1
        `).bind(tenantSlug).first();

        if (!tenant) {
          return new Response(`
            <!DOCTYPE html>
            <html lang="ru">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Управляющая компания не найдена</title>
              <style>
                body {
                  font-family: system-ui, -apple-system, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  margin: 0;
                  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                  color: white;
                }
                .container {
                  text-align: center;
                  padding: 2rem;
                }
                h1 {
                  font-size: 3rem;
                  margin: 0 0 1rem 0;
                }
                p {
                  font-size: 1.25rem;
                  margin: 0.5rem 0;
                  opacity: 0.9;
                }
                .code {
                  font-family: monospace;
                  background: rgba(255,255,255,0.1);
                  padding: 0.25rem 0.5rem;
                  border-radius: 4px;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>404</h1>
                <p>Управляющая компания <span class="code">${tenantSlug}</span> не найдена</p>
                <p>Данный поддомен не зарегистрирован в системе</p>
              </div>
            </body>
            </html>
          `, {
            status: 404,
            headers: {
              'Content-Type': 'text/html;charset=UTF-8',
              'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0'
            }
          });
        }

        // Store tenant context for this request
        setCurrentTenant(tenant);
        setTenantForRequest(request, tenant);
      } catch (error) {
        console.error('Error fetching tenant:', error);
        return new Response('Error loading tenant', { status: 500 });
      }
    } else {
      setCurrentTenant(null);
    }

    // Try to match API routes
    if (url.pathname.startsWith('/api')) {
      const matched = matchRoute(request.method, url.pathname);
      if (matched) {
        // Wrap in monitoring middleware with safety net
        try {
          return await withMonitoring(request, async () => {
            try {
              // Apply rate limiting to non-auth endpoints (auth handles it internally)
              if (!url.pathname.startsWith('/api/auth/login') && !url.pathname.startsWith('/api/health')) {
                const user = await getUser(request, env);
                const identifier = getClientIdentifier(request, user);
                const endpoint = `${request.method}:${url.pathname}`;
                const rateLimit = await checkRateLimit(env, identifier, endpoint);

                if (!rateLimit.allowed) {
                  const resetIn = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
                  return new Response(JSON.stringify({
                    error: `Rate limit exceeded. Try again in ${resetIn} seconds.`
                  }), {
                    status: 429,
                    headers: {
                      'Content-Type': 'application/json',
                      'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
                      'X-RateLimit-Limit': (RATE_LIMITS[endpoint] || RATE_LIMITS['default']).maxRequests.toString(),
                      'X-RateLimit-Remaining': '0',
                      'X-RateLimit-Reset': rateLimit.resetAt.toString(),
                      'Retry-After': resetIn.toString()
                    }
                  });
                }

                // Add rate limit headers to successful response
                const response = await matched.handler(request, env, matched.params);

                // WebSocket responses have immutable headers, so we can't modify them
                // For WebSocket upgrade responses, skip adding rate limit headers
                if (response.status === 101 || response.headers.get('Upgrade') === 'websocket') {
                  return response;
                }

                // For regular responses, create a new Response with rate limit headers
                const newHeaders = new Headers(response.headers);
                newHeaders.set('X-RateLimit-Limit', (RATE_LIMITS[endpoint] || RATE_LIMITS['default']).maxRequests.toString());
                newHeaders.set('X-RateLimit-Remaining', rateLimit.remaining.toString());
                newHeaders.set('X-RateLimit-Reset', rateLimit.resetAt.toString());

                return new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: newHeaders
                });
              }

              return await matched.handler(request, env, matched.params);
            } catch (err: any) {
              console.error('API Error:', err);
              return error(err.message || 'Internal server error', 500);
            }
          });
        } catch (outerErr: any) {
          // Safety net: if withMonitoring itself crashes, still return a valid CORS response
          console.error('Critical API Error (outside monitoring):', outerErr);
          return new Response(JSON.stringify({ error: outerErr.message || 'Internal server error' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': getCurrentCorsOrigin(),
              'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
          });
        }
      }
      return error('Not found', 404);
    }

    // For SPA: serve static assets or fallback to index.html
    // BUT first verify tenant exists if this is a tenant subdomain
    if (tenantSlug && !getCurrentTenant()) {
      // This shouldn't happen as we checked above, but double-check for safety
      return new Response(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Управляющая компания не найдена</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            h1 {
              font-size: 3rem;
              margin: 0 0 1rem 0;
            }
            p {
              font-size: 1.25rem;
              margin: 0.5rem 0;
              opacity: 0.9;
            }
            .code {
              font-family: monospace;
              background: rgba(255,255,255,0.1);
              padding: 0.25rem 0.5rem;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404</h1>
            <p>Управляющая компания <span class="code">${tenantSlug}</span> не найдена</p>
            <p>Данный поддомен не зарегистрирован в системе</p>
          </div>
        </body>
        </html>
      `, {
        status: 404,
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    // Helper: add no-cache headers to HTML responses (index.html)
    // This prevents browsers from caching old index.html that references stale JS hashes
    const withNoCacheIfHtml = (response: Response): Response => {
      const contentType = response.headers.get('Content-Type') || '';
      if (contentType.includes('text/html')) {
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        newHeaders.set('Pragma', 'no-cache');
        newHeaders.set('Expires', '0');
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }
      return response;
    };

    // env.ASSETS is automatically provided by Cloudflare when using assets config
    try {
      // Try to serve the requested asset
      const assetResponse = await env.ASSETS.fetch(request);

      // If asset found, return it (with no-cache for HTML)
      if (assetResponse.status !== 404) {
        return withNoCacheIfHtml(assetResponse);
      }

      // For 404 (file not found), serve index.html for SPA routing
      const indexRequest = new Request(new URL('/', request.url).toString(), request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return withNoCacheIfHtml(indexResponse);
    } catch (e) {
      // Fallback to index.html on any error
      try {
        const indexRequest = new Request(new URL('/', request.url).toString(), request);
        const indexResponse = await env.ASSETS.fetch(indexRequest);
        return withNoCacheIfHtml(indexResponse);
      } catch {
        return new Response('UK CRM - Service temporarily unavailable', {
          status: 503,
          headers: { 'Content-Type': 'text/html' }
        });
      }
    }
    } catch (fatalError: any) {
      // Last-resort safety net — prevent Cloudflare error 1101 (Worker threw exception)
      console.error('FATAL unhandled error in fetch handler:', fatalError);
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  }
};

// Export Durable Object
export { ConnectionManager } from './ConnectionManager';
