// Auth, Users, Team & Executors routes — extracted from index.ts
// Contains: login, register, user CRUD, password management, team CRUD, executor stats

import type { Env } from '../types';
import { route } from '../router';
import { getUser } from '../middleware/auth';
import { getTenantId, setTenantForRequest } from '../middleware/tenant';
import { invalidateCache } from '../middleware/cache-local';
import { invalidateOnChange, getCacheStats } from '../cache';
import { checkRateLimit, getClientIdentifier } from '../middleware/rateLimit';
import { getCurrentCorsOrigin } from '../middleware/cors';
import { json, error, generateId, isManagement, isAdminLevel, getPaginationParams, createPaginatedResponse } from '../utils/helpers';
import { hashPassword, verifyPassword, createJWT } from '../utils/crypto';
import { isExecutorRole, isSuperAdmin } from '../index';
import { createRequestLogger } from '../utils/logger';
import { validateBody } from '../validation/validate';
import { loginSchema } from '../validation/schemas';

export function registerUserRoutes() {

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
  // In non-production (local dev / staging), allow without auth for easy seeding
  if (env.ENVIRONMENT === 'production') {
    const authUser = await getUser(request, env);
    if (!isSuperAdmin(authUser)) return error('Access denied', 403);
  }

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

  // 2. Create demo users — realistic Tashkent names and phones
  const demoUsers = [
    { id: generateId(), login: 'demo-director', password: 'kamizo', name: 'Алишер Каримов', role: 'director', phone: '+998901234501' },
    { id: generateId(), login: 'demo-manager', password: 'kamizo', name: 'Дилноза Рахимова', role: 'manager', phone: '+998937654302' },
    { id: generateId(), login: 'demo-admin', password: 'kamizo', name: 'Бахтиёр Усманов', role: 'admin', phone: '+998901112203' },
    { id: generateId(), login: 'demo-dispatcher', password: 'kamizo', name: 'Мадина Хасанова', role: 'dispatcher', phone: '+998946783304' },
    { id: generateId(), login: 'demo-executor', password: 'kamizo', name: 'Рустам Ибрагимов', role: 'executor', phone: '+998905556605', specialization: 'plumber' },
    { id: generateId(), login: 'demo-electrician', password: 'kamizo', name: 'Азиз Мирзаев', role: 'executor', phone: '+998937778806', specialization: 'electrician' },
    { id: generateId(), login: 'demo-handyman', password: 'kamizo', name: 'Шерзод Турсунов', role: 'executor', phone: '+998901239907', specialization: 'general' },
    { id: generateId(), login: 'demo-security', password: 'kamizo', name: 'Отабек Норматов', role: 'security', phone: '+998944443308' },
    { id: generateId(), login: 'demo-dept-head', password: 'kamizo', name: 'Нодира Ташпулатова', role: 'department_head', phone: '+998908887709' },
    { id: generateId(), login: 'demo-shop', password: 'kamizo', name: 'Гулнора Тошева', role: 'marketplace_manager', phone: '+998936665510' },
    { id: generateId(), login: 'demo-resident1', password: 'kamizo', name: 'Фарход Исмоилов', role: 'resident', phone: '+998901234511', address: 'ул. Бобура, 24', apartment: '34' },
    { id: generateId(), login: 'demo-resident2', password: 'kamizo', name: 'Малика Абдуллаева', role: 'resident', phone: '+998937654312', address: 'ул. Бобура, 24', apartment: '87' },
    { id: generateId(), login: 'demo-resident3', password: 'kamizo', name: 'Зафар Нуриллаев', role: 'resident', phone: '+998945551213', address: 'ул. Мирзо Улугбека, 55', apartment: '23' },
    { id: generateId(), login: 'demo-resident4', password: 'kamizo', name: 'Шахло Назарова', role: 'resident', phone: '+998901119914', address: 'пр. Амира Темура, 100', apartment: '156' },
    { id: generateId(), login: 'demo-resident5', password: 'kamizo', name: 'Жамшид Ахмедов', role: 'resident', phone: '+998938882215', address: 'ул. Мирзо Улугбека, 55', apartment: '15' },
    { id: generateId(), login: 'demo-tenant', password: 'kamizo', name: 'Лазиз Юлдашев', role: 'tenant', phone: '+998906667716', address: 'ул. Бобура, 24', apartment: '112' },
  ];

  for (const u of demoUsers) {
    const passwordHash = await hashPassword(u.password);
    await env.DB.prepare(`
      INSERT INTO users (id, login, password_hash, name, role, phone, specialization, address, apartment, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))
    `).bind(
      u.id, u.login, passwordHash, u.name, u.role, u.phone,
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

  // 3. Create demo buildings (3 total — realistic Tashkent complexes)
  const building1Id = generateId();
  const building2Id = generateId();
  const building3Id = generateId();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Caravan City', 'ул. Бобура, 24', 12, 4, 96, 9600.0, 2022, 'monolith', 1, 4, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building1Id, tenantId).run();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Mirzo Residence', 'ул. Мирзо Улугбека, 55', 9, 3, 54, 5400.0, 2023, 'monolith', 1, 3, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building2Id, tenantId).run();

  await env.DB.prepare(`
    INSERT INTO buildings (id, name, address, floors, entrances_count, apartments_count, total_area, year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water, tenant_id, created_at, updated_at)
    VALUES (?, 'ЖК Tashkent Plaza', 'пр. Амира Темура, 100', 16, 6, 192, 19200.0, 2024, 'monolith', 1, 6, 1, 1, ?, datetime('now'), datetime('now'))
  `).bind(building3Id, tenantId).run();

  // 4. Create demo apartments
  const apartments = [
    // Building 1 - ЖК Caravan City (ул. Бобура, 24)
    { id: generateId(), building_id: building1Id, number: '34', floor: 5, total_area: 72.5, rooms: 3, status: 'occupied', primary_owner_id: resident1.id },
    { id: generateId(), building_id: building1Id, number: '87', floor: 10, total_area: 55.0, rooms: 2, status: 'occupied', primary_owner_id: resident2.id },
    { id: generateId(), building_id: building1Id, number: '112', floor: 12, total_area: 95.0, rooms: 4, status: 'rented' },
    { id: generateId(), building_id: building1Id, number: '56', floor: 7, total_area: 48.0, rooms: 2, status: 'vacant' },
    // Building 2 - ЖК Mirzo Residence (ул. Мирзо Улугбека, 55)
    { id: generateId(), building_id: building2Id, number: '23', floor: 4, total_area: 68.0, rooms: 3, status: 'occupied', primary_owner_id: resident3.id },
    { id: generateId(), building_id: building2Id, number: '15', floor: 3, total_area: 42.0, rooms: 1, status: 'occupied', primary_owner_id: findDemoUser('demo-resident5').id },
    { id: generateId(), building_id: building2Id, number: '41', floor: 7, total_area: 85.0, rooms: 4, status: 'vacant' },
    // Building 3 - ЖК Tashkent Plaza (пр. Амира Темура, 100)
    { id: generateId(), building_id: building3Id, number: '156', floor: 12, total_area: 75.0, rooms: 3, status: 'occupied', primary_owner_id: findDemoUser('demo-resident4').id },
    { id: generateId(), building_id: building3Id, number: '89', floor: 6, total_area: 110.0, rooms: 4, status: 'occupied' },
    { id: generateId(), building_id: building3Id, number: '201', floor: 14, total_area: 58.0, rooms: 2, status: 'rented' },
  ];

  for (const apt of apartments) {
    await env.DB.prepare(`
      INSERT INTO apartments (id, building_id, number, floor, total_area, rooms, status, primary_owner_id, tenant_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(apt.id, apt.building_id, apt.number, apt.floor, apt.total_area, apt.rooms, apt.status, apt.primary_owner_id || null, tenantId).run();
  }

  // 5. Create rental apartment (apt 112 for rent in Caravan City)
  const rentalAptId = generateId();
  await env.DB.prepare(`
    INSERT INTO rental_apartments (id, name, address, apartment, owner_id, is_active, tenant_id, created_at, updated_at)
    VALUES (?, 'Квартира 112, ЖК Caravan City', 'ул. Бобура, 24', '112', ?, 1, ?, datetime('now'), datetime('now'))
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
  const handyman = findDemoUser('demo-handyman');
  const dispatcher = findDemoUser('demo-dispatcher');
  const executorRecordId = generateId();
  const electricianRecordId = generateId();
  const handymanRecordId = generateId();

  await env.DB.prepare(`
    INSERT INTO executors (id, user_id, specialization, status, rating, completed_count, created_at)
    VALUES (?, ?, 'plumber', 'available', 4.8, 47, datetime('now'))
  `).bind(executorRecordId, executor.id).run();

  await env.DB.prepare(`
    INSERT INTO executors (id, user_id, specialization, status, rating, completed_count, created_at)
    VALUES (?, ?, 'electrician', 'available', 4.9, 35, datetime('now'))
  `).bind(electricianRecordId, electrician.id).run();

  await env.DB.prepare(`
    INSERT INTO executors (id, user_id, specialization, status, rating, completed_count, created_at)
    VALUES (?, ?, 'general', 'available', 4.6, 28, datetime('now'))
  `).bind(handymanRecordId, handyman.id).run();

  // 8. Create demo requests (different statuses for full cycle)
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  const resident4 = findDemoUser('demo-resident4');
  const resident5 = findDemoUser('demo-resident5');

  const requests = [
    { id: generateId(), number: 1001, request_number: 'KD-1001', resident_id: resident1.id, category_id: 'plumbing', title: 'Протечка в ванной', description: 'Течёт труба под раковиной в ванной комнате. Вода капает на пол, возможно повреждение стяжки. Нужен срочный ремонт.', priority: 'urgent', status: 'in_progress', executor_id: executor.id, created_at: twoDaysAgo, started_at: oneDayAgo },
    { id: generateId(), number: 1002, request_number: 'KD-1002', resident_id: resident2.id, category_id: 'elevator', title: 'Не работает лифт', description: 'Лифт в подъезде №2 застревает между 5 и 6 этажами. Кнопки мигают, двери не открываются нормально. Жители 10+ этажей вынуждены ходить пешком.', priority: 'high', status: 'assigned', executor_id: handyman.id, created_at: oneDayAgo },
    { id: generateId(), number: 1003, request_number: 'KD-1003', resident_id: resident3.id, category_id: 'plumbing', title: 'Замена счётчика воды', description: 'Срок поверки счётчика холодной воды истёк. Необходимо заменить на новый. Квартира 23, ЖК Mirzo Residence.', priority: 'medium', status: 'new', created_at: threeHoursAgo },
    { id: generateId(), number: 1004, request_number: 'KD-1004', resident_id: resident4.id, category_id: 'noise', title: 'Шум от соседей', description: 'Соседи сверху (кв. 168) регулярно шумят после 23:00 — громкая музыка и топот. Просьба провести беседу или принять меры.', priority: 'medium', status: 'assigned', executor_id: security.id, created_at: oneDayAgo },
    { id: generateId(), number: 1005, request_number: 'KD-1005', resident_id: resident5.id, category_id: 'maintenance', title: 'Ремонт подъезда', description: 'В подъезде №1 ЖК Mirzo Residence облупилась краска на стенах, не горит свет на 3 этаже, перила расшатаны. Необходим косметический ремонт.', priority: 'low', status: 'completed', executor_id: handyman.id, created_at: twoDaysAgo, started_at: twoDaysAgo, completed_at: oneDayAgo, rating: 5, feedback: 'Отлично! Подъезд выглядит как новый. Спасибо Шерзоду!' },
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
    VALUES (?, 1, ?, 'ул. Бобура, 24', 'Годовое общее собрание собственников ЖК Caravan City. Обсуждение бюджета на 2026 год, ремонт подъездов и благоустройство двора.', 'uk', ?, 'Kamizo Demo', 'offline', 'voting_open', ?, 'Актовый зал, 1 этаж', 'apartment', 51, 9600.0, ?, datetime('now'), datetime('now'))
  `).bind(meetingId, building1Id, director.id, futureDate, tenantId).run();

  // Create agenda items for the meeting
  const agendaItems = [
    { id: generateId(), title: 'Утверждение бюджета на 2026 год', description: 'Рассмотрение и утверждение сметы расходов на содержание и обслуживание общего имущества ЖК Caravan City на 2026 год', order_num: 1 },
    { id: generateId(), title: 'Капитальный ремонт подъездов', description: 'Принятие решения о проведении ремонта подъездов 1-4 ЖК Caravan City с заменой дверей, покраской стен и обновлением освещения', order_num: 2 },
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
    VALUES (?, 2, ?, 'ул. Мирзо Улугбека, 55', 'Внеочередное собрание по вопросу установки шлагбаума на придомовой территории ЖК Mirzo Residence. Результат: решение принято большинством голосов.', 'uk', ?, 'Kamizo Demo', 'offline', 'completed', ?, 'Холл 1 этажа', 'apartment', 51, 5400.0, ?, datetime('now', '-30 days'), datetime('now', '-28 days'))
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
    VALUES (?, 'building', 'ЖК Caravan City — Общий чат', 'Общий чат жителей ЖК Caravan City', ?, ?, ?, datetime('now'))
  `).bind(generalChannelId, building1Id, manager.id, tenantId).run();

  const chatMessages = [
    { sender: manager.id, content: 'Добро пожаловать в общий чат ЖК Caravan City! Здесь вы можете задавать вопросы и получать оперативную информацию.', ago: '-2 days' },
    { sender: resident1.id, content: 'Здравствуйте! Подскажите, когда будет работать детская площадка?', ago: '-1 day' },
    { sender: manager.id, content: 'Здравствуйте, Фарход! Детская площадка откроется после завершения благоустройства — ориентировочно через 2 недели.', ago: '-1 day' },
    { sender: resident2.id, content: 'А можно установить камеры на парковке? Уже второй раз кто-то царапает машину.', ago: '-12 hours' },
    { sender: manager.id, content: 'Малика, вопрос по камерам вынесем на ближайшее собрание. Пока что рекомендуем зафиксировать повреждения и написать заявку.', ago: '-10 hours' },
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
    buildings_created: 3,
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
// PUBLIC: no auth required
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

  const { data: body, errors: validationErrors } = await validateBody<{ login: string; password: string }>(request, loginSchema);
  if (validationErrors) return error(validationErrors, 400);
  const { login, password } = body;

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

  // Issue JWT token (7 days)
  const jwtToken = await createJWT(
    { userId: user.id, role: user.role, tenantId: user.tenant_id || undefined },
    env.JWT_SECRET,
    7 * 24 * 60 * 60
  );

  return new Response(JSON.stringify({ user, token: jwtToken }), {
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

  await env.DB.prepare(`
    INSERT INTO users (id, login, password_hash, name, role, phone, address, apartment, building_id, entrance, floor, specialization, branch, building, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, login.trim(), passwordHash, name, role, phone || null, address || null, apartment || null, building_id || null, entrance || null, floor || null, specialization || null, branch || null, building || null, tenantId).run();

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
      createRequestLogger(request).error('Auto-create apartment failed', e);
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
          // Create or ensure personal_account exists for this resident
          // Use login as account number if numeric, otherwise generate a unique number
          const loginTrimmed = u.login?.trim();
          const accountNum = (loginTrimmed && /^\d+$/.test(loginTrimmed))
            ? loginTrimmed
            : null; // will be auto-generated below

          // Check for existing account linked to this apartment
          const existingAccount = await env.DB.prepare(
            `SELECT id FROM personal_accounts WHERE apartment_id = ? ${bulkTenantId ? 'AND tenant_id = ?' : ''}`
          ).bind(aptId, ...(bulkTenantId ? [bulkTenantId] : [])).first() as any;

          if (!existingAccount) {
            // Also check by account number if we have one
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

              // Link personal_account to apartment
              await env.DB.prepare(
                'UPDATE apartments SET personal_account_id = ? WHERE id = ?'
              ).bind(paId, aptId).run();
            }
          } else {
            // Update owner_name and apartment_number on existing account
            await env.DB.prepare(
              `UPDATE personal_accounts SET owner_name = ?, apartment_number = ?, total_area = COALESCE(NULLIF(total_area, 0), ?)
               WHERE id = ?`
            ).bind(u.name || null, String(u.apartment), u.total_area || null, existingAccount.id).run();
          }
        }
      } catch (linkErr) {
        // Non-critical - don't fail the whole bulk operation
        createRequestLogger(request).error('Failed to link apartment data', linkErr);
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

// Users: Admin change name (ФИО)
route('PATCH', '/api/users/:id/name', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const { name } = await request.json() as any;
  if (!name || !name.trim()) {
    return error('Name is required', 400);
  }

  const tenantId = getTenantId(request);
  const result = await env.DB.prepare(
    `UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(name.trim(), params.id, ...(tenantId ? [tenantId] : [])).run();

  if (!result.meta.changes) {
    return error('User not found', 404);
  }

  return json({ success: true, name: name.trim() });
});

// Users: Update resident data with documented reason (admin/manager only)
route('POST', '/api/users/:id/change-with-reason', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as {
    changes: Array<{ field: string; value: string }>;
    reason: string;
    document_number?: string;
    document_date?: string;
    comment?: string;
  };

  if (!body.changes || body.changes.length === 0) return error('No changes specified');
  if (!body.reason) return error('Reason is required');

  // Get current user data
  const resident = await env.DB.prepare(
    `SELECT id, name, phone, address, apartment, status FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<Record<string, unknown>>();
  if (!resident) return error('User not found', 404);

  const allowedFields = ['name', 'phone', 'apartment', 'address', 'status'];
  const updates: string[] = [];
  const values: (string | number)[] = [];

  for (const change of body.changes) {
    if (!allowedFields.includes(change.field)) continue;
    const oldValue = (resident[change.field] as string) || '';
    const newValue = change.value || '';

    // Apply the update
    updates.push(`${change.field} = ?`);
    values.push(newValue);

    // Log the change
    await env.DB.prepare(
      `INSERT INTO resident_changes_log (id, tenant_id, resident_id, changed_by, change_type, field_name, old_value, new_value, reason, document_number, document_date, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(), tenantId || '', params.id, authUser!.id,
      change.field === 'name' ? 'name_change' : change.field === 'status' ? 'status_change' : 'data_change',
      change.field, oldValue, newValue, body.reason,
      body.document_number || null, body.document_date || null, body.comment || null
    ).run();
  }

  // Handle password change separately
  const passwordChange = body.changes.find(c => c.field === 'password');
  if (passwordChange && passwordChange.value) {
    const hashed = await hashPassword(passwordChange.value);
    updates.push('password_hash = ?');
    values.push(hashed);
    updates.push('password_plain = ?');
    values.push(passwordChange.value);

    await env.DB.prepare(
      `INSERT INTO resident_changes_log (id, tenant_id, resident_id, changed_by, change_type, field_name, old_value, new_value, reason, document_number, document_date, comment)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(), tenantId || '', params.id, authUser!.id,
      'password_reset', 'password', '***', '***', body.reason,
      body.document_number || null, body.document_date || null, body.comment || null
    ).run();
  }

  if (updates.length === 0) return error('No valid changes to apply');

  values.push(params.id);
  if (tenantId) values.push(tenantId);

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(...values).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  const updated = await env.DB.prepare(
    `SELECT id, login, name, phone, address, apartment, status FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  return json({ success: true, user: updated });
});

// Users: Get resident change history
route('GET', '/api/users/:id/changes', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const { results } = await env.DB.prepare(
    `SELECT rcl.*, u.name as changed_by_name FROM resident_changes_log rcl
     LEFT JOIN users u ON rcl.changed_by = u.id
     WHERE rcl.resident_id = ? ${tenantId ? 'AND rcl.tenant_id = ?' : ''}
     ORDER BY rcl.created_at DESC LIMIT 50`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).all();

  return json({ changes: results || [] });
});

// Users: Deactivate resident (soft delete)
route('POST', '/api/users/:id/deactivate', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) {
    return error('Manager access required', 403);
  }

  const tenantId = getTenantId(request);
  const body = await request.json() as { reason: string; comment?: string };
  if (!body.reason) return error('Reason is required');

  const resident = await env.DB.prepare(
    `SELECT id, name, status FROM users WHERE id = ? AND role = 'resident' ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first<Record<string, unknown>>();
  if (!resident) return error('Resident not found', 404);

  await env.DB.prepare(
    `UPDATE users SET status = 'inactive', updated_at = datetime('now') WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).run();

  // Log the deactivation
  await env.DB.prepare(
    `INSERT INTO resident_changes_log (id, tenant_id, resident_id, changed_by, change_type, field_name, old_value, new_value, reason, comment)
     VALUES (?, ?, ?, ?, 'deactivation', 'status', ?, 'inactive', ?, ?)`
  ).bind(
    generateId(), tenantId || '', params.id, authUser!.id,
    (resident.status as string) || 'active', body.reason, body.comment || null
  ).run();

  await invalidateOnChange('users', env.RATE_LIMITER);
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
  const { results: staff } = await env.DB.prepare(`
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.is_active, u.created_at,
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
    SELECT id, login, name, phone, role, specialization, status, created_at
    FROM users
    WHERE id = ? AND role IN ('admin', 'manager', 'department_head', 'executor', 'director', 'advertiser')
      ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!staff) {
    return error('Staff member not found', 404);
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

  // Hash and update password
  const hashedPassword = await hashPassword(password);
  await env.DB.prepare(`
    UPDATE users SET password_hash = ? WHERE id = ? ${tenantIdReset ? 'AND tenant_id = ?' : ''}
  `).bind(hashedPassword, targetUser.id, ...(tenantIdReset ? [tenantIdReset] : [])).run();

  // Invalidate cache
  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    success: true,
    message: `Password updated for ${targetUser.name}`,
    user: { login: targetUser.login, name: targetUser.name, role: targetUser.role }
  });
});

// Admin: Reset user password by ID — generates temporary password, hashes it, returns once
route('POST', '/api/users/:id/reset-password', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (!isAdminLevel(user)) return error('Access denied', 403);

  const tenantId = getTenantId(request);
  const targetUser = await env.DB.prepare(
    `SELECT id, login, name, role FROM users WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(params.id, ...(tenantId ? [tenantId] : [])).first() as any;

  if (!targetUser) return error('User not found', 404);

  // Generate a temporary password: login + random 6 chars
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const tempPassword = `${targetUser.login}_${randomSuffix}`;

  const passwordHash = await hashPassword(tempPassword);
  await env.DB.prepare(
    `UPDATE users SET password_hash = ? WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}`
  ).bind(passwordHash, targetUser.id, ...(tenantId ? [tenantId] : [])).run();

  await invalidateOnChange('users', env.RATE_LIMITER);

  return json({
    success: true,
    message: `Temporary password set for ${targetUser.name}`,
    temporaryPassword: tempPassword,
    user: { id: targetUser.id, login: targetUser.login, name: targetUser.name, role: targetUser.role }
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
  if (body.password) {
    const hashedPassword = await hashPassword(body.password);
    updates.push('password_hash = ?');
    values.push(hashedPassword);
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
    SELECT id, login, name, phone, role, specialization, status, created_at
    FROM users
    WHERE id = ? ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

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

// POST /api/admin/migrate-passwords removed — password_plain column dropped for security

// Team: Reset passwords for all staff members
// Admin operation to reset staff passwords and return temporary ones
route('POST', '/api/team/reset-all-passwords', async (request, env) => {
  const user = await getUser(request, env);
  if (!user) return error('Unauthorized', 401);
  if (user.role !== 'admin') return error('Only admin can perform this operation', 403);

  // MULTI-TENANCY: Filter by tenant_id
  const tenantId = getTenantId(request);

  const staffRoles = ['manager', 'department_head', 'executor'];
  const { results: staffMembers } = await env.DB.prepare(`
    SELECT id, login, name, role FROM users
    WHERE role IN (?, ?, ?)
    ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(...staffRoles, ...(tenantId ? [tenantId] : [])).all();

  if (!staffMembers || staffMembers.length === 0) {
    return json({ message: 'No staff members found', updated: 0 });
  }

  // Generate and set passwords for each staff member
  const results: { id: string; login: string; name: string; password: string }[] = [];

  for (const staff of staffMembers as any[]) {
    // Generate a password based on login + role first letter + random suffix
    const randomSuffix = Math.random().toString(36).substring(2, 6);
    const newPassword = `${staff.login}${staff.role.charAt(0)}${randomSuffix}`;

    // Hash only — no more password_plain storage
    const hashedPassword = await hashPassword(newPassword);

    await env.DB.prepare(`
      UPDATE users SET password_hash = ? WHERE id = ?
    `).bind(hashedPassword, staff.id).run();

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
    `SELECT id, login, name, phone, role, specialization, branch, is_active
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
    createRequestLogger(request).warn('Access denied to executors list', { role: user.role, userId: user.id });
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

  // Query with statistics from requests table
  // MULTI-TENANCY: Also filter requests stats by tenant_id
  const dataQuery = `
    SELECT
      u.id, u.login, u.name, u.phone, u.role, u.specialization, u.status, u.is_active, u.created_at,
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

  const executor = await env.DB.prepare(`
    SELECT id, login, name, phone, role, specialization, status, created_at
    FROM users
    WHERE id = ? AND role IN ('executor', 'department_head') ${tenantId ? 'AND tenant_id = ?' : ''}
  `).bind(params.id, ...(tenantId ? [tenantId] : [])).first();

  if (!executor) {
    return error('Executor not found', 404);
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


} // end registerUserRoutes
