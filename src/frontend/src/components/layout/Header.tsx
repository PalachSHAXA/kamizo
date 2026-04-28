import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Bell, Clock, Search, Lock, Phone, FileText, Car, ChevronRight, Megaphone, Users,
  Plus, QrCode, MessageSquare, BarChart3, ClipboardList
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useRequestStore, useExecutorStore, useNotificationStore, useVehicleStore, useAnnouncementStore } from '../../stores/dataStore';
import { useMeetingStore } from '../../stores/meetingStore';
import { SPECIALIZATION_LABELS, SPECIALIZATION_LABELS_UZ } from '../../types';
import type { ExecutorSpecialization } from '../../types';
import { useLanguageStore } from '../../stores/languageStore';

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
export const markOnboardingComplete = (_userId: string, _action: string): void => {
  // This is now handled by the API automatically
  // password_changed_at is set when user changes password
  // contract_signed_at is set when user downloads contract
  // Tracked in DB via API (password_changed_at, contract_signed_at)
};

const ONBOARDING_TASKS: OnboardingTask[] = [];

// Page title mapping for breadcrumb
const PAGE_TITLES: Record<string, Record<string, string>> = {
  ru: {
    '/': 'Главная',
    '/requests': 'Заявки',
    '/residents': 'Жители',
    '/executors': 'Исполнители',
    '/buildings': 'Комплексы',
    '/announcements': 'Объявления',
    '/meetings': 'Собрания',
    '/chat': 'Чат',
    '/work-orders': 'Наряды',
    '/schedule': 'Расписание',
    '/stats': 'Статистика',
    '/vehicles': 'Транспорт',
    '/vehicle-search': 'Поиск авто',
    '/guest-access': 'Гостевой доступ',
    '/qr-scanner': 'QR Сканер',
    '/profile': 'Профиль',
    '/contract': 'Договор',
    '/contacts': 'Контакты',
    '/marketplace': 'Маркетплейс',
    '/marketplace-orders': 'Заказы',
    '/trainings': 'Обучение',
    '/colleagues': 'Коллеги',
    '/rentals': 'Аренда',
    '/team': 'Команда',
    '/reports': 'Отчёты',
    '/settings': 'Настройки',
    '/monitoring': 'Мониторинг',
    '/notepad': 'Блокнот',
    '/rate-employees': 'Оценка сотрудников',
  },
  uz: {
    '/': 'Bosh sahifa',
    '/requests': 'Arizalar',
    '/residents': 'Aholilar',
    '/executors': 'Ijrochilar',
    '/buildings': 'Komplekslar',
    '/announcements': "E'lonlar",
    '/meetings': "Yig'ilishlar",
    '/chat': 'Chat',
    '/work-orders': 'Naryad',
    '/schedule': 'Jadval',
    '/stats': 'Statistika',
    '/vehicles': 'Transport',
    '/vehicle-search': 'Avto qidirish',
    '/guest-access': "Mehmon ruxsati",
    '/qr-scanner': 'QR Skaner',
    '/profile': 'Profil',
    '/contract': 'Shartnoma',
    '/contacts': "Kontaktlar",
    '/marketplace': 'Marketplace',
    '/marketplace-orders': 'Buyurtmalar',
    '/trainings': "O'qitish",
    '/colleagues': 'Hamkasblar',
    '/rentals': 'Ijara',
    '/team': 'Jamoa',
    '/reports': 'Hisobotlar',
    '/settings': 'Sozlamalar',
    '/monitoring': 'Monitoring',
    '/notepad': 'Bloknot',
    '/rate-employees': "Xodimlarni baholash",
  },
};

export function Header() {
  const { user } = useAuthStore();
  const notifications = useNotificationStore(s => s.notifications);
  const getUnreadCount = useNotificationStore(s => s.getUnreadCount);
  const markNotificationAsRead = useNotificationStore(s => s.markNotificationAsRead);
  const markAllNotificationsAsRead = useNotificationStore(s => s.markAllNotificationsAsRead);
  const requests = useRequestStore(s => s.requests);
  const vehicles = useVehicleStore(s => s.vehicles);
  const getAnnouncementsForResidents = useAnnouncementStore(s => s.getAnnouncementsForResidents);
  const getAnnouncementsForEmployees = useAnnouncementStore(s => s.getAnnouncementsForEmployees);
  const { meetings } = useMeetingStore();
  const { language } = useLanguageStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const sentRemindersRef = useRef<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Get current page title for breadcrumb
  const currentPageTitle = PAGE_TITLES[language]?.[location.pathname] || PAGE_TITLES['ru'][location.pathname] || '';
  const isHomePage = location.pathname === '/';

  // Get pending onboarding tasks for residents - tasks stay until completed
  // Check for 'resident' role (case-insensitive) or tenant
  const isResident = user?.role?.toLowerCase() === 'resident' || user?.role?.toLowerCase() === 'tenant';
  // Check if user is tenant or commercial_owner (rental users - don't have access to requests)
  const isRentalUser = user?.role === 'tenant' || user?.role === 'commercial_owner';
  const pendingOnboardingTasks = useMemo(() => isResident
    ? ONBOARDING_TASKS
        .filter(task => !(isRentalUser && (task.id === 'sign_contract' || task.id === 'add_vehicle')))
        .filter(task => !task.checkComplete(user, vehicles))
    : [], [isResident, isRentalUser, user, vehicles]);

  // Super admin doesn't receive tenant notifications
  const isSuperAdmin = user?.role === 'super_admin';

  // Get unread announcements count
  const isAdvertiserRole = user?.role === 'advertiser';
  const userAnnouncements = useMemo(() => isSuperAdmin ? [] : (isResident
    ? getAnnouncementsForResidents(user?.login || '', user?.buildingId || '', user?.entrance || '', user?.floor || '', user?.branch || '')
    : getAnnouncementsForEmployees()), [isSuperAdmin, isResident, getAnnouncementsForResidents, getAnnouncementsForEmployees, user]);
  const unreadAnnouncementsCount = useMemo(() => userAnnouncements.filter(a => !a.viewedBy.includes(user?.id || '')).length, [userAnnouncements, user?.id]);

  // Get upcoming meetings count (meetings in next 7 days that user hasn't seen)
  // Tenant/commercial_owner don't participate in meetings
  // Advertiser also doesn't participate in resident meetings
  // Super admin doesn't participate in tenant meetings
  const isExecutor = user?.role === 'executor' || user?.role === 'security';
  const showMeetings = !isRentalUser && !isAdvertiserRole && !isSuperAdmin && !isExecutor;
  const upcomingMeetings = useMemo(() => {
    if (!showMeetings) return [];
    const now = new Date();
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    return meetings.filter(m => {
      if (!m.confirmedDateTime) return false;
      const meetingDate = new Date(m.confirmedDateTime);
      return meetingDate >= now && meetingDate <= weekFromNow && m.status !== 'cancelled';
    });
  }, [showMeetings, meetings]);
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
      const { requests: currentRequests } = useRequestStore.getState();
      const { executors: currentExecutors } = useExecutorStore.getState();
      const { addNotification: notify } = useNotificationStore.getState();

      if (!currentUser) return;

      const now = new Date();
      const tenMinutesLater = new Date(now.getTime() + 10 * 60 * 1000);
      const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

      // Get requests that are relevant to current user
      const relevantRequests = currentRequests.filter(r => {
        if (!r.scheduledDate || !r.scheduledTime) return false;
        if (!['assigned', 'accepted'].includes(r.status)) return false;

        // For executors - their assigned requests
        if (currentUser.role === 'executor' || currentUser.role === 'security') {
          const executor = currentExecutors.find(e => e.login === currentUser.login);
          return r.executorId === executor?.id;
        }
        // For residents - their own requests
        if (currentUser.role === 'resident') {
          return r.residentId === currentUser.id;
        }
        return false;
      });

      relevantRequests.forEach((request: any) => {
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
  const userNotifications = useMemo(() => notifications.filter(n => n.userId === user?.id).slice(0, 10), [notifications, user?.id]);

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
    const specLabels = language === 'ru' ? SPECIALIZATION_LABELS : SPECIALIZATION_LABELS_UZ;
    if (language === 'ru') {
      switch (user?.role) {
        case 'super_admin': return 'Суперадмин';
        case 'director': return 'Директор';
        case 'admin': return 'Администратор';
        case 'manager': return 'Менеджер';
        case 'department_head': return `Глава отдела ${specLabels[user?.specialization as ExecutorSpecialization] || ''}`.trim();
        case 'executor': return specLabels[user?.specialization as ExecutorSpecialization] || 'Исполнитель';
        case 'resident': return 'Житель';
        case 'dispatcher': return 'Диспетчер';
        case 'security': return 'Охранник';
        case 'marketplace_manager': return 'Менеджер маркетплейса';
        case 'advertiser': return 'Рекламодатель';
        default: return 'Пользователь';
      }
    } else {
      switch (user?.role) {
        case 'super_admin': return 'Super admin';
        case 'director': return 'Direktor';
        case 'admin': return 'Administrator';
        case 'manager': return 'Menejer';
        case 'department_head': return `Bo'lim boshlig'i ${specLabels[user?.specialization as ExecutorSpecialization] || ''}`.trim();
        case 'executor': return specLabels[user?.specialization as ExecutorSpecialization] || 'Ijrochi';
        case 'resident': return 'Aholik';
        case 'dispatcher': return 'Dispetcher';
        case 'security': return 'Qo\'riqchi';
        case 'marketplace_manager': return 'Marketplace menejeri';
        case 'advertiser': return 'Reklama menejeri';
        default: return 'Foydalanuvchi';
      }
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return language === 'ru' ? 'только что' : 'hozirgina';
    if (diffMins < 60) return language === 'ru' ? `${diffMins} мин назад` : `${diffMins} daq oldin`;
    if (diffHours < 24) return language === 'ru' ? `${diffHours} ч назад` : `${diffHours} s oldin`;
    if (diffDays < 7) return language === 'ru' ? `${diffDays} дн назад` : `${diffDays} kun oldin`;
    return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ');
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
  const searchResults = useMemo(() => searchQuery.trim()
    ? requests.filter(r =>
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.number.toString().includes(searchQuery) ||
        r.residentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.address.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5)
    : [], [searchQuery, requests]);

  // Handle clock click - navigate based on user role
  const handleClockClick = () => {
    if (user?.role === 'super_admin') {
      navigate('/');
    } else if (user?.role === 'executor' || user?.role === 'security') {
      navigate('/');
      window.dispatchEvent(new CustomEvent('openSchedule'));
    } else if (user?.role === 'resident' || user?.role === 'tenant' || user?.role === 'commercial_owner') {
      navigate('/');
    } else if (user?.role === 'advertiser' || user?.role === 'marketplace_manager') {
      // These roles don't work with requests - just go to dashboard
      navigate('/');
    } else {
      // For managers/admins/directors - go to requests page
      navigate('/requests');
    }
  };

  // Quick actions based on role
  const getQuickActions = () => {
    const role = user?.role;
    const actions: { icon: typeof Plus; label: string; onClick: () => void; color: string }[] = [];

    if (['admin', 'manager', 'director', 'department_head'].includes(role || '')) {
      actions.push({
        icon: ClipboardList,
        label: language === 'ru' ? 'Заявки' : 'Arizalar',
        onClick: () => navigate('/requests'),
        color: 'text-blue-600 bg-blue-50 hover:bg-blue-100',
      });
    }
    if (['admin', 'manager', 'director'].includes(role || '')) {
      actions.push({
        icon: BarChart3,
        label: language === 'ru' ? 'Отчёты' : 'Hisobotlar',
        onClick: () => navigate('/reports'),
        color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100',
      });
    }
    if (role === 'security') {
      actions.push({
        icon: QrCode,
        label: language === 'ru' ? 'QR Сканер' : 'QR Skaner',
        onClick: () => navigate('/qr-scanner'),
        color: 'text-violet-600 bg-violet-50 hover:bg-violet-100',
      });
    }
    if (['admin', 'manager', 'director', 'department_head', 'executor', 'security', 'resident'].includes(role || '')) {
      actions.push({
        icon: MessageSquare,
        label: language === 'ru' ? 'Чат' : 'Chat',
        onClick: () => navigate('/chat'),
        color: 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100',
      });
    }

    return actions;
  };

  const quickActions = getQuickActions();

  return (
    <header className="h-16 glass-card rounded-none border-x-0 border-t-0 flex items-center justify-between px-6" role="banner">
      <div className="flex items-center gap-4">
        {/* Breadcrumb - show current page name */}
        {!isHomePage && currentPageTitle && (
          <div className="flex items-center gap-1.5 text-sm">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              {language === 'ru' ? 'Главная' : 'Bosh sahifa'}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
            <span className="font-medium text-gray-700">{currentPageTitle}</span>
          </div>
        )}

        {/* Quick action buttons - show on home page */}
        {isHomePage && quickActions.length > 0 && (
          <div className="flex items-center gap-1.5">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${action.color}`}
                title={action.label}
                aria-label={action.label}
              >
                <action.icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{action.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search - show when on home page or requests-related pages */}
        {!isRentalUser && !isAdvertiserRole && user?.role !== 'super_admin' && user?.role !== 'marketplace_manager' && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder={language === 'ru' ? 'Поиск заявок...' : 'Ariza qidirish...'}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowSearchResults(e.target.value.trim().length > 0);
            }}
            onFocus={() => searchQuery.trim() && setShowSearchResults(true)}
            className="glass-input pl-10 w-full max-w-xs lg:max-w-sm"
            aria-label={language === 'ru' ? 'Поиск заявок' : 'Arizalarni qidirish'}
          />
          {/* Search Results Dropdown */}
          {showSearchResults && createPortal(
            <div className="search-results-portal">
              <div
                className="fixed inset-0"
                onClick={() => setShowSearchResults(false)}
              />
              <div
                className="fixed left-4 right-4 sm:left-auto sm:right-auto sm:left-[280px] top-14 sm:w-96 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
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
          className="flex items-center gap-2 px-3 py-1.5 min-h-[44px] bg-white/50 rounded-xl border border-white/30 hover:bg-white/70 transition-colors cursor-pointer touch-manipulation"
          title="Перейти к расписанию"
          aria-label={language === 'ru' ? 'Текущее время, перейти к расписанию' : 'Hozirgi vaqt, jadvalgaga o\'tish'}
        >
          <Clock className="w-4 h-4 text-primary-600" />
          <div className="text-right">
            <div className="text-sm xl:text-base font-mono font-semibold text-gray-800">{formatCurrentTime()}</div>
            <div className="text-xs text-gray-500">{formatCurrentDate()}</div>
          </div>
        </button>

        {/* Notifications Button - hidden for super_admin */}
        {!isSuperAdmin && (
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 min-h-[44px] min-w-[44px] hover:bg-white/30 rounded-lg relative flex items-center justify-center touch-manipulation"
            aria-label={language === 'ru' ? `Уведомления, ${totalBadgeCount} новых` : `Bildirishnomalar, ${totalBadgeCount} yangi`}
            aria-pressed={showNotifications}
          >
            <Bell className="w-5 h-5 text-gray-600" />
            {totalBadgeCount > 0 && (
              <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center pointer-events-none">
                {totalBadgeCount > 9 ? '9+' : totalBadgeCount}
              </span>
            )}
          </button>
        </div>
        )}

        <div className="text-right max-w-[150px] lg:max-w-[200px]">
          <div className="text-sm xl:text-base font-medium truncate">{user?.name}</div>
          <div className="text-xs text-gray-500 truncate">{getRoleLabel()}</div>
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
            className="fixed right-4 left-4 sm:left-auto sm:right-6 top-20 sm:w-96 bg-white rounded-2xl border border-gray-200 shadow-2xl overflow-hidden flex flex-col"
            style={{ zIndex: 10001, maxHeight: 'calc(100dvh - 100px)' }}
            role="region"
            aria-label={language === 'ru' ? 'Уведомления' : 'Bildirishnomalar'}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="font-semibold text-lg">Уведомления</h3>
              {unreadCount > 0 && (
                <button
                  onClick={() => user && markAllNotificationsAsRead(user.id)}
                  className="text-sm text-blue-600 hover:text-blue-800 min-h-[44px] flex items-center touch-manipulation"
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
                      navigate('/announcements');
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
                      navigate('/meetings');
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
                          {meeting.confirmedDateTime ? new Date(meeting.confirmedDateTime).toLocaleDateString(language === 'ru' ? 'ru-RU' : 'uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : (language === 'ru' ? 'Дата уточняется' : 'Sana aniqlanmoqda')}
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
                  className="w-full text-center text-sm text-gray-600 hover:text-gray-900 min-h-[44px] flex items-center justify-center touch-manipulation"
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
