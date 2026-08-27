// Кабинет админа УК: подключение и управление домовыми Telegram-группами
// (§6, §19 ТЗ).
//
// Пять эндпоинтов, все требуют фичи 'telegram' у тенанта и роли
// управления:
//   GET    /api/telegram/groups              — список групп тенанта
//   POST   /api/telegram/groups/connect-token — ссылка добавления бота
//   PATCH  /api/telegram/groups/:id          — переключатели и подъезд
//   DELETE /api/telegram/groups/:id          — мягкое отключение
//   GET    /api/telegram/announcements/:id/deliveries — журнал доставки
//
// Само подключение завершает вебхук: Telegram сообщает о добавлении
// бота в группу апдейтом my_chat_member, и только там появляется
// telegram_chat_id. Здесь мы лишь выдаём одноразовый токен.

import {
  route, getUser, getTenantId, requireFeature, isManagement,
  json, error, generateId, generateLinkToken, type Env
} from './helpers';

// Срок жизни токена подключения группы.
//
// Дольше, чем 10 минут у личной привязки: админу надо успеть открыть
// Telegram, найти нужную группу, добавить бота и, возможно, выдать ему
// права. Но не сутки: предъявитель токена привязывает СВОЮ группу к
// дому этой УК, то есть подписывает её на все объявления этого дома.
const GROUP_TOKEN_TTL_MINUTES = 30;

export function registerTelegramGroupRoutes() {

// ──────────────────────────────────────────────────────────────────
// GET /api/telegram/groups
//
// Отдаёт группы ТОЛЬКО своего тенанта. Джойн с buildings тоже
// фильтруется по tenant_id — иначе подменённый building_id в строке
// группы дал бы прочитать адрес чужого дома.
route('GET', '/api/telegram/groups', async (request, env) => {
  const fc = await requireFeature('telegram', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const { results } = await env.DB.prepare(`
    SELECT g.id, g.building_id, g.entrance, g.telegram_chat_id,
           g.telegram_chat_title, g.listener_enabled, g.announcements_enabled,
           g.bot_status, g.connected_at, g.disabled_at,
           b.name AS building_name, b.address AS building_address
    FROM telegram_groups g
    LEFT JOIN buildings b ON b.id = g.building_id AND b.tenant_id = ?
    WHERE g.tenant_id = ?
    ORDER BY g.disabled_at IS NOT NULL, g.connected_at DESC
  `).bind(tenantId, tenantId).all();

  return json({ groups: results || [] });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/telegram/groups/connect-token
// Body: { building_id, entrance?, announcements_enabled?, listener_enabled? }
//
// Возвращает { url, expiresAt } — ссылку вида
// https://t.me/<bot>?startgroup=<token>.
//
// tenant_id берётся ИСКЛЮЧИТЕЛЬНО из сессии (§3: «нельзя доверять
// tenant_id, полученному из Telegram-команды, URL или frontend»).
// building_id приходит от клиента, поэтому обязательно проверяется на
// принадлежность тенанту — тот же приём, что в announcements-mutations
// перед вставкой объявления. Без этой проверки админ УК A подписал бы
// свою группу на дом УК B и получал бы её объявления.
route('POST', '/api/telegram/groups/connect-token', async (request, env) => {
  const fc = await requireFeature('telegram', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const botUsername = (env as Env).TELEGRAM_BOT_USERNAME;
  if (!botUsername) return error('Telegram bot is not configured', 503);

  const body = await request.json() as any;
  const buildingId = body.building_id || body.buildingId;
  if (!buildingId) return error('building_id is required', 400);

  const building = await env.DB.prepare(
    'SELECT id FROM buildings WHERE id = ? AND tenant_id = ?'
  ).bind(buildingId, tenantId).first();
  if (!building) return error('Building does not belong to your tenant', 403);

  // Подъезд — текстовая метка, и она обязана совпадать с users.entrance
  // и announcements.target_entrance символ-в-символ, иначе таргетинг
  // «на подъезд» промахнётся мимо группы. Обрезаем пробелы, пустую
  // строку приводим к NULL (= группа на весь дом).
  const entranceRaw = body.entrance;
  const entrance = typeof entranceRaw === 'string' && entranceRaw.trim()
    ? entranceRaw.trim() : null;

  // Гасим прежние невыданные токены этого админа: иначе каждое нажатие
  // «Подключить» плодит живые ссылки, и случайно расшаренную нельзя
  // отозвать, просто выпустив новую.
  await env.DB.prepare(
    `UPDATE telegram_group_tokens SET used_at = datetime('now')
     WHERE created_by = ? AND tenant_id = ? AND used_at IS NULL`
  ).bind(authUser!.id, tenantId).run();

  const token = generateLinkToken();
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + GROUP_TOKEN_TTL_MINUTES);

  await env.DB.prepare(`
    INSERT INTO telegram_group_tokens
      (id, tenant_id, building_id, entrance, token,
       announcements_enabled, listener_enabled, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId(), tenantId, buildingId, entrance, token,
    body.announcements_enabled === false ? 0 : 1,
    body.listener_enabled === true ? 1 : 0,
    authUser!.id, expiresAt.toISOString()
  ).run();

  return json({
    url: `https://t.me/${botUsername}?startgroup=${token}`,
    expiresAt: expiresAt.toISOString(),
  });
});

// ──────────────────────────────────────────────────────────────────
// PATCH /api/telegram/groups/:id
// Body: { announcements_enabled?, listener_enabled?, entrance? }
//
// building_id менять НЕЛЬЗЯ. Перепривязка группы к другому дому — это
// отключить и подключить заново: иначе журнал доставок задним числом
// начнёт врать о том, какому дому что уходило.
route('PATCH', '/api/telegram/groups/:id', async (request, env, params) => {
  const fc = await requireFeature('telegram', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const body = await request.json() as any;
  const sets: string[] = [];
  const binds: any[] = [];

  if (typeof body.announcements_enabled === 'boolean') {
    sets.push('announcements_enabled = ?');
    binds.push(body.announcements_enabled ? 1 : 0);
  }
  if (typeof body.listener_enabled === 'boolean') {
    sets.push('listener_enabled = ?');
    binds.push(body.listener_enabled ? 1 : 0);
  }
  if (body.entrance !== undefined) {
    sets.push('entrance = ?');
    binds.push(typeof body.entrance === 'string' && body.entrance.trim()
      ? body.entrance.trim() : null);
  }
  if (!sets.length) return error('Nothing to update', 400);

  binds.push(params.id, tenantId);
  const res = await env.DB.prepare(
    `UPDATE telegram_groups SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`
  ).bind(...binds).run();

  // tenant_id в WHERE, а не проверка после SELECT: так «чужой» id
  // просто не находит строку и меняет ноль записей.
  if (!res.meta?.changes) return error('Group not found', 404);
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// DELETE /api/telegram/groups/:id
//
// Мягкое отключение. Строка остаётся: журнал доставок ссылается на неё,
// и без строки нельзя ответить, куда уходило объявление в прошлом
// месяце. Освободившийся telegram_chat_id выходит из-под частичного
// UNIQUE, так что группу можно подключить заново — хоть у другой УК.
route('DELETE', '/api/telegram/groups/:id', async (request, env, params) => {
  const fc = await requireFeature('telegram', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const res = await env.DB.prepare(
    `UPDATE telegram_groups SET disabled_at = datetime('now')
     WHERE id = ? AND tenant_id = ? AND disabled_at IS NULL`
  ).bind(params.id, tenantId).run();

  if (!res.meta?.changes) return error('Group not found', 404);
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// GET /api/telegram/announcements/:id/deliveries
//
// «Telegram: доставлено в 8 из 9 групп» (§10). Объявление проверяется
// на принадлежность тенанту отдельным запросом: без этого по чужому
// announcement_id читался бы чужой журнал доставок.
route('GET', '/api/telegram/announcements/:id/deliveries', async (request, env, params) => {
  const fc = await requireFeature('telegram', env, request);
  if (!fc.allowed) return error(fc.error!, 403);

  const authUser = await getUser(request, env);
  if (!isManagement(authUser)) return error('Manager access required', 403);

  const tenantId = getTenantId(request);
  if (!tenantId) return error('Tenant context required', 401);

  const ann = await env.DB.prepare(
    'SELECT id FROM announcements WHERE id = ? AND tenant_id = ?'
  ).bind(params.id, tenantId).first();
  if (!ann) return error('Announcement not found', 404);

  const { results } = await env.DB.prepare(`
    SELECT d.id, d.telegram_group_id, d.telegram_chat_id, d.status,
           d.error_message, d.attempts, d.sent_at,
           g.telegram_chat_title, g.building_id
    FROM telegram_deliveries d
    LEFT JOIN telegram_groups g ON g.id = d.telegram_group_id AND g.tenant_id = ?
    WHERE d.announcement_id = ? AND d.tenant_id = ?
    ORDER BY d.created_at ASC
  `).bind(tenantId, params.id, tenantId).all();

  const rows = (results || []) as any[];
  return json({
    deliveries: rows,
    summary: {
      total: rows.length,
      sent: rows.filter(r => r.status === 'sent').length,
      failed: rows.filter(r => r.status === 'failed').length,
      blocked: rows.filter(r => r.status === 'blocked').length,
    },
  });
});

} // end registerTelegramGroupRoutes
