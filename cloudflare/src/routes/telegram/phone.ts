// Сбор номера телефона через кнопку «Поделиться контактом».
//
// Зачем: на проде телефон заполнен примерно у 30 жителей из 3040, а
// выдача кода подтверждения без него отказывает. Просить людей
// заполнить профиль руками — заведомо провальный путь; Telegram отдаёт
// номер в одно нажатие, и этот номер ПОДТВЕРЖДЁН — на него
// зарегистрирован аккаунт.
//
// Флоу в два шага, и второй не формальность:
//   1. Житель жмёт «Поделиться номером» → приходит message.contact.
//   2. Бот показывает номер и спрашивает, записать ли его в профиль.
//      «Да» → номер уходит в users.phone.
//
// Второй шаг — это и есть согласие на обработку персональных данных.
// Само по себе нажатие «поделиться» ещё не означает согласия отдать
// номер управляющей компании: человек мог просто ответить боту.

import type { Env } from '../../types';
import { generateId } from '../../utils/helpers';
import {
  sendTelegramMessage, editTelegramMessage, answerCallbackQuery, escapeHtml,
  REQUEST_CONTACT_KEYBOARD, REMOVE_KEYBOARD,
} from '../../utils/telegram';

// Срок жизни ожидающего подтверждения. Человек прямо сейчас смотрит на
// сообщение с кнопками — десяти минут более чем достаточно, а держать
// номер в промежуточной таблице дольше незачем.
const PENDING_TTL_MINUTES = 10;

// Нормализация к E.164.
//
// Telegram отдаёт phone_number то с плюсом, то без («998901234567»).
// Разнобой в базе ударит позже: Telegram Gateway принимает строго
// E.164, а поиск жителя по номеру не найдёт совпадения между
// «+998901234567» и «998901234567».
//
// Узбекские номера — 12 цифр (998 + 9). Всё, что не похоже, оставляем
// как пришло с ведущим плюсом: чужие форматы ломать не наше дело, а
// отвергать номер целиком из-за неузнанной страны — тем более.
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return `+${digits}`;
}

// Красивый вид для сообщения: +998 90 123-45-67.
function prettyPhone(e164: string): string {
  const m = /^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  return m ? `+998 ${m[1]} ${m[2]}-${m[3]}-${m[4]}` : e164;
}

// ──────────────────────────────────────────────────────────────────
// Предложить поделиться номером.
//
// Зовётся после успешной привязки и по команде /phone. Молчит, если
// номер уже есть во всех привязанных аккаунтах: незачем просить то,
// что уже получено.
export async function offerPhoneShare(
  env: Env, chatId: string | number, telegramUserId: string
): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.phone FROM telegram_users t
    JOIN users u ON u.id = t.user_id
    WHERE t.telegram_user_id = ? AND t.revoked_at IS NULL
  `).bind(String(telegramUserId)).all();

  const linked = (results || []) as any[];
  if (!linked.length) return;

  const missing = linked.filter(u => !u.phone || !String(u.phone).trim());
  if (!missing.length) return;

  await sendTelegramMessage(env, chatId,
    'Чтобы управляющая компания могла связаться с вами по заявкам, поделитесь номером телефона.\n\n'
    + 'Номер попадёт в ваш профиль Kamizo только после отдельного подтверждения — на следующем шаге вы увидите его и решите сами.',
    { replyMarkup: REQUEST_CONTACT_KEYBOARD }
  );
}

// ──────────────────────────────────────────────────────────────────
// Пришёл контакт.
//
// Главная проверка здесь — contact.user_id против from.id.
//
// В Telegram можно переслать боту карточку ЛЮБОГО человека из адресной
// книги, и она приходит тем же message.contact. Поле user_id
// заполняется только когда контакт принадлежит самому отправителю.
// Без этой сверки житель запишет себе в профиль номер соседа, и УК
// будет звонить не туда — а по журналу это будет выглядеть как
// добровольно предоставленный номер.
export async function handleContactShared(
  env: Env, message: any, log: any
): Promise<void> {
  const chatId = message?.chat?.id;
  const fromId = String(message?.from?.id ?? '');
  const contact = message?.contact;
  if (!chatId || !fromId || !contact) return;

  if (String(contact.user_id ?? '') !== fromId) {
    await sendTelegramMessage(env, chatId,
      '⚠️ Это чужой контакт.\n\nВ профиль можно записать только собственный номер — нажмите кнопку «Поделиться номером», а не пересылайте карточку из адресной книги.',
      { replyMarkup: REMOVE_KEYBOARD }
    );
    log.warn('phone_share_foreign_contact', { fromId });
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await sendTelegramMessage(env, chatId,
      '⚠️ Не удалось разобрать номер. Попробуйте ещё раз или укажите его в профиле Kamizo вручную.',
      { replyMarkup: REMOVE_KEYBOARD }
    );
    return;
  }

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.name, u.phone, t.tenant_id FROM telegram_users t
    JOIN users u ON u.id = t.user_id
    WHERE t.telegram_user_id = ? AND t.revoked_at IS NULL
  `).bind(fromId).all();
  const linked = (results || []) as any[];

  if (!linked.length) {
    await sendTelegramMessage(env, chatId,
      'Сначала привяжите аккаунт: откройте Kamizo → Настройки → «Привязать Telegram».',
      { replyMarkup: REMOVE_KEYBOARD }
    );
    return;
  }

  const id = generateId();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000);
  await env.DB.prepare(
    'INSERT INTO telegram_pending_phones (id, telegram_user_id, phone, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(id, fromId, phone, expiresAt.toISOString()).run();

  // Аккаунты делятся на три группы, и обращаться с ними одинаково
  // нельзя.
  //
  // Первая версия писала номер во ВСЕ привязки разом. На реальных
  // данных это сразу вылезло: у одного аккаунта поле пустое, у другого
  // стоит осмысленный рабочий номер — и оба перезаписывались молча.
  // Человек делится контактом, чтобы ЗАПОЛНИТЬ пустое поле, а заодно
  // менял контакт там, где он был выставлен осознанно.
  const isBlank = (p: unknown) => !String(p ?? '').trim();
  const empty = linked.filter(u => isBlank(u.phone));
  const conflicting = linked.filter(u => !isBlank(u.phone) && String(u.phone).trim() !== phone);
  const already = linked.filter(u => String(u.phone ?? '').trim() === phone);

  // Клавиатуру запроса контакта снимаем отдельным ходом: reply-разметку
  // и inline-кнопки в одном сообщении Telegram не совмещает.
  await sendTelegramMessage(env, chatId, 'Спасибо!', { replyMarkup: REMOVE_KEYBOARD });

  // Нечего делать: этот номер уже стоит везде, где мог бы.
  if (!empty.length && !conflicting.length) {
    await env.DB.prepare(
      `UPDATE telegram_pending_phones SET used_at = datetime('now') WHERE id = ?`
    ).bind(id).run();
    await sendTelegramMessage(env, chatId,
      `📱 Этот номер уже указан в вашем профиле Kamizo (${already.length}). Ничего менять не нужно.`);
    return;
  }

  const lines = [`📱 Ваш номер: <b>${escapeHtml(prettyPhone(phone))}</b>`, ''];

  if (empty.length) {
    lines.push(empty.length > 1
      ? `Профилей без номера: ${empty.length}. Записать туда этот номер как рабочий?`
      : 'В вашем профиле Kamizo номер не указан. Записать туда этот как рабочий?');
  }

  if (conflicting.length) {
    if (empty.length) lines.push('');
    const list = conflicting.map(u => `• ${escapeHtml(String(u.phone).trim())}`).join('\n');
    lines.push(
      conflicting.length > 1
        ? `А в других профилях уже указаны другие номера:\n${list}`
        : `А в другом профиле уже указан другой номер:\n${list}`,
      'Их можно оставить как есть или заменить.'
    );
  }

  // Кнопки в столбец: три длинные подписи в одну строку Telegram
  // сожмёт до нечитаемого. Набор зависит от того, есть ли что заполнять
  // и есть ли что заменять — лишних вариантов не показываем.
  const rows: { text: string; callback_data: string }[][] = [];
  if (empty.length) {
    rows.push([{
      text: conflicting.length ? '✅ Заполнить только пустые' : '✅ Да, это мой рабочий номер',
      callback_data: `ph:y:${id}`,
    }]);
  }
  if (conflicting.length) {
    rows.push([{ text: '🔁 Заменить во всех профилях', callback_data: `ph:a:${id}` }]);
  }
  rows.push([{ text: 'Нет', callback_data: `ph:n:${id}` }]);

  await sendTelegramMessage(env, chatId, lines.join('\n'), {
    replyMarkup: { inline_keyboard: rows },
  });
}

// ──────────────────────────────────────────────────────────────────
// Подтверждение записи номера.
//
// В callback_data лежит только идентификатор строки — сам номер
// читается из БД. Причина: callback_data формирует клиент, и
// модифицированный клиент прислал бы любой номер, какой захочет.
export async function handlePhoneCallback(
  env: Env, callback: any, log: any
): Promise<void> {
  const data: string = callback?.data || '';
  if (!data.startsWith('ph:')) return;

  // y — заполнить только пустые, a — заменить везде, n — отказ.
  const [, action, pendingId] = data.split(':');
  if (!pendingId || !['y', 'a', 'n'].includes(action)) return;

  const chatId = callback?.message?.chat?.id;
  const fromId = String(callback?.from?.id ?? '');

  const pending = await env.DB.prepare(
    'SELECT * FROM telegram_pending_phones WHERE id = ?'
  ).bind(pendingId).first() as any;

  if (!pending || pending.used_at) {
    await answerCallbackQuery(env, callback.id, 'Запрос уже обработан');
    return;
  }
  // Срок — в JS: expires_at хранится ISO-строкой.
  if (new Date(pending.expires_at) < new Date()) {
    await answerCallbackQuery(env, callback.id, 'Срок запроса истёк');
    return;
  }
  // Подтверждает тот же человек, что делился.
  if (String(pending.telegram_user_id) !== fromId) {
    await answerCallbackQuery(env, callback.id, 'Недостаточно прав');
    return;
  }

  await env.DB.prepare(
    `UPDATE telegram_pending_phones SET used_at = datetime('now')
     WHERE id = ? AND used_at IS NULL`
  ).bind(pendingId).run();

  if (action === 'n') {
    await answerCallbackQuery(env, callback.id, 'Хорошо, номер не сохранён');
    if (chatId) {
      await editTelegramMessage(env, chatId, callback.message.message_id,
        'Номер не сохранён. Указать его можно в профиле Kamizo или командой /phone.');
    }
    return;
  }

  // §16: один Telegram может быть привязан к аккаунтам в нескольких УК.
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.name, u.phone FROM telegram_users t
    JOIN users u ON u.id = t.user_id
    WHERE t.telegram_user_id = ? AND t.revoked_at IS NULL
  `).bind(fromId).all();
  const linked = (results || []) as any[];

  // 'y' заполняет только пустые: условие вынесено в сам UPDATE, а не в
  // предварительную выборку. Между показом кнопок и нажатием человек
  // мог указать номер в приложении — фильтр по свежепрочитанной строке
  // пропустил бы это и всё равно перезаписал.
  const onlyEmpty = action === 'y';
  let changed = 0;
  for (const u of linked) {
    const res = await env.DB.prepare(
      `UPDATE users SET phone = ?, updated_at = datetime('now')
       WHERE id = ?${onlyEmpty ? " AND (phone IS NULL OR TRIM(phone) = '')" : ''}`
    ).bind(pending.phone, u.id).run();
    changed += res.meta?.changes || 0;
  }

  await answerCallbackQuery(env, callback.id, changed ? 'Номер сохранён' : 'Изменений не потребовалось');
  if (chatId) {
    const tail = onlyEmpty && linked.length > changed
      ? '\n\nОстальные профили оставлены без изменений.'
      : '';
    await editTelegramMessage(env, chatId, callback.message.message_id,
      changed
        ? `✅ Номер <b>${escapeHtml(prettyPhone(pending.phone))}</b> записан${changed > 1 ? ` в профили Kamizo (${changed})` : ' в профиль Kamizo'}.${tail}\n\nИзменить его можно в приложении или командой /phone.`
        : 'Ничего не изменилось — номер уже был указан.');
  }

  log.info('phone_saved_from_telegram', { mode: action, changed, linked: linked.length });
}
