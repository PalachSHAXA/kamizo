import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, FileText, ShoppingBag, Bell, User, CalendarDays, BarChart3, MessageCircle, LayoutDashboard, QrCode, Plus, Lock, Users, Wrench, Car } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLanguageStore } from '../stores/languageStore';
import { useRequestStore, useNotificationStore } from '../stores/dataStore';
import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';
import { useModalStore } from '../stores/modalStore';
import { FeatureLockedModal } from './FeatureLockedModal';

/**
 * BottomBar — single shared bottom navigation used by EVERY page in the
 * resident PWA (Home, Requests, Vehicles, Chat, Profile, …) and by every
 * other role too. Visual matches the Claude-Design §01-glavnaya mockup
 * exactly: a floating white pill (rgba(255,255,255,0.92) + backdrop blur,
 * 26 px corner radius, soft warm shadow) sitting `env(safe-area-inset-
 * bottom)` above the home indicator, with the role's tabs in the pill
 * and — for roles that have one — a raised orange FAB in the centre.
 *
 * Rendered via `createPortal(bar, document.body)` so the bar escapes any
 * ancestor with `transform`, `filter`, `backdrop-filter`, or
 * `perspective` that would otherwise downgrade `position: fixed` to
 * "fixed relative to that ancestor". This was the root cause of the
 * earlier "bar scrolls with the content on Vehicles" issue.
 *
 * Per-page scrollable content is responsible for reserving
 * `calc(96px + env(safe-area-inset-bottom))` of bottom padding so the
 * last card clears the pill (see kz-screen / pb-24 across pages).
 */

interface Tab {
  id: string;
  icon: typeof Home;
  label: string;
  path: string;
  badge: number;
  fillOnActive?: boolean;
  isFab?: boolean;
  feature?: string;
}

export function BottomBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const requests = useRequestStore(s => s.requests);
  const getUnreadCount = useNotificationStore(s => s.getUnreadCount);
  const { hasFeature, config } = useTenantStore();
  const modalCount = useModalStore((s) => s.count);
  const [lockedFeatureName, setLockedFeatureName] = useState<string | null>(null);
  const [lockedFeatureKey, setLockedFeatureKey] = useState<string | null>(null);
  const hasTenant = !!config?.tenant;

  if (!user) return null;

  const role = user.role;

  if (role === 'super_admin') return null;

  // /chat for direct-chat roles (resident / tenant / commercial_owner) opens
  // straight into the UK thread, which has its own back-arrow header. An
  // extra bottom bar there steals vertical space and feels boxed.
  const isDirectChatRole = role === 'resident' || role === 'tenant' || role === 'commercial_owner';
  if (location.pathname === '/chat' && isDirectChatRole) return null;

  // Hide while any sheet/modal is open — prevents the pill from peeking
  // under the sheet's primary action.
  if (modalCount > 0) return null;

  // -----------------------------------------------------------------
  // Badges
  // -----------------------------------------------------------------
  const activeRequestsCount = requests.filter(r =>
    r.residentId === user.id && !['completed', 'closed', 'cancelled'].includes(r.status)
  ).length;
  const pendingApprovalCount = requests.filter(r =>
    r.residentId === user.id && r.status === 'pending_approval'
  ).length;
  const unreadNews = getUnreadCount(user.id);
  const newRequestsCount = requests.filter(r => r.status === 'new').length;
  const executorRequestBadge = requests.filter(r =>
    (r.status === 'new' && r.category === user.specialization) ||
    (r.executorId === user.id && ['assigned', 'accepted', 'in_progress'].includes(r.status))
  ).length;

  // -----------------------------------------------------------------
  // Role-based tab sets — unchanged from the previous flat-bar version
  // so per-role navigation is identical; only the visual layer changed.
  // -----------------------------------------------------------------
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
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0 },
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'team', icon: Users, label: language === 'ru' ? 'Команда' : 'Jamoa', path: '/team', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'director') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Обзор' : 'Sharh', path: '/', badge: 0 },
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'reports', icon: BarChart3, label: language === 'ru' ? 'Отчёты' : 'Hisobotlar', path: '/reports', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'department_head') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Отдел' : 'Bo\'lim', path: '/', badge: 0 },
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'executors', icon: Wrench, label: language === 'ru' ? 'Сотрудники' : 'Xodimlar', path: '/executors', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'manager') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0 },
        { id: 'requests', icon: FileText, label: language === 'ru' ? 'Заявки' : 'Arizalar', path: '/requests', badge: newRequestsCount, feature: 'requests' },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'executors', icon: Wrench, label: language === 'ru' ? 'Исполн.' : 'Ijrochilar', path: '/executors', badge: 0 },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'marketplace_manager') {
      return [
        { id: 'home', icon: ShoppingBag, label: language === 'ru' ? 'Товары' : 'Mahsulotlar', path: '/', badge: 0 },
        { id: 'orders', icon: FileText, label: language === 'ru' ? 'Заказы' : 'Buyurtmalar', path: '/marketplace-orders', badge: 0 },
        { id: 'chat', icon: MessageCircle, label: language === 'ru' ? 'Чат' : 'Chat', path: '/chat', badge: 0, feature: 'chat' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    if (role === 'advertiser') {
      return [
        { id: 'home', icon: LayoutDashboard, label: language === 'ru' ? 'Реклама' : 'Reklama', path: '/', badge: 0 },
        { id: 'announcements', icon: Bell, label: language === 'ru' ? 'Новости' : 'Yangiliklar', path: '/announcements', badge: unreadNews, feature: 'announcements' },
        { id: 'profile', icon: User, label: language === 'ru' ? 'Профиль' : 'Profil', path: '/profile', badge: 0 },
      ];
    }

    // tenant / commercial_owner
    return [
      { id: 'home', icon: Home, label: language === 'ru' ? 'Главная' : 'Bosh', path: '/', badge: 0 },
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
      if (tab.id === 'qr') {
        navigate('/qr-scanner');
        return;
      }
      // Plus FAB for residents — open the service-picker sheet. If we're
      // not on the home route, hop there first then dispatch the event.
      if (currentPath === '/') {
        window.dispatchEvent(new Event('open-services'));
      } else {
        // eslint-disable-next-line react-hooks/immutability
        (window as unknown as Record<string, unknown>).__pendingOpenServices = true;
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

  // -----------------------------------------------------------------
  // Visual layer — floating pill, identical to ResidentHomeDesign TabBar
  // -----------------------------------------------------------------
  const fabIdx = tabs.findIndex(t => t.isFab);
  const hasFab = fabIdx >= 0;
  const leftTabs = hasFab ? tabs.slice(0, fabIdx) : tabs;
  const fabTab = hasFab ? tabs[fabIdx] : null;
  const rightTabs = hasFab ? tabs.slice(fabIdx + 1) : [];

  const renderItem = (tab: Tab) => {
    const active = isActive(tab);
    const locked = isTabLocked(tab);
    const Icon = locked ? Lock : tab.icon;
    return (
      <button
        key={tab.id}
        type="button"
        className="icon-only"
        onClick={() => handleTap(tab)}
        aria-current={active ? 'page' : undefined}
        aria-label={tab.label || tab.id}
        data-tour={`bottombar-${tab.id}`}
        style={{
          position: 'relative',
          background: active ? 'rgba(249,115,22,0.12)' : 'transparent',
          border: 'none',
          cursor: locked ? 'not-allowed' : 'pointer',
          borderRadius: 999,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: active ? '9px 15px' : '9px 11px',
          color: active ? '#EA580C' : '#9CA3AF',
          opacity: locked ? 0.4 : 1,
          minWidth: 0,
          minHeight: 0,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Icon
          style={{ width: 22, height: 22 }}
          strokeWidth={active ? 2.3 : 1.9}
          fill={active && tab.fillOnActive ? 'currentColor' : 'none'}
        />
        {active && tab.label && (
          <span style={{ fontSize: 13, fontWeight: 750, whiteSpace: 'nowrap' }}>{tab.label}</span>
        )}
        {tab.badge > 0 && !locked && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -2,
              right: -4,
              minWidth: 18,
              height: 18,
              padding: '0 4px',
              borderRadius: 999,
              background: '#EF4444',
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              border: '2px solid #FFFFFF',
            }}
          >
            {tab.badge > 9 ? '9+' : tab.badge}
          </span>
        )}
      </button>
    );
  };

  const fab = fabTab ? (
    <button
      key={fabTab.id}
      type="button"
      onClick={() => handleTap(fabTab)}
      aria-label={fabTab.id === 'qr' ? (language === 'ru' ? 'QR сканер' : 'QR skaner') : (language === 'ru' ? 'Новая заявка' : 'Yangi ariza')}
      data-tour={`bottombar-${fabTab.id}`}
      style={{
        width: 52,
        height: 52,
        borderRadius: 999,
        flex: '0 0 auto',
        background: 'linear-gradient(135deg, #FB923C, #EA580C)',
        border: 'none',
        cursor: 'pointer',
        display: 'grid',
        placeItems: 'center',
        color: '#FFFFFF',
        boxShadow: '0 6px 16px rgba(249,115,22,0.45)',
      }}
    >
      {fabTab.id === 'qr'
        ? <QrCode style={{ width: 25, height: 25 }} strokeWidth={2.6} />
        : <Plus style={{ width: 25, height: 25 }} strokeWidth={2.6} />}
    </button>
  ) : null;

  const bar = (
    <div
      role="navigation"
      aria-label={language === 'ru' ? 'Нижняя навигация' : 'Pastki navigatsiya'}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        padding: '0 14px env(safe-area-inset-bottom, 0px)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          maxWidth: 480,
          margin: '0 auto',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(16px) saturate(180%)',
          WebkitBackdropFilter: 'blur(16px) saturate(180%)',
          border: '1px solid rgba(255,255,255,0.7)',
          borderRadius: 26,
          boxShadow: '0 10px 30px rgba(28,25,23,0.14), 0 2px 6px rgba(28,25,23,0.06)',
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: hasFab ? 'space-between' : 'space-around',
          gap: 4,
        }}
      >
        {hasFab ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{leftTabs.map(renderItem)}</div>
            {fab}
            <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{rightTabs.map(renderItem)}</div>
          </>
        ) : (
          tabs.map(renderItem)
        )}
      </div>
      <FeatureLockedModal
        isOpen={!!lockedFeatureName}
        onClose={() => { setLockedFeatureName(null); setLockedFeatureKey(null); }}
        featureName={lockedFeatureName || undefined}
        featureKey={lockedFeatureKey || undefined}
      />
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(bar, document.body) : bar;
}
