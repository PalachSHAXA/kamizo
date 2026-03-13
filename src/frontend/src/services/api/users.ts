// Users API & Team API

import { apiRequest, transformUser } from './client';

export const usersApi = {
  getMe: async () => {
    const data = await apiRequest<{ user: any }>('/api/users/me');
    return { user: transformUser(data.user) };
  },

  updateMe: async (updates: { phone?: string; name?: string; language?: string }) => {
    const data = await apiRequest<{ user: any }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
    return { user: transformUser(data.user) };
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    return apiRequest<{ success: boolean; password_changed_at?: string }>('/api/users/me/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },

  markContractSigned: async () => {
    return apiRequest<{ success: boolean; contract_signed_at?: string }>('/api/users/me/contract-signed', {
      method: 'POST',
    });
  },

  adminChangePassword: async (userId: string, newPassword: string) => {
    return apiRequest<{ success: boolean }>(`/api/users/${userId}/password`, {
      method: 'POST',
      body: JSON.stringify({ new_password: newPassword }),
    });
  },

  getAll: async (filters?: { role?: string; building_id?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.building_id) params.append('building_id', filters.building_id);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    const query = params.toString();
    return apiRequest<{ users: any[]; pagination?: any }>(`/api/users${query ? '?' + query : ''}`);
  },

  delete: async (userId: string) => {
    return apiRequest<{ success: boolean }>(`/api/users/${userId}`, {
      method: 'DELETE',
    });
  },
};

// Team API (Admin only - get all staff: managers, department heads, executors)
export const teamApi = {
  getAll: async () => {
    // Always fetch fresh data, no caching
    return apiRequest<{
      admins: any[];
      managers: any[];
      departmentHeads: any[];
      executors: any[];
    }>('/api/team', { cache: 'no-store' });
  },

  // Get single staff member by ID (for live data refresh with password)
  getById: async (userId: string) => {
    // Always fetch fresh data, no caching
    return apiRequest<{ user: any }>(`/api/team/${userId}`, { cache: 'no-store' });
  },

  // Create new staff member (uses auth/register endpoint)
  create: async (data: {
    login: string;
    password: string;
    name: string;
    phone: string;
    role: 'admin' | 'manager' | 'department_head' | 'executor' | 'advertiser';
    specialization?: string;
  }) => {
    return apiRequest<{ user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (userId: string, data: {
    name?: string;
    phone?: string;
    login?: string;
    password?: string;
    specialization?: string;
    status?: string;
  }) => {
    return apiRequest<{ user: any }>(`/api/team/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Delete staff member
  delete: async (userId: string) => {
    return apiRequest<{ success: boolean }>(`/api/team/${userId}`, {
      method: 'DELETE',
    });
  },

  // Reset passwords for all staff without password_plain (admin only, one-time operation)
  resetAllPasswords: async () => {
    return apiRequest<{
      message: string;
      updated: number;
      staff: { id: string; login: string; name: string; password: string }[];
    }>('/api/team/reset-all-passwords', {
      method: 'POST',
    });
  },
};
