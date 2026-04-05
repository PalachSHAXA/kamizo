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

  // Calculate pending onboarding tasks with details
  const pendingTasks = useMemo(() => {
    if (!isResident || !user) return [];
    const tasks: { id: string; title: string; description: string; icon: typeof Key; path: string; completed: boolean }[] = [
      {
        id: 'password',
        title: 'Сменить пароль',
        description: 'Установите надёжный пароль',
        icon: Key,
        path: '/profile',
        completed: !!user.passwordChangedAt
      },
      {
        id: 'phone',
        title: 'Указать телефон',
        description: 'Для связи и уведомлений',
        icon: Phone,
        path: '/profile',
        completed: !!(user.phone && user.phone.length >= 5)
      },
      ...(!isRentalUser ? [{
        id: 'contract',
        title: 'Подписать договор',
        description: 'Договор с управляющей компанией',
        icon: FileText,
        path: '/contract',
        completed: !!user.contractSignedAt
      },
      {
        id: 'vehicle',
        title: 'Добавить транспорт',
        description: 'Зарегистрируйте ваш автомобиль',
        icon: Car,
        path: '/vehicles',
        completed: vehicles.some(v => v.ownerId === user.id)
      }] : [])
    ];
    return tasks;
  }, [isResident, isRentalUser, user, vehicles]);

  const pendingTasksCount = pendingTasks.filter(t => !t.completed).length;

  // Menu badge - only sidebar tab notifications (announcements, meetings), NOT onboarding tasks
  const totalMenuBadge = unreadAnnouncementsCount + upcomingMeetings.length;

  const userNotifications = notifications.filter(n => n.userId === user?.id).slice(0, 10);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин`;
    if (diffHours < 24) return `${diffHours} ч`;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
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
      <header className="mobile-header" role="banner">
        <button onClick={onMenuClick} className="min-w-[44px] min-h-[44px] bg-white rounded-[13px] flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] relative active:scale-[0.88] transition-transform touch-manipulation" aria-label={language === 'ru' ? 'Открыть меню' : 'Menyuni ochish'} aria-expanded={false}>
          <Menu className="w-[18px] h-[18px] text-gray-700" strokeWidth={2} />
          {/* Badge on menu button for pending tasks */}
          {totalMenuBadge > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full text-xs font-extrabold text-white flex items-center justify-center border-2 border-white pointer-events-none">
              {totalMenuBadge > 9 ? '9+' : totalMenuBadge}
            </span>
          )}
        </button>

        <div className="flex items-center gap-2">
          <AppLogo size="sm" />
          <span className="font-bold text-gray-900 text-sm">{tenantName}</span>
        </div>

        <button
          onClick={() => setShowNotifications(!showNotifications)}
          className="min-w-[44px] min-h-[44px] bg-white rounded-[13px] flex items-center justify-center shadow-[0_2px_10px_rgba(0,0,0,0.06)] relative active:scale-[0.88] transition-transform touch-manipulation"
          aria-label={language === 'ru' ? `Уведомления, ${totalNotificationsBadge} новых` : `Bildirishnomalar, ${totalNotificationsBadge} yangi`}
          aria-pressed={showNotifications}
        >
          <Bell className="w-[18px] h-[18px] text-gray-700" strokeWidth={2} />
          {totalNotificationsBadge > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 rounded-full text-xs font-extrabold text-white flex items-center justify-center border-2 border-white pointer-events-none">
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
          <div
            className="fixed left-3 right-3 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden"
            style={{ zIndex: 110, maxHeight: '70dvh', bottom: 'calc(var(--bottom-bar-h, 64px) + 8px)' }}
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
                            ? new Date(meeting.confirmedDateTime).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                            : 'Дата уточняется'}
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
