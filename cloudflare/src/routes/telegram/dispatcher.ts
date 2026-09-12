// Умный диспетчер в домовой группе (§11–§15 ТЗ, Этап 2).
//
// Бот читает новые сообщения подключённых групп, замечает признаки
// проблем ЖКХ и предлагает оформить заявку. Сам заявку НЕ создаёт —
// §27 это запрещает прямым текстом. Всё, что он делает, — присылает
// кнопку, ведущую в приложение с предзаполненной формой, которую
// человек проверяет и отправляет сам.
//
// Три вещи, которые здесь важнее кода:
//
//   1. Слушатель включается ТОЛЬКО у групп с listener_enabled = 1, а
//      этот флаг администратор УК ставит вручную, увидев предупреждение
//      из §15 о том, что бот начнёт получать сообщения группы.
//   2. Текст сообщений не сохраняется. В telegram_suggestions пишутся
//      категория, уверенность и id сообщения — этого хватает антиспаму
//      и статистике. Текст уходит в БД только если человек сам нажал
//      «Оформить заявку»: тогда он кладётся в черновик с коротким
//      сроком жизни. §15: «не создавать скрытый архив сообщений».
//   3. Сначала работают локальные правила. Неуверенные сообщения могут
//      попасть только в локальную модель на loopback VPS; внешний AI URL
//      код отклоняет. При перегрузке или ошибке модель молча пропускается.

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { getTenantId } from '../../middleware/tenant';
import { json, error, generateId } from '../../utils/helpers';
import {
  sendTelegramMessage, editTelegramMessage, answerCallbackQuery,
} from '../../utils/telegram';
import {
  classifyZhkhMessage, SUGGESTION_THRESHOLD, categoryLabel,
  detectLanguage, type ZhkhLang, type ZhkhCategory,
} from '../../utils/zhkh-classifier';
import { ensureDictionaryLoaded } from '../../utils/zhkh-dictionary';
import {
  classifyNavigationIntent, type NavigationMatch, type NavigationIntent,
} from '../../utils/navigation-intent';
import { classifyWithLocalAi, getAiListenerMode } from '../../utils/local-ai-listener';
import { normalizeFeatures } from '../../lib/features';

// Тексты диспетчера на обоих языках.
//
// Язык берётся из САМОГО сообщения, а не из users.language: в группе бот
// не знает, кто написал, пока человек не привязал аккаунт. Отвечать
// по-русски на узбекское сообщение — верный способ, чтобы предложением
// не воспользовались.
//
// Узбекский апостроф здесь — модификатор ʻ, а не машинописный: по
// правилу из CLAUDE.md, чтобы не экранировать его в каждой строке.
// «о» или «об» — по первой букве подписи категории. Пока все подписи
// начинались с согласной, вопрос не вставал; «уборке» — первая с
// гласной, и «о уборке» читается как опечатка. Правило по звуку, а не
// по букве: «об аварии», но «о ёлке» и «о юге» — там в начале [й].
// Категория классификатора → специализация исполнителя.
//
// Это два разных словаря, и до сих пор они соприкасались напрямую:
// эндпоинт черновика отдавал 'leak', а форма заявки ждёт значение из
// ExecutorSpecialization ('plumber'). Совпадали случайно только
// 'elevator' и 'cleaning'; во всех прочих случаях житель, пришедший из
// группы, создавал заявку с категорией, которой нет ни в одной строке
// categories, — и она повисала, потому что маршрутизация исполнителям
// идёт по specialization.
//
// Соответствие огрублённое и это осознанно: классификатор различает
// протечку и канализацию, а чинит и то и другое сантехник. Освещение
// уходит к электрику по той же причине. 'common_property' сваливает в
// 'other' — под ним и двери, и крыша, и домофон, и развести их без
// повторной классификации нельзя, а угадывать хуже, чем честно
// показать «Другое» и дать человеку поправить в форме.
export const SPECIALIZATION_BY_CATEGORY: Record<ZhkhCategory, string> = {
  leak: 'plumber',
  sewage: 'plumber',
  electricity: 'electrician',
  lighting: 'electrician',
  elevator: 'elevator',
  heating: 'boiler',
  garbage: 'trash',
  cleaning: 'cleaning',
  common_property: 'other',
};

function ruPrep(label: string): string {
  return /^[аоиуэ]/.test(label) ? 'об' : 'о';
}

const D = {
  suggest: (lang: ZhkhLang, label: string) => lang === 'uz'
    ? `Bu ${label} haqidagi murojaatga o‘xshaydi.\n\nXohlasangiz, Kamizoda ariza rasmiylashtirishga yordam beraman.`
    : `Похоже, вы сообщаете ${ruPrep(label)} ${label}.\n\nЕсли хотите, я помогу оформить заявку в Kamizo.`,

  btnCreate: (lang: ZhkhLang) => lang === 'uz'
    ? '📝 Ariza rasmiylashtirish' : '📝 Оформить заявку',
  btnSkipRu: 'Спасибо, не нужно',
  btnSkipUz: 'Rahmat, kerak emas',

  dismissed: (lang: ZhkhLang) => lang === 'uz'
    ? 'Yaxshi, ariza yaratmaymiz.' : 'Хорошо, заявку создавать не будем.',

  dismissedToast: (lang: ZhkhLang) => lang === 'uz'
    ? 'Yaxshi, ariza yaratilmadi' : 'Хорошо, заявка не создана',

  openingToast: (lang: ZhkhLang) => lang === 'uz' ? 'Kamizo ochilmoqda' : 'Открываю форму в Kamizo',

  // Ссылка отдаётся кнопкой, а не разметкой внутри текста. Текстовый
  // якорь Telegram рисует по-разному в разных клиентах, а при
  // невалидном href молча превращает в обычный текст — человек видит
  // фразу «Открыть форму», по которой некуда нажать. С кнопкой так не
  // выйдет: она либо появится, либо запрос упадёт с ошибкой в логах.
  draft: (lang: ZhkhLang) => lang === 'uz'
    ? `📝 <b>Ariza tayyorlashga yordam beraman</b>

Maʼlumotlarni tekshirib, Kamizoda tasdiqlang. Havola 30 daqiqa amal qiladi, ariza esa faqat siz tasdiqlaganingizdan keyin yaratiladi.`
    : `📝 <b>Помогу оформить заявку</b>

Проверьте данные и подтвердите их в Kamizo. Ссылка действует 30 минут, а заявка будет создана только после вашего подтверждения.`,

  btnOpen: (lang: ZhkhLang) => lang === 'uz'
    ? '📝 Kamizoda shaklni ochish' : '📝 Открыть форму в Kamizo',

  handled: (lang: ZhkhLang) => lang === 'uz' ? 'Bu so‘rov allaqachon ko‘rib chiqilgan' : 'Этот запрос уже обработан',

  notAuthor: (lang: ZhkhLang) => lang === 'uz'
    ? 'Bu tugmadan faqat xabar muallifi foydalanishi mumkin'
    : 'Этой кнопкой может воспользоваться только автор сообщения',

  groupGone: (lang: ZhkhLang) => lang === 'uz'
    ? 'Bu guruh Kamizoga ulanmagan. Iltimos, boshqaruv kompaniyasiga murojaat qiling'
    : 'Эта группа больше не подключена к Kamizo. Пожалуйста, обратитесь в управляющую компанию',
};

// §14: «Не более одного предложения одному пользователю в одной группе
// за несколько часов», причём «Конкретное значение должно быть
// настраиваемым».
//
// Отсюда чтение из окружения, а не константа в коде. Значение подбирают
// по живым чатам, и подбирать его правкой файла с последующим деплоем —
// негодный способ. Для проверок ставится 0, для прода возвращается
// разумное число, и всё это без пересборки.
//
// Умолчания: 2 часа на человека в группе и 30 минут на повтор той же
// категории. Это осознанный компромисс — раздражение от лишнего бота в
// домовом чате обходится дороже, чем пропущенная заявка, которую житель
// всё равно может оформить руками. Но и держать человека в тишине
// полдня, как было при шести часах, чрезмерно.
//
// Значение 0 отключает соответствующую проверку целиком.
function cooldownHours(env: Env): number {
  const raw = Number(env.TELEGRAM_COOLDOWN_HOURS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 2;
}

function dedupeMinutes(env: Env): number {
  const raw = Number(env.TELEGRAM_DEDUPE_MINUTES);
  return Number.isFinite(raw) && raw >= 0 ? raw : 30;
}

// Срок жизни черновика. Человек нажал кнопку, открыл приложение, вошёл,
// проверил форму — полчаса с запасом. Дольше держать нельзя: ссылка
// видна всем участникам группового чата.
const DRAFT_TTL_MINUTES = 30;

const NAV_COPY: Record<NavigationIntent, {
  ru: string; uz: string; buttonRu: string; buttonUz: string;
}> = {
  rental_publish: {
    ru: 'Хотите сдать квартиру? Я помогу перейти к размещению объявления в Kamizo.',
    uz: 'Kvartirani ijaraga bermoqchimisiz? Kamizoda eʼlon joylashtirishga yordam beraman.',
    buttonRu: 'Разместить объявление', buttonUz: 'Eʼlon joylashtirish',
  },
  rental_browse: {
    ru: 'Ищете квартиру в аренду? Я помогу посмотреть актуальные предложения в Kamizo.',
    uz: 'Ijaraga kvartira qidiryapsizmi? Kamizodagi dolzarb takliflarni ko‘rsataman.',
    buttonRu: 'Найти квартиру', buttonUz: 'Kvartira topish',
  },
  useful_contacts: {
    ru: 'Нужен мастер или полезный номер? Подходящий контакт можно найти в Kamizo.',
    uz: 'Usta yoki kerakli telefon raqami kerakmi? Mos kontaktni Kamizodan topish mumkin.',
    buttonRu: 'Найти услугу', buttonUz: 'Xizmat topish',
  },
  marketplace: {
    ru: 'Хотите посмотреть товары и услуги? Я помогу открыть Маркет УК в Kamizo.',
    uz: 'Mahsulot yoki xizmatlarni ko‘rmoqchimisiz? Kamizodagi BK marketini ochishga yordam beraman.',
    buttonRu: 'Открыть Маркет', buttonUz: 'Marketni ochish',
  },
  vehicle_owner: {
    ru: 'Нужно найти владельца автомобиля? Введите номер машины в поиске Kamizo.',
    uz: 'Avtomobil egasini topish kerakmi? Mashina raqamini Kamizo qidiruviga kiriting.',
    buttonRu: 'Найти владельца', buttonUz: 'Egasini topish',
  },
  guest_pass: {
    ru: 'Ожидаете гостя или курьера? Я помогу быстро оформить пропуск в Kamizo.',
    uz: 'Mehmon yoki kuryer kutyapsizmi? Kamizoda ruxsatnoma rasmiylashtirishga yordam beraman.',
    buttonRu: 'Оформить пропуск', buttonUz: 'Ruxsatnoma yaratish',
  },
  qr_scan: {
    ru: 'Конечно. Открою сканер, чтобы вы могли проверить QR-пропуск.',
    uz: 'Albatta. QR-ruxsatnomani tekshirish uchun skanerni ochaman.',
    buttonRu: 'Открыть сканер', buttonUz: 'Skanerni ochish',
  },
  vehicle_menu: {
    ru: 'Конечно, помогу с автомобилем. Выберите, пожалуйста, что вам нужно:',
    uz: 'Albatta, avtomobil bo‘yicha yordam beraman. Kerakli bo‘limni tanlang:',
    buttonRu: 'Мои авто', buttonUz: 'Mening avtomobillarim',
  },
  pass_menu: {
    ru: 'Конечно, помогу. Выберите, пожалуйста: оформить гостевой пропуск или проверить QR-код.',
    uz: 'Albatta, yordam beraman. Mehmon ruxsatnomasini yaratish yoki QR-kodni tekshirishni tanlang.',
    buttonRu: 'Оформить гостя', buttonUz: 'Mehmonni rasmiylashtirish',
  },
  rental_menu: {
    ru: 'С радостью помогу с арендой. Выберите, пожалуйста: найти квартиру или разместить свою.',
    uz: 'Ijara bo‘yicha yordam beraman. Kvartira topish yoki o‘zingiznikini joylashtirishni tanlang.',
    buttonRu: 'Найти квартиру', buttonUz: 'Kvartira topish',
  },
  parking_issue: {
    ru: 'Понимаю, такая ситуация с парковкой может мешать жильцам. Сообщить об этом управляющей компании?',
    uz: 'Tushunaman, bunday to‘xtash holati aholiga xalaqit berishi mumkin. Bu haqda BKga yozamizmi?',
    buttonRu: 'Сообщить УК', buttonUz: 'BKga yozish',
  },
  barrier_issue: {
    ru: 'Понимаю. Если возникла проблема со въездом или связью с охраной, напишите в чат управляющей компании.',
    uz: 'Tushunaman. Kirish yoki qo‘riqlash bilan bog‘liq muammo bo‘lsa, boshqaruv kompaniyasi chatiga yozing.',
    buttonRu: 'Написать в чат', buttonUz: 'Chatga yozish',
  },
  resident_proposal: {
    ru: 'Спасибо за идею! Предложение по улучшению дома можно отправить управляющей компании в Kamizo.',
    uz: 'Taklifingiz uchun rahmat! Uyni yaxshilash bo‘yicha fikrni Kamizo orqali BKga yuborish mumkin.',
    buttonRu: 'Написать УК', buttonUz: 'BKga yozish',
  },
  assistant_help: {
    ru: 'Здравствуйте! Я помогу быстро найти нужный раздел Kamizo: заявки, аренду, услуги, Маркет УК, гостевые пропуска или автомобили.',
    uz: 'Assalomu alaykum! Kamizodagi kerakli bo‘limni tez topishga yordam beraman: arizalar, ijara, xizmatlar, BK marketi, mehmon ruxsatnomalari yoki avtomobillar.',
    buttonRu: 'Открыть Kamizo', buttonUz: 'Kamizoni ochish',
  },
};

const NAV_MENU_ACTIONS: Partial<Record<NavigationIntent, Array<{
  path: string; ru: string; uz: string;
}>>> = {
  vehicle_menu: [
    { path: '/vehicle-search', ru: 'Найти владельца', uz: 'Egasini topish' },
    { path: '/vehicles', ru: 'Мои автомобили', uz: 'Mening avtomobillarim' },
  ],
  pass_menu: [
    { path: '/guest-access', ru: 'Оформить гостя', uz: 'Mehmon ruxsati' },
    { path: '/qr-scanner', ru: 'Проверить QR', uz: 'QR tekshirish' },
  ],
  rental_menu: [
    { path: '/apartment-rentals', ru: 'Найти квартиру', uz: 'Kvartira topish' },
    { path: '/apartment-rentals/create', ru: 'Сдать квартиру', uz: 'Ijaraga berish' },
  ],
  parking_issue: [
    { path: '/chat', ru: 'Сообщить УК', uz: 'BKga yozish' },
  ],
  barrier_issue: [
    { path: '/chat', ru: 'Написать в чат УК', uz: 'BK chatiga yozish' },
  ],
};

async function handleNavigationIntent(
  env: Env,
  group: { id: string; tenant_id: string },
  message: any,
  match: NavigationMatch,
  log: any
): Promise<void> {
  const chatId = String(message.chat.id);
  const threadId = Number(message.message_thread_id || 0);
  const telegramUserId = String(message.from.id);

  const tenant = await env.DB.prepare(
    'SELECT url, features FROM tenants WHERE id = ? AND is_active = 1'
  ).bind(group.tenant_id).first() as any;
  if (!tenant) return;

  if (match.requiredFeature) {
    const features = normalizeFeatures(tenant.features);
    const enabled = features.includes(match.requiredFeature as never);
    if (!enabled) {
      log.info('dispatcher_navigation_skipped', { tenantId: group.tenant_id, intent: match.intent, reason: 'feature_disabled' });
      return;
    }
  }

  // PII-bearing staff tools are never advertised to an unlinked or
  // unauthorized Telegram account. Public catalog routes can safely lead to
  // login and let their own backend gates make the final decision.
  if (match.restrictedRoles?.length) {
    const { results } = await env.DB.prepare(`
      SELECT u.role
      FROM telegram_users link
      JOIN users u ON u.id = link.user_id AND u.tenant_id = link.tenant_id
      WHERE link.tenant_id = ? AND link.telegram_user_id = ?
        AND link.revoked_at IS NULL AND u.is_active = 1
    `).bind(group.tenant_id, telegramUserId).all();
    if (!(results || []).some((row: any) => match.restrictedRoles!.includes(row.role))) {
      log.info('dispatcher_navigation_skipped', { tenantId: group.tenant_id, intent: match.intent, reason: 'role_not_linked' });
      return;
    }
  }

  const recent = await env.DB.prepare(`
    SELECT 1 FROM telegram_suggestions
    WHERE tenant_id = ? AND telegram_chat_id = ? AND message_thread_id = ?
      AND telegram_user_id = ? AND category = ?
      AND created_at > datetime('now', '-60 seconds')
    LIMIT 1
  `).bind(group.tenant_id, chatId, threadId, telegramUserId, `nav:${match.intent}`).first();
  if (recent) {
    log.info('dispatcher_navigation_skipped', { tenantId: group.tenant_id, intent: match.intent, reason: 'cooldown' });
    return;
  }

  const rawBase = String(tenant.url || 'https://app.kamizo.uz').replace(/[/]+$/, '');
  const base = /^https?:[/][/]/.test(rawBase) ? rawBase : `https://${rawBase}`;
  const openUrl = (path: string) => `${base}/open?target=${encodeURIComponent(path)}`;
  const lang = detectLanguage(String(message.text || message.caption || ''));
  const copy = NAV_COPY[match.intent];
  const menuActions = NAV_MENU_ACTIONS[match.intent];
  const buttons = menuActions
    ? menuActions.map(action => ({
        text: lang === 'uz' ? action.uz : action.ru,
        url: openUrl(action.path),
      }))
    : [{ text: lang === 'uz' ? copy.buttonUz : copy.buttonRu, url: openUrl(match.path) }];
  const sent = await sendTelegramMessage(
    env,
    chatId,
    lang === 'uz' ? copy.uz : copy.ru,
    {
      messageThreadId: threadId,
      replyToMessageId: Number(message.message_id),
      buttons,
    }
  );
  if (!sent.ok) return;

  await env.DB.prepare(`
    INSERT INTO telegram_suggestions
      (id, tenant_id, telegram_group_id, telegram_chat_id, message_thread_id,
       telegram_user_id, telegram_message_id, category, confidence, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'routed')
  `).bind(
    generateId(), group.tenant_id, group.id, chatId, threadId,
    telegramUserId, String(message.message_id), `nav:${match.intent}`
  ).run();
  log.info('dispatcher_navigation_routed', { tenantId: group.tenant_id, intent: match.intent });
}

// ──────────────────────────────────────────────────────────────────
// Обработка обычного сообщения в группе.
//
// Вызывается из вебхука для каждого нового группового сообщения. Сначала
// проверяем активную привязку: даже локальный AI не должен обрабатывать
// сообщения группы, которая не подключена к Kamizo или отключила listener.
export async function handleGroupMessage(
  env: Env, message: any, log: any
): Promise<void> {
  const text: string = message?.text || message?.caption || '';
  const chatId = String(message?.chat?.id ?? '');
  const fromId = String(message?.from?.id ?? '');
  const messageThreadId = Number(message?.message_thread_id || 0);

  if (!text || !chatId || !fromId) return;
  // §14: не реагируем на сообщения ботов, включая собственные.
  if (message?.from?.is_bot) return;

  await ensureDictionaryLoaded(env);

  const classified = classifyZhkhMessage(text);
  const hit = classified && classified.confidence >= SUGGESTION_THRESHOLD ? classified : null;
  const navigation = hit ? null : classifyNavigationIntent(text);
  const aiMode = getAiListenerMode(env);
  if (!hit && !navigation && aiMode === 'off') return;

  const group = await env.DB.prepare(
    `SELECT id, tenant_id, building_id, entrance, message_thread_id
     FROM telegram_groups
     WHERE telegram_chat_id = ? AND disabled_at IS NULL AND listener_enabled = 1
       AND message_thread_id IN (?, 0)
     ORDER BY CASE WHEN message_thread_id = ? THEN 0 ELSE 1 END
     LIMIT 1`
  ).bind(chatId, messageThreadId, messageThreadId).first() as any;
  if (!group) return;

  if (!hit && !navigation && !message?.forward_origin && !message?.forward_date) {
    if (aiMode === 'shadow') {
      // Shadow inference must never delay Telegram's webhook. Only one local
      // request runs at a time; further messages immediately skip AI.
      void classifyWithLocalAi(env, text).then(ai => {
        if (!ai) return;
        log.info('dispatcher_ai_classified', {
          tenantId: group.tenant_id,
          kind: ai.kind,
          intent: ai.kind === 'navigation' ? ai.intent : undefined,
          category: ai.kind === 'maintenance' ? ai.category : undefined,
          confidence: ai.confidence,
          similarity: ai.similarity,
          margin: ai.margin,
          lang: ai.lang,
          mode: aiMode,
        });
      }).catch(() => {});
      return;
    }
  }

  if (!hit && !navigation) return;

  if (navigation) {
    await handleNavigationIntent(env, group, message, navigation, log);
    return;
  }
  if (!hit) return;

  // Кулдаун по человеку. Сравнение времени в SQL здесь корректно: обе
  // стороны — datetime('now'), одинаковый формат. (В отличие от мест,
  // где хранится ISO-строка из toISOString(); там сверка идёт в JS.)
  const hours = cooldownHours(env);
  if (hours > 0) {
    const recent = await env.DB.prepare(
      `SELECT 1 FROM telegram_suggestions
       WHERE telegram_chat_id = ? AND message_thread_id = ? AND telegram_user_id = ?
         AND tenant_id = ?
         AND category NOT LIKE 'nav:%'
          AND created_at > datetime('now', ?)
       LIMIT 1`
    ).bind(chatId, messageThreadId, fromId, group.tenant_id, `-${hours} hours`).first();
    if (recent) return;
  }

  // Дедупликация по категории в этой группе.
  const minutes = dedupeMinutes(env);
  if (minutes > 0) {
    const sameIssue = await env.DB.prepare(
      `SELECT 1 FROM telegram_suggestions
       WHERE telegram_chat_id = ? AND message_thread_id = ? AND category = ?
         AND tenant_id = ?
          AND created_at > datetime('now', ?)
       LIMIT 1`
    ).bind(chatId, messageThreadId, hit.category, group.tenant_id, `-${minutes} minutes`).first();
    if (sameIssue) return;
  }

  const suggestionId = generateId();
  await env.DB.prepare(`
    INSERT INTO telegram_suggestions
      (id, tenant_id, telegram_group_id, telegram_chat_id, message_thread_id,
       telegram_user_id, telegram_message_id, category, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    suggestionId, group.tenant_id, group.id, chatId, messageThreadId, fromId,
    String(message.message_id), hit.category, hit.confidence
  ).run();

  // Отвечаем реплаем на конкретное сообщение (§12), а не в пустоту —
  // в живом чате иначе непонятно, к чему относится предложение.
  //
  // Язык — из самого сообщения: в группе неизвестно, кто автор, пока он
  // не привязал аккаунт, так что users.language недоступен.
  const label = categoryLabel(hit.category, hit.lang);
  const sent = await sendTelegramMessage(
    env, chatId, D.suggest(hit.lang, label),
    {
      messageThreadId,
      replyToMessageId: Number(message.message_id),
      buttons: [
        { text: D.btnCreate(hit.lang), callback_data: `sg:y:${suggestionId}` },
        {
          text: hit.lang === 'uz' ? D.btnSkipUz : D.btnSkipRu,
          callback_data: `sg:n:${suggestionId}`,
        },
      ],
    }
  );

  if (sent.ok) {
    log.info('dispatcher_suggested', {
      tenantId: group.tenant_id, category: hit.category,
      confidence: hit.confidence, lang: hit.lang,
    });
  }
}

// ──────────────────────────────────────────────────────────────────
// Нажатие кнопки под предложением.
//
// «Не нужно» — не косметика: §14 требует поддержать эту кнопку, а
// накопленные dismissed показывают, где классификатор врёт. Без этого
// сигнала пороги подкручиваются вслепую.
export async function handleSuggestionCallback(
  env: Env, callback: any, log: any
): Promise<void> {
  const data: string = callback?.data || '';
  if (!data.startsWith('sg:')) return;

  const [, action, suggestionId] = data.split(':');
  if (!suggestionId || (action !== 'y' && action !== 'n')) return;

  const chatId = callback?.message?.chat?.id;
  const messageThreadId = Number(callback?.message?.message_thread_id || 0);
  const fromId = String(callback?.from?.id ?? '');

  // Язык определяем по СОБСТВЕННОМУ сообщению бота, под которым нажали
  // кнопку: оно уже составлено на языке исходной реплики жителя. Так
  // ответы остаются в одном языке на всю цепочку, и не нужна ни колонка
  // в telegram_suggestions, ни хранение чужого текста — а §15 требует
  // как раз его не хранить.
  const lang = detectLanguage(String(callback?.message?.text ?? ''));

  const binding = await env.DB.prepare(
    `SELECT id, tenant_id FROM telegram_groups
     WHERE telegram_chat_id = ? AND disabled_at IS NULL
       AND message_thread_id IN (?, 0)
     ORDER BY CASE WHEN message_thread_id = ? THEN 0 ELSE 1 END
     LIMIT 1`
  ).bind(String(chatId ?? ''), messageThreadId, messageThreadId).first() as any;

  const sug = binding ? await env.DB.prepare(
    `SELECT * FROM telegram_suggestions
     WHERE id = ? AND tenant_id = ? AND telegram_chat_id = ? AND message_thread_id = ?`
  ).bind(suggestionId, binding.tenant_id, String(chatId ?? ''), messageThreadId).first() as any : null;

  if (!sug || sug.outcome !== 'offered') {
    await answerCallbackQuery(env, callback.id, D.handled(lang));
    return;
  }

  // Кнопку жмёт только автор исходного сообщения. Иначе сосед оформит
  // заявку от чужого имени и с чужим текстом — а заявка потом
  // фигурирует как обращение конкретного жителя.
  if (String(sug.telegram_user_id) !== fromId) {
    await answerCallbackQuery(env, callback.id, D.notAuthor(lang));
    return;
  }

  if (action === 'n') {
    await env.DB.prepare(
      `UPDATE telegram_suggestions SET outcome = 'dismissed',
       resolved_at = datetime('now')
       WHERE id = ? AND tenant_id = ? AND outcome = 'offered'`
    ).bind(suggestionId, sug.tenant_id).run();
    await answerCallbackQuery(env, callback.id, D.dismissedToast(lang));
    if (chatId) {
      await editTelegramMessage(env, chatId, callback.message.message_id,
        D.dismissed(lang));
    }
    log.info('dispatcher_dismissed', { category: sug.category });
    return;
  }

  const group = await env.DB.prepare(
    `SELECT building_id, entrance FROM telegram_groups
     WHERE id = ? AND tenant_id = ?`
  ).bind(sug.telegram_group_id, sug.tenant_id).first() as any;
  if (!group) {
    await answerCallbackQuery(env, callback.id, D.groupGone(lang));
    return;
  }

  // Черновик. Текст исходного сообщения сохраняется ЗДЕСЬ и только
  // здесь — после явного действия человека, как требует §15. До
  // нажатия кнопки он нигде не оседал.
  const token = crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MINUTES * 60 * 1000);
  const sourceText: string = callback?.message?.reply_to_message?.text || '';

  await env.DB.prepare(`
    INSERT INTO telegram_draft_tokens
      (id, tenant_id, token, building_id, entrance, category, description,
       telegram_chat_id, message_thread_id, telegram_message_id, suggestion_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId(), sug.tenant_id, token, group.building_id, group.entrance,
    sug.category, sourceText.slice(0, 1000),
    String(chatId ?? ''), Number(sug.message_thread_id || 0),
    String(sug.telegram_message_id ?? ''),
    suggestionId, expiresAt.toISOString()
  ).run();

  await env.DB.prepare(
    `UPDATE telegram_suggestions SET outcome = 'accepted',
     resolved_at = datetime('now')
     WHERE id = ? AND tenant_id = ? AND outcome = 'offered'`
  ).bind(suggestionId, sug.tenant_id).run();

  const tenant = await env.DB.prepare(
    'SELECT url FROM tenants WHERE id = ?'
  ).bind(sug.tenant_id).first() as any;
  // Схему достраиваем здесь, а не полагаемся на аккуратность
  // заполнения: у части тенантов в tenants.url лежит голый домен
  // (qa-rentals, qa-limited). Для текстовой ссылки это было
  // косметикой — Telegram просто не делал её ссылкой; для кнопки уже
  // нет: на невалидный URL он отвечает ошибкой, и предложение не
  // дойдёт вовсе.
  const rawBase = String(tenant?.url || 'https://app.kamizo.uz').replace(/[/]+$/, '');
  const base = /^https?:[/][/]/.test(rawBase) ? rawBase : `https://${rawBase}`;
  // Ведём на /open, а не сразу в приложение. Telegram открывает ссылки
  // во встроенном браузере, а он не отдаёт систему по App Links и
  // Universal Links — обычная https-ссылка там навсегда останется
  // веб-версией. Промежуточная страница пробует передать управление
  // приложению способами, которые из встроенного браузера работают, и
  // сама же откатывается на веб-версию.
  //
  // Маршрута /requests/new в приложении нет: житель создаёт заявку из
  // своего дашборда, куда форма открывается модалкой. Поэтому /open
  // ведёт в корень с параметром, а его подхватывает ResidentDashboard.
  // Пока страницы /open нет на проде, ведём напрямую в приложение —
  // иначе кнопка отправляла бы жителя на 404. Флаг снимается вместе
  // с выкатом фронта.
  const url = env.TELEGRAM_DRAFT_OPEN_PAGE === '1'
    ? `${base}/open?telegramDraft=${token}`
    : `${base}/?telegramDraft=${token}`;

  await answerCallbackQuery(env, callback.id, D.openingToast(lang));
  if (chatId) {
    await editTelegramMessage(env, chatId, callback.message.message_id,
      D.draft(lang), { buttons: [{ text: D.btnOpen(lang), url }] });
  }

  log.info('dispatcher_accepted', { category: sug.category, lang });
}

// ──────────────────────────────────────────────────────────────────
// GET /api/telegram/draft/:token
//
// Отдаёт черновик заявки для предзаполнения формы (§13 ТЗ).
//
// Семь проверок из §13, и ни одну нельзя убрать:
//   1. Пользователь авторизован — иначе черновик прочтёт кто угодно по
//      ссылке из группового чата.
//   2. Токен существует.
//   3. Не истёк (сверка в JS: expires_at хранится как ISO-строка).
//   4. tenant пользователя совпадает с tenant черновика. Это главная
//      проверка §13: «Если tenant или дом не совпадает, создавать
//      заявку запрещено».
//   5. Дом черновика принадлежит тому же тенанту.
//   6. У пользователя есть отношение к этому дому.
//   7. Токен не занят другим пользователем.
//
// Ничего из перечисленного не берётся из URL или из Telegram — только
// из JWT и из строки в БД.
export function registerDispatcherRoutes() {

route('GET', '/api/telegram/draft/:token', async (request, env, params) => {
  const authUser = await getUser(request, env);
  if (!authUser) return error('Unauthorized', 401);

  const draft = await env.DB.prepare(
    'SELECT * FROM telegram_draft_tokens WHERE token = ?'
  ).bind(params.token).first() as any;
  if (!draft) return error('Draft not found', 404);

  if (new Date(draft.expires_at) < new Date()) return error('Draft expired', 410);

  const tenantId = getTenantId(request) || (authUser as any).tenant_id || '';
  if (!tenantId || tenantId !== draft.tenant_id) {
    return error('Draft belongs to another workspace', 403);
  }

  const building = await env.DB.prepare(
    'SELECT id, name, address FROM buildings WHERE id = ? AND tenant_id = ?'
  ).bind(draft.building_id, tenantId).first() as any;
  if (!building) return error('Building not found', 404);

  // Отношение пользователя к дому. Жителя проверяем по building_id в
  // профиле; сотрудникам УК дом доступен по роли — они и так работают
  // со всеми домами своего тенанта.
  const staffRoles = ['admin', 'director', 'manager', 'department_head', 'dispatcher', 'executor'];
  const isStaff = staffRoles.includes((authUser as any).role);
  if (!isStaff && (authUser as any).building_id !== draft.building_id) {
    return error('No access to this building', 403);
  }

  // Привязка к первому читателю. Повторные чтения тем же человеком
  // разрешены (перезагрузка страницы после входа), чужие — нет.
  if (!draft.used_at) {
    await env.DB.prepare(
      `UPDATE telegram_draft_tokens SET used_at = datetime('now'), used_by = ?
       WHERE token = ? AND used_at IS NULL`
    ).bind(authUser.id, params.token).run();
  } else if (draft.used_by && draft.used_by !== authUser.id) {
    return error('Draft already opened by another user', 403);
  }

  return json({
    category: SPECIALIZATION_BY_CATEGORY[draft.category as ZhkhCategory] || 'other',
    description: draft.description,
    buildingId: draft.building_id,
    buildingAddress: building.address || building.name,
    entrance: draft.entrance,
  });
});

} // end registerDispatcherRoutes
