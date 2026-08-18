import { demoId } from './ids';
import { demoRoleManifest } from './manifest';
import { DEMO_BUILDING_AREAS, DEMO_CARAVAN_MEETING_AGGREGATES } from './scenario';
import type {
  DemoDomainSeeder,
  DemoEntityCounter,
  DemoProvisionContext,
  DemoProvisionResult,
  DemoResultCounters,
} from './types';

const CORE_FEATURES = [
  'requests', 'votes', 'meetings', 'chat', 'announcements',
  'marketplace', 'rentals', 'rental_listings', 'vehicles', 'communal', 'qr', 'advertiser',
  'trainings', 'colleagues', 'notepad',
];

const BATCH_SIZE = 100;

function iso(now: Date, days: number, hours = 0): string {
  return new Date(now.getTime() + (days * 24 + hours) * 60 * 60 * 1000).toISOString();
}

async function runBatches(db: D1Database, statements: D1PreparedStatement[]): Promise<void> {
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await db.batch(statements.slice(index, index + BATCH_SIZE));
  }
}

async function existingIds(
  db: D1Database,
  table: string,
  ids: string[],
  tenantId: string,
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const result = await db.prepare(
      `SELECT id FROM ${table} WHERE tenant_id = ? AND id IN (${placeholders})`,
    ).bind(tenantId, ...batch).all<{ id: string }>();
    for (const row of result.results) existing.add(row.id);
  }
  return existing;
}

async function upsertEntity(
  context: DemoProvisionContext,
  table: string,
  ids: string[],
  statements: D1PreparedStatement[],
): Promise<DemoEntityCounter> {
  const existing = await existingIds(context.db, table, ids, context.tenantId);
  await runBatches(context.db, statements);
  return { created: ids.length - existing.size, updated: existing.size };
}

function mergeFeatures(raw: string | null | undefined): string {
  let current: string[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) current = parsed.filter((value): value is string => typeof value === 'string');
    } catch {
      current = [];
    }
  }
  return JSON.stringify(Array.from(new Set([...current, ...CORE_FEATURES])));
}

export async function provisionDemoCore(context: DemoProvisionContext): Promise<DemoProvisionResult> {
  if (context.tenantSlug !== 'demo') throw new Error('Demo provisioning requires the exact demo slug');

  const tenant = await context.db.prepare(
    'SELECT id, features FROM tenants WHERE id = ? AND slug = ?',
  ).bind(context.tenantId, context.tenantSlug).first<{ id: string; features: string | null }>();
  if (!tenant) throw new Error('Demo tenant not found');

  const counters: DemoResultCounters = {};
  const now = context.now.toISOString();
  await context.db.prepare(`
    UPDATE tenants SET
      name = ?, url = ?, admin_url = ?, color = ?, color_secondary = ?, plan = ?,
      features = ?, is_demo = 1, is_active = 1, updated_at = ?
    WHERE id = ? AND slug = ?
  `).bind(
    'Kamizo Demo', 'https://demo.kamizo.uz', 'https://demo.kamizo.uz/admin',
    '#f97316', '#fb923c', 'enterprise', mergeFeatures(tenant.features), now,
    context.tenantId, context.tenantSlug,
  ).run();
  counters.tenant = { created: 0, updated: 1 };

  const logins = demoRoleManifest.map((role) => role.login);
  const loginPlaceholders = logins.map(() => '?').join(',');
  const existingUsersResult = await context.db.prepare(`
    SELECT id, login FROM users
    WHERE tenant_id = ? AND login IN (${loginPlaceholders})
  `).bind(context.tenantId, ...logins).all<{ id: string; login: string }>();
  const existingUsers = new Map(existingUsersResult.results.map((user) => [user.login, user.id]));
  const userIds = new Map<string, string>();
  const userStatements: D1PreparedStatement[] = [];
  let usersCreated = 0;
  let usersUpdated = 0;

  for (const descriptor of demoRoleManifest) {
    const existingId = existingUsers.get(descriptor.login);
    const id = existingId ?? await demoId(context.tenantId, `user:${descriptor.roleKey}`);
    userIds.set(descriptor.roleKey, id);
    if (existingId) {
      usersUpdated += 1;
      userStatements.push(context.db.prepare(`
        UPDATE users SET name = ?, role = ?, specialization = ?, is_active = 1, updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(descriptor.name, descriptor.role, descriptor.specialization, now, id, context.tenantId));
    } else {
      usersCreated += 1;
      const passwordHash = await context.createPasswordHash();
      const phone = `+99890${String(1200000 + descriptor.order).padStart(7, '0')}`;
      userStatements.push(context.db.prepare(`
        INSERT INTO users
          (id, login, phone, password_hash, name, role, specialization, is_active, tenant_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name, role = excluded.role, specialization = excluded.specialization,
          is_active = 1, updated_at = excluded.updated_at
        WHERE users.tenant_id = excluded.tenant_id
      `).bind(
        id, descriptor.login, phone, passwordHash, descriptor.name, descriptor.role,
        descriptor.specialization, context.tenantId, now, now,
      ));
    }
  }
  await runBatches(context.db, userStatements);

  const primaryResidentId = userIds.get('resident')!;
  const secondaryResidentId = await demoId(context.tenantId, 'actor:resident-secondary');
  const secondaryLogin = 'demo-resident-2';
  const secondaryName = 'Малика Абдуллаева';
  let secondaryResident = await context.db.prepare(`
    SELECT id, login, name, role FROM users
    WHERE tenant_id = ? AND (id = ? OR login = ?)
    LIMIT 1
  `).bind(context.tenantId, secondaryResidentId, secondaryLogin)
    .first<{ id: string; login: string; name: string; role: string }>();
  if (secondaryResident
    && (secondaryResident.id !== secondaryResidentId
      || secondaryResident.login !== secondaryLogin
      || secondaryResident.role !== 'resident')) {
    throw new Error('Demo secondary resident conflict');
  }
  if (!secondaryResident) {
    const passwordHash = await context.createPasswordHash();
    await context.db.prepare(`
      INSERT INTO users
        (id, login, phone, password_hash, name, role, is_active, tenant_id, created_at, updated_at)
      VALUES (?, ?, '+998901299999', ?, ?, 'resident', 1, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `).bind(secondaryResidentId, secondaryLogin, passwordHash, secondaryName, context.tenantId, now, now).run();
    secondaryResident = await context.db.prepare(`
      SELECT id, login, name, role FROM users
      WHERE tenant_id = ? AND id = ? AND login = ? AND role = 'resident'
      LIMIT 1
    `).bind(context.tenantId, secondaryResidentId, secondaryLogin)
      .first<{ id: string; login: string; name: string; role: string }>();
    if (!secondaryResident) throw new Error('Demo secondary resident conflict');
    usersCreated += 1;
  } else {
    await context.db.prepare(`
      UPDATE users SET name = ?, is_active = 1, updated_at = ?
      WHERE id = ? AND login = ? AND role = 'resident' AND tenant_id = ?
    `).bind(secondaryName, now, secondaryResidentId, secondaryLogin, context.tenantId).run();
    secondaryResident.name = secondaryName;
    usersUpdated += 1;
  }
  counters.users = { created: usersCreated, updated: usersUpdated };

  const directorId = userIds.get('director')!;
  const managerId = userIds.get('manager')!;
  const executorId = userIds.get('executor')!;
  const electricianId = userIds.get('electrician')!;
  const securityId = userIds.get('security')!;
  const tenantUserId = userIds.get('tenant')!;

  const buildingIds = await Promise.all([
    demoId(context.tenantId, 'building:caravan'),
    demoId(context.tenantId, 'building:mirzo'),
  ]);
  const buildings = [
    { id: buildingIds[0], name: 'ЖК Caravan City', address: 'ул. Бобура, 24', floors: 12, totalArea: DEMO_BUILDING_AREAS.caravan, year: 2022 },
    { id: buildingIds[1], name: 'ЖК Mirzo Residence', address: 'ул. Мирзо Улугбека, 55', floors: 9, totalArea: DEMO_BUILDING_AREAS.mirzo, year: 2023 },
  ];
  counters.buildings = await upsertEntity(context, 'buildings', buildingIds, buildings.map((building) =>
    context.db.prepare(`
      INSERT INTO buildings
        (id, name, address, branch_code, floors, entrances_count, apartments_count, total_area,
         year_built, building_type, has_elevator, elevator_count, has_gas, has_hot_water,
         has_intercom, has_video_surveillance, has_playground, manager_id, manager_name,
         residents_count, residential_area, created_at, updated_at, tenant_id)
      VALUES (?, ?, ?, 'YS', ?, 1, 3, ?, ?, 'monolith', 1, 1, 1, 1, 1, 1, 1, ?, ?, 3, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name, address=excluded.address, floors=excluded.floors,
        entrances_count=excluded.entrances_count, apartments_count=excluded.apartments_count,
        total_area=excluded.total_area, residential_area=excluded.residential_area, year_built=excluded.year_built,
        manager_id=excluded.manager_id, manager_name=excluded.manager_name,
        updated_at=excluded.updated_at
      WHERE buildings.tenant_id=excluded.tenant_id
    `).bind(
      building.id, building.name, building.address, building.floors, building.totalArea,
      building.year, managerId, demoRoleManifest.find((role) => role.roleKey === 'manager')!.name,
       building.totalArea, now, now, context.tenantId,
     ),
  ));

  const entranceIds = await Promise.all([
    demoId(context.tenantId, 'entrance:caravan:1'),
    demoId(context.tenantId, 'entrance:mirzo:1'),
  ]);
  counters.entrances = await upsertEntity(context, 'entrances', entranceIds, entranceIds.map((id, index) =>
    context.db.prepare(`
      INSERT INTO entrances
        (id, building_id, number, floors_from, floors_to, apartments_from, apartments_to,
         has_elevator, intercom_type, notes, created_at, updated_at, tenant_id)
      VALUES (?, ?, 1, 1, ?, ?, ?, 1, 'smart', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        building_id=excluded.building_id, floors_to=excluded.floors_to,
        apartments_from=excluded.apartments_from, apartments_to=excluded.apartments_to,
        notes=excluded.notes, updated_at=excluded.updated_at
      WHERE entrances.tenant_id=excluded.tenant_id
    `).bind(
      id, buildingIds[index], buildings[index].floors, index === 0 ? 49 : 201,
      index === 0 ? 51 : 203, `Презентационный подъезд ${buildings[index].name}`,
      now, now, context.tenantId,
    ),
  ));

  const apartmentSpecs = [
    { key: 'caravan:49', building: 0, number: '49', floor: 7, area: 49, rooms: 2, owner: primaryResidentId },
    { key: 'caravan:17', building: 0, number: '17', floor: 3, area: 17, rooms: 1, owner: secondaryResident.id },
    { key: 'caravan:51', building: 0, number: '51', floor: 8, area: 42, rooms: 2, owner: null },
    { key: 'mirzo:201', building: 1, number: '201', floor: 7, area: 72, rooms: 3, owner: tenantUserId },
    { key: 'mirzo:202', building: 1, number: '202', floor: 7, area: 56, rooms: 2, owner: null },
    { key: 'mirzo:203', building: 1, number: '203', floor: 7, area: 63, rooms: 3, owner: null },
  ];
  const apartmentIds = await Promise.all(apartmentSpecs.map((apartment) => demoId(context.tenantId, `apartment:${apartment.key}`)));
  counters.apartments = await upsertEntity(context, 'apartments', apartmentIds, apartmentSpecs.map((apartment, index) =>
    context.db.prepare(`
      INSERT INTO apartments
        (id, building_id, entrance_id, number, floor, total_area, rooms, ownership_type,
         ownership_share, status, is_commercial, is_basement, is_parking, primary_owner_id,
         created_at, updated_at, tenant_id, property_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'private', 1, 'occupied', 0, 0, 0, ?, ?, ?, ?, 'non_commercial')
      ON CONFLICT(id) DO UPDATE SET
        building_id=excluded.building_id, entrance_id=excluded.entrance_id, number=excluded.number,
        floor=excluded.floor, total_area=excluded.total_area, rooms=excluded.rooms,
        status=excluded.status, is_commercial=excluded.is_commercial,
        is_basement=excluded.is_basement, is_parking=excluded.is_parking,
        primary_owner_id=excluded.primary_owner_id,
        updated_at=excluded.updated_at, property_type=excluded.property_type
      WHERE apartments.tenant_id=excluded.tenant_id
    `).bind(
      apartmentIds[index], buildingIds[apartment.building], entranceIds[apartment.building],
      apartment.number, apartment.floor, apartment.area, apartment.rooms, apartment.owner,
      now, now, context.tenantId,
    ),
  ));

  await runBatches(context.db, [
    context.db.prepare(`
      UPDATE users SET building_id=?, building=?, address=?, apartment='49', entrance='1', floor='7', total_area=49, updated_at=?
      WHERE id=? AND tenant_id=?
    `).bind(buildingIds[0], buildings[0].name, buildings[0].address, now, primaryResidentId, context.tenantId),
    context.db.prepare(`
      UPDATE users SET building_id=?, building=?, address=?, apartment='17', entrance='1', floor='3', total_area=17, updated_at=?
      WHERE id=? AND tenant_id=?
    `).bind(buildingIds[0], buildings[0].name, buildings[0].address, now, secondaryResident.id, context.tenantId),
    context.db.prepare(`
      UPDATE users SET building_id=?, building=?, address=?, apartment='201', entrance='1', floor='7', total_area=72, updated_at=?
      WHERE id=? AND tenant_id=?
    `).bind(buildingIds[1], buildings[1].name, buildings[1].address, now, tenantUserId, context.tenantId),
  ]);

  const categorySpecs = [
    { key: 'plumber', ru: 'Сантехника', uz: 'Santexnika', icon: 'wrench', specialization: 'plumber' },
    { key: 'electrician', ru: 'Электрика', uz: 'Elektrika', icon: 'zap', specialization: 'electrician' },
    { key: 'elevator', ru: 'Лифт', uz: 'Lift', icon: 'arrow-up-down', specialization: 'general' },
    { key: 'security', ru: 'Безопасность', uz: 'Xavfsizlik', icon: 'shield', specialization: 'security' },
  ];
  const categoryIds = await Promise.all(categorySpecs.map((category) => demoId(context.tenantId, `category:${category.key}`)));
  counters.categories = await upsertEntity(context, 'categories', categoryIds, categorySpecs.map((category, index) =>
    context.db.prepare(`
      INSERT INTO categories (id,name_ru,name_uz,icon,specialization,is_active,tenant_id)
      VALUES (?,?,?,?,?,1,?)
      ON CONFLICT(id) DO UPDATE SET
        name_ru=excluded.name_ru, name_uz=excluded.name_uz, icon=excluded.icon,
        specialization=excluded.specialization, is_active=1
      WHERE categories.tenant_id=excluded.tenant_id
    `).bind(categoryIds[index], category.ru, category.uz, category.icon, category.specialization, context.tenantId),
  ));

  const requestSpecs = [
    { status: 'new', category: 0, resident: primaryResidentId, executor: null, title: 'Замена счётчика воды', priority: 'medium', days: 0 },
    { status: 'assigned', category: 2, resident: secondaryResident.id, executor: executorId, title: 'Диагностика лифта', priority: 'high', days: -1 },
    { status: 'accepted', category: 1, resident: primaryResidentId, executor: electricianId, title: 'Проверка электрощита', priority: 'high', days: -2 },
    { status: 'in_progress', category: 0, resident: secondaryResident.id, executor: executorId, title: 'Протечка в ванной', priority: 'urgent', days: -3 },
    { status: 'pending_approval', category: 3, resident: primaryResidentId, executor: securityId, title: 'Настройка камеры у входа', priority: 'medium', days: -5 },
    { status: 'completed', category: 1, resident: secondaryResident.id, executor: electricianId, title: 'Замена освещения в холле', priority: 'low', days: -8 },
    { status: 'cancelled', category: 2, resident: primaryResidentId, executor: null, title: 'Шум лифта ночью', priority: 'medium', days: -4 },
  ];
  const requestIds = await Promise.all(requestSpecs.map((request) => demoId(context.tenantId, `request:${request.status}`)));
  counters.requests = await upsertEntity(context, 'requests', requestIds, requestSpecs.map((request, index) => {
    const createdAt = iso(context.now, request.days);
    const startedAt = ['in_progress', 'pending_approval', 'completed'].includes(request.status) ? iso(context.now, request.days, 2) : null;
    const completedAt = ['pending_approval', 'completed'].includes(request.status) ? iso(context.now, request.days, 6) : null;
    return context.db.prepare(`
      INSERT INTO requests
        (id,number,request_number,resident_id,category_id,title,description,priority,status,
         executor_id,assigned_by,started_at,completed_at,rating,feedback,
         created_at,updated_at,tenant_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        resident_id=excluded.resident_id, category_id=excluded.category_id, title=excluded.title,
        description=excluded.description
      WHERE requests.tenant_id=excluded.tenant_id
    `).bind(
      requestIds[index], 2001 + index, `DEMO-${2001 + index}`, request.resident,
      categoryIds[request.category], request.title, `${request.title}. Демонстрационная заявка.`,
      request.priority, request.status, request.executor, managerId, startedAt, completedAt,
      request.status === 'completed' ? 5 : null,
       request.status === 'completed' ? 'Работа выполнена качественно' : null,
       createdAt, now, context.tenantId,
    );
  }));

  const meetingIds = await Promise.all([
    demoId(context.tenantId, 'meeting:active'),
    demoId(context.tenantId, 'meeting:historical'),
  ]);
  const protocolId = await demoId(context.tenantId, 'meeting:historical:protocol');
  const activeMeetingAggregate = DEMO_CARAVAN_MEETING_AGGREGATES.active;
  const historicalMeetingAggregate = DEMO_CARAVAN_MEETING_AGGREGATES.historical;
  const meetingSpecs = [
    {
      id: meetingIds[0], number: 1, status: 'voting_open', description: 'Благоустройство двора и ремонт подъезда',
      confirmed: iso(context.now, 2), ...activeMeetingAggregate,
      legacy: { votedArea: 49, eligibleCount: 2, participatedCount: 1 },
      protocol: null, opened: iso(context.now, -1), closed: null, approved: null,
    },
    {
      id: meetingIds[1], number: 2, status: 'protocol_approved', description: 'Утверждение годового плана обслуживания',
      confirmed: iso(context.now, -45), ...historicalMeetingAggregate,
      legacy: { votedArea: 66, eligibleCount: 2, participatedCount: 2 },
      protocol: protocolId, opened: iso(context.now, -47), closed: iso(context.now, -44), approved: iso(context.now, -43),
    },
  ];
  counters.meetings = await upsertEntity(context, 'meetings', meetingIds, meetingSpecs.map((meeting) => {
    const legacySignature = `meetings.total_area=108 AND meetings.voted_area=${meeting.legacy.votedArea} AND meetings.total_eligible_count=${meeting.legacy.eligibleCount} AND meetings.participated_count=${meeting.legacy.participatedCount}`;
    const effectiveVotedArea = `CASE WHEN ${legacySignature} THEN excluded.voted_area ELSE meetings.voted_area END`;
    return context.db.prepare(`
      INSERT INTO meetings
        (id,number,building_id,building_address,description,organizer_type,organizer_id,
         organizer_name,format,status,confirmed_date_time,location,voting_unit,quorum_percent,
         allow_revote,require_otp,total_area,voted_area,total_eligible_count,participated_count,
         quorum_reached,participation_percent,voting_opened_at,voting_closed_at,
         results_published_at,protocol_id,protocol_generated_at,protocol_approved_at,
         created_at,updated_at,tenant_id)
      VALUES (?,?,?,?,?,'uk',?,?,'hybrid',?,?,?,'apartment',50,1,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        building_id=excluded.building_id, building_address=excluded.building_address,
        description=excluded.description, organizer_id=excluded.organizer_id,
        organizer_name=excluded.organizer_name, location=excluded.location,
        total_area=excluded.total_area,
        voted_area=${effectiveVotedArea},
        total_eligible_count=CASE WHEN ${legacySignature} THEN excluded.total_eligible_count ELSE meetings.total_eligible_count END,
        participated_count=CASE WHEN ${legacySignature} THEN excluded.participated_count ELSE meetings.participated_count END,
        quorum_reached=CASE WHEN (${effectiveVotedArea}) * 100.0 / excluded.total_area >= excluded.quorum_percent THEN 1 ELSE 0 END,
        participation_percent=ROUND((${effectiveVotedArea}) * 100.0 / excluded.total_area, 2)
      WHERE meetings.tenant_id=excluded.tenant_id
    `).bind(
      meeting.id, meeting.number, buildingIds[0], buildings[0].address, meeting.description,
      directorId, demoRoleManifest[0].name, meeting.status, meeting.confirmed,
      'Актовый зал, 1 этаж', DEMO_BUILDING_AREAS.caravan, meeting.votedArea,
      meeting.eligibleCount, meeting.participatedCount, meeting.quorumReached,
      meeting.participationPercent, meeting.opened, meeting.closed, meeting.closed, meeting.protocol,
      meeting.protocol ? meeting.closed : null, meeting.approved,
      meeting.status === 'voting_open' ? iso(context.now, -7) : iso(context.now, -50),
      now, context.tenantId,
    );
  }));

  const agendaSpecs = [
    { meeting: 0, order: 1, key: 'yard', title: 'Благоустройство двора', approved: 0, forArea: 3400, againstArea: 1000, abstainArea: 478, legacy: [49, 0, 0] },
    { meeting: 0, order: 2, key: 'entrance', title: 'Ремонт входной группы', approved: 0, forArea: 2200, againstArea: 2200, abstainArea: 478, legacy: [0, 49, 0] },
    { meeting: 1, order: 1, key: 'budget', title: 'Утверждение бюджета', approved: 1, forArea: 6000, againstArea: 1100, abstainArea: 488, legacy: [66, 0, 0] },
    { meeting: 1, order: 2, key: 'service', title: 'План технического обслуживания', approved: 1, forArea: 5200, againstArea: 1800, abstainArea: 588, legacy: [66, 0, 0] },
  ];
  const agendaIds = await Promise.all(agendaSpecs.map((agenda) => demoId(context.tenantId, `agenda:${agenda.meeting}:${agenda.key}`)));
  counters.agendaItems = await upsertEntity(context, 'meeting_agenda_items', agendaIds, agendaSpecs.map((agenda, index) => {
    const legacySignature = `meeting_agenda_items.votes_for_area=${agenda.legacy[0]} AND meeting_agenda_items.votes_against_area=${agenda.legacy[1]} AND meeting_agenda_items.votes_abstain_area=${agenda.legacy[2]}`;
    return context.db.prepare(`
      INSERT INTO meeting_agenda_items
        (id,meeting_id,item_order,title,description,threshold,is_approved,
         votes_for_area,votes_against_area,votes_abstain_area,tenant_id,created_at)
      VALUES (?,?,?,?,?,'simple_majority',?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, description=excluded.description,
        votes_for_area=CASE WHEN ${legacySignature} THEN excluded.votes_for_area ELSE meeting_agenda_items.votes_for_area END,
        votes_against_area=CASE WHEN ${legacySignature} THEN excluded.votes_against_area ELSE meeting_agenda_items.votes_against_area END,
        votes_abstain_area=CASE WHEN ${legacySignature} THEN excluded.votes_abstain_area ELSE meeting_agenda_items.votes_abstain_area END
      WHERE meeting_agenda_items.tenant_id=excluded.tenant_id
    `).bind(
      agendaIds[index], meetingIds[agenda.meeting], agenda.order, agenda.title,
      `${agenda.title}: материалы и решение для презентации.`, agenda.approved,
      agenda.forArea, agenda.againstArea, agenda.abstainArea,
      context.tenantId, agenda.meeting === 0 ? iso(context.now, -7) : iso(context.now, -50),
    );
  }));

  const voterSpecs = [
    { meeting: 0, user: primaryResidentId, apartment: apartmentIds[0], weight: 49, voted: 1 },
    { meeting: 0, user: secondaryResident.id, apartment: apartmentIds[1], weight: 17, voted: 0 },
    { meeting: 1, user: primaryResidentId, apartment: apartmentIds[0], weight: 49, voted: 1 },
    { meeting: 1, user: secondaryResident.id, apartment: apartmentIds[1], weight: 17, voted: 1 },
  ];
  const eligibleIds = await Promise.all(voterSpecs.map((voter) =>
    demoId(context.tenantId, `eligible:${voter.meeting}:${voter.user}`)));
  counters.eligibleVoters = await upsertEntity(context, 'meeting_eligible_voters', eligibleIds, voterSpecs.map((voter, index) =>
    context.db.prepare(`
      INSERT INTO meeting_eligible_voters
        (id,meeting_id,user_id,apartment_id,voting_weight,has_voted,created_at,tenant_id)
       VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         apartment_id=excluded.apartment_id, voting_weight=excluded.voting_weight
       WHERE meeting_eligible_voters.tenant_id=excluded.tenant_id
    `).bind(
       eligibleIds[index], meetingIds[voter.meeting], voter.user, voter.apartment,
       voter.weight, voter.voted, voter.meeting === 0 ? iso(context.now, -7) : iso(context.now, -50),
       context.tenantId,
    ),
  ));

  const participationSpecs = [
    { meeting: 0, user: primaryResidentId, date: iso(context.now, -1) },
    { meeting: 1, user: primaryResidentId, date: iso(context.now, -45) },
    { meeting: 1, user: secondaryResident.id, date: iso(context.now, -45, 1) },
  ];
  const participationIds = await Promise.all(participationSpecs.map((item) =>
    demoId(context.tenantId, `participated:${item.meeting}:${item.user}`)));
  counters.participatedVoters = await upsertEntity(context, 'meeting_participated_voters', participationIds, participationSpecs.map((item, index) =>
    context.db.prepare(`
      INSERT INTO meeting_participated_voters
        (id,meeting_id,user_id,participation_type,participated_at,tenant_id)
       VALUES (?,?,?,'online',?,?)
       ON CONFLICT(id) DO NOTHING
     `).bind(participationIds[index], meetingIds[item.meeting], item.user, item.date, context.tenantId),
  ));

  const voteSpecs = [
    { meeting: 0, agenda: 0, user: primaryResidentId, apartment: 0, number: '49', name: demoRoleManifest[2].name, weight: 49, choice: 'for', date: iso(context.now, -1) },
    { meeting: 0, agenda: 1, user: primaryResidentId, apartment: 0, number: '49', name: demoRoleManifest[2].name, weight: 49, choice: 'against', date: iso(context.now, -1, 1) },
    { meeting: 1, agenda: 2, user: primaryResidentId, apartment: 0, number: '49', name: demoRoleManifest[2].name, weight: 49, choice: 'for', date: iso(context.now, -45) },
    { meeting: 1, agenda: 2, user: secondaryResident.id, apartment: 1, number: '17', name: secondaryResident.name, weight: 17, choice: 'for', date: iso(context.now, -45, 1) },
    { meeting: 1, agenda: 3, user: primaryResidentId, apartment: 0, number: '49', name: demoRoleManifest[2].name, weight: 49, choice: 'for', date: iso(context.now, -45, 2) },
    { meeting: 1, agenda: 3, user: secondaryResident.id, apartment: 1, number: '17', name: secondaryResident.name, weight: 17, choice: 'for', date: iso(context.now, -45, 3) },
  ];
  const voteIds = await Promise.all(voteSpecs.map((vote) => demoId(context.tenantId, `vote:${vote.meeting}:${vote.agenda}:${vote.user}`)));
  counters.votes = await upsertEntity(context, 'meeting_vote_records', voteIds, voteSpecs.map((vote, index) =>
    context.db.prepare(`
      INSERT INTO meeting_vote_records
        (id,meeting_id,agenda_item_id,user_id,vote,vote_weight,voted_at,voter_id,choice,
         voter_name,apartment_id,apartment_number,ownership_share,is_revote,
         verification_method,otp_verified,vote_hash,tenant_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,'login',1,?,?)
       ON CONFLICT(id) DO NOTHING
    `).bind(
       voteIds[index], meetingIds[vote.meeting], agendaIds[vote.agenda],
       vote.user, vote.choice, vote.weight, vote.date, vote.user, vote.choice, vote.name,
      apartmentIds[vote.apartment], vote.number, 1,
      `demo-${vote.meeting}-${vote.agenda}-${vote.user}`, context.tenantId,
    ),
  ));

  counters.protocols = await upsertEntity(context, 'meeting_protocols', [protocolId], [
    context.db.prepare(`
      INSERT INTO meeting_protocols
        (id,meeting_id,protocol_number,content,decisions,protocol_hash,
         signed_by_uk_user_id,signed_by_uk_name,signed_by_uk_role,signed_by_uk_at,
          uk_signature_hash,created_at,tenant_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
       protocolId, meetingIds[1], 'DEMO-2/2026',
       '# ПРОТОКОЛ №2\nРешения общего собрания собственников ЖК Caravan City.',
       JSON.stringify([{ agendaItemId: agendaIds[2], approved: true }, { agendaItemId: agendaIds[3], approved: true }]),
       'demo-protocol-hash', directorId, demoRoleManifest[0].name, 'director',
      iso(context.now, -43), 'demo-director-signature', iso(context.now, -44), context.tenantId,
    ),
  ]);

  const announcementSpecs = [
    { key: 'residents', type: 'residents', target: 'building', building: buildingIds[0], title: 'Плановые работы во дворе', priority: 'important' },
    { key: 'staff', type: 'employees', target: 'all', building: null, title: 'Планёрка технической службы', priority: 'normal' },
    { key: 'all', type: 'all', target: 'all', building: null, title: 'День открытых дверей Kamizo', priority: 'normal' },
  ];
  const announcementIds = await Promise.all(announcementSpecs.map((announcement) => demoId(context.tenantId, `announcement:${announcement.key}`)));
  counters.announcements = await upsertEntity(context, 'announcements', announcementIds, announcementSpecs.map((announcement, index) =>
    context.db.prepare(`
      INSERT INTO announcements
        (id,title,content,type,target_type,target_building_id,priority,is_active,
         expires_at,created_by,created_at,updated_at,tenant_id)
      VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, content=excluded.content, type=excluded.type,
        target_type=excluded.target_type, target_building_id=excluded.target_building_id
      WHERE announcements.tenant_id=excluded.tenant_id
    `).bind(
      announcementIds[index], announcement.title,
      `${announcement.title}. Подробности доступны в демонстрационном кабинете.`,
      announcement.type, announcement.target, announcement.building, announcement.priority,
      iso(context.now, 30), managerId, iso(context.now, -index - 1), now, context.tenantId,
    ),
  ));

  const channelIds = await Promise.all([
    demoId(context.tenantId, 'chat:building-general'),
    demoId(context.tenantId, 'chat:private-support'),
  ]);
  counters.chatChannels = await upsertEntity(context, 'chat_channels', channelIds, [
    context.db.prepare(`
      INSERT INTO chat_channels
        (id,type,name,description,building_id,resident_id,created_by,created_at,tenant_id)
       VALUES (?,'building_general',?,?,?,NULL,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, building_id=excluded.building_id,
         created_by=excluded.created_by
      WHERE chat_channels.tenant_id=excluded.tenant_id
    `).bind(
       channelIds[0], 'ЖК Caravan City — общий чат', 'Новости дома и общение жителей',
       buildingIds[0], managerId, iso(context.now, -10), context.tenantId,
    ),
    context.db.prepare(`
      INSERT INTO chat_channels
        (id,type,name,description,building_id,resident_id,created_by,created_at,tenant_id)
       VALUES (?,'private_support',?,?,NULL,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, description=excluded.description, resident_id=excluded.resident_id,
         created_by=excluded.created_by
      WHERE chat_channels.tenant_id=excluded.tenant_id
    `).bind(
       channelIds[1], demoRoleManifest[2].name, 'Личный чат с управляющей компанией',
       primaryResidentId, primaryResidentId, iso(context.now, -3), context.tenantId,
    ),
  ]);

  const messageSpecs = [
    { channel: 0, sender: managerId, content: 'Добро пожаловать в общий чат дома.', days: -3, hours: 0 },
    { channel: 0, sender: primaryResidentId, content: 'Когда начнутся работы во дворе?', days: -2, hours: 1 },
    { channel: 0, sender: managerId, content: 'Работы начнутся в понедельник в 9:00.', days: -2, hours: 2 },
    { channel: 1, sender: primaryResidentId, content: 'Нужна помощь с заявкой по счётчику.', days: -1, hours: 0 },
    { channel: 1, sender: managerId, content: 'Заявку увидели, направляем специалиста.', days: -1, hours: 1 },
    { channel: 1, sender: primaryResidentId, content: 'Спасибо, буду ждать звонка.', days: -1, hours: 2 },
  ];
  const messageIds = await Promise.all(messageSpecs.map((message, index) => demoId(context.tenantId, `chat-message:${message.channel}:${index}`)));
  counters.chatMessages = await upsertEntity(context, 'chat_messages', messageIds, messageSpecs.map((message, index) =>
    context.db.prepare(`
      INSERT INTO chat_messages (id,channel_id,sender_id,content,created_at,tenant_id)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(id) DO NOTHING
    `).bind(
      messageIds[index], channelIds[message.channel], message.sender, message.content,
      iso(context.now, message.days, message.hours), context.tenantId,
    ),
  ));

  return { phase: 'core', counters };
}

export const demoCoreSeeder: DemoDomainSeeder = {
  phase: 'core',
  seed: provisionDemoCore,
};
