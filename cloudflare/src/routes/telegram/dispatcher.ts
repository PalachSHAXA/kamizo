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
//   3. Разбор целиком локальный (utils/zhkh-classifier.ts). Никакой
//      внешней LLM — §15 требует отдельного решения на этот счёт.

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
    ? `Siz ${label} haqida xabar berdingiz shekilli.\n\nKamizoda ariza rasmiylashtirilsinmi?`
    : `Похоже, вы сообщили ${ruPrep(label)} ${label}.\n\nОформить заявку в Kamizo?`,

  btnCreate: (lang: ZhkhLang) => lang === 'uz'
    ? '📝 Ariza rasmiylashtirish' : '📝 Оформить заявку',
  btnSkipRu: 'Не нужно',
  btnSkipUz: 'Kerak emas',

  dismissed: (lang: ZhkhLang) => lang === 'uz'
    ? 'Tushunarli, ariza kerak emas.' : 'Понял, заявка не нужна.',

  dismissedToast: (lang: ZhkhLang) => lang === 'uz'
    ? 'Yaxshi, boshqa taklif qilmayman' : 'Хорошо, не буду предлагать',

  openingToast: (lang: ZhkhLang) => lang === 'uz' ? 'Kamizo ochilmoqda' : 'Открываю Kamizo',

  // Ссылка отдаётся кнопкой, а не разметкой внутри текста. Текстовый
  // якорь Telegram рисует по-разному в разных клиентах, а при
  // невалидном href молча превращает в обычный текст — человек видит
  // фразу «Открыть форму», по которой некуда нажать. С кнопкой так не
  // выйдет: она либо появится, либо запрос упадёт с ошибкой в логах.
  draft: (lang: ZhkhLang) => lang === 'uz'
    ? `📝 <b>Ariza rasmiylashtirish</b>

Havola 30 daqiqa amal qiladi. Ariza faqat siz tasdiqlaganingizdan keyin yaratiladi.`
    : `📝 <b>Оформление заявки</b>

Ссылка действует 30 минут. Заявка будет создана только после вашего подтверждения.`,

  btnOpen: (lang: ZhkhLang) => lang === 'uz'
    ? '📝 Kamizoda shaklni ochish' : '📝 Открыть форму в Kamizo',

  handled: (lang: ZhkhLang) => lang === 'uz' ? 'Allaqachon koʻrib chiqilgan' : 'Уже обработано',

  notAuthor: (lang: ZhkhLang) => lang === 'uz'
    ? 'Bu taklif xabar muallifiga tegishli'
    : 'Это предложение адресовано автору сообщения',

  groupGone: (lang: ZhkhLang) => lang === 'uz'
    ? 'Guruh endi ulanmagan' : 'Группа больше не подключена',
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

// ──────────────────────────────────────────────────────────────────
// Обработка обычного сообщения в группе.
//
// Вызывается из вебхука для КАЖДОГО текстового сообщения подключённой
// группы, поэтому дешёвые проверки идут первыми: сначала отсев по
// флагу и по классификатору (обе без запросов к БД для большинства
// сообщений), и только потом обращения к базе.
export async function handleGroupMessage(
  env: Env, message: any, log: any
): Promise<void> {
  const text: string = message?.text || '';
  const chatId = String(message?.chat?.id ?? '');
  const fromId = String(message?.from?.id ?? '');

  if (!text || !chatId || !fromId) return;
  // §14: не реагируем на сообщения ботов, включая собственные.
  if (message?.from?.is_bot) return;

  // Правки словаря из БД. Кэш на минуту, поэтому запроса на каждое
  // сообщение не происходит: иначе главное свойство классификации —
  // дешевизна — исчезло бы, ведь подавляющее большинство реплик в
  // домовом чате не про поломки, и платить за них обращением к базе
  // нельзя.
  await ensureDictionaryLoaded(env);

  const hit = classifyZhkhMessage(text);
  if (!hit || hit.confidence < SUGGESTION_THRESHOLD) return;

  const group = await env.DB.prepare(
    `SELECT id, tenant_id, building_id, entrance FROM telegram_groups
     WHERE telegram_chat_id = ? AND disabled_at IS NULL AND listener_enabled = 1`
  ).bind(chatId).first() as any;
  if (!group) return;

  // Кулдаун по человеку. Сравнение времени в SQL здесь корректно: обе
  // стороны — datetime('now'), одинаковый формат. (В отличие от мест,
  // где хранится ISO-строка из toISOString(); там сверка идёт в JS.)
  const hours = cooldownHours(env);
  if (hours > 0) {
    const recent = await env.DB.prepare(
      `SELECT 1 FROM telegram_suggestions
       WHERE telegram_chat_id = ? AND telegram_user_id = ?
         AND created_at > datetime('now', ?)
       LIMIT 1`
    ).bind(chatId, fromId, `-${hours} hours`).first();
    if (recent) return;
  }

  // Дедупликация по категории в этой группе.
  const minutes = dedupeMinutes(env);
  if (minutes > 0) {
    const sameIssue = await env.DB.prepare(
      `SELECT 1 FROM telegram_suggestions
       WHERE telegram_chat_id = ? AND category = ?
         AND created_at > datetime('now', ?)
       LIMIT 1`
    ).bind(chatId, hit.category, `-${minutes} minutes`).first();
    if (sameIssue) return;
  }

  const suggestionId = generateId();
  await env.DB.prepare(`
    INSERT INTO telegram_suggestions
      (id, tenant_id, telegram_group_id, telegram_chat_id, telegram_user_id,
       telegram_message_id, category, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    suggestionId, group.tenant_id, group.id, chatId, fromId,
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
  const fromId = String(callback?.from?.id ?? '');

  // Язык определяем по СОБСТВЕННОМУ сообщению бота, под которым нажали
  // кнопку: оно уже составлено на языке исходной реплики жителя. Так
  // ответы остаются в одном языке на всю цепочку, и не нужна ни колонка
  // в telegram_suggestions, ни хранение чужого текста — а §15 требует
  // как раз его не хранить.
  const lang = detectLanguage(String(callback?.message?.text ?? ''));

  const sug = await env.DB.prepare(
    'SELECT * FROM telegram_suggestions WHERE id = ?'
  ).bind(suggestionId).first() as any;

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
       resolved_at = datetime('now') WHERE id = ? AND outcome = 'offered'`
    ).bind(suggestionId).run();
    await answerCallbackQuery(env, callback.id, D.dismissedToast(lang));
    if (chatId) {
      await editTelegramMessage(env, chatId, callback.message.message_id,
        D.dismissed(lang));
    }
    log.info('dispatcher_dismissed', { category: sug.category });
    return;
  }

  const group = await env.DB.prepare(
    'SELECT building_id, entrance FROM telegram_groups WHERE id = ?'
  ).bind(sug.telegram_group_id).first() as any;
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
       telegram_chat_id, telegram_message_id, suggestion_id, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    generateId(), sug.tenant_id, token, group.building_id, group.entrance,
    sug.category, sourceText.slice(0, 1000),
    String(chatId ?? ''), String(sug.telegram_message_id ?? ''),
    suggestionId, expiresAt.toISOString()
  ).run();

  await env.DB.prepare(
    `UPDATE telegram_suggestions SET outcome = 'accepted',
     resolved_at = datetime('now') WHERE id = ? AND outcome = 'offered'`
  ).bind(suggestionId).run();

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
