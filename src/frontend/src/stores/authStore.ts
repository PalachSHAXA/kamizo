import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { authApi, usersApi } from '../services/api';

interface MockUserData {
  password: string;
  user: User;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  // Legacy compatibility - to be removed after full migration
  additionalUsers: Record<string, MockUserData>;
  login: (loginStr: string, password: string) => Promise<boolean>;
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
  }>) => Promise<{ created: any[]; updated: any[] }>;
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
      additionalUsers: {},

      login: async (loginStr: string, password: string) => {
        const normalizedLogin = loginStr.trim();
        const normalizedPassword = password.trim();
        set({ isLoading: true, error: null });

        // API login (all users are in database)
        try {
          const data = await authApi.login(normalizedLogin, normalizedPassword);
          set({
            user: data.user,
            token: data.token,
            isLoading: false,
            error: null
          });
          return true;
        } catch (apiError: unknown) {
          // Login failed
          const message = apiError instanceof Error ? apiError.message : 'Неверный логин или пароль';
          set({
            isLoading: false,
            error: message
          });
          return false;
        }
      },

      logout: () => {
        authApi.logout();
        set({ user: null, token: null, error: null });
      },

      register: async (userData) => {
        set({ isLoading: true, error: null });
        try {
          await authApi.register(userData);
          set({ isLoading: false });
          return true;
        } catch (error: unknown) {
          console.error('Register failed:', error);
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
          console.error('Bulk register failed:', error);
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
          console.error('Update profile failed:', error);
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
          console.error('Change password failed:', error);
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
          console.error('Admin change password failed:', error);
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
          console.error('Mark contract signed failed:', error);
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
          console.error('Refresh user failed:', error);
          // If token is invalid, logout
          get().logout();
        }
      },

      // Legacy methods for backward compatibility (to be removed after full migration)
      addMockUser: (login: string, password: string, user: User) => {
        console.log('addMockUser called with:', { login, password, user });

        // Also register via API with all fields including building info
        authApi.register({
          login,
          password,
          name: user.name,
          role: user.role,
          phone: user.phone,
          address: user.address,
          apartment: user.apartment,
          building_id: (user as any).buildingId,
          entrance: (user as any).entrance,
          floor: (user as any).floor,
          branch: (user as any).branch,
          building: (user as any).building,
        }).then(() => {
          console.log('User registered via API successfully');
        }).catch((err) => {
          console.error('API register error:', err);
        });

        set((state) => ({
          additionalUsers: {
            ...state.additionalUsers,
            [login]: { password, user }
          }
        }));

        console.log('User added to local store');
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
      version: 3, // Increment to fix token/user.id mismatch
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        // Do NOT persist additionalUsers - all users should come from API
        // This ensures data is consistent across all browsers/devices
      }),
      // Sync token to localStorage when store is rehydrated (e.g., page refresh)
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Rehydrate error:', error);
          return;
        }
        if (state?.user?.id) {
          // CRITICAL FIX: Ensure token always matches user.id
          // This fixes 401 errors caused by token/user.id mismatch
          const correctToken = state.user.id;
          if (state.token !== correctToken) {
            console.warn('Token mismatch detected, fixing...', {
              oldToken: state.token,
              newToken: correctToken
            });
            state.token = correctToken;
          }
          localStorage.setItem('auth_token', correctToken);
          console.log('Token synced to localStorage on rehydrate:', correctToken);
        } else if (state?.token) {
          // No user but have token - clear it to avoid stale state
          console.warn('Token exists but no user, clearing auth state');
          localStorage.removeItem('auth_token');
          state.token = null;
        }
      },
    }
  )
);
