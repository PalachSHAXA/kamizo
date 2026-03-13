// Settings API, Notifications API, Tenant API

import { apiRequest, apiRequestWrapped } from './client';

// ============================================
// APP SETTINGS API
// ============================================

export interface AppSettings {
  companyName: string;
  companyInn: string;
  companyAddress: string;
  companyPhone: string;
  routingMode: 'manual' | 'auto' | 'hybrid';
  workingHoursStart: string;
  workingHoursEnd: string;
  autoAssign: boolean;
  notifyOnNew: boolean;
  notifyOnComplete: boolean;
  notifyOnRating: boolean;
  smsNotifications: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

export const settingsApi = {
  // Get all settings
  getAll: async () => {
    return apiRequestWrapped<{ settings: Record<string, any> }>('/api/settings').then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Get single setting
  get: async (key: string) => {
    return apiRequestWrapped<{ value: any }>(`/api/settings/${key}`).then(r => ({
      success: r.success,
      data: r.data,
      error: r.error
    }));
  },

  // Update single setting
  update: async (key: string, value: any) => {
    return apiRequestWrapped<{ success: boolean }>(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  },

  // Bulk update settings
  updateMany: async (settings: Partial<AppSettings>) => {
    return apiRequestWrapped<{ success: boolean }>('/api/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },
};

// ============================================
// NOTIFICATIONS API
// ============================================

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body?: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export const notificationsApi = {
  // Get notifications for current user
  getAll: async (limit = 50, unreadOnly = false) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (unreadOnly) params.set('unread', 'true');
    return apiRequest<{ notifications: Notification[] }>(`/api/notifications?${params}`);
  },

  // Get unread count
  getUnreadCount: async () => {
    return apiRequest<{ count: number }>('/api/notifications/count');
  },

  // Create notification
  create: async (data: {
    user_id: string;
    type: string;
    title: string;
    body?: string;
    data?: any;
  }) => {
    return apiRequest<{ id: string; success: boolean }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Mark as read
  markAsRead: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  // Mark all as read
  markAllAsRead: async () => {
    return apiRequest<{ success: boolean }>('/api/notifications/read-all', {
      method: 'POST',
    });
  },

  // Delete
  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/notifications/${id}`, {
      method: 'DELETE',
    });
  },

  // Broadcast to multiple users
  broadcast: async (data: {
    user_ids: string[];
    type: string;
    title: string;
    body?: string;
    data?: any;
  }) => {
    return apiRequest<{ success: boolean; count: number }>('/api/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// === TENANTS API (SUPER ADMIN ONLY) ===
export const tenantApi = {
  // Get all tenants
  getAll: async () => {
    return apiRequest<{ tenants: any[] }>('/api/tenants');
  },

  // Create tenant
  create: async (data: {
    name: string;
    slug: string;
    url: string;
    admin_url?: string;
    color?: string;
    color_secondary?: string;
    plan?: 'basic' | 'pro' | 'enterprise';
    features?: string[];
    admin_email?: string;
    admin_phone?: string;
  }) => {
    return apiRequest<{ tenant: any }>('/api/tenants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Update tenant
  update: async (id: string, data: Partial<{
    name: string;
    slug: string;
    url: string;
    admin_url: string;
    color: string;
    color_secondary: string;
    plan: 'basic' | 'pro' | 'enterprise';
    features: string[];
    admin_email: string;
    admin_phone: string;
    is_active: number;
  }>) => {
    return apiRequest<{ tenant: any }>(`/api/tenants/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // Delete tenant
  delete: async (id: string) => {
    return apiRequest<{ success: boolean }>(`/api/tenants/${id}`, {
      method: 'DELETE',
    });
  },
};
