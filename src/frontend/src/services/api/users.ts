// Users API & Team API

import { apiRequest, transformUser } from './client';
import type { UserApiResponse } from './client';
import type { ExecutorSpecialization, UserRole } from '../../types';

export type TeamRole =
  | 'admin'
  | 'director'
  | 'manager'
  | 'advertiser'
  | 'department_head'
  | 'dispatcher'
  | 'executor'
  | 'security';

export interface TeamListUser {
  id: string;
  login: string;
  name: string;
  phone: string | null;
  role: TeamRole;
  specialization: ExecutorSpecialization | null;
  is_active: number;
  created_at: string;
  completed_count: number;
  active_count: number;
  avg_rating: number;
}

export interface TeamDetailUser {
  id: string;
  login: string;
  name: string;
  phone: string | null;
  role: TeamRole;
  specialization: ExecutorSpecialization | null;
  status: string | null;
  created_at: string;
}

export interface TeamListResponse {
  directors: TeamListUser[];
  admins: TeamListUser[];
  managers: TeamListUser[];
  departmentHeads: TeamListUser[];
  executors: TeamListUser[];
  total: number;
}

export interface ResetUserPasswordResponse {
  success: boolean;
  message: string;
  temporaryPassword: string;
  user: { id: string; login: string; name: string; role: UserRole };
}

export const usersApi = {
  getMe: async () => {
    const data = await apiRequest<{ user: UserApiResponse }>('/api/users/me');
    return { user: transformUser(data.user) };
  },

  updateMe: async (updates: { phone?: string; name?: string; language?: string }) => {
    const data = await apiRequest<{ user: UserApiResponse }>('/api/users/me', {
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

  resetUserPassword: async (userId: string) => {
    return apiRequest<ResetUserPasswordResponse>(`/api/users/${userId}/reset-password`, {
      method: 'POST',
    });
  },

  adminChangeName: async (userId: string, name: string) => {
    return apiRequest<{ success: boolean; name: string }>(`/api/users/${userId}/name`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  // Update resident data with documented reason
  changeWithReason: async (userId: string, data: {
    changes: Array<{ field: string; value: string }>;
    reason: string;
    document_number?: string;
    document_date?: string;
    comment?: string;
  }) => {
    return apiRequest<{ success: boolean; user: Record<string, unknown> }>(`/api/users/${userId}/change-with-reason`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Get resident change history
  getChangeHistory: async (userId: string) => {
    return apiRequest<{ changes: Record<string, unknown>[] }>(`/api/users/${userId}/changes`);
  },

  // Deactivate resident (soft delete)
  deactivate: async (userId: string, reason: string, comment?: string) => {
    return apiRequest<{ success: boolean }>(`/api/users/${userId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason, comment }),
    });
  },

  getAll: async (filters?: { role?: string; building_id?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.role) params.append('role', filters.role);
    if (filters?.building_id) params.append('building_id', filters.building_id);
    if (filters?.limit) params.append('limit', filters.limit.toString());
    const query = params.toString();
    return apiRequest<{ users: Record<string, unknown>[]; pagination?: Record<string, unknown> }>(`/api/users${query ? '?' + query : ''}`);
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
    return apiRequest<TeamListResponse>('/api/team', { cache: 'no-store' });
  },

  // Get single staff member by ID for live data refresh
  getById: async (userId: string) => {
    // Always fetch fresh data, no caching
    return apiRequest<{ user: TeamDetailUser }>(`/api/team/${userId}`, { cache: 'no-store' });
  },

  // Create new staff member (uses auth/register endpoint)
  create: async (data: {
    login: string;
    password: string;
    name: string;
    phone: string;
    role: 'admin' | 'manager' | 'department_head' | 'executor' | 'advertiser' | 'dispatcher' | 'security';
    specialization?: string;
  }) => {
    return apiRequest<{ user: TeamDetailUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update: async (userId: string, data: {
    name?: string;
    phone?: string;
    login?: string;
    specialization?: string;
    status?: string;
  }) => {
    return apiRequest<{ user: TeamDetailUser }>(`/api/team/${userId}`, {
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
};
