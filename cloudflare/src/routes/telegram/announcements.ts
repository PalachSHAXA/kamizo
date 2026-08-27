// Дублирование объявлений Kamizo в домовые Telegram-группы (§8–§10 ТЗ).
//
// Это MVP из §25. Ключевые инварианты, за которые отвечает файл:
//   • объявление уходит ТОЛЬКО в группы своего тенанта (§26);
//   • сбой Telegram не ломает публикацию объявления в Kamizo (§23);
//   • повторная отправка не создаёт дублей (§23);
//   • каждая попытка попадает в журнал telegram_deliveries (§10).
//
// Telegram здесь — вторичный канал. Источником объявления остаётся
// запись в announcements; §27 запрещает заводить объявления, живущие
// только в Telegram.

import type { Env } from '../../types';
import { generateId } from '../../utils/helpers';
import { sendTelegramMessage, escapeHtml } from '../../utils/telegram';
import { type Audience } from '../../utils/audience';

export interface TelegramGroupRow {
  id: string;
  tenant_id: string;
  building_id: string;
  entrance: string | null;
  telegram_chat_id: string;
  telegram_chat_title: string | null;
}

// ──────────────────────────────────────────────────────────────────
// Подбор групп под аудиторию объявления.
//
// Правила соответствия и почему они такие:
//
//   all       — все активные группы тенанта.
//   branch    — группы, чей дом принадлежит филиалу. Джойн по
//               buildings.branch_code, причём ОБЕ таблицы фильтруются
//               по tenant_id. Ровно эту двойную фильтрацию чинил
//               Sprint 67 P0 #1 в push-фанауте: без неё объявление
//               утекало всем тенантам, у которых совпал branch_code.
//   building  — все группы дома, включая подъездные.
//   entrance  — группы этого подъезда И группы, обслуживающие дом
//               целиком (entrance IS NULL). Обоснование: жители
//               подъезда состоят и там и там, а не доставить им
//               объявление хуже, чем слегка зашумить соседей.
//               Отключение воды в подъезде дом целиком тоже касается.
//   floor     — то же, что entrance: у Telegram-группы нет этажа, а
//               этаж без подъезда в Kamizo не адресуется.
//   custom    — НЕ отправляем никуда. target_logins адресует поимённо;
//               группа — это широковещание, и рассылка личного
//               объявления в общий чат раскрыла бы адресата соседям.
//
// Группы с announcements_enabled = 0 и отключённые (disabled_at) в
// выборку не попадают. Группы, из которых бота выгнали
// (bot_status left/kicked), тоже: тратить на них вызовы бессмысленно,
// админ УК видит их состояние в кабинете (§19).
export async function resolveTelegramGroups(
  env: Env,
  tenantId: string,
  audience: Audience
): Promise<TelegramGroupRow[]> {
  if (audience.targetType === 'custom') return [];

  const base = `SELECT g.id, g.tenant_id, g.building_id, g.entrance,
                       g.telegram_chat_id, g.telegram_chat_title
                FROM telegram_groups g`;
  const active = `g.tenant_id = ? AND g.disabled_at IS NULL
                  AND g.announcements_enabled = 1
                  AND g.bot_status NOT IN ('left', 'kicked')`;

  let sql: string;
  const params: any[] = [tenantId];

  switch (audience.targetType) {
    case 'branch':
      if (!audience.branch) return [];
      sql = `${base}
             INNER JOIN buildings b ON g.building_id = b.id
             WHERE ${active} AND b.branch_code = ? AND b.tenant_id = ?`;
      params.push(audience.branch, tenantId);
      break;

    case 'building':
      if (!audience.buildingId) return [];
      sql = `${base} WHERE ${active} AND g.building_id = ?`;
      params.push(audience.buildingId);
      break;

    case 'entrance':
    case 'floor':
      if (!audience.buildingId) return [];
      if (!audience.entrance) {
        sql = `${base} WHERE ${active} AND g.building_id = ?`;
        params.push(audience.buildingId);
      } else {
        sql = `${base} WHERE ${active} AND g.building_id = ?
               AND (g.entrance = ? OR g.entrance IS NULL)`;
        params.push(audience.buildingId, audience.entrance);
      }
      break;

    default: // 'all'
      sql = `${base} WHERE ${active}`;
  }

  const { results } = await env.DB.prepare(sql).bind(...params).all();
  return (results || []) as unknown as TelegramGroupRow[];
}

// ──────────────────────────────────────────────────────────────────
// Формат сообщения (§9).
//
// parse_mode = HTML, поэтому всё, что пришло от пользователя (заголовок,
// текст, адрес дома), экранируется. Неэкранированный '<' в тексте
// объявления не просто ломает вёрстку — Telegram отвергает сообщение
// целиком, и объявление не доходит ни до кого.
const PRIORITY_PREFIX: Record<string, string> = {
  urgent: '\u{1F6A8} СРОЧНО',
  important: '\u{2757} ВАЖНО',
  normal: '\u{1F4E2}',
};

export function formatAnnouncement(
  announcement: any,
  building: { address?: string; name?: string } | null,
  entrance: string | null,
  appUrl: string | null
): string {
  const prefix = PRIORITY_PREFIX[announcement.priority] || PRIORITY_PREFIX.normal;
  const lines: string[] = [];

  lines.push(`${prefix} <b>${escapeHtml(announcement.title)}</b>`);
  lines.push('');
  lines.push(escapeHtml(announcement.content));

  const place = building?.address || building?.name;
  if (place) {
    lines.push('');
    lines.push(`\u{1F3E0} ${escapeHtml(place)}${entrance ? `, подъезд ${escapeHtml(entrance)}` : ''}`);
  }

  if (appUrl) {
    lines.push('');
    lines.push(`<a href="${escapeHtml(appUrl)}">Открыть в Kamizo</a>`);
  }

  return lines.join('\n');
}

// ──────────────────────────────────────────────────────────────────
// Отправка объявления во все подходящие группы.
//
// Вызывается из announcements-mutations.ts и ОБЯЗАН быть обёрнут в
// .catch() на стороне вызова — так же, как sendPushNotification
// (доменное правило из CLAUDE.md: иначе роняет основной запрос).
// Внутри тоже ничего не бросаем: §23 требует, чтобы объявление
// осталось опубликованным даже при полностью лежащем Telegram.
//
// Отправка последовательная, а не Promise.all. Telegram ограничивает
// ~30 сообщений в секунду суммарно, и параллельный залп по десяткам
// групп упрётся в 429 с retry_after, то есть выйдет медленнее, а не
// быстрее.
export async function deliverAnnouncementToTelegram(
  env: Env,
  tenantId: string,
  announcement: any,
  audience: Audience
): Promise<{ sent: number; failed: number; total: number }> {
  const result = { sent: 0, failed: 0, total: 0 };

  // Объявление для сотрудников в домовой чат жителей не идёт.
  if (announcement.type === 'employees' || announcement.type === 'staff') return result;
  if (!env.TELEGRAM_BOT_TOKEN) return result;

  const groups = await resolveTelegramGroups(env, tenantId, audience);
  result.total = groups.length;
  if (!groups.length) return result;

  // Адрес дома — для строки «Дом: …». Берём один раз, а не на каждую
  // группу: у объявления на филиал или на весь тенант дом у групп
  // разный, поэтому подтягиваем по building_id самой группы ниже.
  const buildingCache = new Map<string, any>();
  const loadBuilding = async (id: string) => {
    if (buildingCache.has(id)) return buildingCache.get(id);
    const row = await env.DB.prepare(
      'SELECT name, address FROM buildings WHERE id = ? AND tenant_id = ?'
    ).bind(id, tenantId).first();
    buildingCache.set(id, row);
    return row;
  };

  // Ссылка «Открыть в Kamizo» ведёт на домен конкретной УК, а не на
  // общий app.kamizo.uz: у тенанта свой поддомен (tenants.url), и
  // житель должен попасть в своё приложение.
  const tenant = await env.DB.prepare(
    'SELECT url FROM tenants WHERE id = ?'
  ).bind(tenantId).first() as any;
  const appUrl = tenant?.url ? `${String(tenant.url).replace(/\/$/, '')}/announcements` : null;

  for (const group of groups) {
    const building = await loadBuilding(group.building_id);
    const text = formatAnnouncement(announcement, building, group.entrance, appUrl);

    const send = await sendTelegramMessage(env, group.telegram_chat_id, text);

    // Бота выгнали или заблокировали — повторять нечего, помечаем и
    // гасим bot_status, чтобы следующий фанаут эту группу не трогал.
    const blocked = !send.ok && /blocked|kicked|chat not found|not a member|CHAT_WRITE_FORBIDDEN/i
      .test(send.reason || '');
    if (blocked) {
      await env.DB.prepare(
        `UPDATE telegram_groups SET bot_status = 'kicked' WHERE id = ? AND tenant_id = ?`
      ).bind(group.id, tenantId).run();
    }

    const status = send.ok ? 'sent' : (blocked ? 'blocked' : 'failed');
    if (send.ok) result.sent++; else result.failed++;

    // ON CONFLICT по (announcement_id, telegram_chat_id): повторная
    // отправка обновляет ту же строку журнала и инкрементирует attempts,
    // а не плодит дубли (§23).
    await env.DB.prepare(`
      INSERT INTO telegram_deliveries
        (id, tenant_id, announcement_id, telegram_group_id, telegram_chat_id,
         telegram_message_id, delivery_type, status, error_message, attempts, sent_at)
      VALUES (?, ?, ?, ?, ?, ?, 'group', ?, ?, 1, ?)
      ON CONFLICT(announcement_id, telegram_chat_id) DO UPDATE SET
        telegram_message_id = excluded.telegram_message_id,
        status = excluded.status,
        error_message = excluded.error_message,
        attempts = telegram_deliveries.attempts + 1,
        sent_at = excluded.sent_at
    `).bind(
      generateId(), tenantId, announcement.id, group.id, group.telegram_chat_id,
      send.ok ? String(send.result?.message_id ?? '') : null,
      status,
      send.ok ? null : (send.reason || 'unknown').slice(0, 500),
      send.ok ? new Date().toISOString() : null
    ).run();
  }

  return result;
}
