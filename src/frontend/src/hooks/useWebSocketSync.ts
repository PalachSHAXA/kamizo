import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useMeetingStore } from '../stores/meetingStore';
import { pushNotifications } from '../services/pushNotifications';

// Global event emitter for chat messages
type ChatMessageListener = (message: any) => void;
const chatListeners: Set<ChatMessageListener> = new Set();

export function subscribeToChatMessages(listener: ChatMessageListener) {
  chatListeners.add(listener);
  return () => chatListeners.delete(listener);
}

function emitChatMessage(message: any) {
  chatListeners.forEach(listener => listener(message));
}

// Global event emitter for reschedule updates
type RescheduleListener = (reschedule: any) => void;
const rescheduleListeners: Set<RescheduleListener> = new Set();

export function subscribeToRescheduleUpdates(listener: RescheduleListener) {
  rescheduleListeners.add(listener);
  return () => rescheduleListeners.delete(listener);
}

function emitRescheduleUpdate(reschedule: any) {
  rescheduleListeners.forEach(listener => listener(reschedule));
}

/**
 * WebSocket hook для real-time синхронизации данных
 * Заменяет SSE для улучшения производительности
 *
 * ПРЕИМУЩЕСТВА:
 * - Двусторонняя связь (клиент ⟷ сервер)
 * - Durable Objects управляют всеми соединениями
 * - 99.99% меньше нагрузки на D1 (6 polls/min вместо 60,000)
 * - Мгновенные обновления без polling на клиенте
 * - Автоматическое переподключение с exponential backoff
 */
export function useWebSocketSync() {
  const { user, token } = useAuthStore();
  const { fetchRequests, fetchExecutors, fetchAnnouncements, fetchPendingReschedules } = useDataStore();
  const { fetchMeetings } = useMeetingStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(0);

  const MAX_RECONNECT_ATTEMPTS = 10;
  const SYNC_DEBOUNCE = 500; // Debounce sync calls
  const HEARTBEAT_INTERVAL = 30000; // 30 seconds

  const syncData = useCallback(async (includeExecutors = true) => {
    if (!user || user.role === 'super_admin') return;

    // Debounce: prevent multiple syncs in quick succession
    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_DEBOUNCE) {
      return;
    }
    lastSyncRef.current = now;

    try {
      const promises: Promise<void>[] = [fetchRequests()];

      if (includeExecutors && ['manager', 'admin', 'director', 'dispatcher', 'department_head'].includes(user.role)) {
        promises.push(fetchExecutors());
      }

      await Promise.all(promises);
    } catch (error) {
      console.error('[WS] Error syncing data:', error);
    }
  }, [user, fetchRequests, fetchExecutors]);

  const syncMeetings = useCallback(async () => {
    if (!user || user.role === 'super_admin') return;
    try {
      await fetchMeetings();
    } catch (error) {
      console.error('[WS] Error syncing meetings:', error);
    }
  }, [user, fetchMeetings]);

  const startHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, HEARTBEAT_INTERVAL);
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!user || !token || user.role === 'super_admin') return;

    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Determine protocol (ws:// or wss://)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        startHeartbeat();
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'connected':
              // Initial sync
              await syncData();
              await syncMeetings();
              break;

            case 'pong':
              // Heartbeat response - connection is alive
              break;

            case 'request_update':
              await syncData(false); // Only fetch requests, not executors
              break;

            case 'meeting_update':
              await syncMeetings();

              // Show push notification for new/updated meetings
              if (message.data?.meetings && message.data.meetings.length > 0) {
                const activeMeeting = message.data.meetings.find((m: any) =>
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
              break;

            case 'announcement_update':
              await fetchAnnouncements();
              break;

            case 'chat_message':
              emitChatMessage(message.data?.message || message.data);
              break;

            case 'chat_read':
              emitChatMessage({ type: 'read', ...message.data });
              break;

            case 'executor_update':
              if (['manager', 'admin', 'director', 'dispatcher', 'department_head'].includes(user.role)) {
                await fetchExecutors();
              }
              break;

            case 'reschedule_update':
              await fetchPendingReschedules();
              if (message.data?.reschedule) {
                emitRescheduleUpdate(message.data.reschedule);
              }
              break;

            default:
              break;
          }
        } catch (error) {
          console.error('[WS] Error processing message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      ws.onclose = () => {
        stopHeartbeat();
        wsRef.current = null;

        // Attempt reconnect with exponential backoff
        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          console.error('[WS] Max reconnect attempts reached');
          // Could fallback to polling here if needed
        }
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
    }
  }, [user, token, syncData, syncMeetings, startHeartbeat, stopHeartbeat, fetchPendingReschedules]);

  useEffect(() => {
    if (!user || !token) {
      // Cleanup on logout
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      stopHeartbeat();
      return;
    }

    // Initial data fetch
    syncData();
    syncMeetings();

    // Connect via WebSocket
    connect();

    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      stopHeartbeat();
    };
  }, [user, token, connect, syncData, syncMeetings, stopHeartbeat]);

  // Handle visibility change - reconnect if disconnected
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible - sync data
        syncData();
        syncMeetings();

        // Reconnect WebSocket if disconnected
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          reconnectAttempts.current = 0;
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, syncData, syncMeetings]);

  // Manual refresh function
  const refresh = useCallback(() => {
    syncData();
    syncMeetings();
  }, [syncData, syncMeetings]);

  return { refresh };
}
