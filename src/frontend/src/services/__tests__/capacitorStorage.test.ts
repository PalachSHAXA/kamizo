// fix/mobile-token-persistence: тесты hybrid storage adapter.

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Capacitor + Preferences ДО импорта нашего модуля.
const isNativeMock = vi.hoisted(() => ({ value: false }));
const prefsStore = vi.hoisted(() => new Map<string, string>());

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativeMock.value },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: prefsStore.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { prefsStore.set(key, value); }),
    remove: vi.fn(async ({ key }: { key: string }) => { prefsStore.delete(key); }),
  },
}));

import { preferencesStorage, hydrateTokenCache, writeTokenToNativeStorage, isNativePlatform } from '../capacitorStorage';

beforeEach(() => {
  isNativeMock.value = false;
  prefsStore.clear();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('capacitorStorage — web fallback (isNativePlatform=false)', () => {
  it('setItem пишет в localStorage', async () => {
    await preferencesStorage.setItem('key1', 'value1');
    expect(localStorage.getItem('key1')).toBe('value1');
    expect(prefsStore.has('key1')).toBe(false); // Preferences не тронут
  });

  it('getItem читает из localStorage', async () => {
    localStorage.setItem('key2', 'value2');
    const v = await preferencesStorage.getItem('key2');
    expect(v).toBe('value2');
  });

  it('removeItem удаляет из localStorage', async () => {
    localStorage.setItem('key3', 'value3');
    await preferencesStorage.removeItem('key3');
    expect(localStorage.getItem('key3')).toBeNull();
  });

  it('hydrateTokenCache() no-op на web (early return)', async () => {
    localStorage.setItem('auth_token', 'legacy-web-token');
    await hydrateTokenCache();
    // Никаких изменений — legacy остался, Preferences не запрашивался.
    expect(localStorage.getItem('auth_token')).toBe('legacy-web-token');
    expect(prefsStore.has('auth_token')).toBe(false);
  });

  it('writeTokenToNativeStorage() no-op на web', () => {
    writeTokenToNativeStorage('some-token');
    expect(prefsStore.has('auth_token')).toBe(false);
  });
});

describe('capacitorStorage — native platform (isNativePlatform=true)', () => {
  beforeEach(() => { isNativeMock.value = true; });

  it('isNativePlatform() возвращает true', () => {
    expect(isNativePlatform()).toBe(true);
  });

  it('setItem пишет в Preferences И зеркалит в localStorage (sync warm cache)', async () => {
    await preferencesStorage.setItem('auth_token', 'jwt-native');
    expect(prefsStore.get('auth_token')).toBe('jwt-native');
    // ВАЖНО: зеркало в localStorage — иначе sync getToken() в client.ts не увидит.
    expect(localStorage.getItem('auth_token')).toBe('jwt-native');
  });

  it('getItem предпочитает Preferences перед localStorage', async () => {
    prefsStore.set('auth_token', 'from-keychain');
    localStorage.setItem('auth_token', 'from-webview-stale');
    const v = await preferencesStorage.getItem('auth_token');
    expect(v).toBe('from-keychain');
  });

  it('getItem fallback на localStorage если Preferences.get кинул', async () => {
    const { Preferences } = await import('@capacitor/preferences');
    vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('plugin fail'));
    localStorage.setItem('auth_token', 'fallback-value');
    const v = await preferencesStorage.getItem('auth_token');
    expect(v).toBe('fallback-value');
  });

  it('removeItem чистит и Preferences, и localStorage', async () => {
    prefsStore.set('auth_token', 'jwt');
    localStorage.setItem('auth_token', 'jwt');
    await preferencesStorage.removeItem('auth_token');
    expect(prefsStore.has('auth_token')).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('hydrateTokenCache() — Keychain истина, заливает в localStorage', async () => {
    prefsStore.set('auth_token', 'jwt-from-keychain');
    // localStorage мог быть очищен WebView'ом
    expect(localStorage.getItem('auth_token')).toBeNull();

    await hydrateTokenCache();

    expect(localStorage.getItem('auth_token')).toBe('jwt-from-keychain');
  });

  it('hydrateTokenCache() — migration: legacy token в localStorage без Keychain → переносится в Preferences', async () => {
    // Симуляция: пользователь обновил приложение с версии до fix'а. У него
    // старый токен в localStorage, но Keychain ещё пуст.
    localStorage.setItem('auth_token', 'legacy-web-jwt');
    expect(prefsStore.has('auth_token')).toBe(false);

    await hydrateTokenCache();

    // Токен теперь в Keychain — след. cold start будет читать оттуда.
    expect(prefsStore.get('auth_token')).toBe('legacy-web-jwt');
    // localStorage не тронут (миграция read-only)
    expect(localStorage.getItem('auth_token')).toBe('legacy-web-jwt');
  });

  it('hydrateTokenCache() — оба пусты → тишина, не создаёт ложных значений', async () => {
    await hydrateTokenCache();
    expect(prefsStore.has('auth_token')).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('writeTokenToNativeStorage(string) — записывает в Preferences fire-and-forget', async () => {
    writeTokenToNativeStorage('jwt-new');
    // Fire-and-forget → микротаска.
    await Promise.resolve();
    expect(prefsStore.get('auth_token')).toBe('jwt-new');
  });

  it('writeTokenToNativeStorage(null) — удаляет из Preferences', async () => {
    prefsStore.set('auth_token', 'old-jwt');
    writeTokenToNativeStorage(null);
    await Promise.resolve();
    expect(prefsStore.has('auth_token')).toBe(false);
  });
});
