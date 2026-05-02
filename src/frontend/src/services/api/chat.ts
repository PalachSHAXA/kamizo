// Chat API

import { apiRequest } from './client';

export const chatApi = {
  getChannels: async () => {
    return apiRequest<{ channels: Record<string, unknown>[] }>('/api/chat/channels');
  },

  createChannel: async (channel: {
    type: 'uk_general' | 'building_general' | 'admin_support' | 'private_support';
    name: string;
    description?: string;
    building_id?: string;
  }) => {
    return apiRequest<{ channel: Record<string, unknown> }>('/api/chat/channels', {
      method: 'POST',
      body: JSON.stringify(channel),
    });
  },

  getMessages: async (channelId: string, limit = 50, before?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.append('before', before);
    return apiRequest<{ messages: Record<string, unknown>[] }>(`/api/chat/channels/${channelId}/messages?${params}`);
  },

  sendMessage: async (channelId: string, content: string) => {
    return apiRequest<{ message: Record<string, unknown> }>(`/api/chat/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  markRead: async (channelId: string) => {
    return apiRequest<{ success: boolean }>(`/api/chat/channels/${channelId}/read`, {
      method: 'POST',
    });
  },

  // Mark specific message as read (for delivery checkmarks)
  markMessageRead: async (channelId: string, messageId: string) => {
    return apiRequest<{ success: boolean }>(`/api/chat/channels/${channelId}/messages/${messageId}/read`, {
      method: 'POST',
    });
  },

  // Get or create private support channel for current user (resident)
  getOrCreateSupportChannel: async () => {
    return apiRequest<Record<string, unknown>>('/api/chat/channels/support', {
      method: 'POST',
    });
  },

  // Get all private support channels (admin/manager only)
  getAllSupportChannels: async () => {
    return apiRequest<{ channels: Record<string, unknown>[] }>('/api/chat/channels?type=private_support');
  },

  // Get unread message count for sidebar badge
  getUnreadCount: async () => {
    return apiRequest<{ unread_count: number }>('/api/chat/unread-count');
  },
};
