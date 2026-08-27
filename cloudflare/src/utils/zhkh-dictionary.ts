// Загрузчик правок словаря из БД (миграция 079).
//
// Классификатор держит встроенные словари в коде и умеет накладывать
// поверх них дельту. Этот модуль читает дельту из telegram_dictionary и
// отдаёт её классификатору.
//
// ── Почему с кэшем ───────────────────────────────────────────────────
// Классификация выполняется на КАЖДОМ сообщении подключённой группы, и
// главное её свойство — дешевизна: подавляющее большинство реплик в
// домовом чате не про поломки, и платить за них запросом к БД нельзя.
// Без кэша добавление словаря из базы превратило бы бесплатную проверку
// в запрос на каждое сообщение чата.
//
// Минуты достаточно: правки словаря — редкое действие администратора, и
// задержка в минуту между «сохранил» и «применилось» никого не удивит.
// Сохранение при этом сбрасывает кэш явно (invalidateDictionaryCache),
// так что на практике изменения видны сразу.

import type { Env } from '../types';
import {
  applyDictionaryOverrides, type DictionaryOverrides, type ZhkhCategory,
} from './zhkh-classifier';

const CACHE_TTL_MS = 60_000;

let loadedAt = 0;
let loading: Promise<void> | null = null;

export function invalidateDictionaryCache(): void {
  loadedAt = 0;
}

/**
 * Гарантирует, что действующие словари соответствуют БД.
 *
 * Ошибку глотает намеренно: таблицы может не быть (миграция 079 ещё не
 * прогнана), база может быть занята. Классификатор в этом случае
 * работает на встроенных словарях — то есть на рабочем состоянии по
 * умолчанию, а не молчит. Ровно та же логика, по которой обёрнуты
 * запросы в login-approval и sendTelegramToUser.
 */
export async function ensureDictionaryLoaded(env: Env): Promise<void> {
  if (Date.now() - loadedAt < CACHE_TTL_MS) return;

  // Параллельные сообщения не должны порождать несколько запросов:
  // Telegram доставляет апдейты пачками, и на старте кэша их может
  // прийти сразу десяток.
  if (loading) return loading;

  loading = (async () => {
    try {
      const { results } = await env.DB.prepare(
        'SELECT kind, category, term, action FROM telegram_dictionary'
      ).all();

      const ov: DictionaryOverrides = {
        topics: {}, symptoms: [], negative: [],
        disabled: { topics: [], symptoms: [], negative: [] },
      };

      for (const row of (results || []) as any[]) {
        const term = String(row.term || '').trim();
        if (!term) continue;

        if (row.action === 'disable') {
          // Отключение сверяется с нормализованными встроенными
          // корнями, поэтому нормализуем и здесь.
          const bucket = row.kind === 'topic' ? ov.disabled.topics
            : row.kind === 'symptom' ? ov.disabled.symptoms
              : ov.disabled.negative;
          bucket.push(term);
          continue;
        }

        if (row.kind === 'topic') {
          const cat = row.category as ZhkhCategory;
          if (!cat) continue;
          (ov.topics[cat] ||= []).push(term);
        } else if (row.kind === 'symptom') {
          ov.symptoms.push(term);
        } else if (row.kind === 'negative') {
          ov.negative.push(term);
        }
      }

      applyDictionaryOverrides(ov);
      loadedAt = Date.now();
    } catch {
      // Таблицы нет или БД недоступна — остаёмся на встроенных
      // словарях. Метку времени НЕ обновляем, чтобы попробовать снова
      // на следующем сообщении, а не молчать минуту.
      applyDictionaryOverrides();
    } finally {
      loading = null;
    }
  })();

  return loading;
}
