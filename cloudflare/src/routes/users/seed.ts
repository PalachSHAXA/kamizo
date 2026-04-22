// Seed routes: initial data seeding, demo tenant creation
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getCacheStats } from '../../cache';
import { json, error, generateId } from '../../utils/helpers';
import { hashPassword } from '../../utils/crypto';
import { isSuperAdmin } from '../../index';

export function registerSeedRoutes() {

// Cache stats endpoint
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
    // Super admin account (password: admin123)
    { login: 'superadmin', password: 'admin123', name: 'Super Administrator', role: 'super_admin', phone: '+998900000000' },
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
    const passwordHash = await hashPassword(u.password);

    // Check if exists
    const existing = await env.DB.prepare('SELECT id, password_hash FROM users WHERE login = ?').bind(u.login).first() as any;
    if (existing) {
      // Update password hash and role (fixes bcrypt -> PBKDF2 migration)
      await env.DB.prepare(
        `UPDATE users SET password_hash = ?, role = ?, name = ?, updated_at = datetime('now') WHERE id = ?`
      ).bind(passwordHash, u.role, u.name, existing.id).run();
      results.push({ login: u.login, status: 'updated' });
      continue;
    }

    const id = generateId();

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

  // 3. Create demo buildings
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
    { id: generateId(), building_id: building1Id, number: '34', floor: 5, total_area: 72.5, rooms: 3, status: 'occupied', primary_owner_id: resident1.id },
    { id: generateId(), building_id: building1Id, number: '87', floor: 10, total_area: 55.0, rooms: 2, status: 'occupied', primary_owner_id: resident2.id },
    { id: generateId(), building_id: building1Id, number: '112', floor: 12, total_area: 95.0, rooms: 4, status: 'rented' },
    { id: generateId(), building_id: building1Id, number: '56', floor: 7, total_area: 48.0, rooms: 2, status: 'vacant' },
    { id: generateId(), building_id: building2Id, number: '23', floor: 4, total_area: 68.0, rooms: 3, status: 'occupied', primary_owner_id: resident3.id },
    { id: generateId(), building_id: building2Id, number: '15', floor: 3, total_area: 42.0, rooms: 1, status: 'occupied', primary_owner_id: findDemoUser('demo-resident5').id },
    { id: generateId(), building_id: building2Id, number: '41', floor: 7, total_area: 85.0, rooms: 4, status: 'vacant' },
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

  // 5. Create rental apartment
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

  // 8. Create demo requests
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

  // 12. Create past completed meeting
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
    { id: generateId(), cat: catGroceries, name_ru: 'Соль поваренная 1 кг', name_uz: 'Osh tuzi 1 kg', price: 5000, stock: 200, desc_ru: 'Мелкая поваренная соль высшего сорта', desc_uz: 'Oliy navli mayda osh tuzi', image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Сахар белый 1 кг', name_uz: 'Oq shakar 1 kg', price: 14000, stock: 150, desc_ru: 'Рафинированный белый сахар-песок', desc_uz: 'Tozalangan oq shakar', image: 'https://images.unsplash.com/photo-1595568139907-d42f4c2c4e63?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Масло подсолнечное 1л', name_uz: 'Kungaboqar yog\'i 1l', price: 28000, stock: 80, desc_ru: 'Рафинированное подсолнечное масло для жарки и салатов', desc_uz: 'Tozalangan kungaboqar yog\'i', image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Рис девзира 1 кг', name_uz: 'Devzira guruch 1 kg', price: 32000, stock: 100, desc_ru: 'Узбекский рис девзира для плова', desc_uz: 'Palov uchun o\'zbek devzira guruchi', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Макароны спагетти 500г', name_uz: 'Spagetti makaron 500g', price: 12000, stock: 120, desc_ru: 'Макаронные изделия из твёрдых сортов пшеницы', desc_uz: 'Qattiq bug\'doydan tayyorlangan makaron', image: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Мука пшеничная 2 кг', name_uz: 'Bug\'doy uni 2 kg', price: 18000, stock: 90, desc_ru: 'Мука высшего сорта для выпечки', desc_uz: 'Oliy navli pishirish uchun un', image: 'https://images.unsplash.com/photo-1574323347407-f5e1ad7d3136?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catGroceries, name_ru: 'Чай зелёный 100 пакетиков', name_uz: 'Yashil choy 100 paket', price: 25000, old_price: 32000, stock: 60, desc_ru: 'Ароматный зелёный чай в пакетиках', desc_uz: 'Xushbo\'y yashil choy paketlarda', image: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catBeverages, name_ru: 'Вода питьевая 5л', name_uz: 'Ichimlik suvi 5l', price: 10000, stock: 200, desc_ru: 'Очищенная питьевая вода в бутылке', desc_uz: 'Tozalangan ichimlik suvi', image: 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catBeverages, name_ru: 'Сок апельсиновый 1л', name_uz: 'Apelsin sharbati 1l', price: 18000, stock: 50, desc_ru: 'Натуральный апельсиновый сок прямого отжима', desc_uz: 'Tabiiy apelsin sharbati', image: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catBeverages, name_ru: 'Молоко 3.2% 1л', name_uz: 'Sut 3.2% 1l', price: 16000, stock: 40, desc_ru: 'Пастеризованное молоко 3.2% жирности', desc_uz: 'Pasterizatsiya qilingan sut 3.2%', image: 'https://images.unsplash.com/photo-1563636619-e9143da7973b?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Шампунь для волос 400мл', name_uz: 'Soch uchun shampun 400ml', price: 35000, old_price: 42000, stock: 45, desc_ru: 'Питательный шампунь для всех типов волос с кератином', desc_uz: 'Barcha turdagi sochlar uchun oziqlantiruvchi shampun', image: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Гель для душа 500мл', name_uz: 'Dush uchun gel 500ml', price: 30000, stock: 60, desc_ru: 'Увлажняющий гель для душа с алоэ вера', desc_uz: 'Aloe vera bilan namlantiruvchi dush geli', image: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Мыло жидкое 300мл', name_uz: 'Suyuq sovun 300ml', price: 15000, stock: 80, desc_ru: 'Антибактериальное жидкое мыло для рук', desc_uz: 'Qo\'llar uchun antibakterial suyuq sovun', image: 'https://images.unsplash.com/photo-1584305574647-0cc949a2bb9e?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Зубная паста 100мл', name_uz: 'Tish pastasi 100ml', price: 22000, stock: 70, desc_ru: 'Отбеливающая зубная паста с фтором', desc_uz: 'Ftorli oqartiruvchi tish pastasi', image: 'https://images.unsplash.com/photo-1559590086-c3f5b0891609?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Дезодорант спрей 150мл', name_uz: 'Dezodorant sprey 150ml', price: 28000, stock: 55, desc_ru: 'Дезодорант-антиперспирант 48 часов защиты', desc_uz: '48 soatlik himoya dezodorant-antiperspirant', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPersonalCare, name_ru: 'Туалетная бумага 12 рулонов', name_uz: 'Hojatxona qog\'ozi 12 rulon', price: 38000, old_price: 45000, stock: 100, desc_ru: 'Трёхслойная мягкая туалетная бумага', desc_uz: 'Uch qatlamli yumshoq hojatxona qog\'ozi', image: 'https://images.unsplash.com/photo-1584556812952-905ffd0c611a?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catCleaning, name_ru: 'Средство для мытья посуды 500мл', name_uz: 'Idish yuvish vositasi 500ml', price: 18000, stock: 90, desc_ru: 'Концентрированное средство с ароматом лимона', desc_uz: 'Limon xushbo\'yidagi konsentrlangan vosita', image: 'https://images.unsplash.com/photo-1556909172-8c2f041fca1e?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catCleaning, name_ru: 'Стиральный порошок 3 кг', name_uz: 'Kir yuvish kukuni 3 kg', price: 55000, old_price: 65000, stock: 40, desc_ru: 'Универсальный стиральный порошок для белого и цветного белья', desc_uz: 'Oq va rangli kiyimlar uchun universal kir yuvish kukuni', image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catCleaning, name_ru: 'Средство для мытья полов 1л', name_uz: 'Pol yuvish vositasi 1l', price: 22000, stock: 65, desc_ru: 'Универсальное средство для мытья полов и кафеля', desc_uz: 'Pol va kafel uchun universal yuvish vositasi', image: 'https://images.unsplash.com/photo-1585421514284-efb74c2b69ba?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catCleaning, name_ru: 'Средство для стёкол 500мл', name_uz: 'Oyna uchun vosita 500ml', price: 15000, stock: 75, desc_ru: 'Средство для мытья стёкол и зеркал без разводов', desc_uz: 'Oyna va ko\'zgularni dog\'siz yuvish vositasi', image: 'https://images.unsplash.com/photo-1528740561666-dc2479dc08ab?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catHousehold, name_ru: 'Мусорные пакеты 120л (10 шт)', name_uz: 'Chiqindi paketlari 120l (10 dona)', price: 15000, stock: 50, desc_ru: 'Прочные мусорные пакеты для больших контейнеров', desc_uz: 'Katta idishlar uchun mustahkam chiqindi paketlari', image: 'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catHousehold, name_ru: 'Губки для посуды (5 шт)', name_uz: 'Idish yuvish shimgichlari (5 dona)', price: 8000, stock: 120, desc_ru: 'Набор кухонных губок с абразивной стороной', desc_uz: 'Abraziv tomoni bor oshxona shimgichlari to\'plami', image: 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catHousehold, name_ru: 'Перчатки резиновые (пара)', name_uz: 'Rezina qo\'lqoplar (juft)', price: 10000, stock: 100, desc_ru: 'Хозяйственные перчатки для уборки', desc_uz: 'Tozalash uchun xo\'jalik qo\'lqoplari', image: 'https://images.unsplash.com/photo-1584820927498-cfe5211fd8bf?w=400&h=400&fit=crop&auto=format&q=80' },
    { id: generateId(), cat: catPlumbing, name_ru: 'Смеситель для кухни', name_uz: 'Oshxona uchun aralashtirgich', price: 185000, old_price: 220000, stock: 8, desc_ru: 'Однорычажный смеситель из нержавеющей стали с гибким изливом', desc_uz: 'Zanglamaydigan po\'latdan yasalgan tutqichli aralashtirgich', image: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&h=400&fit=crop&auto=format&q=80', featured: true },
    { id: generateId(), cat: catPlumbing, name_ru: 'Гибкая подводка 1/2" 80см', name_uz: 'Egiluvchan quvur 1/2" 80sm', price: 12000, stock: 100, desc_ru: 'Надёжная подводка для подключения смесителей и бачков', desc_uz: 'Aralashtirgich va bachokni ulash uchun ishonchli quvur', image: 'https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400&h=400&fit=crop&auto=format&q=80' },
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

  // 15. Create demo notes
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

  // 16. Create additional QR codes
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

} // end registerSeedRoutes
