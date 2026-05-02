import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Notification } from '../types';
import { apiRequest } from '../services/api';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface NotificationState {
  notifications: Notification[];

  fetchNotificationsFromAPI: () => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: (userId: string) => void;
  getUnreadCount: (userId: string) => number;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      fetchNotificationsFromAPI: async () => {
        try {
          const data = await apiRequest<Record<string, unknown>>('/api/notifications?limit=50');
          if (data.notifications && Array.isArray(data.notifications)) {
            const mapped = (data.notifications as Record<string, unknown>[]).map((n) => ({
              id: n.id,
              userId: n.user_id,
              type: n.type || 'request_created',
              title: n.title || '',
              message: n.body || n.message || '',
              requestId: (n.data as Record<string, unknown>)?.requestId || null,
              read: Boolean(n.is_read),
              createdAt: n.created_at,
            } as Notification));
            // Replace local notifications with API data (source of truth)
            // Keep any local-only notifications that aren't in the API yet
            const apiIds = new Set(mapped.map((n: { id: string }) => n.id));
            const existing = get().notifications;
            const localOnly = existing.filter(n => !apiIds.has(n.id));
            set({ notifications: [...mapped, ...localOnly].slice(0, 200) });
          }
        } catch {
          // Silently fail - notifications are non-critical
        }
      },

      addNotification: (notification) => {
        const newNotification: Notification = {
          ...notification,
          id: generateId(),
          read: false,
          createdAt: new Date().toISOString(),
        };
        // Limit notifications to 200 to prevent memory bloat
        set((state) => ({
          notifications: [newNotification, ...state.notifications].slice(0, 200),
        }));
      },

      markNotificationAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        }));
        apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
      },

      markAllNotificationsAsRead: (userId) => {
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.userId === userId ? { ...n, read: true } : n
          ),
        }));
        apiRequest('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
      },

      getUnreadCount: (userId) => {
        return get().notifications.filter(n => n.userId === userId && !n.read).length;
      },
    }),
    {
      name: 'uk-notification-storage',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 100),
      }),
    }
  )
);
