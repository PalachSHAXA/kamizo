import { Capacitor } from '@capacitor/core';
import type { User } from '../types';

const NATIVE_AUTH_KEY = 'kamizo_native_auth_session_v1';

interface NativeAuthSession {
  user: User;
  token: string;
}

function isNativeAuthSession(value: unknown): value is NativeAuthSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<NativeAuthSession>;
  return typeof candidate.token === 'string'
    && candidate.token.length > 20
    && !!candidate.user
    && typeof candidate.user === 'object'
    && typeof candidate.user.id === 'string'
    && typeof candidate.user.role === 'string';
}

export async function persistNativeAuthSession(user: User, token: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: NATIVE_AUTH_KEY, value: JSON.stringify({ user, token }) });
  } catch {
    // localStorage remains the web/native fallback.
  }
}

export async function restoreNativeAuthSession(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const stored = await Preferences.get({ key: NATIVE_AUTH_KEY });
    if (!stored.value) return false;
    const session: unknown = JSON.parse(stored.value);
    if (!isNativeAuthSession(session)) {
      await Preferences.remove({ key: NATIVE_AUTH_KEY });
      return false;
    }
    localStorage.setItem('auth_token', session.token);
    localStorage.setItem('uk-auth-storage', JSON.stringify({
      state: { user: session.user, token: session.token },
      version: 4,
    }));
    return true;
  } catch {
    return false;
  }
}

export async function clearNativeAuthSession(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.remove({ key: NATIVE_AUTH_KEY });
  } catch {
    // The in-memory and localStorage session are still cleared by authStore.
  }
}
