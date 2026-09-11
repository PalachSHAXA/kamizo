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
  REMOVE_KEYBOARD,
} from '../../utils/telegram';

// Срок жизни ожидающего подтверждения. Человек прямо сейчас смотрит на
// сообщение с кнопками — десяти минут более чем достаточно, а держать
// номер в промежуточной таблице дольше незачем.
const PENDING_TTL_MINUTES = 10;

function isRussian(languageCode: unknown): boolean {
  return !String(languageCode || '').toLowerCase().startsWith('uz');
}

function contactKeyboard(ru: boolean) {
  return {
    keyboard: [[{
      text: ru ? '📱 Поделиться моим номером' : '📱 Telefon raqamimni ulashish',
      request_contact: true,
    }]],
    resize_keyboard: true,
    one_time_keyboard: true,
    selective: true,
  };
}

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
  env: Env, chatId: string | number, telegramUserId: string,
  languageCode?: string, quietWhenComplete = false
): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.phone, u.language FROM telegram_users t
    JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id
    WHERE t.telegram_user_id = ? AND t.revoked_at IS NULL
  `).bind(String(telegramUserId)).all();

  const linked = (results || []) as any[];
  const ru = linked.length
    ? (linked[0]?.language || 'ru') === 'ru'
    : isRussian(languageCode);
  if (!linked.length) {
    await sendTelegramMessage(env, chatId, ru
      ? 'Сначала, пожалуйста, привяжите аккаунт Kamizo. Откройте Kamizo → Настройки → «Привязать Telegram».'
      : 'Avval Kamizo hisobingizni ulang. Kamizo → Sozlamalar → «Telegramni ulash» bo‘limini oching.');
    return;
  }

  const missing = linked.filter(u => !u.phone || !String(u.phone).trim());
  if (!missing.length) {
    if (!quietWhenComplete) {
      await sendTelegramMessage(env, chatId, ru
        ? 'Спасибо! Ваш номер уже указан в профиле Kamizo, поэтому ничего менять не нужно.'
        : 'Rahmat! Telefon raqamingiz Kamizo profilingizda allaqachon ko‘rsatilgan, hech narsani o‘zgartirish shart emas.');
    }
    return;
  }

  await sendTelegramMessage(env, chatId,
    ru
      ? 'Пожалуйста, поделитесь своим номером, чтобы управляющая компания могла связаться с вами по заявкам, гостевому доступу или автомобилю.\n\n'
        + 'Номер не появится в группе. Сначала я покажу его вам и попрошу отдельно подтвердить сохранение в профиле Kamizo.'
      : 'Arizalar, mehmon kirishi va ro‘yxatdan o‘tgan avtomobil bo‘yicha boshqaruv kompaniyasi siz bilan bog‘lanishi uchun telefon raqamingizni ulashing.\n\n'
        + 'Raqam Telegram guruhida ko‘rinmaydi. Avval uni sizga ko‘rsataman va Kamizo profiliga saqlash uchun alohida tasdiq so‘rayman.',
    { replyMarkup: contactKeyboard(ru) }
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
  const telegramRu = isRussian(message?.from?.language_code);

  if (String(contact.user_id ?? '') !== fromId) {
    await sendTelegramMessage(env, chatId,
      telegramRu
        ? 'Похоже, вы отправили контакт другого человека. В профиль можно сохранить только ваш номер. Пожалуйста, отправьте /phone и нажмите «Поделиться моим номером».'
        : 'Boshqa odamning kontakti yuborilganga o‘xshaydi. Profilga faqat o‘z raqamingizni saqlash mumkin. /phone buyrug‘ini yuborib, «Telefon raqamimni ulashish» tugmasini bosing.',
      { replyMarkup: REMOVE_KEYBOARD }
    );
    log.warn('phone_share_foreign_contact', { fromId });
    return;
  }

  const phone = normalizePhone(contact.phone_number);
  if (!phone) {
    await sendTelegramMessage(env, chatId,
      telegramRu
        ? 'Не получилось распознать номер. Пожалуйста, отправьте /phone и попробуйте ещё раз либо укажите номер в профиле Kamizo.'
        : 'Telefon raqamini aniqlab bo‘lmadi. /phone buyrug‘ini yuborib qayta urinib ko‘ring yoki raqamni Kamizo profilida kiriting.',
      { replyMarkup: REMOVE_KEYBOARD }
    );
    return;
  }

  const { results } = await env.DB.prepare(`
    SELECT u.id, u.name, u.phone, u.language, t.tenant_id FROM telegram_users t
    JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id
    WHERE t.telegram_user_id = ? AND t.revoked_at IS NULL
  `).bind(fromId).all();
  const linked = (results || []) as any[];
  const ru = linked.length ? (linked[0]?.language || 'ru') === 'ru' : telegramRu;

  if (!linked.length) {
    await sendTelegramMessage(env, chatId,
      ru
        ? 'Сначала, пожалуйста, привяжите аккаунт: откройте Kamizo → Настройки → «Привязать Telegram».'
        : 'Avval hisobingizni ulang: Kamizo → Sozlamalar → «Telegramni ulash» bo‘limini oching.',
      { replyMarkup: REMOVE_KEYBOARD }
    );
    return;
  }

  const id = generateId();
  const expiresAt = new Date(Date.now() + PENDING_TTL_MINUTES * 60 * 1000);
  await env.DB.prepare(
    `INSERT INTO telegram_pending_phones
       (id, tenant_id, telegram_user_id, phone, expires_at)
     VALUES (?, '__global__', ?, ?, ?)`
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
  await sendTelegramMessage(env, chatId, ru ? 'Спасибо, номер получен.' : 'Rahmat, raqam qabul qilindi.', { replyMarkup: REMOVE_KEYBOARD });

  // Нечего делать: этот номер уже стоит везде, где мог бы.
  if (!empty.length && !conflicting.length) {
    await env.DB.prepare(
      `UPDATE telegram_pending_phones SET used_at = datetime('now')
       WHERE id = ? AND tenant_id = '__global__'`
    ).bind(id).run();
    await sendTelegramMessage(env, chatId,
      ru
        ? '📱 Этот номер уже сохранён в вашем профиле Kamizo. Всё в порядке, ничего менять не нужно.'
        : '📱 Bu raqam Kamizo profilingizda allaqachon saqlangan. Hammasi joyida, hech narsani o‘zgartirish shart emas.');
    return;
  }

  const lines = [
    ru ? `📱 Ваш номер: <b>${escapeHtml(prettyPhone(phone))}</b>` : `📱 Telefon raqamingiz: <b>${escapeHtml(prettyPhone(phone))}</b>`,
    '',
  ];

  if (empty.length) {
    lines.push(ru
      ? (empty.length > 1
          ? `Этот номер можно сохранить в ${empty.length} профилях, где контакт пока не указан. Сохранить?`
          : 'В профиле Kamizo номер пока не указан. Сохранить этот номер?')
      : (empty.length > 1
          ? `Bu raqamni kontakt ko‘rsatilmagan ${empty.length} ta profilga saqlash mumkin. Saqlaymizmi?`
          : 'Kamizo profilingizda raqam hozircha ko‘rsatilmagan. Bu raqamni saqlaymizmi?'));
  }

  if (conflicting.length) {
    if (empty.length) lines.push('');
    const list = conflicting.map(u => `• ${escapeHtml(String(u.phone).trim())}`).join('\n');
    lines.push(ru
      ? (conflicting.length > 1
          ? `В других профилях уже сохранены номера:\n${list}\nИх можно оставить без изменений или заменить.`
          : `В другом профиле уже сохранён номер:\n${list}\nЕго можно оставить без изменений или заменить.`)
      : (conflicting.length > 1
          ? `Boshqa profillarda quyidagi raqamlar saqlangan:\n${list}\nUlarni o‘zgartirmasdan qoldirish yoki almashtirish mumkin.`
          : `Boshqa profilda quyidagi raqam saqlangan:\n${list}\nUni o‘zgartirmasdan qoldirish yoki almashtirish mumkin.`));
  }

  // Кнопки в столбец: три длинные подписи в одну строку Telegram
  // сожмёт до нечитаемого. Набор зависит от того, есть ли что заполнять
  // и есть ли что заменять — лишних вариантов не показываем.
  const rows: { text: string; callback_data: string }[][] = [];
  if (empty.length) {
    rows.push([{
      text: ru
        ? (conflicting.length ? '✅ Сохранить только в пустых' : '✅ Да, сохранить номер')
        : (conflicting.length ? '✅ Faqat bo‘sh profillarga' : '✅ Ha, raqamni saqlash'),
      callback_data: `ph:y:${id}`,
    }]);
  }
  if (conflicting.length) {
    rows.push([{ text: ru ? '🔁 Заменить во всех профилях' : '🔁 Barcha profillarda almashtirish', callback_data: `ph:a:${id}` }]);
  }
  rows.push([{ text: ru ? 'Нет, спасибо' : 'Yo‘q, rahmat', callback_data: `ph:n:${id}` }]);

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
  let ru = isRussian(callback?.from?.language_code);

  const pending = await env.DB.prepare(
    `SELECT * FROM telegram_pending_phones
     WHERE id = ? AND tenant_id = '__global__'`
  ).bind(pendingId).first() as any;

  if (pending) {
    const profile = await env.DB.prepare(`
      SELECT u.language FROM telegram_users t
      JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id
      WHERE t.telegram_user_id = ? AND t.revoked_at IS NULL
      ORDER BY t.linked_at ASC LIMIT 1
    `).bind(fromId).first() as any;
    if (profile?.language) ru = profile.language === 'ru';
  }

  if (!pending || pending.used_at) {
    await answerCallbackQuery(env, callback.id, ru ? 'Этот запрос уже обработан' : 'Bu so‘rov allaqachon ko‘rib chiqilgan');
    return;
  }
  // Срок — в JS: expires_at хранится ISO-строкой.
  if (new Date(pending.expires_at) < new Date()) {
    await answerCallbackQuery(env, callback.id, ru ? 'Время подтверждения истекло' : 'Tasdiqlash vaqti tugadi');
    return;
  }
  // Подтверждает тот же человек, что делился.
  if (String(pending.telegram_user_id) !== fromId) {
    await answerCallbackQuery(env, callback.id, ru ? 'Эта кнопка доступна только владельцу номера' : 'Bu tugma faqat raqam egasi uchun');
    return;
  }

  await env.DB.prepare(
    `UPDATE telegram_pending_phones SET used_at = datetime('now')
     WHERE id = ? AND tenant_id = '__global__' AND used_at IS NULL`
  ).bind(pendingId).run();

  if (action === 'n') {
    await answerCallbackQuery(env, callback.id, ru ? 'Хорошо, номер не сохранён' : 'Yaxshi, raqam saqlanmadi');
    if (chatId) {
      await editTelegramMessage(env, chatId, callback.message.message_id,
        ru
          ? 'Хорошо, номер не сохранён. Если передумаете, укажите его в профиле Kamizo или отправьте команду /phone.'
          : 'Yaxshi, raqam saqlanmadi. Keyinroq uni Kamizo profilida yoki /phone buyrug‘i orqali ko‘rsatishingiz mumkin.');
    }
    return;
  }

  // §16: один Telegram может быть привязан к аккаунтам в нескольких УК.
  const { results } = await env.DB.prepare(`
    SELECT u.id, u.name, u.phone, t.tenant_id FROM telegram_users t
    JOIN users u ON u.id = t.user_id AND u.tenant_id = t.tenant_id
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
       WHERE id = ? AND tenant_id = ?${onlyEmpty ? " AND (phone IS NULL OR TRIM(phone) = '')" : ''}`
    ).bind(pending.phone, u.id, u.tenant_id).run();
    changed += res.meta?.changes || 0;
  }

  await answerCallbackQuery(env, callback.id, changed
    ? (ru ? 'Спасибо, номер сохранён' : 'Rahmat, raqam saqlandi')
    : (ru ? 'Номер уже был сохранён' : 'Raqam allaqachon saqlangan'));
  if (chatId) {
    const tail = onlyEmpty && linked.length > changed
      ? (ru ? '\n\nОстальные профили оставлены без изменений.' : '\n\nQolgan profillar o‘zgartirilmadi.')
      : '';
    await editTelegramMessage(env, chatId, callback.message.message_id,
      changed
        ? (ru
            ? `✅ Спасибо! Номер <b>${escapeHtml(prettyPhone(pending.phone))}</b> сохранён${changed > 1 ? ` в ${changed} профилях Kamizo` : ' в профиле Kamizo'}.${tail}\n\nИзменить его можно в приложении или командой /phone.`
            : `✅ Rahmat! <b>${escapeHtml(prettyPhone(pending.phone))}</b> raqami${changed > 1 ? ` ${changed} ta Kamizo profilida` : ' Kamizo profilida'} saqlandi.${tail}\n\nUni ilovada yoki /phone buyrug‘i orqali o‘zgartirish mumkin.`)
        : (ru ? 'Всё в порядке: этот номер уже был сохранён.' : 'Hammasi joyida: bu raqam allaqachon saqlangan.'));
  }

  log.info('phone_saved_from_telegram', { mode: action, changed, linked: linked.length });
}
