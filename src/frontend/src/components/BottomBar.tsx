import { useRef, useState, useEffect } from 'react';
import { Home, FileText, ShoppingBag, Bell, User, CalendarDays, BarChart3, MessageCircle, LayoutDashboard, QrCode, Plus, Lock, Users, Wrench, Car } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguageStore } from '../stores/languageStore';
import { useDataStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';
import { FeatureLockedModal } from './FeatureLockedModal';

interface Tab {
  id: string;
  icon: typeof Home;
  label: string;
  path: string;
  badge: number;
  fillOnActive?: boolean;
  isFab?: boolean;
  feature?: string; // feature key for gating
}

export function BottomBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const { requests, getUnreadCount } = useDataStore();
  const { hasFeature, config } = useTenantStore();
  const barRef = useRef<HTMLDivElement>(null);
  const [fabPressed, setFabPressed] = useState(false);
  const [lockedFeatureName, setLockedFeatureName] = useState<string | null>(null);
  const [lockedFeatureKey, setLockedFeatureKey] = useState<string | null>(null);
  const hasTenant = !!config?.tenant;

  if (!user) return null;

  const role = user.role;

  // Don't show on desktop or for super_admin
  if (role === 'super_admin') return null;

  // Hide the bottom bar on /chat for roles that land directly on a composer
  // (resident / tenant / commercial_owner go straight into the УК thread).
  // The chat screen has its own in-header back arrow; an extra tab-bar makes
  // the messenger feel boxed and steals vertical real estate from the message
  // list. Management roles see a thread list at /chat, so their nav stays.
  const isDirectChatRole = role === 'resident' || role === 'tenant' || role === 'commercial_owner';
  if (location.pathname === '/chat' && isDirectChatRole) return null;

  // Calculate badges
  const activeRequestsCount = requests.filter(r =>
    r.residentId === user.id && !['completed', 'closed', 'cancelled'].includes(r.status)
  ).length;

  const pendingApprovalCount = requests.filter(r =>
    r.residentId === user.id && r.status === 'pending_approval'
  ).length;

  const unreadNews = getUnreadCount(user.id);

  // New requests for managers
  const newRequestsCount = requests.filter(r => r.status === 'new').length;

  // Executor request counts
  const executorRequestBadge = requests.filter(r =>
    (r.status === 'new' && r.category === user.specialization) ||
    (r.executorId === user.id && ['assigned', 'accepted', 'in_progress'].includes(r.status))
  ).length;

  // Role-based tabs
  const getTabs = (): Tab[] => {
    if (role === 'resident') {
      return [
        { id: 'home', icon: Home, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0 },
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/?tab=requests', badge: activeRequestsCount + pendingApprovalCount, feature: 'requests' },
        { id: 'fab', icon: Plus, label: '', path: '', badge: 0, isFab: true },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'executor' || role === 'security') {
      const isSecurity = role === 'security' || user.specialization === 'security';
      if (isSecurity) {
        // Security lands directly at /qr-scanner (see Layout:223). Button labeled
        // "Задачи" was misleading because it navigated to the scanner, not a task list.
        // Renamed to "Пропуска" → /guest-access (their actual dashboard).
        return [
          { id: 'home', icon: FileText, label: language === 'ru' ? 'Пропуска' : 'Ruxsatnomalar', path: '/guest-access', badge: 0 },
          { id: 'vehicle', icon: Car, label: language === 'ru' ? 'Машины' : 'Mashinalar', path: '/vehicle-search', badge: 0 },
          { id: 'qr', icon: QrCode, label: '', path: '/qr-scanner', badge: 0, isFab: true },
          { id: 'stats', icon: BarChart3, label: language === 'ru' ? 'Стат.' : 'Stat.', path: '/my-stats', badge: 0 },
          { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
        ];
      }
      return [
        { id: 'home', icon: FileText, label: language === 'ru' ? 'Задачи' : 'Vazifalar', path: '/', badge: executorRequestBadge },
        { id: 'schedule', icon: CalendarDays, label: language === 'ru' ? 'График' : 'Jadval', path: '/schedule', badge: 0 },
        { id: 'stats', icon: BarChart3, label: language === 'ru' ? 'Стат.' : 'Stat.', path: '/my-stats', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'admin') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0, fillOnActive: false},
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'team', icon: Users, label: language === 'ru' ? 'Команда' : 'Jamoa', path: '/team', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'director') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Обзор' : 'Sharh', path: '/', badge: 0, fillOnActive: false},
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'reports', icon: BarChart3, label: language === 'ru' ? 'Отчёты' : 'Hisobotlar', path: '/reports', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'department_head') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Отдел' : 'Bo\'lim', path: '/', badge: 0, fillOnActive: false},
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'executors', icon: Wrench, label: language === 'ru' ? 'Сотрудники' : 'Xodimlar', path: '/executors', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'manager') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0, fillOnActive: false},
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'executors', icon: Wrench, label: language === 'ru' ? 'Исполн.' : 'Ijrochilar', path: '/executors', badge: 0 },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'marketplace_manager') {
      return [
        { id: 'home', icon: ShoppingBag, label: language === 'ru' ? 'Товары' : 'Mahsulotlar', path: '/', badge: 0, fillOnActive: false},
        { id: 'orders', icon: FileText, label: language === 'ru' ? 'Заказы' : 'Buyurtmalar', path: '/marketplace-orders', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'advertiser') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Реклама' : 'Reklama', path: '/', badge: 0, fillOnActive: false},
        { id: 'announcements', icon: Bell, label: language === 'ru' ? 'Новости' : 'Yangiliklar', path: '/announcements', badge: unreadNews, feature: 'announcements' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    // tenant / commercial_owner
    return [
      { id: 'home', icon: Home, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0, fillOnActive: false},
      { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: activeRequestsCount, feature: 'requests' },
      { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
      { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
    ];
  };

  const tabs = getTabs();

  const currentPath = location.pathname;

  const isActive = (tab: Tab) => {
    if (tab.isFab) return false;
    if (tab.id === 'home' && tab.path === '/') return currentPath === '/' && !location.search.includes('tab=');
    if (tab.id === 'requests' && tab.path === '/?tab=requests') return currentPath === '/' && location.search.includes('tab=requests');
    return currentPath === tab.path;
  };

  const isTabLocked = (tab: Tab): boolean => {
    if (!hasTenant || !tab.feature) return false;
    return !hasFeature(tab.feature);
  };

  const featureNameMap: Record<string, Record<string, string>> = {
    marketplace: { ru: 'Маркетплейс', uz: 'Marketplace' },
    requests: { ru: 'Заявки', uz: 'Arizalar' },
    chat: { ru: 'Чат', uz: 'Chat' },
    announcements: { ru: 'Объявления', uz: 'E\'lonlar' },
  };

  const handleTap = (tab: Tab) => {
    if (tab.isFab) {
      setFabPressed(true);
      setTimeout(() => setFabPressed(false), 300);
      // QR FAB for security - navigate to scanner
      if (tab.id === 'qr') {
        navigate('/qr-scanner');
        return;
      }
      // Plus FAB for residents - open service request modal
      if (currentPath === '/') {
        window.dispatchEvent(new Event('open-services'));
      } else {
        (window as any).__pendingOpenServices = true;
        navigate('/');
        setTimeout(() => window.dispatchEvent(new Event('open-services')), 600);
      }
      return;
    }
    if (isTabLocked(tab)) {
      const lang = language === 'ru' ? 'ru' : 'uz';
      setLockedFeatureName(featureNameMap[tab.feature!]?.[lang] || (language === 'ru' ? 'Функция' : 'Funksiya'));
      setLockedFeatureKey(tab.feature || null);
      return;
    }
    navigate(tab.path);
  };

  return (
    <div
      ref={barRef}
      className="md:hidden fixed left-0 right-0 z-10 bg-white"
      role="navigation"
      aria-label={language === 'ru' ? 'Нижняя навигация' : 'Pastki navigatsiya'}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        bottom: 'calc(-1 * var(--ios-pwa-gap, 0px))',
      }}
    >
      {/* Bottom bar redesign:
          - The active tab is now signaled by a 3px brand-colored top
            indicator + colored icon/label, instead of a chunky pill
            background. Cleaner and matches modern iOS/Android conventions.
          - The FAB is still elevated but reduced from 48→44 with a tighter
            elevation (-14px instead of -20px) and a softer shadow, so it
            reads as part of the bar rather than a separate floating button.
          - Removed the "active dot" + scale wobble animation that made the
            bar feel busy. Active state is just color + indicator. */}
      <div
        className="flex items-stretch justify-around px-1 bg-white/95 backdrop-blur border-t border-gray-100"
        style={{ paddingBottom: '4px' }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);

          // FAB center button (Plus for residents, QR for security)
          if (tab.isFab) {
            const FabIcon = tab.id === 'qr' ? QrCode : Plus;
            const isQrFab = tab.id === 'qr';
            const qrActive = isQrFab && currentPath === '/qr-scanner';
            return (
              <div key={tab.id} className="flex-1 flex justify-center items-start pt-2 relative z-20">
                <button
                  onClick={() => handleTap(tab)}
                  className="touch-manipulation -mt-3.5"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label={tab.id === 'qr' ? (language === 'ru' ? 'QR сканер' : 'QR skaner') : (language === 'ru' ? 'Новая заявка' : 'Yangi ariza')}
                  data-tour={`bottombar-${tab.id}`}
                >
                  <div
                    className={`rounded-full flex items-center justify-center transition-all duration-200 border-[3px] border-white ${
                      fabPressed && !isQrFab ? 'scale-[0.82] rotate-[135deg]' : fabPressed ? 'scale-[0.88]' : 'scale-100 rotate-0 active:scale-[0.92]'
                    } ${qrActive ? 'ring-2 ring-offset-1 ring-primary-400' : ''}`}
                    style={{
                      width: '44px',
                      height: '44px',
                      background: `linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.88))`,
                      boxShadow: '0 4px 14px rgba(var(--brand-rgb), 0.35), 0 1px 2px rgba(15,23,42,0.08)',
                    }}
                  >
                    <FabIcon className="w-[22px] h-[22px] text-white" strokeWidth={2.5} />
                  </div>
                </button>
              </div>
            );
          }

          const locked = isTabLocked(tab);

          return (
            <button
              key={tab.id}
              onClick={() => handleTap(tab)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 touch-manipulation ${locked ? 'opacity-40' : ''}`}
              style={{ WebkitTapHighlightColor: 'transparent', minHeight: '52px', paddingTop: '6px', paddingBottom: '4px', minWidth: '0' }}
              aria-current={isActive(tab) ? 'page' : undefined}
              aria-label={tab.label}
              data-tour={`bottombar-${tab.id}`}
            >
              {/* Top indicator — brand-colored 3px line that slides in for
                  the active tab. iOS-style. */}
              <div
                className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-b-full transition-all duration-300 ${
                  active && !locked ? 'w-7 bg-primary-500 opacity-100' : 'w-0 opacity-0'
                }`}
              />

              {/* Icon */}
              {locked ? (
                <Lock className="text-gray-300" style={{ width: '22px', height: '22px' }} strokeWidth={1.8} />
              ) : (
                <Icon
                  className={`transition-colors duration-200 ${
                    active ? 'text-primary-600' : 'text-gray-400'
                  }`}
                  style={{ width: '22px', height: '22px' }}
                  fill={active && tab.fillOnActive ? 'currentColor' : 'none'}
                  strokeWidth={active ? 2.2 : 1.8}
                />
              )}

              {/* Label */}
              <span
                className={`leading-none transition-all duration-200 ${
                  locked ? 'font-medium text-gray-300' : active ? 'font-bold text-primary-600' : 'font-medium text-gray-500'
                }`}
                style={{ fontSize: '10.5px' }}
              >
                {tab.label}
              </span>

              {/* Badge */}
              {tab.badge > 0 && !locked && (
                <span
                  className="absolute top-1 z-20 min-w-[16px] h-[16px] bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center px-[3px] border-[1.5px] border-white shadow-sm"
                  style={{ right: `calc(50% - 20px)` }}
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <FeatureLockedModal
        isOpen={!!lockedFeatureName}
        onClose={() => { setLockedFeatureName(null); setLockedFeatureKey(null); }}
        featureName={lockedFeatureName || undefined}
        featureKey={lockedFeatureKey || undefined}
      />
    </div>
  );
}
