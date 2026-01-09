import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Bell, Clock, Search, Lock, Phone, FileText, Car, ChevronRight, Megaphone, Users } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useMeetingStore } from '../../stores/meetingStore';
import { SPECIALIZATION_LABELS } from '../../types';
import type { ExecutorSpecialization } from '../../types';

// Onboarding tasks for residents
interface OnboardingTask {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  route: string;
  checkComplete: (user: any, vehicles: any[]) => boolean;
}

// NOTE: Onboarding completion is now tracked in the database (password_changed_at, contract_signed_at)
// This ensures the status persists across devices and browsers.
// The markOnboardingComplete function is kept for backward compatibility but the primary
// source of truth is now the user object from the API.

// Mark action as completed (legacy - kept for backward compatibility during transition)
export const markOnboardingComplete = (userId: string, action: string): void => {
  // This is now handled by the API automatically
  // password_changed_at is set when user changes password
  // contract_signed_at is set when user downloads contract
  console.log(`[Onboarding] Action ${action} for user ${userId} - now tracked in DB`);
};

const ONBOARDING_TASKS: OnboardingTask[] = [
  {
    id: 'change_password',
    title: 'Сменить пароль',
    description: 'Установите надёжный пароль для защиты аккаунта',
    icon: <Lock className="w-5 h-5 text-amber-500" />,
    route: '/profile',
    // Check if user has changed password (stored in DB - passwordChangedAt field)
    checkComplete: (user) => !!user?.passwordChangedAt,
  },
  {
    id: 'add_phone',
    title: 'Добавить номер телефона',
    description: 'Укажите контактный номер для связи',
    icon: <Phone className="w-5 h-5 text-blue-500" />,
    route: '/profile',
    checkComplete: (user) => !!user?.phone && user.phone.length > 5,
  },
  {
    id: 'sign_contract',
    title: 'Подписать договор',
    description: 'Ознакомьтесь и подпишите договор с УК',
    icon: <FileText className="w-5 h-5 text-green-500" />,
    route: '/', // Goes to dashboard where contract section is
    // Check if user has downloaded contract (stored in DB - contractSignedAt field)
    checkComplete: (user) => !!user?.contractSignedAt,
  },
  {
    id: 'add_vehicle',
    title: 'Добавить автомобиль',
    description: 'Зарегистрируйте ваш автомобиль для парковки',
    icon: <Car className="w-5 h-5 text-purple-500" />,
    route: '/vehicles',
    checkComplete: (user, vehicles) => vehicles.some(v => v.ownerId === user?.id),
  },
];

export function Header() {
  const { user } = useAuthStore();
  const { notifications, requests, vehicles, getUnreadCount, markNotificationAsRead, markAllNotificationsAsRead, getAnnouncementsForResidents, getAnnouncementsForEmployees } = useDataStore();
  const { meetings } = useMeetingStore();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const sentRemindersRef = useRef<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Get pending onboarding tasks for residents - tasks stay until completed
  // Check for 'resident' role (case-insensitive) or tenant
  const isResident = user?.role?.toLowerCase() === 'resident' || user?.role?.toLowerCase() === 'tenant';
  // Check if user is tenant or commercial_owner (rental users - don't have access to requests)
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';
  const pendingOnboardingTasks = isResident
    ? ONBOARDING_TASKS.filter(task => !task.checkComplete(user, vehicles))
    : [];

  // Get unread announcements count
  const userAnnouncements = isResident
    ? getAnnouncementsForResidents(user?.login || '', user?.buildingId || '', user?.entrance || '', user?.floor || '', user?.branch || '')
    : getAnnouncementsForEmployees();
  const unreadAnnouncementsCount = userAnnouncements.filter(a => !a.viewedBy.includes(user?.id || '')).length;

  // Get upcoming meetings count (meetings in next 7 days that user hasn't seen)
  const nowDate = new Date();
  const weekFromNow = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingMeetings = meetings.filter(m => {
    if (!m.confirmedDateTime) return false;
    const meetingDate = new Date(m.confirmedDateTime);
    return meetingDate >= nowDate && meetingDate <= weekFromNow && m.status !== 'cancelled';
  });
  const unreadMeetingsCount = upcomingMeetings.length;

  const handleTaskClick = (task: OnboardingTask) => {
    setShowNotifications(false);
    navigate(task.route);
  };

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check for upcoming scheduled requests (every minute)
  useEffect(() => {
    if (!user) return;

    const checkUpcomingRequests = () => {
      const currentUser = useAuthStore.getState().user;
      const { requests: currentRequests, executors: currentExecutors, addNotification: notify } = useDataStore.getState();

      if (!currentUser) return;

      const now = new Date();
      const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);
      const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

      // Get requests that are relevant to current user
      const relevantRequests = currentRequests.filter(r => {
        if (!r.scheduledDate || !r.scheduledTime) return false;
        if (!['assigned', 'accepted'].includes(r.status)) return false;

        // For executors - their assigned requests
        if (currentUser.role === 'executor') {
          const executor = currentExecutors.find(e => e.login === currentUser.login);
          return r.executorId === executor?.id;
        }
        // For residents - their own requests
        if (currentUser.role === 'resident') {
          return r.residentId === currentUser.id;
        }
        return false;
      });

      relevantRequests.forEach(request => {
        // Parse scheduled time (format: "09:00-12:00" or "14:00")
        const timeStr = request.scheduledTime!;
        const startTime = timeStr.split('-')[0]; // Take start time
        const [hours, minutes] = startTime.split(':').map(Number);

        const scheduledDateTime = new Date(request.scheduledDate!);
        scheduledDateTime.setHours(hours, minutes, 0, 0);

        const reminderKey = `${request.id}-10min`;
        const reminder5Key = `${request.id}-5min`;

        // 10-minute reminder
        if (scheduledDateTime > now && scheduledDateTime <= tenMinutesLater && !sentRemindersRef.current.has(reminderKey)) {
          const minutesUntil = Math.round((scheduledDateTime.getTime() - now.getTime()) / 60000);

          notify({
            userId: currentUser.id,
            type: 'request_assigned',
            title: `Напоминание: через ${minutesUntil} мин`,
            message: `Заявка #${request.number} "${request.title}" запланирована на ${startTime}. ${request.address}, кв. ${request.apartment}`,
            requestId: request.id,
          });

          sentRemindersRef.current.add(reminderKey);
        }

        // 5-minute reminder (more urgent)
        if (scheduledDateTime > now && scheduledDateTime <= fiveMinutesLater && !sentRemindersRef.current.has(reminder5Key)) {
          const minutesUntil = Math.round((scheduledDateTime.getTime() - now.getTime()) / 60000);

          if (minutesUntil <= 5 && !sentRemindersRef.current.has(reminderKey)) {
            notify({
              userId: currentUser.id,
              type: 'request_assigned',
              title: `Срочно: через ${minutesUntil} мин!`,
              message: `Заявка #${request.number} начинается через ${minutesUntil} минут! Адрес: ${request.address}, кв. ${request.apartment}`,
              requestId: request.id,
            });
          }

          sentRemindersRef.current.add(reminder5Key);
        }
      });
    };

    // Check immediately and then every minute
    checkUpcomingRequests();
    const reminderTimer = setInterval(checkUpcomingRequests, 60000);
    return () => clearInterval(reminderTimer);
  }, [user?.id]);

  const unreadCount = user ? getUnreadCount(user.id) : 0;
  const totalBadgeCount = unreadCount + pendingOnboardingTasks.length + unreadAnnouncementsCount + unreadMeetingsCount;
  const userNotifications = notifications.filter(n => n.userId === user?.id).slice(0, 10);

  // Format current time
  const formatCurrentTime = () => {
    return currentTime.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatCurrentDate = () => {
    return currentTime.toLocaleDateString('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'admin': return 'Администратор';
      case 'manager': return 'Менеджер';
      case 'department_head': return `Глава отдела ${SPECIALIZATION_LABELS[user?.specialization as ExecutorSpecialization] || ''}`.trim();
      case 'executor': return SPECIALIZATION_LABELS[user?.specialization as ExecutorSpecialization] || 'Исполнитель';
      case 'resident': return 'Житель';
      default: return 'Пользователь';
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffHours < 24) return `${diffHours} ч назад`;
    if (diffDays < 7) return `${diffDays} дн назад`;
    return date.toLocaleDateString('ru-RU');
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

  // Search functionality
  const searchResults = searchQuery.trim()
    ? requests.filter(r =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.number.toString().includes(searchQuery) ||
        r.residentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.address.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [];

  // Handle clock click - navigate based on user role
  const handleClockClick = () => {
    if (user?.role === 'executor') {
      // For executors - go to schedule view
      navigate('/');
      // Will need to trigger schedule view in ExecutorDashboard
      window.dispatchEvent(new CustomEvent('openSchedule'));
    } else if (user?.role === 'resident') {
      // For residents - go to my requests
      navigate('/');
    } else {
      // For managers/admins - go to requests page
      navigate('/requests');
    }
  };

  return (
    <header className="h-16 glass-card rounded-none border-x-0 border-t-0 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        {/* Hide search for rental users (tenant/commercial_owner) - they don't have requests */}
        {!isRentalUser && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск заявок..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(e.target.value.trim().length > 0);
            }}
            onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
            className="glass-input pl-10 w-64"
          />
          {/* Search Results Dropdown */}
          {showSearchResults && createPortal(
            <div className="search-results-portal">
              <div
                className="fixed inset-0"
                onClick={() => setShowSearchResults(false)}
              />
              <div
                className="fixed left-[280px] top-14 w-96 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
                style={{ zIndex: 10002 }}
              >
                {searchResults.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p>Ничего не найдено</p>
                  </div>
                ) : (
                  <div>
                    <div className="p-2 bg-gray-50 border-b text-xs text-gray-500">
                      Найдено: {searchResults.length} заявок
                    </div>
                    {searchResults.map((request) => (
                      <div
                        key={request.id}
                        onClick={() => {
                          navigate('/requests');
                          setShowSearchResults(false);
                          setSearchQuery('');
                        }}
                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">#{request.number}</span>
                          <span className="font-medium text-sm">{request.title}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">{request.address}, кв. {request.apartment}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            request.status === 'new' ? 'bg-blue-100 text-blue-700' :
                            request.status === 'in_progress' ? 'bg-amber-100 text-amber-700' :
                            request.status === 'completed' ? 'bg-green-100 text-green-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {request.status === 'new' ? 'Новая' :
                             request.status === 'in_progress' ? 'В работе' :
                             request.status === 'completed' ? 'Выполнена' :
                             request.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>,
            document.body
          )}
        </div>
        )}
      </div>
      <div className="flex items-center gap-4">
        {/* Current Time Clock - clickable */}
        <button
          onClick={handleClockClick}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/50 rounded-xl border border-white/30 hover:bg-white/70 transition-colors cursor-pointer"
          title="Перейти к расписанию"
        >
          <Clock className="w-4 h-4 text-primary-600" />
          <div className="text-right">
            <div className="text-sm font-mono font-semibold text-gray-800">{formatCurrentTime()}</div>
            <div className="text-xs text-gray-500">{formatCurrentDate()}</div>
          </div>
        </button>

        {/* Notifications Button */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 hover:bg-white/30 rounded-lg relative"
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {totalBadgeCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center">
                {totalBadgeCount > 9 ? '9+' : totalBadgeCount}
              </span>
            )}
          </button>
        </div>

        <div className="text-right">
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-gray-500">{getRoleLabel()}</div>
        </div>
      </div>

      {/* Notifications Portal - rendered at body level for proper z-index */}
      {showNotifications && createPortal(
        <div className="notifications-portal">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20"
            style={{ zIndex: 10000 }}
            onClick={() => setShowNotifications(false)}
          />
          {/* Dropdown */}
          <div
            className="fixed right-6 top-20 w-96 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col"
            style={{ zIndex: 10001, maxHeight: 'calc(100vh - 100px)' }}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="font-semibold text-lg">Уведомления</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => user && markAllNotificationsAsRead(user.id)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Прочитать все
                </button>
              )}
            </div>

            {/* Onboarding Tasks for Residents */}
            {pendingOnboardingTasks.length > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <p className="text-xs font-medium text-amber-700">Необходимые действия</p>
                </div>
                {pendingOnboardingTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleTaskClick(task)}
                    className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        {task.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-gray-900">{task.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{task.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Announcements Section */}
            {unreadAnnouncementsCount > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-4 py-2 bg-blue-50 border-b border-blue-100">
                  <p className="text-xs font-medium text-blue-700 flex items-center gap-1">
                    <Megaphone className="w-3 h-3" />
                    Объявления ({unreadAnnouncementsCount})
                  </p>
                </div>
                {userAnnouncements.filter(a => !a.viewedBy.includes(user?.id || '')).slice(0, 3).map((announcement) => (
                  <div
                    key={announcement.id}
                    onClick={() => {
                      setShowNotifications(false);
                      navigate(isResident ? '/announcements' : '/staff/announcements');
                    }}
                    className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 bg-blue-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <Megaphone className="w-5 h-5 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-gray-900 truncate">{announcement.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{announcement.content}</p>
                      </div>
                      <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Meetings Section */}
            {unreadMeetingsCount > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-4 py-2 bg-purple-50 border-b border-purple-100">
                  <p className="text-xs font-medium text-purple-700 flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    Собрания ({unreadMeetingsCount})
                  </p>
                </div>
                {upcomingMeetings.slice(0, 3).map((meeting) => (
                  <div
                    key={meeting.id}
                    onClick={() => {
                      setShowNotifications(false);
                      navigate(isResident ? '/meetings' : '/staff/meetings');
                    }}
                    className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 bg-purple-50/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                        <Users className="w-5 h-5 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm text-gray-900 truncate">
                          Собрание дома {meeting.buildingAddress}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {meeting.confirmedDateTime ? new Date(meeting.confirmedDateTime).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Дата уточняется'}
                        </p>
                      </div>
                      <span className="w-2 h-2 bg-purple-500 rounded-full flex-shrink-0" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notifications List */}
            <div className="overflow-y-auto flex-1" style={{ maxHeight: '400px' }}>
              {userNotifications.length === 0 && pendingOnboardingTasks.length === 0 && unreadAnnouncementsCount === 0 && unreadMeetingsCount === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Нет уведомлений</p>
                </div>
              ) : userNotifications.length === 0 ? (
                null
              ) : (
                userNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => {
                      if (!notification.read) {
                        markNotificationAsRead(notification.id);
                      }
                    }}
                    className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                      !notification.read ? 'bg-blue-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex gap-3">
                      <span className="text-2xl flex-shrink-0">{getNotificationIcon(notification.type)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className={`font-medium text-sm ${!notification.read ? 'text-gray-900' : 'text-gray-600'}`}>
                            {notification.title}
                          </h4>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {formatTime(notification.createdAt)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {userNotifications.length > 0 && (
              <div className="p-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-full text-center text-sm text-gray-600 hover:text-gray-900"
                >
                  Закрыть
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
