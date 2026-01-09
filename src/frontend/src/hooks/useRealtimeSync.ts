import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useMeetingStore } from '../stores/meetingStore';
import { pushNotifications } from '../services/pushNotifications';

/**
 * Hook для real-time синхронизации данных через SSE (Server-Sent Events)
 * Мгновенно получает обновления от сервера
 *
 * ОПТИМИЗИРОВАНО:
 * - Не закрывает SSE при hidden tab (для cross-device sync)
 * - Экономит ресурсы при неактивном табе
 * - Автоматически восстанавливает соединение
 */
export function useRealtimeSync() {
  const { user, token } = useAuthStore();
  const { fetchRequests, fetchExecutors } = useDataStore();
  const { fetchMeetings } = useMeetingStore();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const lastSyncRef = useRef<number>(0);
  const MAX_RECONNECT_ATTEMPTS = 10; // Increased for better reliability
  const SYNC_DEBOUNCE = 500; // Debounce sync calls

  const syncData = useCallback(async () => {
    if (!user) return;

    // Debounce: prevent multiple syncs in quick succession
    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_DEBOUNCE) {
      return;
    }
    lastSyncRef.current = now;

    try {
      // Parallel fetch for speed
      const promises: Promise<void>[] = [fetchRequests()];

      if (['manager', 'admin', 'dispatcher', 'department_head'].includes(user.role)) {
        promises.push(fetchExecutors());
      }

      await Promise.all(promises);
    } catch (error) {
      console.error('[SSE] Error syncing data:', error);
    }
  }, [user, fetchRequests, fetchExecutors]);

  // Sync meetings data
  const syncMeetings = useCallback(async () => {
    if (!user) return;
    try {
      console.log('[SSE] Syncing meetings...');
      await fetchMeetings();
    } catch (error) {
      console.error('[SSE] Error syncing meetings:', error);
    }
  }, [user, fetchMeetings]);

  const connect = useCallback(() => {
    if (!user || !token) return;

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    console.log('[SSE] Connecting...');

    // Create EventSource with auth token
    // Note: EventSource doesn't support custom headers, so we use query param
    const url = `/api/events?token=${token}`;

    // For SSE we need to use fetch with Authorization header
    // since EventSource doesn't support custom headers
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[SSE] Connected');
      reconnectAttempts.current = 0;
    };

    eventSource.addEventListener('connected', (event) => {
      console.log('[SSE] Server confirmed connection:', event.data);
    });

    eventSource.addEventListener('update', (event) => {
      console.log('[SSE] Received update:', event.data);
      // Fetch fresh data when server signals an update
      syncData();
    });

    // Listen for executor updates (new executors added)
    eventSource.addEventListener('executor_update', async (event) => {
      console.log('[SSE] Received executor update:', event.data);
      // Refetch executors
      if (['manager', 'admin', 'dispatcher', 'department_head'].includes(user?.role || '')) {
        await fetchExecutors();
      }
    });

    // Listen for announcement updates
    eventSource.addEventListener('announcement_update', async (event) => {
      console.log('[SSE] Received announcement update:', event.data);
      try {
        const data = JSON.parse(event.data);
        // Show push notification for new announcements
        if (data.announcements && data.announcements.length > 0) {
          const latestAnnouncement = data.announcements[0];
          const priorityLabels: Record<string, string> = {
            urgent: '🚨 Срочно',
            high: '❗ Важно',
            normal: '📢',
            low: 'ℹ️'
          };
          const prefix = priorityLabels[latestAnnouncement.priority] || '📢';

          await pushNotifications.show({
            title: `${prefix} Новое объявление`,
            body: latestAnnouncement.title,
            tag: `announcement-${latestAnnouncement.id}`,
            requireInteraction: latestAnnouncement.priority === 'urgent' || latestAnnouncement.priority === 'high',
            data: { url: '/announcements', announcementId: latestAnnouncement.id }
          });
        }
      } catch (e) {
        console.error('[SSE] Error processing announcement update:', e);
      }
    });

    // Listen for meeting updates
    eventSource.addEventListener('meeting_update', async (event) => {
      console.log('[SSE] Received meeting update:', event.data);
      try {
        const data = JSON.parse(event.data);
        // Sync meetings data
        await syncMeetings();

        // Show push notification for new/updated meetings
        if (data.meetings && data.meetings.length > 0) {
          const activeMeeting = data.meetings.find((m: any) =>
            m.status === 'voting_open' || m.status === 'schedule_poll_open'
          );
          if (activeMeeting) {
            await pushNotifications.show({
              title: '📢 Собрание жильцов',
              body: activeMeeting.status === 'voting_open'
                ? 'Голосование открыто! Примите участие в собрании.'
                : 'Новое собрание объявлено. Выберите удобную дату.',
              tag: `meeting-${activeMeeting.id}`,
              requireInteraction: true,
              data: { url: '/meetings' }
            });
          }
        }
      } catch (e) {
        console.error('[SSE] Error processing meeting update:', e);
      }
    });

    eventSource.onerror = (error) => {
      console.error('[SSE] Error:', error);
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnect with exponential backoff
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      } else {
        console.log('[SSE] Max reconnect attempts reached, falling back to polling');
        // Fallback to polling if SSE fails
        startPolling();
      }
    };
  }, [user, token, syncData, syncMeetings]);

  // Fallback polling if SSE fails
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    console.log('[SSE] Starting fallback polling');
    pollingIntervalRef.current = setInterval(syncData, 5000);
  }, [syncData]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!user || !token) {
      // Cleanup on logout
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      stopPolling();
      return;
    }

    // Initial data fetch
    syncData();

    // Try to connect via SSE
    connect();

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopPolling();
    };
  }, [user, token, connect, syncData, stopPolling]);

  // Handle visibility change - DON'T close SSE for cross-device sync
  // Just sync data when tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible - immediate sync to catch any updates
        syncData();
        syncMeetings();

        // Reconnect SSE if disconnected
        if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
          reconnectAttempts.current = 0;
          connect();
        }
      }
      // NOTE: We DON'T close SSE when tab is hidden - this keeps cross-device sync working
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, syncData, syncMeetings]);

  // Manual refresh function
  const refresh = useCallback(() => {
    syncData();
  }, [syncData]);

  return { refresh };
}
