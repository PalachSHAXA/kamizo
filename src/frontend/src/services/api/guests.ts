// Guest Codes API

import { apiRequest, cachedGet, CACHE_TTL } from './client';

export const guestCodesApi = {
  getAll: async () => {
    return cachedGet<{ codes: any[] }>('/api/guest-codes', CACHE_TTL.SHORT);
  },

  getById: async (codeId: string) => {
    return cachedGet<{ code: any }>(`/api/guest-codes/${codeId}`, CACHE_TTL.SHORT);
  },

  create: async (code: {
    visitor_type: string;
    visitor_name?: string;
    visitor_phone?: string;
    visitor_vehicle_plate?: string;
    access_type: string;
    valid_from?: string;
    valid_until?: string;
    resident_name?: string;
    resident_phone?: string;
    resident_apartment?: string;
    resident_address?: string;
    notes?: string;
  }) => {
    return apiRequest<{ code: any }>('/api/guest-codes', {
      method: 'POST',
      body: JSON.stringify(code),
    });
  },

  revoke: async (codeId: string, reason?: string) => {
    return apiRequest<{ success: boolean }>(`/api/guest-codes/${codeId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  delete: async (codeId: string) => {
    return apiRequest<{ success: boolean }>(`/api/guest-codes/${codeId}`, {
      method: 'DELETE',
    });
  },

  validate: async (qrToken: string) => {
    return apiRequest<{ valid: boolean; code?: any; error?: string; message?: string }>('/api/guest-codes/validate', {
      method: 'POST',
      body: JSON.stringify({ qr_token: qrToken }),
    });
  },

  use: async (codeId: string) => {
    return apiRequest<{ success: boolean; code?: any }>(`/api/guest-codes/${codeId}/use`, {
      method: 'POST',
    });
  },

  getLogs: async (codeId: string) => {
    return apiRequest<{ logs: any[] }>(`/api/guest-codes/${codeId}/logs`);
  },
};
