import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import { apiRequest } from '../services/api';
import type { PopupType } from '../components/PopupNotification';

// Interface for marketplace orders
interface MarketplaceOrderForNotification {
  id: string;
  order_number: string;
  status: string;
  rating?: number;
}

// Interface for vote reconsideration requests
interface ReconsiderationRequestForNotification {
  id: string;
  meeting_id: string;
  agenda_item_id: string;
  agenda_item_title: string;
  status: string;
  message_to_resident?: string;
  created_at: string;
}

export interface PopupItem {
  id: string;
  type: PopupType;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Store shown popup IDs in sessionStorage to persist across re-renders but not page reloads
const getShownIds = (): Set<string> => {
  try {
    const stored = sessionStorage.getItem('shown_popup_ids');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const saveShownId = (id: string) => {
  try {
    const shown = getShownIds();
    shown.add(id);
    sessionStorage.setItem('shown_popup_ids', JSON.stringify([...shown]));
  } catch {
    // Ignore
  }
};

export function usePopupNotifications() {
  const { user } = useAuthStore();
  const {
    announcements,
    getAnnouncementsForResidents,
    markAnnouncementAsViewed,
    requests,
  } = useDataStore();

  const [popups, setPopups] = useState<PopupItem[]>([]);
  const processedRef = useRef(false);

  // Check for new urgent announcements (for residents)
  useEffect(() => {
    // Only run once per mount
    if (processedRef.current) return;

    if (!user || user.role !== 'resident') {
      return;
    }

    console.log('[PopupNotifications] Checking for resident:', user.login);
    console.log('[PopupNotifications] All announcements:', announcements.length);

    // Get announcements for this resident
    const relevantAnnouncements = getAnnouncementsForResidents(
      user.login,
      user.buildingId,
      user.entrance,
      user.floor,
      user.branch
    );

    console.log('[PopupNotifications] Relevant announcements:', relevantAnnouncements.length);

    const shownIds = getShownIds();

    // Filter important/urgent announcements not yet shown
    const urgentAnnouncements = relevantAnnouncements.filter(a => {
      const isUrgent = a.priority === 'urgent' || a.priority === 'important';
      const notViewed = !a.viewedBy.includes(user.id);
      const notShown = !shownIds.has(`announcement-${a.id}`);
      console.log(`[PopupNotifications] Announcement "${a.title}": urgent=${isUrgent}, notViewed=${notViewed}, notShown=${notShown}`);
      return isUrgent && notViewed && notShown;
    });

    console.log('[PopupNotifications] Urgent to show:', urgentAnnouncements.length);

    // Create popups for new announcements
    const newPopups: PopupItem[] = urgentAnnouncements.map(a => {
      const isMeeting = /собрани|встреч|заседани|йиғилиш/i.test(a.title + ' ' + a.content);

      saveShownId(`announcement-${a.id}`);

      return {
        id: `announcement-${a.id}`,
        type: isMeeting ? 'announcement_meeting' : 'announcement_urgent',
        title: a.title,
        message: a.content.length > 200 ? a.content.substring(0, 200) + '...' : a.content,
        actionLabel: 'Понятно',
        onAction: () => {
          markAnnouncementAsViewed(a.id, user.id);
        },
      };
    });

    if (newPopups.length > 0) {
      console.log('[PopupNotifications] Adding popups:', newPopups);
      setPopups(prev => [...prev, ...newPopups]);
    }

    processedRef.current = true;
  }, [user, announcements, getAnnouncementsForResidents, markAnnouncementAsViewed]);

  // Check for requests pending approval (for residents)
  useEffect(() => {
    if (!user || user.role !== 'resident') {
      return;
    }

    const shownIds = getShownIds();

    // Find requests that are pending approval for this resident
    const pendingApproval = requests.filter(r =>
      r.residentId === user.id &&
      r.status === 'pending_approval' &&
      !shownIds.has(`request-completed-${r.id}`)
    );

    console.log('[PopupNotifications] Pending approval requests:', pendingApproval.length);

    const newPopups: PopupItem[] = pendingApproval.map(r => {
      saveShownId(`request-completed-${r.id}`);

      return {
        id: `request-completed-${r.id}`,
        type: 'request_completed' as PopupType,
        title: 'Работа завершена!',
        message: `Заявка ${r.number}: ${r.executorName || 'Исполнитель'} завершил работу. Пожалуйста, подтвердите выполнение и оцените работу.`,
        actionLabel: 'Оценить работу',
        onAction: () => {
          // Store request ID to open rating modal directly
          sessionStorage.setItem('open_rating_for_request', r.id);
          // Navigate to home page where ResidentDashboard is mounted
          // ResidentDashboard will check sessionStorage on mount/update
          if (window.location.pathname !== '/') {
            window.location.href = '/';
          } else {
            // Already on home page, dispatch event
            window.dispatchEvent(new CustomEvent('openRatingModal', { detail: { requestId: r.id } }));
          }
        },
      };
    });

    if (newPopups.length > 0) {
      console.log('[PopupNotifications] Adding request popups:', newPopups);
      setPopups(prev => [...prev, ...newPopups]);
    }
  }, [user, requests]);

  // Check for marketplace order status changes (for residents) - with polling
  useEffect(() => {
    if (!user || user.role !== 'resident') {
      return;
    }

    // Track last known statuses
    const lastKnownStatusesKey = 'marketplace_order_statuses';
    const getLastStatuses = (): Record<string, string> => {
      try {
        const stored = sessionStorage.getItem(lastKnownStatusesKey);
        return stored ? JSON.parse(stored) : {};
      } catch {
        return {};
      }
    };
    const saveStatuses = (statuses: Record<string, string>) => {
      try {
        sessionStorage.setItem(lastKnownStatusesKey, JSON.stringify(statuses));
      } catch {
        // Ignore
      }
    };

    const statusLabels: Record<string, { ru: string, title: string }> = {
      confirmed: { ru: 'подтверждён', title: 'Заказ подтверждён!' },
      preparing: { ru: 'готовится', title: 'Заказ готовится!' },
      ready: { ru: 'готов к выдаче', title: 'Заказ готов!' },
      delivering: { ru: 'доставляется', title: 'Заказ в пути!' },
      delivered: { ru: 'доставлен', title: 'Заказ доставлен!' },
      cancelled: { ru: 'отменён', title: 'Заказ отменён' },
    };

    const checkOrderStatuses = async () => {
      try {
        const response = await apiRequest<{ orders: MarketplaceOrderForNotification[] }>('/api/marketplace/orders');
        const orders = response?.orders || [];

        const shownIds = getShownIds();
        const lastStatuses = getLastStatuses();
        const newStatuses: Record<string, string> = {};

        const newPopups: PopupItem[] = [];

        for (const order of orders) {
          newStatuses[order.id] = order.status;

          // Check if status changed from last known status
          const lastStatus = lastStatuses[order.id];
          if (lastStatus && lastStatus !== order.status) {
            const popupId = `order-status-${order.id}-${order.status}`;
            if (!shownIds.has(popupId)) {
              saveShownId(popupId);

              const statusInfo = statusLabels[order.status] || { ru: order.status, title: 'Статус заказа изменён' };

              // Special handling for delivered orders - show rating option
              if (order.status === 'delivered' && !order.rating) {
                newPopups.push({
                  id: popupId,
                  type: 'delivery_completed' as PopupType,
                  title: statusInfo.title,
                  message: `Ваш заказ ${order.order_number} успешно доставлен. Пожалуйста, оцените доставку.`,
                  actionLabel: 'Оценить доставку',
                  onAction: () => {
                    sessionStorage.setItem('open_delivery_rating_for_order', order.id);
                    if (window.location.pathname !== '/marketplace') {
                      window.location.href = '/marketplace';
                    } else {
                      window.dispatchEvent(new CustomEvent('openDeliveryRatingModal', { detail: { orderId: order.id } }));
                    }
                  },
                });
              } else if (order.status === 'cancelled') {
                newPopups.push({
                  id: popupId,
                  type: 'announcement_urgent' as PopupType,
                  title: statusInfo.title,
                  message: `Ваш заказ ${order.order_number} был отменён.`,
                  actionLabel: 'Понятно',
                });
              } else {
                newPopups.push({
                  id: popupId,
                  type: 'announcement_meeting' as PopupType,
                  title: statusInfo.title,
                  message: `Заказ ${order.order_number} ${statusInfo.ru}.`,
                  actionLabel: 'Посмотреть',
                  onAction: () => {
                    if (window.location.pathname !== '/marketplace') {
                      window.location.href = '/marketplace';
                    }
                  },
                });
              }
            }
          }
        }

        // Save current statuses for next check
        saveStatuses(newStatuses);

        // Also check for delivered orders without rating (initial check)
        const unratedDelivered = orders.filter(o =>
          o.status === 'delivered' &&
          !o.rating &&
          !shownIds.has(`delivery-completed-${o.id}`)
        );

        for (const o of unratedDelivered) {
          saveShownId(`delivery-completed-${o.id}`);
          newPopups.push({
            id: `delivery-completed-${o.id}`,
            type: 'delivery_completed' as PopupType,
            title: 'Заказ доставлен!',
            message: `Ваш заказ ${o.order_number} успешно доставлен. Пожалуйста, оцените доставку.`,
            actionLabel: 'Оценить доставку',
            onAction: () => {
              sessionStorage.setItem('open_delivery_rating_for_order', o.id);
              if (window.location.pathname !== '/marketplace') {
                window.location.href = '/marketplace';
              } else {
                window.dispatchEvent(new CustomEvent('openDeliveryRatingModal', { detail: { orderId: o.id } }));
              }
            },
          });
        }

        if (newPopups.length > 0) {
          console.log('[PopupNotifications] Adding order popups:', newPopups.length);
          setPopups(prev => [...prev, ...newPopups]);
        }
      } catch (err) {
        console.error('[PopupNotifications] Error checking order statuses:', err);
      }
    };

    // Check immediately on mount
    checkOrderStatuses();

    // Poll every 10 seconds for order status changes
    const interval = setInterval(checkOrderStatuses, 10000);

    return () => clearInterval(interval);
  }, [user]);

  // Check for new vote reconsideration requests (for residents) - with polling
  useEffect(() => {
    if (!user || user.role !== 'resident') {
      return;
    }

    // Track last known request IDs
    const lastKnownRequestsKey = 'reconsideration_request_ids';
    const getLastKnownIds = (): string[] => {
      try {
        const stored = sessionStorage.getItem(lastKnownRequestsKey);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    };
    const saveKnownIds = (ids: string[]) => {
      try {
        sessionStorage.setItem(lastKnownRequestsKey, JSON.stringify(ids));
      } catch {
        // Ignore
      }
    };

    const checkReconsiderationRequests = async () => {
      try {
        const response = await apiRequest<{
          success: boolean;
          data: { requests: ReconsiderationRequestForNotification[] };
        }>('/api/meetings/reconsideration-requests/me');

        const requests = response?.data?.requests || [];
        const pendingRequests = requests.filter(r => r.status === 'pending' || r.status === 'viewed');

        const shownIds = getShownIds();
        const lastKnownIds = getLastKnownIds();
        const currentIds = pendingRequests.map(r => r.id);

        const newPopups: PopupItem[] = [];

        // Find new requests that weren't in the last known list
        for (const request of pendingRequests) {
          const popupId = `reconsideration-${request.id}`;
          if (!lastKnownIds.includes(request.id) && !shownIds.has(popupId)) {
            saveShownId(popupId);
            newPopups.push({
              id: popupId,
              type: 'announcement_meeting' as PopupType,
              title: 'Просьба пересмотреть голос',
              message: request.message_to_resident
                ? `${request.agenda_item_title}: ${request.message_to_resident}`
                : `УК просит вас пересмотреть голос по вопросу: ${request.agenda_item_title}`,
              actionLabel: 'Открыть',
              onAction: () => {
                // Navigate to meetings page
                if (window.location.pathname !== '/meetings') {
                  window.location.href = '/meetings';
                }
              },
            });
          }
        }

        // Save current IDs for next check
        saveKnownIds(currentIds);

        if (newPopups.length > 0) {
          console.log('[PopupNotifications] Adding reconsideration request popups:', newPopups.length);
          setPopups(prev => [...prev, ...newPopups]);
        }
      } catch (err) {
        console.error('[PopupNotifications] Error checking reconsideration requests:', err);
      }
    };

    // Check immediately on mount
    checkReconsiderationRequests();

    // Poll every 5 seconds for new reconsideration requests
    const interval = setInterval(checkReconsiderationRequests, 5000);

    return () => clearInterval(interval);
  }, [user]);

  const dismissPopup = useCallback((id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  }, []);

  const addPopup = useCallback((popup: Omit<PopupItem, 'id'>) => {
    const id = `custom-${Date.now()}`;
    setPopups(prev => [...prev, { ...popup, id }]);
  }, []);

  return {
    popups,
    dismissPopup,
    addPopup,
  };
}
