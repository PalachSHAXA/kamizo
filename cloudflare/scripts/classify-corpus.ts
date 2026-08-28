// Прогон корпуса сообщений через ЖКХ-классификатор — офлайн.
//
// Зачем отдельный скрипт, а не тест: тесты отвечают «не сломалось ли»,
// а этот — «сколько ложных сработок на живой переписке». Второе по
// синтетическим примерам не измеряется в принципе: настоящий домовой
// чат на девять десятых состоит из болтовни, объявлений и поздравлений,
// и именно на них классификатор ошибается.
//
// Скрипт НИЧЕГО не сохраняет и никуда не ходит: ни базы, ни сети, ни
// бота. Тексты живут в памяти процесса и умирают вместе с ним. Это
// осознанно — система намеренно не хранит текст сообщений (в
// telegram_suggestions пишется только категория и уверенность), и
// инструмент проверки не должен заводить чёрный ход к тому, что
// продукт держать у себя отказался.
//
// Запуск (Node 24+, стирание типов встроено):
//   node scripts/classify-corpus.ts <файл> [--fires|--silent] [--limit N]
//
// Формат файла:
//   *.json — экспорт Telegram Desktop (Настройки → Экспорт истории чата)
//   *.txt  — по одному сообщению в строке
//
// Читает и стандартный ввод, если файл не указан.

import { readFileSync } from 'node:fs';
import {
  classifyZhkhMessage, SUGGESTION_THRESHOLD, categoryLabel,
  type ZhkhCategory,
} from '../src/utils/zhkh-classifier.ts';

// ── Разбор входа ────────────────────────────────────────────────────

// В экспорте Telegram текст бывает строкой, а бывает массивом кусков
// (ссылки, упоминания, форматирование) — их надо склеить, иначе
// сообщение со ссылкой приедет пустым.
function textOf(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map(p => (typeof p === 'string' ? p : String((p as { text?: string })?.text ?? ''))).join('');
  }
  return '';
}

function parseCorpus(source: string, isJson: boolean): string[] {
  if (!isJson) {
    return source.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  const data = JSON.parse(source) as { messages?: unknown[] };
  const messages = Array.isArray(data.messages) ? data.messages : [];
  return messages
    .map(m => textOf((m as { text?: unknown })?.text))
    .map(s => s.trim())
    .filter(Boolean);
}

// ── Аргументы ───────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flags = new Set(argv.filter(a => a.startsWith('--')));
const positional = argv.filter(a => !a.startsWith('--'));
const limitArg = argv.findIndex(a => a === '--limit');
const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : Infinity;
const file = positional.find(a => !/^\d+$/.test(a));

const source = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
const corpus = parseCorpus(source, (file || '').endsWith('.json'));

if (!corpus.length) {
  console.error('Пусто: ни одного сообщения не разобрано.');
  process.exit(1);
}

// ── Прогон ──────────────────────────────────────────────────────────

interface Row { text: string; category: ZhkhCategory | null; confidence: number; lang: string }

const fired: Row[] = [];
const silent: string[] = [];

for (const text of corpus) {
  const r = classifyZhkhMessage(text);
  if (r && r.confidence >= SUGGESTION_THRESHOLD) {
    fired.push({ text, category: r.category, confidence: r.confidence, lang: r.lang });
  } else {
    silent.push(text);
  }
}

// ── Отчёт ───────────────────────────────────────────────────────────

const pct = (n: number) => ((n / corpus.length) * 100).toFixed(1);

console.log(`\nВсего сообщений:  ${corpus.length}`);
console.log(`Сработал бот:     ${fired.length}  (${pct(fired.length)}%)`);
console.log(`Промолчал:        ${silent.length}  (${pct(silent.length)}%)`);

if (fired.length) {
  const byCategory = new Map<ZhkhCategory, number>();
  for (const r of fired) if (r.category) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  console.log('\nПо категориям:');
  for (const [c, n] of [...byCategory].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c.padEnd(16)} ${categoryLabel(c, 'ru')}`);
  }
}

// Сработки печатаются всегда и целиком: каждая строка здесь — то, что
// бот скажет вслух при всём доме, и просмотреть их глазами дешевле,
// чем потом объяснять жителям, почему он ответил на некролог.
if (!flags.has('--silent')) {
  console.log(`\n── Сработки (${fired.length}) ──`);
  for (const r of fired.slice(0, limit)) {
    console.log(`  ${r.confidence.toFixed(2)}  ${String(r.category).padEnd(16)} ${r.lang}  │ ${r.text.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  if (fired.length > limit) console.log(`  … ещё ${fired.length - limit}`);
}

// Пропуски — обратная сторона, но она дешевле: житель оформит заявку
// руками. Поэтому по умолчанию не печатаем, только по флагу.
if (flags.has('--silent')) {
  console.log(`\n── Промолчал (${silent.length}) ──`);
  for (const t of silent.slice(0, limit)) {
    console.log(`  │ ${t.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  if (silent.length > limit) console.log(`  … ещё ${silent.length - limit}`);
}

console.log('');
