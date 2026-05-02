// Auth API

import { apiRequest, transformUser, markLoggedIn } from './client';

export const authApi = {
  login: async (login: string, password: string) => {
    const data = await apiRequest<{ user: Record<string, unknown>; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    });
    localStorage.setItem('auth_token', data.token);
    markLoggedIn(); // 10s grace period before 401s can force logout
    // Transform user fields from snake_case to camelCase
    return { ...data, user: transformUser(data.user) };
  },

  logout: () => {
    localStorage.removeItem('auth_token');
  },

  register: async (userData: {
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    specialization?: string;
    building_id?: string;
    entrance?: string;
    floor?: string;
    branch?: string;
    building?: string;
  }) => {
    return apiRequest<{ user: Record<string, unknown> }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  registerBulk: async (users: Array<{
    login: string;
    password: string;
    name: string;
    role: string;
    phone?: string;
    address?: string;
    apartment?: string;
    building_id?: string;
    entrance?: string;
    floor?: string;
  }>) => {
    return apiRequest<{ created: Record<string, unknown>[]; updated: Record<string, unknown>[] }>('/api/auth/register-bulk', {
      method: 'POST',
      body: JSON.stringify({ users }),
    });
  },
};
