import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { useMeetingStore } from '../stores/meetingStore';
import { useToastStore } from '../stores/toastStore';
import { pushNotifications } from '../services/pushNotifications';

// Global event emitter for chat messages
type ChatMessageListener = (message: Record<string, unknown>) => void;
const chatListeners: Set<ChatMessageListener> = new Set();

export function subscribeToChatMessages(listener: ChatMessageListener) {
  chatListeners.add(listener);
  return () => chatListeners.delete(listener);
}

function emitChatMessage(message: Record<string, unknown>) {
  chatListeners.forEach(listener => listener(message));
}

// Global event emitter for reschedule updates
type RescheduleListener = (reschedule: Record<string, unknown>) => void;
const rescheduleListeners: Set<RescheduleListener> = new Set();

export function subscribeToRescheduleUpdates(listener: RescheduleListener) {
  rescheduleListeners.add(listener);
  return () => rescheduleListeners.delete(listener);
}

function emitRescheduleUpdate(reschedule: Record<string, unknown>) {
  rescheduleListeners.forEach(listener => listener(reschedule));
}

interface WsMessage {
  type: string;
  data?: Record<string, unknown> & {
    meetings?: Array<Record<string, unknown>>;
    message?: Record<string, unknown>;
    reschedule?: Record<string, unknown>;
  };
}

/**
 * WebSocket hook для real-time синхронизации данных
 *
 * ФИКСЫ:
 * - Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (cap)
 * - Max 10 attempts, then show toast and stop
 * - Ref-based callbacks to prevent useEffect re-trigger loops
 * - Guard against concurrent connect() calls
 */
export function useWebSocketSync() {
  // ВРЕМЕННО ОТКЛЮЧЕНО: WebSocket спамит на production из-за нестабильности DO
  // Включить когда Durable Objects стабилизируются
  const WEBSOCKET_ENABLED = false;

  const { user, token } = useAuthStore();
  const { fetchRequests, fetchExecutors, fetchAnnouncements, fetchPendingReschedules } = useDataStore();
  const { fetchMeetings } = useMeetingStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSyncRef = useRef<number>(0);
  const connectingRef = useRef(false); // guard against concurrent connects
  const gaveUpRef = useRef(false); // true after max attempts exhausted
  const unmountedRef = useRef(false);
  const openedAtRef = useRef<number>(0); // timestamp when connection opened

  const MAX_RECONNECT_ATTEMPTS = 10;
  const SYNC_DEBOUNCE = 500;
  const HEARTBEAT_INTERVAL = 30000;
  const BASE_DELAY = 1000; // 1 second
  const MAX_DELAY = 30000; // 30 seconds
  const STABLE_CONNECTION_MS = 5000; // connection must live 5s to reset attempts

  // Keep latest callbacks in refs so connect() never goes stale
  const userRef = useRef(user);
  const tokenRef = useRef(token);
  userRef.current = user;
  tokenRef.current = token;

  const fetchRequestsRef = useRef(fetchRequests);
  const fetchExecutorsRef = useRef(fetchExecutors);
  const fetchAnnouncementsRef = useRef(fetchAnnouncements);
  const fetchPendingReschedulesRef = useRef(fetchPendingReschedules);
  const fetchMeetingsRef = useRef(fetchMeetings);
  fetchRequestsRef.current = fetchRequests;
  fetchExecutorsRef.current = fetchExecutors;
  fetchAnnouncementsRef.current = fetchAnnouncements;
  fetchPendingReschedulesRef.current = fetchPendingReschedules;
  fetchMeetingsRef.current = fetchMeetings;

  const syncData = useCallback(async (includeExecutors = true) => {
    const u = userRef.current;
    if (!u || u.role === 'super_admin') return;

    const now = Date.now();
    if (now - lastSyncRef.current < SYNC_DEBOUNCE) return;
    lastSyncRef.current = now;

    try {
      const promises: Promise<void>[] = [fetchRequestsRef.current()];
      if (includeExecutors && ['manager', 'admin', 'director', 'dispatcher', 'department_head'].includes(u.role)) {
        promises.push(fetchExecutorsRef.current());
      }
      await Promise.all(promises);
    } catch (error) {
      console.error('[WS] Error syncing data:', error);
    }
  }, []);

  const syncMeetings = useCallback(async () => {
    const u = userRef.current;
    if (!u || u.role === 'super_admin') return;
    try {
      await fetchMeetingsRef.current();
    } catch (error) {
      console.error('[WS] Error syncing meetings:', error);
    }
  }, []);

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

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    const u = userRef.current;
    const t = tokenRef.current;
    if (!u || !t || u.role === 'super_admin') return;

    // Guard: don't open multiple connections simultaneously
    if (connectingRef.current) return;
    if (unmountedRef.current) return;

    // Close existing connection cleanly (without triggering onclose reconnect)
    if (wsRef.current) {
      // Remove onclose handler before closing to prevent cascade
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    connectingRef.current = true;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws?token=${t}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        connectingRef.current = false;
        openedAtRef.current = Date.now();
        // Don't reset attempts here — wait until onclose checks stability
        startHeartbeat();
        // connected
      };

      ws.onmessage = async (event) => {
        try {
          const message = JSON.parse(event.data) as WsMessage;

          switch (message.type) {
            case 'connected':
              await syncData();
              await syncMeetings();
              break;

            case 'pong':
              break;

            case 'request_update':
              await syncData(false);
              break;

            case 'meeting_update':
              await syncMeetings();
              if (message.data?.meetings && message.data.meetings.length > 0) {
                const activeMeeting = message.data.meetings.find((m) =>
                  m.status === 'voting_open' || m.status === 'schedule_poll_open'
                );
                if (activeMeeting) {
                  await pushNotifications.show({
                    title: '\uD83D\uDCE2 Собрание жильцов',
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
              await fetchAnnouncementsRef.current();
              break;

            case 'chat_message':
              emitChatMessage((message.data?.message || message.data || {}) as Record<string, unknown>);
              break;

            case 'chat_read':
              emitChatMessage({ type: 'read', ...(message.data || {}) } as Record<string, unknown>);
              break;

            case 'executor_update':
              if (['manager', 'admin', 'director', 'dispatcher', 'department_head'].includes(userRef.current?.role || '')) {
                await fetchExecutorsRef.current();
              }
              break;

            case 'reschedule_update':
              await fetchPendingReschedulesRef.current();
              if (message.data?.reschedule) {
                emitRescheduleUpdate(message.data.reschedule as Record<string, unknown>);
              }
              break;

            default:
              break;
          }
        } catch (error) {
          console.error('[WS] Error processing message:', error);
        }
      };

      ws.onerror = () => {
        // onerror is always followed by onclose — reconnect logic lives there
        connectingRef.current = false;
      };

      ws.onclose = () => {
        stopHeartbeat();
        wsRef.current = null;
        connectingRef.current = false;

        // Don't reconnect if unmounted or gave up
        if (unmountedRef.current || gaveUpRef.current) return;

        // Only reset attempts if connection was stable (lived 5+ seconds)
        // This prevents infinite loop: open→reset→close→reconnect→open→reset→...
        const connectionDuration = Date.now() - openedAtRef.current;
        if (openedAtRef.current > 0 && connectionDuration >= STABLE_CONNECTION_MS) {
          reconnectAttempts.current = 0;
          // Connection was stable, reset attempts
        }

        if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ...
          const delay = Math.min(BASE_DELAY * Math.pow(2, reconnectAttempts.current), MAX_DELAY);
          // Reconnecting with backoff

          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts.current++;
            connect();
          }, delay);
        } else {
          // Max attempts exhausted — stop trying, notify user
          gaveUpRef.current = true;
          console.error('[WS] Max reconnect attempts reached, giving up');
          useToastStore.getState().addToast(
            'error',
            'Нет связи с сервером. Обновите страницу для повторного подключения.'
          );
        }
      };
    } catch (error) {
      console.error('[WS] Failed to create WebSocket:', error);
      connectingRef.current = false;
    }
  }, [syncData, syncMeetings, startHeartbeat, stopHeartbeat, clearReconnectTimeout]);

  // Main effect: connect on login, cleanup on logout/unmount
  // Uses stable connect ref — does NOT re-run when callbacks change
  useEffect(() => {
    unmountedRef.current = false;

    if (!user || !token) {
      // Cleanup on logout
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      clearReconnectTimeout();
      stopHeartbeat();
      reconnectAttempts.current = 0;
      gaveUpRef.current = false;
      connectingRef.current = false;
      return;
    }

    // Initial data fetch (always, even if WS disabled)
    syncData();
    syncMeetings();

    // Connect via WebSocket (skip if disabled)
    if (!WEBSOCKET_ENABLED) return;
    connect();

    return () => {
      unmountedRef.current = true;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      clearReconnectTimeout();
      stopHeartbeat();
      connectingRef.current = false;
    };
    // Only re-run when user ID or token actually change (not reference)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, token]);

  // Handle visibility change — reconnect if disconnected
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && userRef.current && tokenRef.current) {
        syncData();
        syncMeetings();

        // Reconnect WebSocket if disconnected (and haven't given up)
        if (WEBSOCKET_ENABLED && (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) && !gaveUpRef.current) {
          reconnectAttempts.current = 0;
          connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, syncData, syncMeetings, WEBSOCKET_ENABLED]);

  // Manual refresh function
  const refresh = useCallback(() => {
    syncData();
    syncMeetings();
  }, [syncData, syncMeetings]);

  return { refresh };
}
