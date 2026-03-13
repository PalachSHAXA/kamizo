// Announcements API & File Upload API

import { apiRequest, cachedGet, invalidateCache, CACHE_TTL, API_URL } from './client';

export const announcementsApi = {
  getAll: async () => {
    return cachedGet<{ announcements: any[] }>('/api/announcements', CACHE_TTL.SHORT);
  },

  create: async (announcement: {
    title: string;
    content: string;
    type: 'residents' | 'employees' | 'staff' | 'all';
    target_type?: 'all' | 'branch' | 'building' | 'entrance' | 'floor' | 'custom';
    target_branch?: string;
    target_building_id?: string;
    target_entrance?: string;
    target_floor?: string;
    target_logins?: string;
    priority?: 'normal' | 'important' | 'urgent';
    expires_at?: string;
    attachments?: { name: string; url: string; type: string; size: number }[];
    personalized_data?: Record<string, { name: string; debt: number }>;
  }) => {
    const result = await apiRequest<{ id: string }>('/api/announcements', {
      method: 'POST',
      body: JSON.stringify(announcement),
    });
    invalidateCache('/api/announcements');
    return result;
  },

  delete: async (announcementId: string) => {
    const result = await apiRequest<{ success: boolean }>(`/api/announcements/${announcementId}`, {
      method: 'DELETE',
    });
    invalidateCache('/api/announcements');
    return result;
  },

  // Update announcement
  update: async (announcementId: string, data: {
    title?: string;
    content?: string;
    type?: 'residents' | 'employees' | 'all';
    priority?: 'normal' | 'important' | 'urgent';
    target_type?: string;
    target_building_id?: string;
    target_entrance?: string;
    target_floor?: string;
    target_logins?: string;
    expires_at?: string;
    attachments?: { name: string; url: string; type: string; size: number }[] | null;
  }) => {
    const result = await apiRequest<{ announcement: any }>(`/api/announcements/${announcementId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    invalidateCache('/api/announcements');
    return result;
  },

  // Mark announcement as viewed
  markAsViewed: async (announcementId: string) => {
    return apiRequest<{ success: boolean }>(`/api/announcements/${announcementId}/view`, {
      method: 'POST',
    });
  },

  // Get views for an announcement (admin/manager can see viewers list and stats)
  getViews: async (announcementId: string) => {
    return apiRequest<{
      count: number;
      targetAudienceSize: number;
      viewPercentage: number;
      viewers: any[];
      userViewed: boolean;
    }>(`/api/announcements/${announcementId}/views`);
  },
};

// File Upload API
export const uploadApi = {
  // Upload a file and get a data URL back
  uploadFile: async (file: File): Promise<{ name: string; url: string; type: string; size: number }> => {
    const formData = new FormData();
    formData.append('file', file);

    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${API_URL}/api/upload`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Upload failed');
    }

    const data = await response.json();
    return data.file;
  },

  // Upload multiple files
  uploadFiles: async (files: File[]): Promise<{ name: string; url: string; type: string; size: number }[]> => {
    const results = await Promise.all(files.map(file => uploadApi.uploadFile(file)));
    return results;
  },
};
