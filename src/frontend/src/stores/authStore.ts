import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { authApi, usersApi } from '../services/api';
import type { TenantPickEntry } from '../services/api/auth';
import { useToastStore } from './toastStore';

interface MockUserData {
  password: string;
  user: User;
}

/**
 * Login attempt outcome.
 *   'success' — user logged in; component should let App re-render.
 *   'picker'  — backend asked the caller to pick a workspace. Read
 *               state.pickerTenants and call login() again with a
 *               tenantSlug.
 *   'error'   — credentials rejected / network issue. state.error holds
 *               the message to display.
 */
export type LoginOutcome = 'success' | 'picker' | 'error';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  /**
   * Populated when the backend returns needs_tenant_pick=true. UI shows
   * a workspace picker; the user picks a slug; the caller re-submits
   * login() with `tenantSlug`. Cleared on success, on error, or by
   * clearPicker().
   */
  pickerTenants: TenantPickEntry[] | null;
  // Legacy compatibility - to be removed after full migration
  additionalUsers: Record<string, MockUserData>;
  login: (loginStr: string, password: string, tenantSlug?: string) => Promise<LoginOutcome>;
  /** Dismiss the picker without resubmitting (user cancelled). */
  clearPicker: () => void;
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
      pickerTenants: null,
      additionalUsers: {},

      login: async (loginStr: string, password: string, tenantSlug?: string) => {
        const normalizedLogin = loginStr.trim();
        const normalizedPassword = password.trim();
        // Clear any leftover picker state from a previous attempt so the
        // UI doesn't briefly show stale options if this call comes back
        // 'success' or 'error' instead of 'picker'.
        set({ isLoading: true, error: null, pickerTenants: null });

        try {
          const result = await authApi.login(normalizedLogin, normalizedPassword, tenantSlug);

          if (result.kind === 'picker') {
            // Backend confirmed credentials are valid for 2+ tenants and is
            // asking the user which workspace to land in. Do NOT mutate
            // user/token — the user isn't authenticated to any workspace
            // until they pick one and we re-submit.
            set({
              isLoading: false,
              error: null,
              pickerTenants: result.tenants,
            });
            return 'picker';
          }

          // Sync token to localStorage immediately so apiRequest can use it
          localStorage.setItem('auth_token', result.token);
          set({
            user: result.user as unknown as User,
            token: result.token,
            isLoading: false,
            error: null,
            pickerTenants: null,
          });
          // Refresh tenant config now that we have a valid JWT. App.tsx
          // calls fetchConfig() on mount, but in the unified mobile app
          // that initial call lands BEFORE login (no JWT → backend can't
          // pick a tenant from Origin: https://localhost) and returns
          // null. After a successful login we have the JWT in
          // localStorage; the JWT-fallback path in the tenant/config
          // endpoint can now resolve the user's REAL workspace. Fire
          // and forget — failure here shouldn't block login. Lazy
          // import dodges a circular store dep (auth → tenant → auth).
          import('./tenantStore').then(({ useTenantStore }) => {
            void useTenantStore.getState().fetchConfig();
          }).catch(() => { /* non-critical */ });

          // Sprint 86 — request native push permission + register the
          // device token with the backend. Native-only (Capacitor.is
          // NativePlatform() guard inside). Fire-and-forget: a denied
          // permission or a network failure here must not break login.
          // The PWA build short-circuits to a no-op.
          import('../services/nativePush').then(({ initializeNativePush }) => {
            void initializeNativePush();
          }).catch(() => { /* non-critical */ });
          return 'success';
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
            pickerTenants: null,
          });
          return 'error';
        }
      },

      clearPicker: () => {
        set({ pickerTenants: null });
      },

      logout: () => {
        // Sprint 86 — deactivate the current native push token. We
        // snapshot the JWT synchronously BEFORE authApi.logout() wipes
        // localStorage; the snapshot is handed to the unregister call
        // so it stays authenticated even though the dynamic-import
        // resolves a microtask after the wipe. Fire-and-forget — a
        // backend blip must not strand the user on the login screen.
        let jwtSnapshot: string | null = null;
        try { jwtSnapshot = localStorage.getItem('auth_token'); } catch { /* private mode */ }
        import('../services/nativePush').then(({ unregisterNativePush }) => {
          void unregisterNativePush(jwtSnapshot);
        }).catch(() => { /* non-critical */ });
        authApi.logout();
        set({ user: null, token: null, error: null });
        // Sprint 87 — очистка tenantStore + всех persist-ключей
        // tenant-config-*. Без этого на нативе (один origin capacitor://
        // localhost на все тенанты) следующий юзер поднимет кэш
        // предыдущего и увидит его фичи до подгрузки нового config.
        import('./tenantStore').then(({ useTenantStore }) => {
          useTenantStore.getState().clear();
        }).catch(() => { /* non-critical */ });
        try {
          Object.keys(localStorage)
            .filter((k) => k === 'tenant-config' || k.startsWith('tenant-config-'))
            .forEach((k) => localStorage.removeItem(k));
        } catch { /* private mode */ }
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
