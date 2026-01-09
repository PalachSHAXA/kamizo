import { create } from 'zustand';
import { User } from '../types';
import { authAPI } from '../api/client';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: false,
  error: null,

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await authAPI.login(username, password);
      global.authToken = data.token;
      set({
        user: data.user,
        token: data.token,
        isLoading: false,
      });
    } catch (error: any) {
      set({
        error: error.response?.data?.message || 'Ошибка входа',
        isLoading: false,
      });
      throw error;
    }
  },

  logout: () => {
    global.authToken = undefined;
    set({ user: null, token: null });
  },

  setUser: (user: User | null) => {
    set({ user });
  },
}));
