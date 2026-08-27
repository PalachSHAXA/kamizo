// Суперадмин-панель Telegram (§18 ТЗ).
//
// Пять эндпоинтов, все под isSuperAdmin:
//   GET  /api/super-admin/telegram/overview          — сводка и состояние
//   GET  /api/super-admin/telegram/groups            — все группы всех тенантов
//   POST /api/super-admin/telegram/groups/:id/disable
//   POST /api/super-admin/telegram/deliveries/:id/retry
//   POST /api/super-admin/telegram/tenants/:id/feature
//
// Чего здесь СОЗНАТЕЛЬНО нет: чтения сообщений домовых групп. §18 прямо
// говорит, что суперадминистратору такой интерфейс не нужен, а
// техническая возможность, однажды появившись, обязательно будет
// использована. Панель показывает счётчики, состояние и технические
// ошибки доставки — не переписку.

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { json, bilingualError, error } from '../../utils/helpers';
import { isSuperAdmin } from '../../index';
import { TENANT_FEATURES, normalizeFeatures } from '../../lib/features';
import { sendTelegramMessage, callTelegram } from '../../utils/telegram';

export function registerTelegramSuperAdminRoutes() {

// ──────────────────────────────────────────────────────────────────
// GET /api/super-admin/telegram/overview
//
// Состояние вебхука тянется у Telegram в реальном времени: хранить его
// у себя бессмысленно — вебхук может слететь на их стороне, и
// закэшированный «всё хорошо» будет врать ровно тогда, когда он нужен.
// Если Telegram не ответил, отдаём null вместо того, чтобы уронить
// весь ответ: остальные счётчики от этого не зависят.
route('GET', '/api/super-admin/telegram/overview', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const e = env as Env;

  let webhook: any = null;
  if (e.TELEGRAM_BOT_TOKEN) {
    const info = await callTelegram(e, 'getWebhookInfo', {});
    if (info.ok) {
      webhook = {
        url: info.result?.url || null,
        pendingUpdateCount: info.result?.pending_update_count ?? null,
        lastErrorMessage: info.result?.last_error_message || null,
        lastErrorDate: info.result?.last_error_date || null,
      };
    }
  }

  const groups = await e.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN disabled_at IS NULL THEN 1 ELSE 0 END) AS active,
      SUM(CASE WHEN bot_status IN ('left','kicked') AND disabled_at IS NULL THEN 1 ELSE 0 END) AS kicked,
      COUNT(DISTINCT tenant_id) AS tenants
    FROM telegram_groups
  `).first() as any;

  const deliveries = await e.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked
    FROM telegram_deliveries
  `).first() as any;

  const links = await e.DB.prepare(
    `SELECT COUNT(*) AS linked FROM telegram_users WHERE revoked_at IS NULL`
  ).first() as any;

  // Тенанты с включённой фичей. normalizeFeatures приводит легаси-ключи
  // к каноническим — без него тенанты со старыми строками выпали бы из
  // выборки, хотя гейт у них работает.
  const { results: tenantRows } = await e.DB.prepare(
    'SELECT id, name, slug, features FROM tenants WHERE is_active = 1'
  ).all();
  const tenants = (tenantRows || []).map((t: any) => {
    let parsed: unknown = [];
    try { parsed = JSON.parse(t.features || '[]'); } catch { parsed = []; }
    const features = normalizeFeatures(parsed);
    return {
      id: t.id, name: t.name, slug: t.slug,
      telegramEnabled: features.includes('telegram'),
    };
  });

  return json({
    botUsername: e.TELEGRAM_BOT_USERNAME || null,
    configured: !!e.TELEGRAM_BOT_TOKEN,
    webhook,
    groups: {
      total: groups?.total || 0,
      active: groups?.active || 0,
      kicked: groups?.kicked || 0,
      tenants: groups?.tenants || 0,
    },
    deliveries: {
      sent: deliveries?.sent || 0,
      failed: deliveries?.failed || 0,
      blocked: deliveries?.blocked || 0,
    },
    linkedUsers: links?.linked || 0,
    tenants,
  });
});

// ──────────────────────────────────────────────────────────────────
// GET /api/super-admin/telegram/groups
//
// Кросс-тенантная выборка — единственное место, где это законно, и
// именно поэтому она под isSuperAdmin. Название чата и адрес дома
// показываем, содержимое переписки — нет.
route('GET', '/api/super-admin/telegram/groups', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const { results } = await env.DB.prepare(`
    SELECT g.id, g.tenant_id, g.telegram_chat_id, g.telegram_chat_title,
           g.entrance, g.bot_status, g.announcements_enabled,
           g.listener_enabled, g.connected_at, g.disabled_at,
           t.name AS tenant_name, b.address AS building_address
    FROM telegram_groups g
    LEFT JOIN tenants t ON t.id = g.tenant_id
    LEFT JOIN buildings b ON b.id = g.building_id
    ORDER BY g.disabled_at IS NOT NULL, g.connected_at DESC
    LIMIT 500
  `).all();

  return json({ groups: results || [] });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/super-admin/telegram/groups/:id/disable
//
// §18: «может отключить проблемную группу». Мягко, как и в кабинете УК:
// журнал доставок ссылается на строку.
route('POST', '/api/super-admin/telegram/groups/:id/disable', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const res = await env.DB.prepare(
    `UPDATE telegram_groups SET disabled_at = datetime('now')
     WHERE id = ? AND disabled_at IS NULL`
  ).bind(params.id).run();

  if (!res.meta?.changes) return error('Group not found or already disabled', 404);
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/super-admin/telegram/deliveries/:id/retry
//
// §18: «повторить неудачную доставку».
//
// Повтор идёт по СОХРАНЁННОМУ telegram_chat_id из журнала, а не по
// текущей привязке группы: группу могли перепривязать к другому дому,
// и повтор обязан уйти туда же, куда шла исходная попытка.
//
// Дубликатов не будет: строка журнала обновляется по своему id, а не
// вставляется заново.
route('POST', '/api/super-admin/telegram/deliveries/:id/retry', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const e = env as Env;
  const d = await e.DB.prepare(
    'SELECT * FROM telegram_deliveries WHERE id = ?'
  ).bind(params.id).first() as any;
  if (!d) return error('Delivery not found', 404);
  if (d.status === 'sent') return error('Already delivered', 400);

  const ann = await e.DB.prepare(
    'SELECT title, content, priority FROM announcements WHERE id = ?'
  ).bind(d.announcement_id).first() as any;
  if (!ann) return error('Announcement not found', 404);

  const text = `📢 <b>${ann.title}</b>\n\n${ann.content}`;
  const send = await sendTelegramMessage(e, d.telegram_chat_id, text);

  await e.DB.prepare(`
    UPDATE telegram_deliveries
    SET status = ?, telegram_message_id = ?, error_message = ?,
        attempts = attempts + 1, sent_at = ?
    WHERE id = ?
  `).bind(
    send.ok ? 'sent' : 'failed',
    send.ok ? String(send.result?.message_id ?? '') : d.telegram_message_id,
    send.ok ? null : (send.reason || 'unknown').slice(0, 500),
    send.ok ? new Date().toISOString() : d.sent_at,
    params.id
  ).run();

  return json({ ok: send.ok, reason: send.reason || null });
});

// ──────────────────────────────────────────────────────────────────
// POST /api/super-admin/telegram/tenants/:id/feature
// Body: { enabled: boolean }
//
// §5: суперадмин включает и отключает интеграцию тенанту. Отдельного
// хранилища для этого не заводим — используем существующий
// tenants.features, тот же механизм, что гейтит все прочие разделы.
route('POST', '/api/super-admin/telegram/tenants/:id/feature', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const body = await request.json() as any;
  const enabled = body.enabled === true;

  const tenant = await env.DB.prepare(
    'SELECT features FROM tenants WHERE id = ?'
  ).bind(params.id).first() as any;
  if (!tenant) return error('Tenant not found', 404);

  let parsed: unknown = [];
  try { parsed = JSON.parse(tenant.features || '[]'); } catch { parsed = []; }
  // Приводим к каноническим ключам на чтении: иначе легаси-значения
  // ("votes") записались бы обратно и продолжили расходиться с гейтами.
  const current = normalizeFeatures(parsed);

  const next = enabled
    ? Array.from(new Set([...current, 'telegram']))
    : current.filter(f => f !== 'telegram');

  // Пишем только известные ключи — мусор из БД дальше не расходится.
  const clean = next.filter(f => (TENANT_FEATURES as readonly string[]).includes(f));

  await env.DB.prepare(
    "UPDATE tenants SET features = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(JSON.stringify(clean), params.id).run();

  return json({ ok: true, features: clean });
});

} // end registerTelegramSuperAdminRoutes
