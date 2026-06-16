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

  // v120 — single channel detail. Used after admin actions
  // (assign/resolve/unresolve) to refresh local state. Backend GET
  // /api/chat/channels/:id includes joined assigned_to_name / role
  // and resolved_by_name so the UI doesn't need a separate users
  // fetch.
  getChannel: async (channelId: string) => {
    return apiRequest<Record<string, unknown>>(`/api/chat/channels/${channelId}`, { cache: 'no-store' });
  },

  // v120 — assign a staff member to handle this channel. Pass null to
  // unassign. Backend rejects non-staff target users with a 400.
  assignChannel: async (channelId: string, assignedTo: string | null) => {
    return apiRequest<Record<string, unknown>>(`/api/admin/chat/channels/${channelId}/assign`, {
      method: 'PATCH',
      body: JSON.stringify({ assigned_to: assignedTo }),
    });
  },

  // v120 — mark channel resolved (stamps resolved_at + resolved_by
  // server-side). Idempotent: re-calling returns the row unchanged.
  resolveChannel: async (channelId: string) => {
    return apiRequest<Record<string, unknown>>(`/api/admin/chat/channels/${channelId}/resolve`, {
      method: 'PATCH',
      body: '{}',
    });
  },

  // v120 — re-open a previously-resolved channel. Not surfaced in
  // commit-2 UI yet but the endpoint ships now; commit 3 may add a
  // "Reopen" affordance.
  unresolveChannel: async (channelId: string) => {
    return apiRequest<Record<string, unknown>>(`/api/admin/chat/channels/${channelId}/unresolve`, {
      method: 'PATCH',
      body: '{}',
    });
  },
};
