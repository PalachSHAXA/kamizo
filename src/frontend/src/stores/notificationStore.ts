import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Notification } from '../types';
import { apiRequest } from '../services/api';

const generateId = () => Math.random().toString(36).substr(2, 9);

interface NotificationState {
  notifications: Notification[];
  /**
   * Per-user set of meeting IDs the user has tapped from the bell
   * dropdown. The meetings themselves don't have server-side
   * "read" state — they're scheduled events, not notifications —
   * so the dropdown's "Собрания (N)" badge would never decrement
   * after a user reviewed it. v126 fixes that with a purely local
   * dismissal set, mirroring how pendingOnboardingTasks already
   * clear themselves on the client.
   *
   * Stored per userId so logging in as a different account on the
   * same device doesn't inherit someone else's dismissals. Persisted
   * under the same `uk-notification-storage` blob as `notifications`.
   *
   * Why not a server table: a meeting is a real, scheduled event
   * (not a notification row), and "I've reviewed the upcoming
   * meeting in my notification bell" carries no value cross-device
   * — when you log in on a fresh device, the meeting is still
   * upcoming and a fresh nudge to review is actually correct
   * Telegram-style UX. Server-side tracking would add an endpoint
   * + table for ~zero product value.
   */
  dismissedMeetings: Record<string, string[]>;

  fetchNotificationsFromAPI: () => Promise<void>;
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: (userId: string) => void;
  getUnreadCount: (userId: string) => number;
  dismissMeetingForUser: (userId: string, meetingId: string) => void;
  isMeetingDismissed: (userId: string, meetingId: string) => boolean;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],
      dismissedMeetings: {},

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

      dismissMeetingForUser: (userId, meetingId) => {
        set((state) => {
          const existing = state.dismissedMeetings[userId] || [];
          if (existing.includes(meetingId)) return {};
          // Cap at 200 entries per user so the list can't grow unbounded
          // across years of upcoming-meeting churn. Oldest dismissals
          // fall off; they don't matter — by then the meeting is in the
          // past and the filter doesn't include it anyway.
          const next = [meetingId, ...existing].slice(0, 200);
          return { dismissedMeetings: { ...state.dismissedMeetings, [userId]: next } };
        });
      },

      isMeetingDismissed: (userId, meetingId) => {
        return (get().dismissedMeetings[userId] || []).includes(meetingId);
      },
    }),
    {
      name: 'uk-notification-storage',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 100),
        dismissedMeetings: state.dismissedMeetings,
      }),
    }
  )
);
