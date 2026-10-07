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
import { getTenantId } from '../../middleware/tenant';
import { json, bilingualError, error, generateId, isAdminLevel } from '../../utils/helpers';
import { isSuperAdmin } from '../../index';
import { TENANT_FEATURES, normalizeFeatures } from '../../lib/features';
import { clearFeatureCache } from '../../middleware/tenant';
import { sendTelegramMessage, callTelegram, escapeHtml } from '../../utils/telegram';

// Общий писатель в audit_log (migration 042). Берёт actor из getUser(),
// падает мягко — аудит не должен ронять операцию.
async function writeAudit(env: Env, actor: any, action: string, tenantId: string | null, targetType: string, targetId: string | null, details: any, request: Request) {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id, tenant_id, actor_id, actor_name, actor_role, action, target_type, target_id, details, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      generateId(),
      tenantId,
      actor?.id || null,
      actor?.name || null,
      actor?.role || null,
      action,
      targetType,
      targetId,
      JSON.stringify(details || {}),
      request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null,
    ).run();
  } catch { /* audit never blocks */ }
}

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
           g.message_thread_id, g.topic_name,
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
    `SELECT title, content, priority FROM announcements
     WHERE id = ? AND tenant_id = ?`
  ).bind(d.announcement_id, d.tenant_id).first() as any;
  if (!ann) return error('Announcement not found', 404);

  const prefix = ann.priority === 'urgent' ? '🚨'
    : ann.priority === 'important' ? '❗'
    : '📢';
  const text = `${prefix} <b>${escapeHtml(ann.title)}</b>\n\n${escapeHtml(ann.content)}`;
  const send = await sendTelegramMessage(e, d.telegram_chat_id, text, {
    messageThreadId: Number(d.message_thread_id || 0),
  });

  await e.DB.prepare(`
    UPDATE telegram_deliveries
    SET status = ?, telegram_message_id = ?, error_message = ?,
        attempts = attempts + 1, sent_at = ?
    WHERE id = ? AND tenant_id = ?
  `).bind(
    send.ok ? 'sent' : 'failed',
    send.ok ? String(send.result?.message_id ?? '') : d.telegram_message_id,
    send.ok ? null : (send.reason || 'unknown').slice(0, 500),
    send.ok ? new Date().toISOString() : d.sent_at,
    params.id, d.tenant_id
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
  clearFeatureCache(params.id);

  return json({ ok: true, features: clean });
});

// ──────────────────────────────────────────────────────────────────
// Выключатель require_telegram_activation на тенанте.
// Двухшаговое включение чтобы было видно, кого заденет.
//
//   POST /api/super-admin/telegram/tenants/:id/activation-required
//     body: { dry_run: true }                 → список затронутых + current state
//     body: { confirm: true, enabled: true }  → применить
//     body: { confirm: true, enabled: false } → применить (выключить)
//
// Затронутые = users WHERE tenant_id=:id AND role IN (…резиденты…)
//                    AND telegram_activation_required = 1
//                    AND skip_telegram_activation = 0
//                    AND telegram_activated_at IS NULL
// На выключение активации гейт больше не стреляет — список для confirm
// при enabled=false не важен, его отдаём пустым.
// ──────────────────────────────────────────────────────────────────
route('POST', '/api/super-admin/telegram/tenants/:id/activation-required', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const e = env as Env;
  const body = await request.json().catch(() => ({})) as { dry_run?: boolean; confirm?: boolean; enabled?: boolean };

  const tenant = await e.DB.prepare(
    'SELECT id, slug, name, require_telegram_activation, is_demo FROM tenants WHERE id = ?'
  ).bind(params.id).first() as any;
  if (!tenant) return error('Tenant not found', 404);

  // dry_run (включение): список тех, кого завтра на входе встретит
  // активация. Для выключения — список тех, у кого сейчас стоит
  // активация (чтобы было видно, кого «отпускаем»).
  const { results: affected } = await e.DB.prepare(
    `SELECT id, login, name, role, phone
       FROM users
      WHERE tenant_id = ?
        AND role IN ('resident','tenant','commercial_owner')
        AND telegram_activation_required = 1
        AND skip_telegram_activation = 0
        AND telegram_activated_at IS NULL
        AND is_active = 1
      ORDER BY role, name`
  ).bind(params.id).all();

  const payload = {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      currentlyEnabled: Number(tenant.require_telegram_activation || 0) === 1,
      isDemo: Number(tenant.is_demo || 0) === 1,
    },
    affectedCount: affected?.length || 0,
    affected: (affected || []).map((u: any) => ({ id: u.id, login: u.login, name: u.name, role: u.role, phone: u.phone })),
  };

  // dry_run — только показ списка
  if (body.dry_run || !body.confirm) {
    return json({ ok: true, dryRun: true, ...payload });
  }

  // Запрет на включение в demo — чтобы в проде не включили случайно
  if (body.enabled && payload.tenant.isDemo) {
    return bilingualError(
      'Нельзя включить обязательную Telegram-активацию для demo-тенанта.',
      'Demo-tenant uchun majburiy Telegram-aktivatsiyani yoqib bo\'lmaydi.',
      409
    );
  }

  const nextEnabled = body.enabled ? 1 : 0;
  await e.DB.prepare(
    "UPDATE tenants SET require_telegram_activation = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(nextEnabled, params.id).run();

  await writeAudit(e, user, 'telegram.activation_required.set', params.id, 'tenant', params.id, {
    enabled: !!body.enabled, affectedCount: payload.affectedCount,
  }, request);

  return json({ ok: true, applied: true, enabled: !!body.enabled, ...payload });
});

// ──────────────────────────────────────────────────────────────────
// Отвязать Telegram у жителя (super-admin, любой тенант).
// Админ УК ходит через /api/admin/telegram/users/:id/unlink ниже.
// ──────────────────────────────────────────────────────────────────
route('POST', '/api/super-admin/telegram/users/:id/unlink', async (request, env, params) => {
  const actor = await getUser(request, env);
  if (!isSuperAdmin(actor)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  const e = env as Env;

  const target = await e.DB.prepare('SELECT id, tenant_id, name, login FROM users WHERE id = ?').bind(params.id).first() as any;
  if (!target) return error('User not found', 404);

  const res = await e.DB.prepare(
    `UPDATE telegram_users SET revoked_at = datetime('now')
      WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`
  ).bind(target.id, target.tenant_id).run();

  await writeAudit(e, actor, 'telegram.user.unlink', target.tenant_id, 'user', target.id, {
    affected: res.meta?.changes ?? 0, login: target.login,
  }, request);
  return json({ ok: true, revoked: res.meta?.changes ?? 0 });
});

// ──────────────────────────────────────────────────────────────────
// Сбросить telegram_activation_required=1 у жителя (super-admin).
// Одновременно отзываем ВСЕ живые привязки в telegram_users — иначе
// gate (с C1 live-bind catch) при следующем входе снова проставит
// telegram_activated_at по старой привязке и сброс был бы бессмысленным.
// ──────────────────────────────────────────────────────────────────
route('POST', '/api/super-admin/telegram/users/:id/reset-activation', async (request, env, params) => {
  const actor = await getUser(request, env);
  if (!isSuperAdmin(actor)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  const e = env as Env;

  const target = await e.DB.prepare('SELECT id, tenant_id, name, login, role FROM users WHERE id = ?').bind(params.id).first() as any;
  if (!target) return error('User not found', 404);

  const revoked = await e.DB.prepare(
    `UPDATE telegram_users SET revoked_at = datetime('now')
      WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`
  ).bind(target.id, target.tenant_id).run();

  await e.DB.prepare(
    `UPDATE users SET telegram_activation_required = 1, telegram_activated_at = NULL, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?`
  ).bind(target.id, target.tenant_id).run();

  await writeAudit(e, actor, 'telegram.user.reset_activation', target.tenant_id, 'user', target.id, {
    login: target.login, role: target.role, revokedLinks: revoked.meta?.changes ?? 0,
  }, request);
  return json({ ok: true, revokedLinks: revoked.meta?.changes ?? 0 });
});

// ──────────────────────────────────────────────────────────────────
// Поставить/снять skip_telegram_activation для сервисного аккаунта.
// Единственный способ без ручного SQL — ровно под Apple-ревью, тест-
// УК-логины и подобные.
// ──────────────────────────────────────────────────────────────────
route('POST', '/api/super-admin/telegram/users/:id/skip-activation', async (request, env, params) => {
  const actor = await getUser(request, env);
  if (!isSuperAdmin(actor)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  const e = env as Env;

  const body = await request.json().catch(() => ({})) as { skip?: boolean };
  if (typeof body.skip !== 'boolean') return error('Body: { skip: true | false }', 400);

  const target = await e.DB.prepare('SELECT id, tenant_id, name, login, role FROM users WHERE id = ?').bind(params.id).first() as any;
  if (!target) return error('User not found', 404);

  await e.DB.prepare(
    `UPDATE users SET skip_telegram_activation = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?`
  ).bind(body.skip ? 1 : 0, target.id, target.tenant_id).run();

  await writeAudit(e, actor, 'telegram.user.skip_activation.set', target.tenant_id, 'user', target.id, {
    skip: !!body.skip, login: target.login, role: target.role,
  }, request);
  return json({ ok: true, skip: !!body.skip });
});

// ──────────────────────────────────────────────────────────────────
// Админ УК: отвязать/сбросить для жителя СВОЕГО тенанта.
// Super-admin тоже проходит, но у него есть глобальные endpoints выше.
// ──────────────────────────────────────────────────────────────────
route('POST', '/api/admin/telegram/users/:id/unlink', async (request, env, params) => {
  const actor = await getUser(request, env);
  if (!actor || (!isAdminLevel(actor) && !isSuperAdmin(actor))) {
    return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  }
  const e = env as Env;

  const target = await e.DB.prepare('SELECT id, tenant_id, name, login FROM users WHERE id = ?').bind(params.id).first() as any;
  if (!target) return error('User not found', 404);

  // Админ УК может трогать только свой тенант.
  const callerTenantId = actor.tenant_id || getTenantId(request);
  if (!isSuperAdmin(actor) && target.tenant_id !== callerTenantId) {
    return bilingualError('Пользователь из другого тенанта', 'Foydalanuvchi boshqa tenantdan', 403);
  }

  const res = await e.DB.prepare(
    `UPDATE telegram_users SET revoked_at = datetime('now')
      WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`
  ).bind(target.id, target.tenant_id).run();

  await writeAudit(e, actor, 'telegram.user.unlink', target.tenant_id, 'user', target.id, {
    affected: res.meta?.changes ?? 0, login: target.login, byAdmin: true,
  }, request);
  return json({ ok: true, revoked: res.meta?.changes ?? 0 });
});

route('POST', '/api/admin/telegram/users/:id/reset-activation', async (request, env, params) => {
  const actor = await getUser(request, env);
  if (!actor || (!isAdminLevel(actor) && !isSuperAdmin(actor))) {
    return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);
  }
  const e = env as Env;

  const target = await e.DB.prepare('SELECT id, tenant_id, name, login, role FROM users WHERE id = ?').bind(params.id).first() as any;
  if (!target) return error('User not found', 404);

  const callerTenantId = actor.tenant_id || getTenantId(request);
  if (!isSuperAdmin(actor) && target.tenant_id !== callerTenantId) {
    return bilingualError('Пользователь из другого тенанта', 'Foydalanuvchi boshqa tenantdan', 403);
  }

  // Отзываем живые привязки + сбрасываем флаг — одна транзакция смысла,
  // две SQL-строки (D1/SQLite не нужен explicit TXN; обе идут по target.id+tenant_id).
  const revoked = await e.DB.prepare(
    `UPDATE telegram_users SET revoked_at = datetime('now')
      WHERE user_id = ? AND tenant_id = ? AND revoked_at IS NULL`
  ).bind(target.id, target.tenant_id).run();

  await e.DB.prepare(
    `UPDATE users SET telegram_activation_required = 1, telegram_activated_at = NULL, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?`
  ).bind(target.id, target.tenant_id).run();

  await writeAudit(e, actor, 'telegram.user.reset_activation', target.tenant_id, 'user', target.id, {
    login: target.login, role: target.role, byAdmin: true, revokedLinks: revoked.meta?.changes ?? 0,
  }, request);
  return json({ ok: true, revokedLinks: revoked.meta?.changes ?? 0 });
});

} // end registerTelegramSuperAdminRoutes
