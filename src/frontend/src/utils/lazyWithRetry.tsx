import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';

// Ключ хранится в sessionStorage (а не localStorage): жив только пока
// вкладка открыта — при следующем реальном chunk-load-error после
// обычной работы день-другой цикл-guard не воспримет прошлый reload
// как «недавний» и снова корректно перезагрузит страницу.
const RELOAD_KEY = 'kamizo-chunk-reload-at';

// Насколько «недавним» считаем предыдущий reload. Если после reload'а
// chunk снова 404 в течение этого окна — значит проблема не в
// stale-index'e (файл действительно отсутствует или сеть). Тогда
// пробрасываем ошибку в ErrorBoundary вместо reload-loop'а.
const RELOAD_COOLDOWN_MS = 10_000;

// Ловим сообщения, которые браузеры выдают на упавший динамический
// импорт:
//   Chrome/Edge: "Failed to fetch dynamically imported module"
//   Safari:      "Importing a module script failed."    (см. api.err.log)
//   Legacy vite/webpack: "Loading chunk NN failed" / "Loading CSS chunk"
// Остальное — реальные JS-ошибки, их не глотаем: ErrorBoundary покажет
// «Упс», как и раньше.
const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk .* failed/i;

/**
 * Обёртка над React.lazy(), которая при chunk-load-error один раз
 * форсит window.location.reload() — свежий index.html с no-cache
 * притянет актуальные chunk-hash'и. Защита от бесконечного цикла:
 * sessionStorage-флаг + 10-секундный cooldown.
 *
 * Инцидент 2026-07-11: два раза за час житель получал «Упс! Что-то
 * пошло не так» после навигации между вкладками — потому что deploy
 * перерандомливал hash'и и удалял старые chunks с CDN. Обёртка
 * закрывает весь класс подобных сбоев.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!CHUNK_ERROR_RE.test(message)) throw err;

      const lastReloadAt = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      const now = Date.now();
      if (lastReloadAt && now - lastReloadAt < RELOAD_COOLDOWN_MS) {
        // Уже перезагружались недавно и снова 404 — не stale-index.
        // Отдаём ErrorBoundary'ю: он покажет «Упс» с кнопкой
        // «Перезагрузить», житель хотя бы поймёт что дело серьёзнее.
        throw err;
      }

      sessionStorage.setItem(RELOAD_KEY, String(now));
      window.location.reload();

      // Never-resolving promise: Suspense-fallback остаётся на экране,
      // пока reload не заменит документ. Иначе React дёрнул бы
      // fallback → повторный factory() → повторный reload по кругу,
      // либо unhandled-rejection в консоли.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
