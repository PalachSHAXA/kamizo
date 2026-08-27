// Редактор словарей ЖКХ-классификатора (суперадмин).
//
// Словарь здесь не список слов, а часть логики: положи «спасибо» в
// симптомы вместо стоп-маркеров — и бот начнёт предлагать заявку на
// каждую благодарность в чате. Поэтому в интерфейсе три вещи сделаны
// намеренно:
//
//   1. Предпросмотр на видном месте, а не спрятан. Он прогоняет фразы
//      через словарь в его текущем виде и показывает ровно то, что
//      увидят жители.
//   2. Встроенные корни нельзя удалить — только выключить. Так всегда
//      видно, что изменили руками, и любую правку можно отменить.
//   3. Разделение «тема / симптом / стоп-маркер» подписано прямо в
//      форме: это главная ошибка, которую здесь можно совершить.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Plus, Search, AlertTriangle, Play, RotateCcw, EyeOff } from 'lucide-react';
import { telegramApi, type DictionaryEntry } from '../../../services/api';

type Kind = 'topic' | 'symptom' | 'negative';

const KIND_LABEL: Record<Kind, string> = {
  topic: 'Тема',
  symptom: 'Симптом',
  negative: 'Стоп-маркер',
};

const KIND_HINT: Record<Kind, string> = {
  topic: 'О чём речь: кран, лифт, канализация. Сама по себе тема заявку не создаёт.',
  symptom: 'Что сломалось: течёт, не работает, нету. Тема без симптома не срабатывает.',
  negative: 'Отменяет срабатывание: спасибо, продам, кто знает. Проверяется первым.',
};

const DEFAULT_PHRASES = [
  'В подъезде течёт труба',
  'Спасибо, лифт починили',
  'Podezdda suv oqyapti',
].join('\n');

export function TelegramDictionaryEditor() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [categories, setCategories] = useState<{ key: string; label: string }[]>([]);
  const [overrideCount, setOverrideCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState<Kind | 'all'>('all');
  const [query, setQuery] = useState('');

  const [newKind, setNewKind] = useState<Kind>('symptom');
  const [newTerm, setNewTerm] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newLang, setNewLang] = useState<'ru' | 'uz'>('ru');

  const [phrases, setPhrases] = useState(DEFAULT_PHRASES);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof telegramApi.previewPhrases>> | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await telegramApi.dictionary();
      setEntries(res.entries || []);
      setCategories(res.categories || []);
      setOverrideCount((res.overrides || []).length);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const runPreview = useCallback(async () => {
    const list = phrases.split('\n').map(s => s.trim()).filter(Boolean);
    if (!list.length) return;
    setPreviewing(true);
    try {
      setPreview(await telegramApi.previewPhrases(list));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setPreviewing(false);
    }
  }, [phrases]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      // После любой правки пересчитываем предпросмотр: смысл его в том,
      // чтобы последствия были видны сразу, а не после ручного нажатия.
      if (preview) await runPreview();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter(e => kindFilter === 'all' || e.kind === kindFilter)
      .filter(e => !q || e.term.toLowerCase().includes(q))
      // Свои правки и выключенные — наверх: именно их приходят смотреть.
      .sort((a, b) => {
        const rank = (e: DictionaryEntry) => (e.source === 'custom' ? 0 : e.active ? 2 : 1);
        return rank(a) - rank(b) || a.term.localeCompare(b.term);
      })
      .slice(0, 400);
  }, [entries, kindFilter, query]);

  const counts = useMemo(() => ({
    topic: entries.filter(e => e.kind === 'topic' && e.active).length,
    symptom: entries.filter(e => e.kind === 'symptom' && e.active).length,
    negative: entries.filter(e => e.kind === 'negative' && e.active).length,
  }), [entries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      )}

      {/* ── Предпросмотр ──────────────────────────────────────────
          Стоит перед редактором, а не после: правку словаря нужно
          проверять до сохранения, а не вспоминать о проверке потом. */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <h3 className="text-sm md:text-base font-semibold mb-1">Проверка фраз</h3>
        <p className="text-xs md:text-sm text-gray-500 mb-3">
          По одной фразе в строке. Показывает, что бот сделает с ними прямо сейчас — вместе со всеми правками.
        </p>
        <textarea
          value={phrases}
          onChange={e => setPhrases(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono resize-y"
          aria-label="Фразы для проверки"
        />
        <button
          onClick={() => void runPreview()}
          disabled={previewing}
          className="mt-2 flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Проверить
        </button>

        {preview && (
          <div className="mt-3 space-y-1.5">
            {preview.results.map((r, i) => (
              <div key={i} className="flex items-start justify-between gap-3 p-2.5 bg-white/40 rounded-lg">
                <span className="text-sm min-w-0 break-words">{r.text}</span>
                <span className="flex-shrink-0 text-right">
                  {r.fires ? (
                    <>
                      <span className="text-xs font-medium text-green-700">Предложит заявку</span>
                      <span className="block text-[11px] text-gray-500">
                        {r.categoryLabel} · {r.confidence} · {r.lang}
                      </span>
                    </>
                  ) : (
                    <span className="text-xs font-medium text-gray-500">Промолчит</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Добавление ──────────────────────────────────────────── */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <h3 className="text-sm md:text-base font-semibold mb-3">Добавить корень</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <select
            value={newKind}
            onChange={e => setNewKind(e.target.value as Kind)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            aria-label="Словарь"
          >
            <option value="topic">Тема</option>
            <option value="symptom">Симптом</option>
            <option value="negative">Стоп-маркер</option>
          </select>

          {newKind === 'topic' ? (
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              aria-label="Категория"
            >
              <option value="">Категория…</option>
              {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          ) : (
            <select
              value={newLang}
              onChange={e => setNewLang(e.target.value as 'ru' | 'uz')}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              aria-label="Язык"
            >
              <option value="ru">Русский</option>
              <option value="uz">Узбекский</option>
            </select>
          )}

          <input
            value={newTerm}
            onChange={e => setNewTerm(e.target.value)}
            placeholder="корень слова"
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono"
            aria-label="Корень"
          />
        </div>

        <p className="text-xs text-gray-500 mb-3">{KIND_HINT[newKind]}</p>

        <button
          onClick={() => void act('add', () => telegramApi.addTerm({
            kind: newKind,
            term: newTerm.trim(),
            category: newKind === 'topic' ? newCategory : null,
            lang: newLang,
          }).then(() => { setNewTerm(''); }))}
          disabled={busy === 'add' || newTerm.trim().length < 3 || (newKind === 'topic' && !newCategory)}
          className="flex items-center gap-2 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm disabled:opacity-50"
        >
          {busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Добавить
        </button>

        <p className="text-xs text-gray-400 mt-2">
          Пишите корень, а не слово целиком: «лампоч» поймает и «лампочка», и «лампочки».
          Регистр, ё, апострофы, удвоения и пробелы приводятся автоматически — их варианты добавлять не нужно.
        </p>
      </div>

      {/* ── Список ──────────────────────────────────────────────── */}
      <div className="glass-card p-3 sm:p-4 md:p-6 rounded-lg sm:rounded-xl">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-sm md:text-base font-semibold">
            Словарь
            <span className="ml-2 font-normal text-xs text-gray-500">
              {counts.topic} тем · {counts.symptom} симптомов · {counts.negative} стоп-маркеров
              {overrideCount > 0 && ` · ${overrideCount} правок`}
            </span>
          </h3>
        </div>

        <div className="flex gap-2 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по корню"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
              aria-label="Поиск"
            />
          </div>
          <select
            value={kindFilter}
            onChange={e => setKindFilter(e.target.value as Kind | 'all')}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            aria-label="Фильтр по словарю"
          >
            <option value="all">Все словари</option>
            <option value="topic">Темы</option>
            <option value="symptom">Симптомы</option>
            <option value="negative">Стоп-маркеры</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {visible.map((e, i) => (
            <span
              key={e.id || `${e.kind}-${e.term}-${i}`}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono ${
                !e.active ? 'bg-gray-100 text-gray-400 line-through'
                  : e.source === 'custom' ? 'bg-primary-50 text-primary-700'
                    : 'bg-white/50 text-gray-700'
              }`}
              title={`${KIND_LABEL[e.kind as Kind]}${e.category ? ` · ${e.category}` : ''}${e.source === 'custom' ? ' · добавлено' : ''}`}
            >
              {e.term}
              {e.source === 'custom' ? (
                <button
                  onClick={() => void act(e.id!, () => telegramApi.removeOverride(e.id!))}
                  disabled={busy === e.id}
                  aria-label={`Удалить ${e.term}`}
                  className="text-primary-500 hover:text-red-600"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              ) : e.active ? (
                <button
                  onClick={() => void act(e.term, () => telegramApi.disableTerm({ kind: e.kind, term: e.term }))}
                  disabled={busy === e.term}
                  aria-label={`Выключить ${e.term}`}
                  className="text-gray-400 hover:text-red-600"
                >
                  <EyeOff className="w-3 h-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>

        {entries.length > visible.length && (
          <p className="text-xs text-gray-400 mt-3">
            Показано {visible.length} из {entries.length}. Уточните поиск, чтобы увидеть остальные.
          </p>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Встроенные корни удалить нельзя — только выключить, и это всегда обратимо.
          Правки применяются в боте в течение минуты.
        </p>
      </div>
    </div>
  );
}
