import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { authApi, usersApi } from '../services/api';
import { useToastStore } from './toastStore';

interface MockUserData {
  password: string;
  user: User;
}

// ── 2FA-on-login pending state ───────────────────────────────────────
// Only populated when the backend (with TWO_FA_ENABLED='1') replies
// to /api/auth/login with twoFactorRequired=true. When the flag is OFF
// the server still returns the legacy {user, token} envelope and this
// state stays null — none of the 2FA UI ever mounts.
export interface TwoFactorPendingState {
  pendingToken: string;
  phoneMasked: string;
  expiresAtMs: number;        // wall-clock time when the code expires
  resendCooldownSec: number;  // initial cooldown advertised by the server
  /** Only present when the backend mock has dev mode on (NEVER in prod). */
  devCode?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  // 2FA pending state — null in the default flag-off configuration.
  pendingTwoFactor: TwoFactorPendingState | null;
  // Legacy compatibility - to be removed after full migration
  additionalUsers: Record<string, MockUserData>;
  login: (loginStr: string, password: string) => Promise<boolean>;
  verify2FA: (code: string, rememberDevice: boolean) => Promise<boolean>;
  resend2FA: () => Promise<{ ok: boolean; retryAfterSec?: number }>;
  cancel2FA: () => void;
  logout: () => void;
  register: (userData: {
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    specialization?: string;
  }) => Promise<boolean>;
  registerBulk: (users: Array<{
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
  }>) => Promise<{ created: Record<string, unknown>[]; updated: Record<string, unknown>[] }>;
  updateProfile: (updates: { phone?: string; name?: string }) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  adminChangePassword: (userId: string, newPassword: string) => Promise<boolean>;
  markContractSigned: () => Promise<boolean>;
  refreshUser: () => Promise<void>;
  // Legacy methods for backward compatibility
  addMockUser: (login: string, password: string, user: User) => void;
  removeUser: (login: string) => void;
  updateUserPassword: (login: string, newPassword: string) => void;
  updateUserProfile: (login: string, updates: Partial<User>) => void;
  getUserPassword: (login: string) => string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      pendingTwoFactor: null,
      additionalUsers: {},

      login: async (loginStr: string, password: string) => {
        const normalizedLogin = loginStr.trim();
        const normalizedPassword = password.trim();
        set({ isLoading: true, error: null, pendingTwoFactor: null });

        // API login (all users are in database)
        try {
          const result = await authApi.login(normalizedLogin, normalizedPassword);
          if (result.kind === 'two_factor') {
            // Backend flag is on AND device wasn't pre-trusted: stash
            // the pending payload, the LoginPage will swap to the
            // code-entry screen. No JWT yet, so we don't set user/token.
            set({
              pendingTwoFactor: {
                pendingToken: result.pending.pendingToken,
                phoneMasked: result.pending.phoneMasked,
                expiresAtMs: Date.now() + Math.max(0, result.pending.expiresInSec) * 1000,
                resendCooldownSec: result.pending.resendCooldownSec,
                devCode: result.pending.dev_code,
              },
              isLoading: false,
              error: null,
            });
            // Returning false keeps the existing call sites (which
            // assume "true = authenticated") from blindly navigating
            // into the app before the code is verified.
            return false;
          }
          // Legacy (flag-off) branch — UNCHANGED behaviour.
          localStorage.setItem('auth_token', result.token);
          set({
            user: result.user,
            token: result.token,
            isLoading: false,
            error: null,
            pendingTwoFactor: null,
          });
          return true;
        } catch (apiError: unknown) {
          // Login failed
          const rawMessage = apiError instanceof Error ? apiError.message : '';
          // Normalize server-side "Invalid credentials" → Russian UX message
          // Other errors (timeout, server error, rate limit) pass through as-is
          const message =
            !rawMessage || rawMessage === 'Invalid credentials'
              ? 'Неверный логин или пароль'
              : rawMessage === 'Превышено время ожидания запроса. Проверьте соединение.'
                ? rawMessage
                : rawMessage.toLowerCase().includes('too many') || rawMessage.toLowerCase().includes('rate limit')
                  ? 'Слишком много попыток входа. Попробуйте через минуту.'
                  : rawMessage.toLowerCase().includes('internal server') || rawMessage.toLowerCase().includes('500')
                    ? 'Ошибка сервера. Попробуйте позже.'
                    : rawMessage;
          set({
            isLoading: false,
            error: message,
            pendingTwoFactor: null,
          });
          return false;
        }
      },

      verify2FA: async (code: string, rememberDevice: boolean) => {
        const pending = get().pendingTwoFactor;
        if (!pending) return false;
        set({ isLoading: true, error: null });
        try {
          const { user, token } = await authApi.verify2FA(pending.pendingToken, code, rememberDevice);
          set({
            user,
            token,
            pendingTwoFactor: null,
            isLoading: false,
            error: null,
          });
          return true;
        } catch (apiError: unknown) {
          const rawMessage = apiError instanceof Error ? apiError.message : '';
          // Map the structured server errors to Russian UX strings.
          const lower = rawMessage.toLowerCase();
          const message =
            lower.includes('invalid_code') ? 'Неверный код. Попробуйте ещё раз.'
            : lower.includes('too_many_attempts') ? 'Слишком много попыток. Запросите код заново.'
            : lower.includes('pending_expired') ? 'Срок действия кода истёк. Начните вход заново.'
            : rawMessage || 'Не удалось подтвердить код.';
          set({ isLoading: false, error: message });
          // If the pending flow is irrecoverable (expired / too many),
          // tear it down so the UI bounces back to the login form.
          if (lower.includes('pending_expired') || lower.includes('too_many_attempts')) {
            set({ pendingTwoFactor: null });
          }
          return false;
        }
      },

      resend2FA: async () => {
        const pending = get().pendingTwoFactor;
        if (!pending) return { ok: false };
        try {
          const resp = await authApi.resend2FA(pending.pendingToken);
          set({
            pendingTwoFactor: {
              ...pending,
              expiresAtMs: Date.now() + Math.max(0, resp.expiresInSec) * 1000,
              resendCooldownSec: resp.resendCooldownSec,
              devCode: resp.dev_code,
            },
            error: null,
          });
          return { ok: true };
        } catch (apiError: unknown) {
          const rawMessage = apiError instanceof Error ? apiError.message : '';
          // Surface the cooldown number to the caller when we got one.
          const m = rawMessage.match(/retry[_ -]after[^\d]*(\d+)/i);
          const retryAfterSec = m ? Number(m[1]) : undefined;
          const lower = rawMessage.toLowerCase();
          const message =
            lower.includes('sms_cooldown') ? 'Подождите перед повторной отправкой.'
            : lower.includes('sms_hourly_cap') ? 'Достигнут лимит отправок за час.'
            : lower.includes('sms_daily_cap') ? 'Достигнут дневной лимит отправок.'
            : lower.includes('pending_expired') ? 'Срок действия кода истёк. Начните вход заново.'
            : rawMessage || 'Не удалось отправить код.';
          set({ error: message });
          return { ok: false, retryAfterSec };
        }
      },

      cancel2FA: () => {
        set({ pendingTwoFactor: null, error: null });
      },

      logout: () => {
        authApi.logout();
        set({ user: null, token: null, error: null, pendingTwoFactor: null });
      },

      register: async (userData) => {
        set({ isLoading: true, error: null });
        try {
          await authApi.register(userData);
          set({ isLoading: false });
          return true;
        } catch (error: unknown) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Register failed');
          set({ isLoading: false, error: (error as Error).message });
          return false;
        }
      },

      registerBulk: async (users) => {
        set({ isLoading: true, error: null });
        try {
          const result = await authApi.registerBulk(users);
          set({ isLoading: false });
          return result;
        } catch (error: unknown) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Bulk register failed');
          set({ isLoading: false, error: (error as Error).message });
          return { created: [], updated: [] };
        }
      },

      updateProfile: async (updates) => {
        set({ isLoading: true, error: null });
        try {
          const data = await usersApi.updateMe(updates);
          set({ user: data.user, isLoading: false });
          return true;
        } catch (error: unknown) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Update profile failed');
          set({ isLoading: false, error: (error as Error).message });
          return false;
        }
      },

      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        try {
          const result = await usersApi.changePassword(currentPassword, newPassword);
          // Update user with password_changed_at from server
          const currentUser = get().user;
          if (currentUser && result.password_changed_at) {
            set({
              user: { ...currentUser, passwordChangedAt: result.password_changed_at },
              isLoading: false
            });
          } else {
            set({ isLoading: false });
          }
          return true;
        } catch (error: unknown) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Change password failed');
          set({ isLoading: false, error: (error as Error).message });
          return false;
        }
      },

      adminChangePassword: async (userId, newPassword) => {
        set({ isLoading: true, error: null });
        try {
          await usersApi.adminChangePassword(userId, newPassword);
          set({ isLoading: false });
          return true;
        } catch (error: unknown) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Admin change password failed');
          set({ isLoading: false, error: (error as Error).message });
          return false;
        }
      },

      markContractSigned: async () => {
        try {
          const result = await usersApi.markContractSigned();
          // Update user with contract_signed_at from server
          const currentUser = get().user;
          if (currentUser && result.contract_signed_at) {
            set({
              user: { ...currentUser, contractSignedAt: result.contract_signed_at }
            });
          }
          return true;
        } catch (error: unknown) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Mark contract signed failed');
          return false;
        }
      },

      refreshUser: async () => {
        const token = get().token;
        if (!token) return;

        try {
          const data = await usersApi.getMe();
          set({ user: data.user });
        } catch (error) {
          useToastStore.getState().addToast('error', (error as Error).message || 'Refresh user failed');
          // If token is invalid, logout
          get().logout();
        }
      },

      // Legacy methods for backward compatibility (to be removed after full migration)
      addMockUser: (login: string, password: string, user: User) => {
        // Also register via API with all fields including building info
        authApi.register({
          login,
          password,
          name: user.name,
          role: user.role,
          phone: user.phone,
          address: user.address,
          apartment: user.apartment,
          building_id: (user as Record<string, unknown>).buildingId as string,
          entrance: (user as Record<string, unknown>).entrance as string,
          floor: (user as Record<string, unknown>).floor as string,
          branch: (user as Record<string, unknown>).branch as string,
          building: (user as Record<string, unknown>).building as string,
        }).catch((err) => {
          useToastStore.getState().addToast('error', (err as Error).message || 'Ошибка регистрации');
        });

        set((state) => ({
          additionalUsers: {
            ...state.additionalUsers,
            [login]: { password, user }
          }
        }));
      },

      removeUser: (login: string) => {
        set((state) => {
          const newUsers = { ...state.additionalUsers };
          delete newUsers[login];
          return { additionalUsers: newUsers };
        });
      },

      updateUserPassword: (login: string, newPassword: string) => {
        set((state) => {
          if (state.additionalUsers[login]) {
            return {
              additionalUsers: {
                ...state.additionalUsers,
                [login]: {
                  ...state.additionalUsers[login],
                  password: newPassword
                }
              }
            };
          }
          return state;
        });
      },

      updateUserProfile: (login: string, updates: Partial<User>) => {
        set((state) => {
          if (state.additionalUsers[login]) {
            return {
              additionalUsers: {
                ...state.additionalUsers,
                [login]: {
                  ...state.additionalUsers[login],
                  user: { ...state.additionalUsers[login].user, ...updates }
                }
              }
            };
          }
          // Also update current user if it's themselves
          if (state.user?.login === login) {
            return { user: { ...state.user, ...updates } };
          }
          return state;
        });
      },

      getUserPassword: (login: string) => {
        const state = get();
        return state.additionalUsers[login]?.password || null;
      },
    }),
    {
      name: 'uk-auth-storage',
      version: 4, // v4: JWT tokens — token is no longer user.id
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        // Do NOT persist additionalUsers - all users should come from API
        // This ensures data is consistent across all browsers/devices
      }),
      // Sync JWT token to localStorage when store is rehydrated (e.g., page refresh)
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Rehydrate error:', error); // keep console.error for critical rehydration debugging
          return;
        }
        if (state?.token) {
          localStorage.setItem('auth_token', state.token);
        } else {
          // No token - clear stale state
          localStorage.removeItem('auth_token');
        }
      },
    }
  )
);
