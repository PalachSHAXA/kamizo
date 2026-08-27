// POST /api/telegram/webhook — приёмник апдейтов от Telegram (§20 ТЗ).
//
// Единственный публичный (неавторизованный) роут проекта помимо
// /api/auth/login: Telegram не знает про наши JWT. Аутентификация тут
// другая — общий секрет в заголовке X-Telegram-Bot-Api-Secret-Token.
//
// Диспетчер в index.ts зовёт getUser() для КАЖДОГО /api-запроса, но не
// блокирует по его результату (результат идёт только в ключ rate-limit
// и в demo-политику). Так что публичный роут не требует правок в
// диспетчере — хендлер просто не спрашивает пользователя.
//
// Три правила обработчика вебхука, каждое стоило кому-то продакшена:
//   1. Всегда отвечать 200. На любой не-200 Telegram уходит в ретраи с
//      нарастающей задержкой и в итоге отваливает вебхук целиком —
//      бот молча умирает для всех тенантов сразу.
//   2. Отвечать быстро. Telegram доставляет апдейты одного чата
//      последовательно; медленный хендлер выстраивает очередь.
//   3. Быть идемпотентным. Ретрай приносит тот же update_id повторно —
//      см. claimUpdate() ниже.
//
// Обрабатываемые типы апдейтов:
//   message         — /start в личке (привязка пользователя),
//                     /start@bot в группе (подключение группы),
//                     /unlink, /help, служебное migrate_to_chat_id,
//                     а также обычный текст в группе → умный диспетчер
//   callback_query  — кнопки: подтверждение входа (§17) и предложение
//                     оформить заявку (§12)
//   my_chat_member  — бота добавили/выгнали/сменили права
//   chat_member     — то же для обычных участников (нужно только для
//                     отслеживания статуса бота, остальное игнорируем)
//
// Про обычные сообщения группы: они уходят в handleGroupMessage, но
// только если у группы включён listener_enabled, а этот флаг
// администратор УК ставит вручную, увидев предупреждение из §15. Текст
// сообщений здесь не сохраняется — см. routes/telegram/dispatcher.ts.

import {
  route, json, sendTelegramMessage, escapeHtml, timingSafeEqual,
  generateId, createRequestLogger, type Env
} from './helpers';
import { resolveLoginRequest } from './login-approval';
import { handleGroupMessage, handleSuggestionCallback } from './dispatcher';

// Тексты бота. i18n тем же паттерном, что во всём проекте:
// language === 'ru' ? ... : ... (CLAUDE.md). Язык берём из
// users.language, а до привязки — из language_code самого Telegram.
//
// Узбекский апостроф — русская двойная кавычка по правилу из CLAUDE.md,
// чтобы не экранировать его в каждой строке.
const T = {
  linked: (ru: boolean, name: string) => ru
    ? `✅ Готово, ${name}!\n\nВаш Telegram привязан к Kamizo. Сюда будут приходить уведомления о заявках, собраниях и коды подтверждения.\n\nОтвязать — команда /unlink`
    : `✅ Tayyor, ${name}!\n\nTelegram hisobingiz Kamizo"ga ulandi. Arizalar, yig"ilishlar haqida bildirishnomalar va tasdiqlash kodlari shu yerga keladi.\n\nUzish — /unlink buyrug"i`,

  badToken: (ru: boolean) => ru
    ? '⚠️ Ссылка недействительна или устарела.\n\nОткройте Kamizo → Настройки → «Привязать Telegram» и получите новую ссылку.'
    : '⚠️ Havola yaroqsiz yoki muddati o"tgan.\n\nKamizo → Sozlamalar → «Telegramni ulash» orqali yangi havola oling.',

  bareStart: (ru: boolean) => ru
    ? '👋 Это бот Kamizo.\n\nЧтобы получать уведомления, привяжите аккаунт: откройте Kamizo → Настройки → «Привязать Telegram».'
    : '👋 Bu Kamizo boti.\n\nBildirishnomalarni olish uchun hisobingizni ulang: Kamizo → Sozlamalar → «Telegramni ulash».',

  unlinked: (ru: boolean) => ru
    ? '🔌 Telegram отвязан. Уведомления сюда больше не придут.'
    : '🔌 Telegram uzildi. Bildirishnomalar bu yerga kelmaydi.',

  notLinked: (ru: boolean) => ru
    ? 'Этот чат не привязан ни к одному аккаунту Kamizo.'
    : 'Bu chat hech qanday Kamizo hisobiga ulanmagan.',

  help: (ru: boolean) => ru
    ? 'Команды:\n/start — привязать аккаунт по ссылке из Kamizo\n/unlink — отвязать\n/help — эта справка'
    : "Buyruqlar:\n/start — Kamizo\"dagi havola orqali hisobni ulash\n/unlink — uzish\n/help — shu yordam",

  // §6 шаг 7 + §15: при подключении бот публикует понятное уведомление
  // участникам группы. Люди в чате не нажимали никаких кнопок и должны
  // сразу понимать, кто и зачем к ним пришёл.
  groupConnected: (address: string, entrance: string | null, listener: boolean) => {
    const lines = [
      '✅ <b>Группа подключена к Kamizo</b>',
      '',
      `🏠 ${escapeHtml(address)}${entrance ? `, подъезд ${escapeHtml(entrance)}` : ''}`,
      '',
      'Сюда будут приходить объявления вашей управляющей компании.',
    ];
    if (listener) {
      lines.push(
        '',
        'Бот также читает новые сообщения группы, чтобы замечать сообщения о проблемах ЖКХ и предлагать оформить заявку.',
        'История переписки не сохраняется, текст сохраняется только если вы сами оформите заявку.'
      );
    }
    return lines.join('\n');
  },

  groupBadToken: '⚠️ Ссылка подключения недействительна или устарела. Попросите администратора УК сформировать новую в разделе «Настройки → Интеграции → Telegram».',
  groupTaken: '⚠️ Эта группа уже подключена к Kamizo. Сначала отключите её в кабинете управляющей компании.',
};

// ──────────────────────────────────────────────────────────────────
// Идемпотентность (§20).
//
// Захватываем update_id ДО любой обработки. INSERT OR IGNORE атомарен,
// поэтому две одновременные доставки одного апдейта разрешаются на
// уровне БД: строку вставит ровно одна, вторая увидит changes === 0 и
// уйдёт молча. Проверять SELECT-ом и потом вставлять было бы гонкой.
async function claimUpdate(env: Env, updateId: unknown): Promise<boolean> {
  if (updateId === undefined || updateId === null) return true;
  const res = await env.DB.prepare(
    'INSERT OR IGNORE INTO telegram_updates (update_id) VALUES (?)'
  ).bind(String(updateId)).run();
  return !!res.meta?.changes;
}

// Уборка журнала дедупликации. Telegram прекращает ретраи многократно
// раньше семи суток, так что более старая запись уже ни от чего не
// защищает. Чистим вероятностно (~1 вызов из 200), чтобы не платить
// DELETE на каждом апдейте.
async function sweepUpdates(env: Env): Promise<void> {
  if (Math.random() > 0.005) return;
  await env.DB.prepare(
    `DELETE FROM telegram_updates WHERE received_at < datetime('now', '-7 days')`
  ).run();
}

export function registerTelegramWebhookRoutes() {

route('POST', '/api/telegram/webhook', async (request, env) => {
  const log = createRequestLogger(request);
  const e = env as Env;

  // ── Аутентификация ──────────────────────────────────────────────
  // secret_token задаётся при setWebhook и приходит этим заголовком.
  // Без проверки любой, кто знает URL, шлёт нам поддельные апдейты и
  // подключает свою группу к чужому дому или привязывает свой Telegram
  // к чужому аккаунту. Сравнение за постоянное время, чтобы секрет не
  // восстановили по таймингам ответа.
  const secret = e.TELEGRAM_WEBHOOK_SECRET;
  const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!secret || !timingSafeEqual(provided, secret)) {
    // 401 — единственный случай, когда мы сознательно НЕ отвечаем 200.
    // Настоящий Telegram сюда не попадёт, а ретраить чужие запросы не
    // наша забота.
    log.warn('telegram_webhook_bad_secret');
    return json({ ok: false }, 401);
  }

  // Дальше — что бы ни случилось, ответ 200. Ошибки только в лог.
  try {
    const update = await request.json() as any;

    if (!await claimUpdate(e, update?.update_id)) {
      log.info('telegram_update_duplicate', { updateId: update?.update_id });
      return json({ ok: true });
    }
    await sweepUpdates(e);

    // ── callback_query ────────────────────────────────────────────
    // Нажатие inline-кнопки. Пока единственный источник — подтверждение
    // входа (§17); resolveLoginRequest сам игнорирует чужие callback_data.
    if (update.callback_query) {
      // Два источника кнопок: подтверждение входа (`la:`) и предложение
      // оформить заявку (`sg:`). Каждый обработчик сам отсеивает чужой
      // callback_data по префиксу.
      await resolveLoginRequest(e, update.callback_query, log);
      await handleSuggestionCallback(e, update.callback_query, log);
      return json({ ok: true });
    }

    // ── my_chat_member / chat_member ──────────────────────────────
    // Бота добавили, выгнали, повысили до админа или забрали права.
    if (update.my_chat_member || update.chat_member) {
      await handleChatMember(e, update.my_chat_member || update.chat_member, log);
      return json({ ok: true });
    }

    const message = update.message || update.edited_message;
    if (!message) return json({ ok: true });

    // §20: группу преобразовали в супергруппу — chat_id меняется, и
    // старый становится мёртвым. Переносим привязку, иначе объявления
    // будут уходить в никуда.
    if (message.migrate_to_chat_id) {
      await e.DB.prepare(
        `UPDATE telegram_groups SET telegram_chat_id = ?
         WHERE telegram_chat_id = ? AND disabled_at IS NULL`
      ).bind(String(message.migrate_to_chat_id), String(message.chat.id)).run();
      log.info('telegram_chat_migrated', {
        from: message.chat?.id, to: message.migrate_to_chat_id,
      });
      return json({ ok: true });
    }

    const text: string = message.text || '';
    const chatId = message.chat?.id;
    const chatType: string = message.chat?.type || '';

    // §14: не реагируем на сообщения ботов, включая собственные.
    if (!chatId || message.from?.is_bot) return json({ ok: true });

    // Обычное (не командное) сообщение в группе — работа умного
    // диспетчера (§11). Внутри стоит собственный отсев: он молча
    // выходит, если у группы не включён listener_enabled.
    //
    // Только update.message, НЕ edited_message: §14 требует «не
    // реагировать на старые или отредактированные сообщения без
    // необходимости». Правка чужого сообщения не должна порождать
    // повторное предложение по той же проблеме.
    if (!text.startsWith('/')) {
      const isGroupChat = message.chat?.type === 'group' || message.chat?.type === 'supergroup';
      if (isGroupChat && update.message) {
        await handleGroupMessage(e, message, log);
      }
      return json({ ok: true });
    }

    // Команда в группе приходит как "/start@kamizobot <payload>".
    // Отрезаем @username, чтобы разбор не зависел от имени бота.
    const parts = text.split(/\s+/);
    const command = parts[0].split('@')[0];
    const payload = parts[1];

    const isGroup = chatType === 'group' || chatType === 'supergroup';

    if (isGroup) {
      // Команды в группе: только подключение по токену. Остальные
      // игнорируем молча — бот не должен отвечать на каждую команду в
      // домовом чате.
      if (command === '/start' && payload) {
        await handleGroupConnect(e, message, payload, log);
      }
      return json({ ok: true });
    }

    // ── Личный чат ────────────────────────────────────────────────
    const tgLang: string = message.from?.language_code || '';
    let ru = !tgLang.startsWith('uz');

    if (command === '/start') {
      if (!payload) {
        await sendTelegramMessage(e, chatId, T.bareStart(ru));
        return json({ ok: true });
      }

      // Живой токен: не использован и не истёк.
      //
      // Срок сверяем в JS, а НЕ через `expires_at > datetime('now')` в
      // SQL. Первая версия делала именно так и была дырявой: link.ts
      // пишет expires_at как toISOString() — "2026-08-26T15:40:00.000Z",
      // тогда как datetime('now') отдаёт "2026-08-26 15:30:00". SQLite
      // сравнивает эти строки побайтово и на 10-й позиции встречает 'T'
      // (0x54) против пробела (0x20). 'T' больше ВСЕГДА, поэтому условие
      // оставалось истинным при любом времени в пределах одних UTC-суток:
      // токен со сроком 10 минут на деле жил до полуночи. Для
      // предъявительской ссылки, дающей привязку чужого Telegram к
      // аккаунту, это не мелочь.
      //
      // new Date(...) парсит ISO-строку однозначно, так что часовой пояс
      // процесса ни на что не влияет. Ровно так же устроена проверка в
      // meetings/otp.ts.
      const row = await e.DB.prepare(
        `SELECT id, user_id, expires_at FROM telegram_link_tokens
         WHERE token = ? AND used_at IS NULL`
      ).bind(payload).first() as any;

      if (!row || new Date(row.expires_at) < new Date()) {
        await sendTelegramMessage(e, chatId, T.badToken(ru));
        return json({ ok: true });
      }

      const user = await e.DB.prepare(
        'SELECT id, name, language, tenant_id FROM users WHERE id = ?'
      ).bind(row.user_id).first() as any;
      if (!user) {
        await sendTelegramMessage(e, chatId, T.badToken(ru));
        return json({ ok: true });
      }
      ru = (user.language || 'ru') === 'ru';

      // Прежняя версия здесь обнуляла привязку у ВСЕХ остальных
      // пользователей с этим chat_id, навязывая правило «один Telegram
      // = один аккаунт Kamizo». §16 требует обратного: один человек
      // законно имеет аккаунты в нескольких тенантах (владеет
      // квартирой у одной УК, арендует у другой) с одним Telegram.
      // Поэтому чужие привязки больше не трогаем.
      //
      // Гасим только предыдущую привязку ЭТОГО аккаунта: активная
      // строка на user_id должна быть одна, иначе непонятно, в какой
      // чат слать код подтверждения. Это же требование держит
      // частичный UNIQUE(user_id) WHERE revoked_at IS NULL.
      await e.DB.prepare(
        `UPDATE telegram_users SET revoked_at = datetime('now')
         WHERE user_id = ? AND revoked_at IS NULL`
      ).bind(user.id).run();

      await e.DB.prepare(`
        INSERT INTO telegram_users
          (id, tenant_id, user_id, telegram_user_id, telegram_chat_id, telegram_username)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(
        generateId(),
        user.tenant_id || '',
        user.id,
        String(message.from?.id ?? chatId),
        String(chatId),
        message.from?.username || null
      ).run();

      // Гасим токен ПОСЛЕ успешной привязки: упади INSERT выше — токен
      // остаётся живым и пользователь повторит по той же ссылке.
      await e.DB.prepare(
        `UPDATE telegram_link_tokens SET used_at = datetime('now') WHERE id = ?`
      ).bind(row.id).run();

      await sendTelegramMessage(e, chatId, T.linked(ru, escapeHtml(user?.name || '')));
      log.info('telegram_linked', { userId: row.user_id });
      return json({ ok: true });
    }

    if (command === '/unlink') {
      // На один chat_id теперь может приходиться НЕСКОЛЬКО активных
      // привязок — по одной на аккаунт в разных тенантах (§16).
      // Отвязываем все: из чата с ботом человек не может выбрать, какой
      // именно аккаунт отключить (он не видит внутренних id), а
      // выборочный отзыв доступен в самом приложении. Команда в боте —
      // это «перестаньте мне писать», и понимать её надо буквально.
      const { results } = await e.DB.prepare(
        `SELECT t.id, t.user_id, u.language
         FROM telegram_users t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.telegram_chat_id = ? AND t.revoked_at IS NULL`
      ).bind(String(chatId)).all();
      const links = (results || []) as any[];

      if (!links.length) {
        await sendTelegramMessage(e, chatId, T.notLinked(ru));
        return json({ ok: true });
      }
      ru = (links[0].language || 'ru') === 'ru';

      await e.DB.prepare(
        `UPDATE telegram_users SET revoked_at = datetime('now')
         WHERE telegram_chat_id = ? AND revoked_at IS NULL`
      ).bind(String(chatId)).run();

      await sendTelegramMessage(e, chatId, T.unlinked(ru));
      log.info('telegram_unlinked', { count: links.length });
      return json({ ok: true });
    }

    await sendTelegramMessage(e, chatId, T.help(ru));
    return json({ ok: true });

  } catch (err: any) {
    // Правило 1: 200 при любой внутренней ошибке. Иначе Telegram
    // ретраит битый апдейт по кругу и в итоге снимает вебхук.
    log.error('telegram_webhook_error', err);
    return json({ ok: true });
  }
});

} // end registerTelegramWebhookRoutes

// ──────────────────────────────────────────────────────────────────
// Подключение группы по одноразовому токену (§6).
//
// Данные о тенанте и доме берутся ИСКЛЮЧИТЕЛЬНО из строки
// telegram_group_tokens, найденной по токену. Ничего из Telegram-апдейта
// источником tenant_id/building_id не является — это прямое требование
// §3. Из апдейта берётся только chat_id и название чата.
async function handleGroupConnect(
  env: Env, message: any, token: string, log: any
): Promise<void> {
  const chatId = String(message.chat.id);

  const tok = await env.DB.prepare(
    `SELECT id, tenant_id, building_id, entrance, announcements_enabled,
            listener_enabled, created_by, expires_at
     FROM telegram_group_tokens WHERE token = ? AND used_at IS NULL`
  ).bind(token).first() as any;

  // Срок — в JS, по той же причине, что описана выше для личных токенов.
  if (!tok || new Date(tok.expires_at) < new Date()) {
    await sendTelegramMessage(env, chatId, T.groupBadToken);
    return;
  }

  // §6 шаг 2: права администратора проверяются ПОВТОРНО, а не только
  // при выдаче токена. Между выдачей и предъявлением могло пройти до
  // получаса — сотрудника успели уволить или перевести в другого
  // тенанта. Проверяем и роль, и принадлежность тому же тенанту.
  const admin = await env.DB.prepare(
    'SELECT id, role FROM users WHERE id = ? AND tenant_id = ? AND is_active = 1'
  ).bind(tok.created_by, tok.tenant_id).first() as any;
  const MANAGEMENT = ['super_admin', 'admin', 'director', 'manager', 'department_head'];
  if (!admin || !MANAGEMENT.includes(admin.role)) {
    await sendTelegramMessage(env, chatId, T.groupBadToken);
    log.warn('telegram_group_connect_admin_revoked', { tokenId: tok.id });
    return;
  }

  // §6 шаг 3: дом всё ещё принадлежит этому тенанту.
  const building = await env.DB.prepare(
    'SELECT id, name, address FROM buildings WHERE id = ? AND tenant_id = ?'
  ).bind(tok.building_id, tok.tenant_id).first() as any;
  if (!building) {
    await sendTelegramMessage(env, chatId, T.groupBadToken);
    log.warn('telegram_group_connect_building_gone', { tokenId: tok.id });
    return;
  }

  // Частичный UNIQUE по telegram_chat_id среди активных строк не даст
  // подключить один чат дважды — в том числе к двум разным тенантам
  // (§7). Ловим конфликт, а не проверяем заранее: предварительный
  // SELECT оставлял бы гонку между двумя одновременными подключениями.
  try {
    await env.DB.prepare(`
      INSERT INTO telegram_groups
        (id, tenant_id, building_id, entrance, telegram_chat_id,
         telegram_chat_title, listener_enabled, announcements_enabled,
         bot_status, connected_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'member', ?)
    `).bind(
      generateId(), tok.tenant_id, tok.building_id, tok.entrance, chatId,
      message.chat.title || null, tok.listener_enabled,
      tok.announcements_enabled, tok.created_by
    ).run();
  } catch (err: any) {
    if (/UNIQUE|constraint/i.test(String(err?.message || err))) {
      await sendTelegramMessage(env, chatId, T.groupTaken);
      return;
    }
    throw err;
  }

  await env.DB.prepare(
    `UPDATE telegram_group_tokens SET used_at = datetime('now') WHERE id = ?`
  ).bind(tok.id).run();

  await sendTelegramMessage(env, chatId, T.groupConnected(
    building.address || building.name || '',
    tok.entrance,
    tok.listener_enabled === 1
  ));

  log.info('telegram_group_connected', {
    tenantId: tok.tenant_id, buildingId: tok.building_id,
  });
}

// ──────────────────────────────────────────────────────────────────
// Изменение статуса бота в чате (§20).
//
// Нас интересует только собственный статус: выгнали, вернули, повысили
// до администратора. Обновляем bot_status, чтобы фанаут не тратил
// вызовы на мёртвые чаты, а админ УК видел реальное положение дел (§19).
//
// Группу при изгнании НЕ отключаем автоматически: disabled_at — решение
// администратора УК. Бота могли выгнать по ошибке и вернуть через
// минуту, а автоотключение потребовало бы заново проходить подключение.
async function handleChatMember(env: Env, upd: any, log: any): Promise<void> {
  const chatId = upd?.chat?.id;
  const status = upd?.new_chat_member?.status;
  if (!chatId || !status) return;

  const known = ['member', 'administrator', 'left', 'kicked', 'restricted'];
  if (!known.includes(status)) return;

  const res = await env.DB.prepare(
    `UPDATE telegram_groups SET bot_status = ?, telegram_chat_title = COALESCE(?, telegram_chat_title)
     WHERE telegram_chat_id = ? AND disabled_at IS NULL`
  ).bind(status, upd?.chat?.title || null, String(chatId)).run();

  if (res.meta?.changes) {
    log.info('telegram_bot_status_changed', { chatId: String(chatId), status });
  }
}
