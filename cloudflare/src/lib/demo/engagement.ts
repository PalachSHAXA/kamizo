import { demoId } from './ids';
import type {
  DemoDomainSeeder,
  DemoEntityCounter,
  DemoProvisionContext,
  DemoProvisionResult,
  DemoResultCounters,
} from './types';

const BATCH_SIZE = 100;

function iso(now: Date, days: number, hours = 0): string {
  return new Date(now.getTime() + (days * 24 + hours) * 60 * 60 * 1000).toISOString();
}

async function existingIds(
  context: DemoProvisionContext,
  table: string,
  ids: readonly string[],
): Promise<Set<string>> {
  const existing = new Set<string>();
  for (let index = 0; index < ids.length; index += BATCH_SIZE) {
    const batch = ids.slice(index, index + BATCH_SIZE);
    const placeholders = batch.map(() => '?').join(',');
    const result = await context.db.prepare(
      `SELECT id FROM ${table} WHERE tenant_id = ? AND id IN (${placeholders})`,
    ).bind(context.tenantId, ...batch).all<{ id: string }>();
    for (const row of result.results) existing.add(row.id);
  }
  return existing;
}

async function insertOnly(
  context: DemoProvisionContext,
  table: string,
  ids: readonly string[],
  statements: D1PreparedStatement[],
): Promise<DemoEntityCounter> {
  const existing = await existingIds(context, table, ids);
  for (let index = 0; index < statements.length; index += BATCH_SIZE) {
    await context.db.batch(statements.slice(index, index + BATCH_SIZE));
  }
  return { created: ids.length - existing.size, updated: existing.size };
}

export async function provisionDemoEngagement(
  context: DemoProvisionContext,
): Promise<DemoProvisionResult> {
  if (context.tenantSlug !== 'demo') throw new Error('Demo provisioning requires the exact demo slug');

  const tenant = await context.db.prepare(
    'SELECT id FROM tenants WHERE id = ? AND slug = ?',
  ).bind(context.tenantId, context.tenantSlug).first<{ id: string }>();
  if (!tenant) throw new Error('Demo tenant not found');

  const requiredLogins = [
    'demo-director', 'demo-manager', '98765432', 'demo-executor',
    'demo-electrician', 'demo-dept-head',
  ] as const;
  const userResult = await context.db.prepare(`
    SELECT id, login, name FROM users
    WHERE tenant_id = ? AND login IN (${requiredLogins.map(() => '?').join(',')})
  `).bind(context.tenantId, ...requiredLogins).all<{ id: string; login: string; name: string }>();
  const users = new Map(userResult.results.map((user) => [user.login, user]));
  for (const login of requiredLogins) {
    if (!users.has(login)) throw new Error(`Demo engagement requires user ${login}`);
  }

  const director = users.get('demo-director')!;
  const manager = users.get('demo-manager')!;
  const resident = users.get('98765432')!;
  const executor = users.get('demo-executor')!;
  const electrician = users.get('demo-electrician')!;
  const departmentHead = users.get('demo-dept-head')!;
  const counters: DemoResultCounters = {};

  const partnerRows = await Promise.all([
    { key: 'training:partner:service', name: 'Kamizo Service Academy', description: 'Практическое обучение эксплуатации жилых комплексов', website: 'https://kamizo.uz' },
    { key: 'training:partner:safety', name: 'Tashkent Safety Lab', description: 'Безопасность инженерных систем и работа с жильцами', website: null },
  ].map(async (row) => ({ ...row, id: await demoId(context.tenantId, row.key) })));
  counters.trainingPartners = await insertOnly(
    context,
    'training_partners',
    partnerRows.map((row) => row.id),
    partnerRows.map((row) => context.db.prepare(`
      INSERT INTO training_partners
        (id,name,description,website,contact_email,contact_phone,is_active,created_at,tenant_id)
      VALUES (?,?,?,?,?,?,1,?,?) ON CONFLICT(id) DO NOTHING
    `).bind(
      row.id, row.name, row.description, row.website, 'academy@kamizo.uz', '+998712001020',
      iso(context.now, -45), context.tenantId,
    )),
  );

  const proposalRows = await Promise.all([
    {
      key: 'training:proposal:completed', partnerId: partnerRows[0].id,
      title: 'Коммуникация с жильцами без конфликтов', category: 'service', status: 'completed',
      start: iso(context.now, -20), end: iso(context.now, -20, 2), location: 'Учебный зал Caravan',
    },
    {
      key: 'training:proposal:scheduled', partnerId: partnerRows[1].id,
      title: 'Безопасная работа с электрооборудованием', category: 'safety', status: 'scheduled',
      start: iso(context.now, 7), end: iso(context.now, 7, 2), location: 'Технический центр Mirzo',
    },
    {
      key: 'training:proposal:pending', partnerId: partnerRows[0].id,
      title: 'Плановое обслуживание инженерных систем', category: 'operations', status: 'pending',
      start: iso(context.now, 14), end: iso(context.now, 14, 2), location: 'Онлайн',
    },
  ].map(async (row) => ({ ...row, id: await demoId(context.tenantId, row.key) })));
  counters.trainingProposals = await insertOnly(
    context,
    'training_proposals',
    proposalRows.map((row) => row.id),
    proposalRows.map((row) => context.db.prepare(`
      INSERT INTO training_proposals
        (id,partner_id,title,description,category,price,duration,max_participants,start_date,end_date,location,status,created_at,tenant_id)
      VALUES (?,?,?,?,?,0,'2 часа',24,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING
    `).bind(
      row.id, row.partnerId, row.title, 'Практический тренинг для команды управляющей компании',
      row.category, row.start, row.end, row.location, row.status, iso(context.now, -30), context.tenantId,
    )),
  );

  const voteRows = await Promise.all([
    { key: 'training:vote:completed:resident', proposalId: proposalRows[0].id, user: resident, vote: 1, date: iso(context.now, -28) },
    { key: 'training:vote:completed:manager', proposalId: proposalRows[0].id, user: manager, vote: 1, date: iso(context.now, -27) },
    { key: 'training:vote:scheduled:resident', proposalId: proposalRows[1].id, user: resident, vote: 1, date: iso(context.now, -5) },
    { key: 'training:vote:scheduled:head', proposalId: proposalRows[1].id, user: departmentHead, vote: 1, date: iso(context.now, -4) },
  ].map(async (row) => ({ ...row, id: await demoId(context.tenantId, row.key) })));
  counters.trainingVotes = await insertOnly(
    context,
    'training_votes',
    voteRows.map((row) => row.id),
    voteRows.map((row) => context.db.prepare(`
      INSERT INTO training_votes (id,proposal_id,user_id,vote,created_at,tenant_id)
      VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING
    `).bind(row.id, row.proposalId, row.user.id, row.vote, row.date, context.tenantId)),
  );

  const registrationRows = await Promise.all([
    { key: 'training:registration:completed:resident', proposalId: proposalRows[0].id, user: resident, attended: 1, feedback: 1, date: iso(context.now, -25) },
    { key: 'training:registration:completed:manager', proposalId: proposalRows[0].id, user: manager, attended: 1, feedback: 1, date: iso(context.now, -24) },
    { key: 'training:registration:scheduled:resident', proposalId: proposalRows[1].id, user: resident, attended: 0, feedback: 0, date: iso(context.now, -3) },
    { key: 'training:registration:scheduled:head', proposalId: proposalRows[1].id, user: departmentHead, attended: 0, feedback: 0, date: iso(context.now, -2) },
  ].map(async (row) => ({ ...row, id: await demoId(context.tenantId, row.key) })));
  counters.trainingRegistrations = await insertOnly(
    context,
    'training_registrations',
    registrationRows.map((row) => row.id),
    registrationRows.map((row) => context.db.prepare(`
      INSERT INTO training_registrations
        (id,proposal_id,user_id,status,registered_at,attended,feedback_submitted,tenant_id)
      VALUES (?,?,?,'registered',?,?,?,?) ON CONFLICT(id) DO NOTHING
    `).bind(row.id, row.proposalId, row.user.id, row.date, row.attended, row.feedback, context.tenantId)),
  );

  const feedbackRows = await Promise.all([
    { key: 'training:feedback:completed:resident', user: resident, rating: 5, comment: 'Полезные техники для спокойного диалога с УК.' },
    { key: 'training:feedback:completed:manager', user: manager, rating: 4, comment: 'Практично, применили рекомендации на следующий день.' },
  ].map(async (row) => ({ ...row, id: await demoId(context.tenantId, row.key) })));
  counters.trainingFeedback = await insertOnly(
    context,
    'training_feedback',
    feedbackRows.map((row) => row.id),
    feedbackRows.map((row) => context.db.prepare(`
      INSERT INTO training_feedback (id,proposal_id,user_id,rating,comment,created_at,tenant_id)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING
    `).bind(row.id, proposalRows[0].id, row.user.id, row.rating, row.comment, iso(context.now, -19), context.tenantId)),
  );

  const ratingRows = await Promise.all([
    { key: 'employee-rating:executor:resident', target: executor, author: resident, rating: 5, comment: 'Спасибо за быстрый ремонт и аккуратную работу.' },
    { key: 'employee-rating:executor:manager', target: executor, author: manager, rating: 5, comment: 'Надёжно ведёт сложные заявки и помогает коллегам.' },
    { key: 'employee-rating:executor:director', target: executor, author: director, rating: 4, comment: 'Стабильно высокий уровень сервиса.' },
    { key: 'employee-rating:electrician:resident', target: electrician, author: resident, rating: 4, comment: 'Подробно объяснил причину неисправности.' },
    { key: 'employee-rating:electrician:manager', target: electrician, author: manager, rating: 5, comment: 'Отличная диагностика и соблюдение сроков.' },
  ].map(async (row) => ({ ...row, id: await demoId(context.tenantId, row.key) })));
  counters.employeeRatings = await insertOnly(
    context,
    'employee_ratings',
    ratingRows.map((row) => row.id),
    ratingRows.map((row, index) => context.db.prepare(`
      INSERT INTO employee_ratings (id,executor_id,request_id,rating,comment,rated_by,created_at,tenant_id)
      VALUES (?,?,NULL,?,?,?,?,?) ON CONFLICT(id) DO NOTHING
    `).bind(
      row.id, row.target.id, row.rating, row.comment, row.author.id, iso(context.now, -index - 1), context.tenantId,
    )),
  );

  const noteOwners = [
    { key: 'director', user: director },
    { key: 'manager', user: manager },
    { key: 'executor', user: executor },
  ];
  const noteTemplates = [
    { title: 'Приоритеты недели', content: 'Проверить открытые заявки и подтвердить ответственных.' },
    { title: 'Встречи', content: 'Подготовить вопросы к планёрке и отметить принятые решения.' },
    { title: 'Напоминание', content: 'Сверить график работ и предупредить жильцов заранее.' },
  ];
  const noteRows = (await Promise.all(noteOwners.flatMap((owner) => noteTemplates.map(async (note, index) => ({
    id: await demoId(context.tenantId, `note:${owner.key}:${index + 1}`),
    user: owner.user,
    title: note.title,
    content: note.content,
    date: iso(context.now, -index, -owner.key.length),
  })))));
  counters.notes = await insertOnly(
    context,
    'notes',
    noteRows.map((row) => row.id),
    noteRows.map((row) => context.db.prepare(`
      INSERT INTO notes (id,user_id,title,content,tenant_id,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING
    `).bind(row.id, row.user.id, row.title, row.content, context.tenantId, row.date, row.date)),
  );

  return { phase: 'engagement', counters };
}

export const demoEngagementSeeder: DemoDomainSeeder = {
  phase: 'engagement',
  seed: provisionDemoEngagement,
};
