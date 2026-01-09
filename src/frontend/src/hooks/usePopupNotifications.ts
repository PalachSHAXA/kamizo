import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useDataStore } from '../stores/dataStore';
import type { PopupType } from '../components/PopupNotification';

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
