// Редактор словарей ЖКХ-классификатора (суперадмин).
//
// Пять эндпоинтов:
//   GET    /api/super-admin/telegram/dictionary          — сводный словарь
//   POST   /api/super-admin/telegram/dictionary          — добавить термин
//   POST   /api/super-admin/telegram/dictionary/disable  — выключить встроенный
//   DELETE /api/super-admin/telegram/dictionary/:id      — отменить правку
//   POST   /api/super-admin/telegram/dictionary/preview  — проверить фразы
//
// ── Почему только суперадмин ─────────────────────────────────────────
// Бот один на все УК, классификатор у него общий. Словарь на тенанта
// раздробил бы качество распознавания и потребовал бы отдельной выверки
// для каждой компании — поэтому правки глобальны, и право на них
// соответствующее.
//
// ── Почему есть preview ──────────────────────────────────────────────
// Словарь здесь не список слов, а часть логики. Достаточно положить
// «спасибо» в симптомы вместо стоп-маркеров, и бот начнёт предлагать
// заявку на каждую благодарность в чате. В коде такое ловят тесты перед
// выкаткой; у правки из интерфейса тестов нет, и без предпросмотра
// ошибку обнаружили бы жители.

import type { Env } from '../../types';
import { route } from '../../router';
import { getUser } from '../../middleware/auth';
import { json, error, bilingualError, generateId } from '../../utils/helpers';
import { isSuperAdmin } from '../../index';
import {
  classifyZhkhMessage, SUGGESTION_THRESHOLD, builtinDictionary,
  normalizeTerm, categoryLabel, type ZhkhCategory,
} from '../../utils/zhkh-classifier';
import { ensureDictionaryLoaded, invalidateDictionaryCache } from '../../utils/zhkh-dictionary';

const KINDS = ['topic', 'symptom', 'negative'] as const;
const CATEGORIES: ZhkhCategory[] = [
  'leak', 'sewage', 'electricity', 'elevator',
  'heating', 'garbage', 'lighting', 'common_property', 'cleaning',
];

// Длина термина. Однобуквенный корень совпадёт почти со всем и
// превратит диспетчер в спамера; длиннее сорока — это уже фраза
// целиком, а сравнение идёт по подстроке нормализованного текста, где
// пробелы удалены, так что длинные фразы почти никогда не совпадут.
const MIN_TERM = 3;
const MAX_TERM = 40;

export function registerDictionaryRoutes() {

// ──────────────────────────────────────────────────────────────────
// GET — сводный словарь: встроенное плюс правки.
//
// Каждый термин помечен источником, чтобы в интерфейсе было видно, что
// пришло из кода, а что добавили руками: удалить можно только второе,
// первое — выключить.
route('GET', '/api/super-admin/telegram/dictionary', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const { results } = await env.DB.prepare(
    'SELECT id, kind, category, term, lang, action, created_at FROM telegram_dictionary ORDER BY created_at DESC'
  ).all();
  const rows = (results || []) as any[];

  const disabled = new Set(
    rows.filter(r => r.action === 'disable').map(r => `${r.kind}:${normalizeTerm(r.term)}`)
  );

  const builtin = builtinDictionary();
  const entries: any[] = [];

  for (const [cat, words] of Object.entries(builtin.topics) as [ZhkhCategory, string[]][]) {
    for (const term of words) {
      entries.push({
        term, kind: 'topic', category: cat, source: 'builtin',
        active: !disabled.has(`topic:${term}`),
      });
    }
  }
  for (const term of builtin.symptoms) {
    entries.push({ term, kind: 'symptom', category: null, source: 'builtin', active: !disabled.has(`symptom:${term}`) });
  }
  for (const term of builtin.negative) {
    entries.push({ term, kind: 'negative', category: null, source: 'builtin', active: !disabled.has(`negative:${term}`) });
  }
  for (const r of rows.filter(x => x.action === 'add')) {
    entries.push({
      id: r.id, term: r.term, kind: r.kind, category: r.category,
      lang: r.lang, source: 'custom', active: true, createdAt: r.created_at,
    });
  }

  return json({
    entries,
    categories: CATEGORIES.map(c => ({ key: c, label: categoryLabel(c, 'ru') })),
    threshold: SUGGESTION_THRESHOLD,
    // Правки перечисляем отдельно: по ним видно, что именно меняли
    // руками, без просмотра четырёхсот встроенных строк.
    overrides: rows,
  });
});

// ──────────────────────────────────────────────────────────────────
// POST — добавить термин.
route('POST', '/api/super-admin/telegram/dictionary', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const body = await request.json() as any;
  const kind = String(body.kind || '');
  const term = String(body.term || '').trim();
  const category = body.category ? String(body.category) : null;
  const lang = body.lang === 'uz' ? 'uz' : 'ru';

  if (!(KINDS as readonly string[]).includes(kind)) return error('Unknown kind', 400);
  if (term.length < MIN_TERM || term.length > MAX_TERM) {
    return bilingualError(
      `Термин должен быть от ${MIN_TERM} до ${MAX_TERM} символов`,
      `Atama ${MIN_TERM} dan ${MAX_TERM} belgigacha bolishi kerak`, 400
    );
  }
  if (kind === 'topic') {
    if (!category || !CATEGORIES.includes(category as ZhkhCategory)) {
      return error('category is required for topic terms', 400);
    }
  }

  // Проверяем по НОРМАЛИЗОВАННОМУ виду: «Не Работает» и «не работает» —
  // один и тот же корень, и добавлять оба бессмысленно.
  const normalized = normalizeTerm(term);
  if (!normalized) return error('Term is empty after normalization', 400);

  const builtin = builtinDictionary();
  const already = kind === 'topic'
    ? (builtin.topics[category as ZhkhCategory] || []).includes(normalized)
    : kind === 'symptom'
      ? builtin.symptoms.includes(normalized)
      : builtin.negative.includes(normalized);
  if (already) {
    return bilingualError('Такой корень уже есть во встроенном словаре',
      'Bunday atama allaqachon mavjud', 409);
  }

  try {
    await env.DB.prepare(`
      INSERT INTO telegram_dictionary (id, kind, category, term, lang, action, created_by)
      VALUES (?, ?, ?, ?, ?, 'add', ?)
    `).bind(generateId(), kind, category, term, lang, user!.id).run();
  } catch (e: any) {
    if (/UNIQUE|constraint/i.test(String(e?.message || e))) {
      return bilingualError('Такой термин уже добавлен', 'Bunday atama allaqachon qoshilgan', 409);
    }
    throw e;
  }

  invalidateDictionaryCache();
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// POST /disable — выключить встроенный термин.
//
// Отдельного «редактирования» встроенных нет: они лежат в файле, менять
// там нечего. Правка существующего = выключить старый плюс добавить
// новый, и в интерфейсе это два понятных действия вместо одного
// непрозрачного.
route('POST', '/api/super-admin/telegram/dictionary/disable', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const body = await request.json() as any;
  const kind = String(body.kind || '');
  const term = normalizeTerm(String(body.term || ''));
  if (!(KINDS as readonly string[]).includes(kind) || !term) return error('kind and term are required', 400);

  try {
    await env.DB.prepare(`
      INSERT INTO telegram_dictionary (id, kind, category, term, lang, action, created_by)
      VALUES (?, ?, NULL, ?, 'ru', 'disable', ?)
    `).bind(generateId(), kind, term, user!.id).run();
  } catch (e: any) {
    if (/UNIQUE|constraint/i.test(String(e?.message || e))) return json({ ok: true });
    throw e;
  }

  invalidateDictionaryCache();
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// DELETE — отменить правку.
//
// Для добавленного термина это удаление, для отключения — возврат
// встроенного в строй. Одна операция на оба случая: строка в таблице и
// есть «правка», а её удаление возвращает состояние по умолчанию.
route('DELETE', '/api/super-admin/telegram/dictionary/:id', async (request, env, params) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const res = await env.DB.prepare(
    'DELETE FROM telegram_dictionary WHERE id = ?'
  ).bind(params.id).run();
  if (!res.meta?.changes) return error('Not found', 404);

  invalidateDictionaryCache();
  return json({ ok: true });
});

// ──────────────────────────────────────────────────────────────────
// POST /preview — прогнать фразы через ДЕЙСТВУЮЩИЙ словарь.
//
// Главный предохранитель редактора. Возвращает по каждой фразе:
// сработает ли, какая категория, какая уверенность и на каком языке
// ответит бот — то есть ровно то, что увидят жители.
route('POST', '/api/super-admin/telegram/dictionary/preview', async (request, env) => {
  const user = await getUser(request, env);
  if (!isSuperAdmin(user)) return bilingualError('Доступ запрещён', 'Kirish taqiqlangan', 403);

  const body = await request.json() as any;
  const phrases: string[] = Array.isArray(body.phrases)
    ? body.phrases.map((p: unknown) => String(p ?? '')).filter(Boolean).slice(0, 20)
    : [];
  if (!phrases.length) return error('phrases are required', 400);

  // Читаем словарь из БД принудительно: предпросмотр обязан показывать
  // состояние ПОСЛЕ только что сохранённой правки, а не то, что лежало
  // в минутном кэше.
  invalidateDictionaryCache();
  await ensureDictionaryLoaded(env);

  return json({
    threshold: SUGGESTION_THRESHOLD,
    results: phrases.map(text => {
      const hit = classifyZhkhMessage(text);
      return {
        text,
        fires: !!hit && hit.confidence >= SUGGESTION_THRESHOLD,
        category: hit?.category ?? null,
        categoryLabel: hit ? categoryLabel(hit.category, hit.lang) : null,
        confidence: hit ? Math.round(hit.confidence * 100) / 100 : 0,
        lang: hit?.lang ?? null,
      };
    }),
  });
});

} // end registerDictionaryRoutes
