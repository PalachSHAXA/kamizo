import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Menu, Megaphone, Users, Key, Phone, FileText, Car, CheckCircle } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore, useAnnouncementStore, useVehicleStore } from '../../stores/dataStore';
import { useMeetingStore } from '../../stores/meetingStore';
import { AppLogo } from '../common/AppLogo';
import { useTenantStore } from '../../stores/tenantStore';
import { useNavigate } from 'react-router-dom';
import { useLanguageStore } from '../../stores/languageStore';

interface MobileHeaderProps {
  onMenuClick: () => void;
  unreadCount: number;
}

export function MobileHeader({ onMenuClick, unreadCount }: MobileHeaderProps) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { language } = useLanguageStore();
  const [showNotifications, setShowNotifications] = useState(false);
  const notifications = useNotificationStore(s => s.notifications);
  const markNotificationAsRead = useNotificationStore(s => s.markNotificationAsRead);
  const markAllNotificationsAsRead = useNotificationStore(s => s.markAllNotificationsAsRead);
  const getAnnouncementsForResidents = useAnnouncementStore(s => s.getAnnouncementsForResidents);
  const getAnnouncementsForEmployees = useAnnouncementStore(s => s.getAnnouncementsForEmployees);
  const vehicles = useVehicleStore(s => s.vehicles);
  const { meetings } = useMeetingStore();
  const tenantName = useTenantStore((s) => s.config?.tenant?.name) || 'Kamizo';

  // Check if resident and get onboarding tasks
  const isResident = user?.role?.toLowerCase() === 'resident' || user?.role?.toLowerCase() === 'tenant';

  // Get unread announcements
  const userAnnouncements = useMemo(() => {
    if (!user) return [];
    return isResident
      ? getAnnouncementsForResidents(user.login || '', user.buildingId || '', user.entrance || '', user.floor || '', user.branch || '')
      : getAnnouncementsForEmployees();
  }, [user, isResident, getAnnouncementsForResidents, getAnnouncementsForEmployees]);

  const unreadAnnouncementsCount = userAnnouncements.filter(a => !a.viewedBy?.includes(user?.id || '')).length;

  // Tenant/commercial_owner don't participate in meetings
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';
  const isExecutor = user?.role === 'executor' || user?.role === 'security';

  // Get upcoming meetings
  const upcomingMeetings = useMemo(() => {
    if (isRentalUser || isExecutor) return [];
    const nowDate = new Date();
    const weekFromNow = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
    return meetings.filter(m => {
      if (!m.confirmedDateTime) return false;
      const meetingDate = new Date(m.confirmedDateTime);
      return meetingDate >= nowDate && meetingDate <= weekFromNow && m.status !== 'cancelled';
    });
  }, [meetings, isRentalUser]);

  const pendingTasks: any[] = [];
  const pendingTasksCount = 0;

  // Menu badge - only sidebar tab notifications (announcements, meetings), NOT onboarding tasks
  const totalMenuBadge = unreadAnnouncementsCount + upcomingMeetings.length;

  const userNotifications = notifications.filter(n => n.userId === user?.id).slice(0, 10);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return language === 'ru' ? 'только что' : 'hozirgina';
    if (diffMins < 60) return language === 'ru' ? `${diffMins} мин` : `${diffMins} daq`;
    if (diffHours < 24) return language === 'ru' ? `${diffHours} ч` : `${diffHours} s`;
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: '2-digit' });
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'request_created': return '📝';
      case 'request_assigned': return '📋';
      case 'request_accepted': return '✅';
      case 'request_started': return '🔧';
      case 'request_completed': return '✨';
      case 'request_approved': return '⭐';
      case 'request_rejected': return '❌';
      case 'request_cancelled': return '🚫';
      case 'request_declined': return '↩️';
      default: return '🔔';
    }
  };

  // Total badge for notifications button - includes onboarding tasks for residents
  const totalNotificationsBadge = unreadCount + unreadAnnouncementsCount + upcomingMeetings.length + pendingTasksCount;

  return (
    <>
      {/* Mobile header — redesigned to be compact and modern.
          Previously each icon button was a 44×44 white card with a shadow,
          which made the header feel chunky and cluttered. The new layout
          left-aligns logo + tenant name (matches platform-style products
          like Telegram, Revolut), keeps the buttons as flat round icons
          with a soft hover bg, and shrinks vertical padding for more
          screen real-estate to the actual content. */}
      <header className="mobile-header" role="banner">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <button
            onClick={onMenuClick}
            className="w-9 h-9 rounded-[10px] flex items-center justify-center relative active:bg-gray-100 transition-colors touch-manipulation -ml-1"
            aria-label={language === 'ru' ? 'Открыть меню' : 'Menyuni ochish'}
            aria-expanded={false}
          >
            <Menu className="w-[20px] h-[20px] text-gray-700" strokeWidth={2.2} />
            {totalMenuBadge > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-amber-500 rounded-full pointer-events-none" />
            )}
          </button>

          <div className="flex items-center gap-2 min-w-0">
            <AppLogo size="sm" />
            <span className="font-bold text-gray-900 text-[15px] truncate">{tenantName}</span>
          </div>
        </div>

        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="w-9 h-9 rounded-[10px] flex items-center justify-center relative active:bg-gray-100 transition-colors touch-manipulation -mr-1"
          aria-label={language === 'ru' ? `Уведомления, ${totalNotificationsBadge} новых` : `Bildirishnomalar, ${totalNotificationsBadge} yangi`}
          aria-pressed={showNotifications}
        >
          <Bell className="w-[20px] h-[20px] text-gray-700" strokeWidth={2.2} />
          {totalNotificationsBadge > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] bg-primary-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center px-[3px] border-[1.5px] border-white pointer-events-none">
              {totalNotificationsBadge > 9 ? '9+' : totalNotificationsBadge}
            </span>
          )}
        </button>
      </header>

      {/* Mobile Notifications Dropdown - Full categories like desktop */}
      {showNotifications && createPortal(
        <div className="notifications-portal">
          <div
            className="fixed inset-0 bg-black/20"
            style={{ zIndex: 100 }}
            onClick={() => setShowNotifications(false)}
          />
          {/* Dropdown anchored to the top, below the mobile header — users
              click the bell at the top, so the popup appearing at the top
              matches their expectation. Previously it opened at the bottom
              near the nav bar, which made click feel unresponsive. */}
          <div
            className="fixed left-3 right-3 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col"
            style={{ zIndex: 110, maxHeight: 'min(75dvh, 600px)', top: 'calc(var(--mobile-header-h, 52px) + 8px)' }}
            role="region"
            aria-label={language === 'ru' ? 'Уведомления' : 'Bildirishnomalar'}
          >
            <div className="p-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="font-semibold text-sm">Уведомления</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => user && markAllNotificationsAsRead(user.id)}
                  className="text-xs text-blue-600 min-h-[44px] flex items-center touch-manipulation"
                >
                  Прочитать все
                </button>
              )}
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(70dvh - 90px)' }}>
              {/* Onboarding Tasks Section - for residents */}
              {isResident && pendingTasks.length > 0 && (
                <div className="border-b border-gray-200">
                  <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                    <p className="text-xs font-medium text-amber-700 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Задачи ({pendingTasksCount}/{pendingTasks.length})
                    </p>
                  </div>
                  {pendingTasks.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => { setShowNotifications(false); navigate(task.path); }}
                      className={`p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 flex items-center gap-2 ${task.completed ? 'bg-green-50/50' : 'bg-amber-50/50'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${task.completed ? 'bg-green-100' : 'bg-amber-100'}`}>
                        <task.icon className={`w-4 h-4 ${task.completed ? 'text-green-600' : 'text-amber-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.completed ? 'text-green-700 line-through' : 'text-gray-900'}`}>
                          {task.title}
                        </p>
                        <p className="text-xs text-gray-500">{task.description}</p>
                      </div>
                      {task.completed ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <span className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Announcements Section */}
              {unreadAnnouncementsCount > 0 && (
                <div className="border-b border-gray-200">
                  <div className="px-3 py-2 bg-blue-50 border-b border-blue-100">
                    <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                      <Megaphone className="w-3 h-3" />
                      Объявления ({unreadAnnouncementsCount})
                    </p>
                  </div>
                  {userAnnouncements.filter(a => !a.viewedBy?.includes(user?.id || '')).slice(0, 3).map((announcement) => (
                    <div
                      key={announcement.id}
                      onClick={() => { setShowNotifications(false); navigate('/announcements'); }}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 bg-blue-50/50 flex items-center gap-2"
                    >
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Megaphone className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{announcement.title}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{announcement.content}</p>
                      </div>
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* Meetings Section */}
              {upcomingMeetings.length > 0 && (
                <div className="border-b border-gray-200">
                  <div className="px-3 py-2 bg-purple-50 border-b border-purple-100">
                    <p className="text-xs font-medium text-purple-700 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      Собрания ({upcomingMeetings.length})
                    </p>
                  </div>
                  {upcomingMeetings.slice(0, 2).map((meeting) => (
                    <div
                      key={meeting.id}
                      onClick={() => { setShowNotifications(false); navigate('/meetings'); }}
                      className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 bg-purple-50/50 flex items-center gap-2"
                    >
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Собрание дома</p>
                        <p className="text-xs text-gray-500">
                          {meeting.confirmedDateTime
                            ? new Date(meeting.confirmedDateTime).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : (language === 'ru' ? 'Дата уточняется' : 'Sana aniqlanmoqda')}
                        </p>
                      </div>
                      <span className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* Regular Notifications */}
              {userNotifications.length === 0 && unreadAnnouncementsCount === 0 && upcomingMeetings.length === 0 && pendingTasksCount === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <Bell className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p>Нет уведомлений</p>
                </div>
              ) : userNotifications.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs font-medium text-gray-500">Уведомления</p>
                  </div>
                  {userNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => {
                        if (!notification.read) {
                          markNotificationAsRead(notification.id);
                        }
                      }}
                      className={`p-3 border-b border-gray-100 ${!notification.read ? 'bg-blue-50' : 'bg-white'}`}
                    >
                      <div className="flex gap-2">
                        <span className="text-lg">{getNotificationIcon(notification.type)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-medium text-sm truncate">{notification.title}</h4>
                            <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(notification.createdAt)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="p-2 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowNotifications(false)}
                className="w-full text-center text-sm text-gray-600 min-h-[44px] flex items-center justify-center touch-manipulation"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
