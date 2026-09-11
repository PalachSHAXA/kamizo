// fix/mobile-token-persistence
//
// Проблема: до этого фикса JWT-токен хранился только в WebView localStorage.
// В нативной обёртке Capacitor (iOS WKWebView / Android WebView) этот
// storage НЕ персистентен по контракту Apple/Google — WebKit может
// очистить его при low-storage, апдейте приложения, изменении entitlements
// и т.п. Пользователи жалуются на «закрыл приложение → открыл → login
// снова», хотя JWT ещё валиден.
//
// Решение — hybrid storage:
//   - Native (iOS/Android) → @capacitor/preferences (Keychain / EncryptedSharedPreferences)
//   - Web (браузеры, PWA-cabinet) → обычный localStorage как раньше
//
// Design decision: getToken() в client.ts должен остаться sync (иначе
// каскадный рефакторинг 8+ мест). Поэтому:
//   1. При старте приложения (main.tsx до React) вызываем
//      hydrateTokenCache() — она читает Preferences и заливает в
//      localStorage (in-memory zapас у WebView).
//   2. Zustand persist использует preferencesStorage — при login/rehydrate
//      токен пишется в Preferences (native) или localStorage (web).
//   3. Все прямые localStorage.setItem/removeItem для 'auth_token'
//      дополняются вызовом writeTokenToNativeStorage() — mirror в
//      Preferences. Async, fire-and-forget — UI не блокируется.
//
// Это гарантирует, что при cold-start-е на iOS токен уже в WebView
// localStorage (через hydrate), а также лежит в Keychain на случай
// следующего перезапуска.

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { StateStorage } from 'zustand/middleware';

const TOKEN_LOCAL_KEY = 'auth_token';
let nativeWriteQueue: Promise<void> = Promise.resolve();

function enqueueNativeWrite(write: () => Promise<void>): Promise<void> {
  nativeWriteQueue = nativeWriteQueue.then(write, write);
  return nativeWriteQueue;
}

/** True если приложение работает как Capacitor-нативное (iOS/Android). */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Безопасный localStorage.getItem — не бросает в private mode. */
function safeLocalGet(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}
function safeLocalSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch { /* private mode / quota */ }
}
function safeLocalRemove(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  } catch { /* private mode */ }
}

/**
 * Zustand persist-совместимый storage. На native — Preferences,
 * на web — localStorage. Read/write возвращают Promise.
 *
 * ВАЖНО: на native платформе ТАКЖЕ дублируем запись в localStorage,
 * чтобы синхронный getToken() из client.ts работал сразу после writes
 * без ожидания следующего рестарта.
 */
export const preferencesStorage: StateStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isNativePlatform()) {
      await nativeWriteQueue;
      try {
        const { value } = await Preferences.get({ key });
        return value ?? null;
      } catch {
        return safeLocalGet(key);
      }
    }
    return safeLocalGet(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isNativePlatform()) {
      await enqueueNativeWrite(async () => {
        try {
          await Preferences.set({ key, value });
        } catch { /* ignore */ }
      });
    }
    // Дублируем в localStorage всегда — sync-читатели ждут его там.
    safeLocalSet(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (isNativePlatform()) {
      await enqueueNativeWrite(async () => {
        try {
          await Preferences.remove({ key });
        } catch { /* ignore */ }
      });
    }
    safeLocalRemove(key);
  },
};

/**
 * Called ONCE в main.tsx перед первым render'ом. Читает 'auth_token' из
 * Preferences (Keychain) и заливает в localStorage — чтобы sync
 * getToken() в client.ts подхватил его сразу же для первого API-запроса.
 *
 * На web (isNativePlatform()=false) сразу возвращает — localStorage
 * уже есть, ничего делать не надо.
 *
 * Не бросает — если Preferences недоступен (dev preview в браузере
 * симулирующий native, etc.), сохраняет текущий localStorage как есть.
 */
export async function hydrateTokenCache(): Promise<void> {
  if (!isNativePlatform()) return;
  await nativeWriteQueue;
  try {
    const { value: nativeToken } = await Preferences.get({ key: TOKEN_LOCAL_KEY });
    if (nativeToken) {
      // Native источник истины — заливаем в localStorage overrides того,
      // что могло случайно там задержаться от прошлой сессии.
      safeLocalSet(TOKEN_LOCAL_KEY, nativeToken);
    } else {
      // В Keychain нет — проверим не осталось ли что-то в localStorage
      // с прошлой версии приложения (до этого фикса). Если да — мигрируем
      // в Preferences один раз, чтобы след. рестарт уже читал из Keychain.
      const legacy = safeLocalGet(TOKEN_LOCAL_KEY);
      if (legacy) {
        try { await Preferences.set({ key: TOKEN_LOCAL_KEY, value: legacy }); }
        catch { /* ignore */ }
      }
    }
  } catch { /* Preferences plugin недоступен в этом контексте */ }
}

/**
 * Fire-and-forget зеркало прямых localStorage.setItem('auth_token', …)
 * в Preferences. Все места, где токен пишется в localStorage напрямую
 * (authStore installSession, main.tsx impersonation, auth.ts logout),
 * должны также вызвать эту функцию.
 *
 * Не await'ить — UI не должен блокироваться на native-IO.
 */
export function writeTokenToNativeStorage(token: string | null): Promise<void> {
  if (!isNativePlatform()) return Promise.resolve();
  return enqueueNativeWrite(async () => {
    try {
      if (token) await Preferences.set({ key: TOKEN_LOCAL_KEY, value: token });
      else await Preferences.remove({ key: TOKEN_LOCAL_KEY });
    } catch { /* localStorage remains the synchronous fallback */ }
  });
}
