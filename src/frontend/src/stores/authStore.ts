import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { authApi } from '../services/api/auth';
import { markLoggedIn, registerSessionExpiredHandler } from '../services/api/client';
import { usersApi } from '../services/api/users';
import type { TenantPickEntry } from '../services/api/auth';
import { useToastStore } from './toastStore';
import { resetSessionScopedState } from './sessionReset';
import { useTenantStore } from './tenantStore';

interface MockUserData {
  password: string;
  user: User;
}

const isUserRole = (value: unknown): value is User['role'] =>
  value === 'super_admin' || value === 'admin' || value === 'director'
  || value === 'manager' || value === 'department_head' || value === 'executor'
  || value === 'resident' || value === 'commercial_owner' || value === 'tenant'
  || value === 'advertiser' || value === 'dispatcher' || value === 'security'
  || value === 'marketplace_manager';

const isUser = (value: unknown): value is User => {
  if (typeof value !== 'object' || value === null) return false;
  return 'id' in value && typeof value.id === 'string'
    && 'phone' in value && typeof value.phone === 'string'
    && 'name' in value && typeof value.name === 'string'
    && 'login' in value && typeof value.login === 'string'
    && 'role' in value && isUserRole(value.role);
};

/**
 * Login attempt outcome.
 *   'success' — user logged in; component should let App re-render.
 *   'picker'  — backend asked the caller to pick a workspace. Read
 *               state.pickerTenants and call login() again with a
 *               tenantSlug.
 *   'error'   — credentials rejected / network issue. state.error holds
 *               the message to display.
 */
// 'approval' — пароль верен, но у аккаунта включён второй фактор через
// Telegram (ТЗ §17). Сессии ещё нет: экран логина должен показать
// «подтвердите вход в Telegram» и вызвать awaitLoginApproval().
export type LoginOutcome = 'success' | 'picker' | 'error' | 'approval';

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
  /**
   * Ожидающее подтверждение входа через Telegram (ТЗ §17). Непусто
   * ровно между ответом login() = 'approval' и решением пользователя.
   */
  pendingApproval: { requestId: string; expiresAt: string } | null;
  /**
   * Опрашивает статус подтверждения, пока человек не нажмёт кнопку в
   * боте. При 'approved' сам ставит сессию и возвращает 'success'.
   */
  awaitLoginApproval: () => Promise<'success' | 'denied' | 'expired' | 'error'>;
  clearPendingApproval: () => void;
  login: (loginStr: string, password: string, tenantSlug?: string) => Promise<LoginOutcome>;
  demoLogin: (roleKey: string) => Promise<LoginOutcome>;
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

const loginErrorMessage = (apiError: unknown): string => {
  const rawMessage = apiError instanceof Error ? apiError.message : '';
  if (!rawMessage || rawMessage === 'Invalid credentials') return 'Неверный логин или пароль';
  if (rawMessage === 'Превышено время ожидания запроса. Проверьте соединение.') return rawMessage;
  if (rawMessage.toLowerCase().includes('too many') || rawMessage.toLowerCase().includes('rate limit')) {
    return 'Слишком много попыток входа. Попробуйте через минуту.';
  }
  if (rawMessage.toLowerCase().includes('internal server') || rawMessage.toLowerCase().includes('500')) {
    return 'Ошибка сервера. Попробуйте позже.';
  }
  return rawMessage;
};

const installSession = (
  set: (state: Partial<AuthState>) => void,
  user: User,
  token: string,
) => {
  resetSessionScopedState();
  localStorage.setItem('auth_token', token);
  markLoggedIn();
  set({ user, token, isLoading: false, error: null, pickerTenants: null });
  void useTenantStore.getState().fetchConfig().catch(() => { /* non-critical */ });
  import('../services/nativePush').then(({ initializeNativePush }) => {
    void initializeNativePush();
  }).catch(() => { /* non-critical */ });
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,
      error: null,
      pickerTenants: null,
      pendingApproval: null,
      additionalUsers: {},

      login: async (loginStr: string, password: string, tenantSlug?: string) => {
        if (get().isLoading) return 'error';
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

          if (result.kind === 'approval') {
            // Пароль верен, но JWT не выдан: ждём нажатия в Telegram.
            // user/token не трогаем — сессии пока нет.
            set({
              isLoading: false,
              error: null,
              pendingApproval: {
                requestId: result.requestId,
                expiresAt: result.expiresAt,
              },
            });
            return 'approval';
          }

          if (!isUser(result.user)) {
            throw new Error('Invalid user response');
          }

          installSession(set, result.user, result.token);
          return 'success';
        } catch (apiError: unknown) {
          set({
            isLoading: false,
            error: loginErrorMessage(apiError),
            pickerTenants: null,
          });
          return 'error';
        }
      },

      demoLogin: async (roleKey: string) => {
        if (get().isLoading) return 'error';
        set({ isLoading: true, error: null, pickerTenants: null });
        try {
          const result = await authApi.demoLogin(roleKey);
          if (!isUser(result.user)) throw new Error('Invalid user response');
          installSession(set, result.user, result.token);
          return 'success';
        } catch (apiError: unknown) {
          set({ isLoading: false, error: loginErrorMessage(apiError), pickerTenants: null });
          return 'error';
        }
      },

      clearPicker: () => {
        set({ pickerTenants: null });
      },

      clearPendingApproval: () => {
        set({ pendingApproval: null });
      },

      // Опрос подтверждения входа (ТЗ §17).
      //
      // Раз в 2 секунды, максимум 65 попыток — чуть больше, чем окно
      // в 2 минуты, чтобы последняя проверка попала уже на истёкший
      // запрос и мы честно показали 'expired', а не бросили опрос
      // молча.
      //
      // Токен приходит РОВНО ОДИН РАЗ: сервер помечает запрос
      // использованным до выдачи, поэтому installSession вызывается
      // немедленно при первом же 'approved'.
      awaitLoginApproval: async () => {
        const pending = get().pendingApproval;
        if (!pending) return 'error';

        const POLL_MS = 2000;
        const MAX_ATTEMPTS = 65;

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
          // Пользователь мог нажать «Отмена» — прекращаем опрос, иначе
          // сессия установится уже после ухода с экрана логина.
          if (!get().pendingApproval) return 'error';

          try {
            const res = await authApi.loginApprovalStatus(pending.requestId);

            if (res.status === 'approved' && res.token && isUser(res.user)) {
              set({ pendingApproval: null });
              installSession(set, res.user, res.token);
              return 'success';
            }
            if (res.status === 'denied') {
              set({ pendingApproval: null });
              return 'denied';
            }
            if (res.status === 'expired' || res.status === 'consumed') {
              set({ pendingApproval: null });
              return 'expired';
            }
          } catch {
            // Сетевой сбой на одном опросе не должен обрывать ожидание:
            // человек в это время держит телефон в руках. Пробуем снова.
          }

          await new Promise(r => setTimeout(r, POLL_MS));
        }

        set({ pendingApproval: null });
        return 'expired';
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
        localStorage.removeItem('auth_token');
        set({ user: null, token: null, error: null });
        resetSessionScopedState();
        authApi.logout();
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
          building_id: user.buildingId,
          entrance: user.entrance,
          floor: user.floor,
          branch: user.branch,
          building: user.building,
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

registerSessionExpiredHandler(() => {
  useAuthStore.setState({ user: null, token: null, error: null });
  resetSessionScopedState();
});
