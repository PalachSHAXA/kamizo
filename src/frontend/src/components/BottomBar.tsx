import { useRef, useState } from 'react';
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
        return [
          { id: 'home', icon: FileText, label: language === 'ru' ? 'Задачи' : 'Vazifalar', path: '/', badge: executorRequestBadge },
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
      className="md:hidden z-50 flex-shrink-0 relative"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      role="navigation"
      aria-label={language === 'ru' ? 'Нижняя навигация' : 'Pastki navigatsiya'}
    >
      {/* Frosted glass background */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-2xl border-t border-gray-200/30" />

      <div className="relative flex items-end justify-around px-1 pt-[6px] pb-[8px]">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab);

          // FAB center button (Plus for residents, QR for security)
          if (tab.isFab) {
            const FabIcon = tab.id === 'qr' ? QrCode : Plus;
            const isQrFab = tab.id === 'qr';
            const qrActive = isQrFab && currentPath === '/qr-scanner';
            return (
              <div key={tab.id} className="flex-1 flex justify-center -mt-5 relative z-20">
                <button
                  onClick={() => handleTap(tab)}
                  className="touch-manipulation"
                  style={{ WebkitTapHighlightColor: 'transparent' }}
                  aria-label={tab.id === 'qr' ? (language === 'ru' ? 'QR сканер' : 'QR skaner') : (language === 'ru' ? 'Новая заявка' : 'Yangi ariza')}
                >
                  <div
                    className={`w-[54px] h-[54px] rounded-full flex items-center justify-center shadow-[0_4px_24px_rgba(var(--brand-rgb),0.45)] transition-all duration-200 border-[3px] border-white ${
                      fabPressed && !isQrFab ? 'scale-[0.82] rotate-[135deg]' : fabPressed ? 'scale-[0.88]' : 'scale-100 rotate-0 active:scale-[0.88]'
                    } ${qrActive ? 'ring-2 ring-offset-2 ring-primary-400' : ''}`}
                    style={{ background: `linear-gradient(135deg, rgb(var(--brand-rgb)), rgba(var(--brand-rgb), 0.85))` }}
                  >
                    <FabIcon className="w-[24px] h-[24px] text-white" strokeWidth={2.5} />
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
              className={`relative flex-1 flex flex-col items-center gap-[2px] touch-manipulation py-1 overflow-hidden ${locked ? 'opacity-40' : ''}`}
              style={{ WebkitTapHighlightColor: 'transparent' }}
              aria-current={isActive(tab) ? 'page' : undefined}
              aria-label={tab.label}
            >
              {/* Active pill background */}
              <div
                className={`absolute inset-x-2 top-0 bottom-1 rounded-[14px] transition-all duration-300 ease-out ${
                  active && !locked ? 'bg-primary-50 scale-100 opacity-100' : 'scale-75 opacity-0'
                }`}
              />

              {/* Icon container with bounce */}
              <div
                className={`relative z-10 transition-all duration-300 ${
                  active && !locked ? 'scale-110 -translate-y-[2px]' : 'scale-100'
                }`}
              >
                {locked ? (
                  <Lock className="w-[22px] h-[22px] text-gray-300" strokeWidth={1.8} />
                ) : (
                  <Icon
                    className={`w-[22px] h-[22px] transition-colors duration-200 ${
                      active ? 'text-primary-600' : 'text-gray-400'
                    }`}
                    fill={active && tab.fillOnActive ? 'currentColor' : 'none'}
                    strokeWidth={active ? 2.2 : 1.8}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={`relative z-10 text-xs leading-tight transition-all duration-200 ${
                  locked ? 'font-medium text-gray-300' : active ? 'font-bold text-primary-600' : 'font-medium text-gray-400'
                }`}
              >
                {tab.label}
              </span>

              {/* Badge */}
              {tab.badge > 0 && !locked && (
                <span
                  className="absolute top-0 z-20 min-w-[16px] h-[16px] bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center px-[3px] border-[1.5px] border-white shadow-sm"
                  style={{ right: `calc(50% - 18px)` }}
                >
                  {tab.badge > 9 ? '9+' : tab.badge}
                </span>
              )}

              {/* Active indicator dot */}
              <div
                className={`relative z-10 w-[4px] h-[4px] rounded-full transition-all duration-300 ${
                  active && !locked ? 'bg-primary-500 scale-100' : 'bg-transparent scale-0'
                }`}
              />
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
