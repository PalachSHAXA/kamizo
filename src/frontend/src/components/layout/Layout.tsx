import { useState, useEffect, useRef, Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { Routes, Route, Navigate, useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useAnnouncementStore, useNotificationStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useTenantStore } from '../../stores/tenantStore';
import { usePopupNotifications } from '../../hooks/usePopupNotifications';
import { useWebSocketSync } from '../../hooks/useWebSocketSync';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileHeader } from './MobileHeader';
import { PopupManager } from '../PopupNotification';
import { PerformanceMonitor } from '../PerformanceMonitor';
import { BottomBar } from '../BottomBar';
import { OfflineIndicator } from '../OfflineIndicator';
import { ProtectedRoute } from '../ProtectedRoute';
import { OnboardingWizard } from '../OnboardingWizard';
import { useOverlayStore, useCanShowOverlay } from '../../stores/overlayStore';
import { useModalStore } from '../../stores/modalStore';
import { useFeatureFetch } from '../../stores/useFeatureFetch';
import { OnboardingTooltips } from '../OnboardingTooltips';
import { settingsApi } from '../../services/api/settings';
import { Loader2, ArrowLeft, ShieldAlert, Home, MapPinOff } from 'lucide-react';

// 404 / no-access page.
// - Separates two distinct situations: truly missing route vs role has no access.
// - Gives a sensible "home" destination per role (security → scanner, others → /).
// - Back + home both available.
const NotFoundPage = () => {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Routes a user COULD legitimately want but doesn't have access to
  // (RBAC-protected). If their role is not in the allowedRoles of that
  // route, ProtectedRoute redirects to / which then ends up here via our
  // /* catch-all. Detect that case to show "no access" instead of "not
  // found", since the page exists, just not for this user.
  const restrictedPaths = [
    '/finance', '/executors', '/residents', '/team', '/reports',
    '/buildings', '/rentals', '/work-orders', '/vehicle-search',
    '/settings', '/payments', '/my-stats', '/schedule',
  ];
  const isRestricted = restrictedPaths.some(p => location.pathname.startsWith(p));

  const homePath =
    user?.role === 'security' ? '/qr-scanner'
    : '/';

  const title = isRestricted
    ? (language === 'ru' ? 'Нет доступа' : "Ruxsat yo'q")
    : (language === 'ru' ? 'Страница не найдена' : 'Sahifa topilmadi');

  const description = isRestricted
    ? (language === 'ru'
        ? 'Эта страница существует, но недоступна для вашей роли. Если вам нужен доступ — обратитесь к администратору.'
        : 'Bu sahifa mavjud, lekin sizning rolingiz uchun cheklangan. Kirish kerak bo\'lsa, administrator bilan bog\'laning.')
    : (language === 'ru'
        ? 'Проверьте адрес или вернитесь на главную.'
        : 'Manzilni tekshiring yoki bosh sahifaga qayting.');

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6 gap-4">
      {isRestricted ? (
        <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
          <ShieldAlert className="w-10 h-10 text-amber-500" />
        </div>
      ) : (
        <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center">
          <MapPinOff className="w-10 h-10 text-gray-400" />
        </div>
      )}

      {!isRestricted && (
        <div className="text-[56px] font-black text-gray-100 leading-none select-none">404</div>
      )}

      <div className="text-[20px] font-bold text-gray-800">{title}</div>
      <div className="text-[14px] text-gray-500 max-w-sm leading-relaxed">{description}</div>

      {/* Show the path so power users + support can debug quickly */}
      <code className="text-[11px] text-gray-400 font-mono bg-gray-50 px-2 py-1 rounded max-w-full truncate">
        {location.pathname}
      </code>

      <div className="flex flex-col sm:flex-row gap-2 mt-2 w-full max-w-xs">
        <button
          onClick={() => navigate(-1)}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-[14px] active:scale-95 transition-transform touch-manipulation min-h-[48px]"
        >
          <ArrowLeft className="w-4 h-4" />
          {language === 'ru' ? 'Назад' : 'Ortga'}
        </button>
        <Link
          to={homePath}
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-semibold text-[14px] active:scale-95 transition-transform touch-manipulation min-h-[48px]"
        >
          <Home className="w-4 h-4" />
          {language === 'ru' ? 'На главную' : 'Bosh sahifa'}
        </Link>
      </div>
    </div>
  );
};

// Page loading fallback
const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
  </div>
);

// Lazy loaded pages - code splitting for optimal bundle size
const ManagerDashboard = lazyWithRetry(() => import('../../pages/ManagerDashboard').then(m => ({ default: m.ManagerDashboard })));
const DepartmentHeadDashboard = lazyWithRetry(() => import('../../pages/DepartmentHeadDashboard').then(m => ({ default: m.DepartmentHeadDashboard })));
const ExecutorDashboard = lazyWithRetry(() => import('../../pages/ExecutorDashboard').then(m => ({ default: m.ExecutorDashboard })));
const ExecutorSchedulePage = lazyWithRetry(() => import('../../pages/ExecutorSchedulePage').then(m => ({ default: m.ExecutorSchedulePage })));
const ExecutorStatsPage = lazyWithRetry(() => import('../../pages/ExecutorStatsPage').then(m => ({ default: m.ExecutorStatsPage })));
const ExecutorAnnouncementsPage = lazyWithRetry(() => import('../../pages/ExecutorAnnouncementsPage').then(m => ({ default: m.ExecutorAnnouncementsPage })));
const ResidentDashboard = lazyWithRetry(() => import('../../pages/ResidentDashboard').then(m => ({ default: m.ResidentDashboard })));
const AdminDashboard = lazyWithRetry(() => import('../../pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const DirectorDashboard = lazyWithRetry(() => import('../../pages/DirectorDashboard').then(m => ({ default: m.DirectorDashboard })));
const BuildingsPage = lazyWithRetry(() => import('../../pages/BuildingsPage').then(m => ({ default: m.BuildingsPage })));
const AnnouncementsPage = lazyWithRetry(() => import('../../pages/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage })));
const MeetingsPage = lazyWithRetry(() => import('../../pages/MeetingsPage').then(m => ({ default: m.MeetingsPage })));
const ResidentAnnouncementsPage = lazyWithRetry(() => import('../../pages/ResidentAnnouncementsPage').then(m => ({ default: m.ResidentAnnouncementsPage })));
const ResidentMeetingsPage = lazyWithRetry(() => import('../../pages/ResidentMeetingsPage').then(m => ({ default: m.ResidentMeetingsPage })));
const ResidentRateEmployeesPage = lazyWithRetry(() => import('../../pages/ResidentRateEmployeesPage').then(m => ({ default: m.ResidentRateEmployeesPage })));
const WorkOrdersPage = lazyWithRetry(() => import('../../pages/WorkOrdersPage').then(m => ({ default: m.WorkOrdersPage })));
const TrainingsPage = lazyWithRetry(() => import('../../pages/TrainingsPage'));
const ColleaguesSection = lazyWithRetry(() => import('../../pages/ColleaguesSection').then(m => ({ default: m.ColleaguesSection })));
const ResidentVehiclesPage = lazyWithRetry(() => import('../../pages/ResidentVehiclesPage').then(m => ({ default: m.ResidentVehiclesPage })));
// v118.36 — AddCarPage is mounted as a TOP-LEVEL route in App.tsx
// (outside the Layout shell) so it owns the whole viewport without
// the app drawer header or bottom nav bar. The lazy import lives
// in App.tsx — removed from here to avoid duplicate loading.
const VehicleSearchPage = lazyWithRetry(() => import('../../pages/VehicleSearchPage').then(m => ({ default: m.VehicleSearchPage })));
const ResidentGuestAccessPage = lazyWithRetry(() => import('../../pages/ResidentGuestAccessPage').then(m => ({ default: m.ResidentGuestAccessPage })));
const GuardQRScannerPage = lazyWithRetry(() => import('../../pages/GuardQRScannerPage').then(m => ({ default: m.GuardQRScannerPage })));
const ManagerGuestAccessPage = lazyWithRetry(() => import('../../pages/ManagerGuestAccessPage').then(m => ({ default: m.ManagerGuestAccessPage })));
const ResidentsPage = lazyWithRetry(() => import('../../pages/ResidentsPage').then(m => ({ default: m.ResidentsPage })));
const ChatPage = lazyWithRetry(() => import('../../pages/ChatPage').then(m => ({ default: m.ChatPage })));
const ResidentProfilePage = lazyWithRetry(() => import('../../pages/ResidentProfilePage').then(m => ({ default: m.ResidentProfilePage })));
const StaffProfilePage = lazyWithRetry(() => import('../../pages/StaffProfilePage').then(m => ({ default: m.StaffProfilePage })));
const ResidentContractPage = lazyWithRetry(() => import('../../pages/ResidentContractPage').then(m => ({ default: m.ResidentContractPage })));
const ResidentUsefulContactsPage = lazyWithRetry(() => import('../../pages/ResidentUsefulContactsPage'));
const AdvertiserDashboard = lazyWithRetry(() => import('../../pages/AdvertiserDashboard').then(m => ({ default: m.AdvertiserDashboard })));
const NotepadPage = lazyWithRetry(() => import('../../pages/NotepadPage').then(m => ({ default: m.NotepadPage })));
const TenantDashboard = lazyWithRetry(() => import('../../pages/tenant/TenantDashboard').then(m => ({ default: m.TenantDashboard })));
const ExecutorsPage = lazyWithRetry(() => import('../../pages/shared/ExecutorsPage').then(m => ({ default: m.ExecutorsPage })));
const RequestsPage = lazyWithRetry(() => import('../../pages/shared/RequestsPage').then(m => ({ default: m.RequestsPage })));
const RentalsPage = lazyWithRetry(() => import('../../pages/manager/RentalsPage').then(m => ({ default: m.RentalsPage })));
const TeamPage = lazyWithRetry(() => import('../../pages/admin/TeamPage').then(m => ({ default: m.TeamPage })));
const ReportsPage = lazyWithRetry(() => import('../../pages/admin/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazyWithRetry(() => import('../../pages/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const MonitoringPage = lazyWithRetry(() => import('../../pages/admin/MonitoringPage').then(m => ({ default: m.MonitoringPage })));
const MarketplacePage = lazyWithRetry(() => import('../../pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const MarketplaceManagerDashboard = lazyWithRetry(() => import('../../pages/MarketplaceManagerDashboard').then(m => ({ default: m.MarketplaceManagerDashboard })));
const MarketplaceOrdersPage = lazyWithRetry(() => import('../../pages/MarketplaceOrdersPage').then(m => ({ default: m.MarketplaceOrdersPage })));
// Resident-facing apartment-rentals announcement page. Static info
// screen — feature does not exist for any tenant. NOT to be confused
// with RentalsPage above, which is the УК-side contract table (admin/
// manager/director only, contains residents' personal data).
const ApartmentRentalsPage = lazyWithRetry(() => import('../../pages/ApartmentRentalsPage').then(m => ({ default: m.ApartmentRentalsPage })));
const SuperAdminDashboard = lazyWithRetry(() => import('../../pages/admin/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const PaymentsPage = lazyWithRetry(() => import('../../pages/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
// Finance module pages
const FinanceEstimatesPage = lazyWithRetry(() => import('../../pages/finance/EstimatesPage'));
const FinanceChargesPage = lazyWithRetry(() => import('../../pages/finance/ChargesPage'));
const FinanceDebtorsPage = lazyWithRetry(() => import('../../pages/finance/DebtorsPage'));
const FinanceIncomePage = lazyWithRetry(() => import('../../pages/finance/IncomePage'));
const FinanceMaterialsPage = lazyWithRetry(() => import('../../pages/finance/MaterialsPage'));
const FinanceSettingsPage = lazyWithRetry(() => import('../../pages/finance/SettingsPage'));
const FinanceExpensesPage = lazyWithRetry(() => import('../../pages/finance/ExpensesPage'));

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { language } = useLanguageStore();
  // Sprint 87 — гейт по загрузке tenant config. Пока не подгружен
  // (или упал и нет валидного cache) — не рендерим каркас: NativeSplashOverlay
  // остаётся на месте, hasFeature=false для всех, feature-fetches не
  // летят. Иначе на нативе / медленной сети UI успевал показать
  // чужие пункты меню (utечка с прошлого тенанта) или спамил 403.
  const isConfigFetched = useTenantStore(s => s.isConfigFetched);
  const configError = useTenantStore(s => s.error);
  const hasCachedTenant = useTenantStore(s => !!s.config?.tenant);
  const refetchConfig = useTenantStore(s => s.fetchConfig);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Audit P0: was useDataStore() — subscribed to all 9 sub-stores so a
  // vehicle or rental update re-rendered the entire layout. Now focused.
  const getUnreadCount = useNotificationStore(s => s.getUnreadCount);
  const fetchAnnouncements = useAnnouncementStore(s => s.fetchAnnouncements);
  const unreadCount = user ? getUnreadCount(user.id) : 0;

  // Director onboarding wizard — go through the central overlay store so it
  // doesn't compete with the resident tour or push prompt on screen.
  const [shouldShow, setShouldShow] = useState(false);
  const requestOverlay = useOverlayStore(s => s.requestOverlay);
  const releaseOverlay = useOverlayStore(s => s.releaseOverlay);
  const canShowDirectorWizard = useCanShowOverlay('director_wizard');

  useEffect(() => {
    if (user?.role !== 'director' || !user?.id) return;
    if (localStorage.getItem(`kamizo_ob_done_${user.id}`)) return;
    settingsApi.get('onboarding_completed').then(res => {
      if (!res.data?.value) setShouldShow(true);
    }).catch(() => {
      setShouldShow(true);
    });
  }, [user?.role, user?.id]);

  useEffect(() => {
    if (!shouldShow) return;
    requestOverlay('director_wizard');
    return () => releaseOverlay('director_wizard');
  }, [shouldShow, requestOverlay, releaseOverlay]);

  const showOnboarding = shouldShow && canShowDirectorWizard;
  const setShowOnboarding = (v: boolean) => {
    if (!v) {
      releaseOverlay('director_wizard');
      setShouldShow(false);
    } else {
      setShouldShow(true);
    }
  };

  // Impersonation banner — shown when super admin entered via "Войти в админку УК"
  const [impersonation, setImpersonation] = useState<{ origin_url: string; tenant_name: string } | null>(() => {
    try {
      const stored = localStorage.getItem('kamizo_impersonation');
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });

  const handleExitImpersonation = () => {
    localStorage.removeItem('kamizo_impersonation');
    setImpersonation(null);
    if (impersonation?.origin_url) {
      window.location.href = impersonation.origin_url;
    } else {
      window.close();
    }
  };

  // Hook for popup notifications (urgent announcements, completed requests)
  const { popups, dismissPopup } = usePopupNotifications();

  // Real-time sync via WebSocket (replaces SSE polling)
  useWebSocketSync();

  // Deep linking is supported — users can bookmark and share URLs directly

  // Fetch announcements on mount (for badge in sidebar) — skip for
  // super_admin AND for tenants where `announcements` feature is off.
  // Раньше дёргали безусловно → у tenants на урезанном тарифе (пример:
  // my-humo, 4 фичи из 16) backend возвращал 403 «Feature not
  // available», announcementStore ловил toast'ом и показывал жителю.
  useFeatureFetch('announcements', () => {
    if (user?.role !== 'super_admin') fetchAnnouncements();
  }, [user?.role]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSidebarOpen(false);
  }, [location.pathname]);

  // Listen for custom event to open sidebar (from ResidentDashboard custom header)
  useEffect(() => {
    const handleOpenSidebar = () => setSidebarOpen(true);
    window.addEventListener('open-sidebar', handleOpenSidebar);
    return () => window.removeEventListener('open-sidebar', handleOpenSidebar);
  }, []);

  // v118.152 — REMOVED left-edge swipe-to-open sidebar gesture.
  // Users reported that a left-region swipe on the resident "Заявки"
  // (and other inner pages) was accidentally opening the drawer. The
  // gesture also collided with iOS's own left-edge back-swipe when
  // the user's finger landed slightly outside the OS's ~20 px zone.
  // Drawer is still openable via the hamburger button in MobileHeader
  // (see line ~525 below: onMenuClick → setSidebarOpen(true)) — that
  // button renders on every route with a mobile header, including
  // Home and all inner pages, for every role (resident/director/
  // executor/admin/manager). Close paths unchanged: backdrop click
  // (line ~525: onClose={() => setSidebarOpen(false)}) and route
  // change (line ~250: setSidebarOpen(false)).
  //
  // Deleted symbols: pathnameRef, swipeRef, handleGlobalTouchStart,
  // handleGlobalTouchEnd, and their useEffect / useCallback wrappers
  // (v113 sidebar swipe + v118.21 chat opt-out both retired). No
  // other code in this file referenced them. The v118.85+v118.150
  // touchmove-guard on mainContentRef (below) is a separate handler
  // for elastic-overscroll protection and is untouched.

  // v118.85 — Belt-and-suspenders against iOS WKWebView top elastic
  // overscroll on the .main-content scroll container. CSS already has
  // `overscroll-behavior-y: none` (index.css), which iOS 16+ honors,
  // but older iOS may still bounce. This handler ONLY blocks the
  // downward-from-top gesture — preventDefault on touchmove when
  // scrollTop is exactly at 0 AND the user is dragging down. Normal
  // scrolling (scrollTop > 0, upward drags, bottom overscroll) all
  // unaffected. Without this, content could bounce up past the fixed
  // HomeHero (v226) on resident Home.
  //
  // v118.150 — bug fix. Touchmove events BUBBLE from any descendant to
  // .main-content. On the resident chat (which has its own inner
  // scroller, listRef) .main-content itself has scrollTop === 0 (chat
  // is full-viewport, .main-content has nothing to scroll). So every
  // downward drag inside the chat (the physical gesture to reveal
  // OLDER messages at top) matched `el.scrollTop <= 0 && currentY >
  // startY`, hit preventDefault, and iOS cancelled the chat's own
  // scroll for that touch sequence. Upward drags (scroll toward newer)
  // didn't match the condition, so they worked. Perfect asymmetric
  // fingerprint of this exact bug.
  //
  // Two safeguards now:
  //   1. Skip when #main-content has 'chat-active'. Chat owns its own
  //      scroller; .main-content isn't scrolling at all in that mode,
  //      so the HomeHero-protection this handler exists for cannot
  //      apply anyway.
  //   2. Walk from e.target up to el. If any element in that chain is
  //      itself a vertical scroller with overflow content
  //      (overflow-y: auto|scroll AND scrollHeight > clientHeight),
  //      let it handle the gesture — do NOT preventDefault. Covers any
  //      future screen (modal, sheet, drawer) mounted inside Layout
  //      that has its own scroller. The original HomeHero protection
  //      still fires because the resident Home page relies on
  //      .main-content itself scrolling (no descendant own-scroller
  //      between the touch and .main-content).
  const mainContentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = mainContentRef.current;
    if (!el) return;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => { startY = e.touches[0]?.clientY ?? 0; };
    const onTouchMove = (e: TouchEvent) => {
      // Safeguard 1 — chat opts out of this handler entirely.
      if (el.classList.contains('chat-active')) return;

      // Safeguard 2 — if the touch originates inside a descendant
      // scroller (its own overflow-y with scrollable content), let
      // that scroller handle the gesture. Prevents this outer handler
      // from cancelling inner scrolls in any current or future
      // own-scroller screen mounted in Layout.
      let node: Node | null = e.target as Node | null;
      while (node && node !== el) {
        if (node instanceof HTMLElement) {
          const cs = window.getComputedStyle(node);
          const overflowY = cs.overflowY;
          if (
            (overflowY === 'auto' || overflowY === 'scroll') &&
            node.scrollHeight > node.clientHeight
          ) {
            return;
          }
        }
        node = node.parentNode;
      }

      const currentY = e.touches[0]?.clientY ?? 0;
      // scrollTop can briefly be negative during the bounce itself; treat <=0 as "at top".
      if (el.scrollTop <= 0 && currentY > startY) {
        e.preventDefault();
      }
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  // Determine which dashboard to show based on role and account_type
  const getDashboard = () => {
    // Check account_type or role for special accounts
    if (user?.account_type === 'advertiser' || user?.role === 'advertiser') {
      return <AdvertiserDashboard />;
    }
    if (user?.role === 'marketplace_manager') {
      return <MarketplaceManagerDashboard />;
    }

    switch (user?.role) {
      case 'super_admin':
        return <SuperAdminDashboard />;
      case 'admin':
        return <AdminDashboard />;
      case 'director':
        return <DirectorDashboard />;
      case 'department_head':
        return <DepartmentHeadDashboard />;
      case 'executor':
        return <ExecutorDashboard />;
      case 'security':
        return <Navigate to="/qr-scanner" replace />;
      case 'resident':
        return <ResidentDashboard />;
      case 'tenant':
      case 'commercial_owner':
        return <TenantDashboard />;
      default:
        return <ManagerDashboard />;
    }
  };

  // Determine which announcements page to show based on role
  const getAnnouncementsPage = () => {
    if (user?.role === 'resident') {
      return <ResidentAnnouncementsPage />;
    }
    if (user?.role === 'executor' || user?.role === 'security' || user?.role === 'advertiser') {
      return <ExecutorAnnouncementsPage />;
    }
    return <AnnouncementsPage />;
  };

  // Determine which meetings page to show based on role
  const getMeetingsPage = () => {
    if (user?.role === 'resident') {
      return <ResidentMeetingsPage />;
    }
    return <MeetingsPage />;
  };

  // Determine which guest access page to show based on role
  const getGuestAccessPage = () => {
    if (user?.role === 'resident') {
      return <ResidentGuestAccessPage />;
    }
    return <ManagerGuestAccessPage />;
  };

  const isSuperAdmin = user?.role === 'super_admin';

  // Resident home renders the full Claude-Design §01 screen (own dark hero +
  // own floating TabBar). Hide the global MobileHeader and make the content
  // full-bleed there so there is exactly one header / one bottom nav.
  const isResidentHome = user?.role === 'resident'
    && location.pathname === '/'
    && !location.search.includes('tab=requests');
  // Resident vehicles also renders a full-screen Claude-Design §05 dark "Гараж"
  // hero with its own top bar — hide the global header + go full-bleed there too.
  const isResidentVehicles = user?.role === 'resident' && location.pathname === '/vehicles';
  // Resident profile (Claude Design §07-profil) paints its own hero and
  // sections edge-to-edge. Without full-bleed, main's px-3 mobile padding
  // exposed a 12px sliver of body bg around the page, reading as a "white
  // strip" against the page's beige interior.
  const isResidentProfile = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/profile';
  // Resident passes / guest access (Claude Design §06-propuska) has a sticky
  // in-page header and a ticket-style hero that need the bare 16px the design
  // specifies — no mobile per-device auto-padding compounding from .page-content.
  const isResidentPasses = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/guest-access';
  // Resident rate-employees (Claude Design §09-ocenka) — sticky in-page
  // header + horizontally-scrolling employee row that needs the full mobile
  // width without the .page-content per-device auto-padding compounding.
  const isResidentRate = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/rate-employees';
  // Resident useful-contacts (Claude Design §08-kontakty) — sticky in-page
  // header + category chips + emergency strip + partner promo cards. Page
  // paints its own 16px sides so .page-content's per-device mobile padding
  // would compound; full-bleed gates the modifier.
  const isResidentContacts = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/useful-contacts';
  // Resident announcements (Claude Design §06-obyavleniya) — sticky in-page
  // header + filter chips + announcement feed. Page paints its own 16-px
  // sides so .page-content's per-device mobile padding would compound;
  // full-bleed gates the modifier and hides the global MobileHeader.
  const isResidentAnnouncements = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/announcements';
  // Resident meetings list (Claude Design §05-sobraniya) — sticky in-page
  // header + legal-weight note + meeting cards with quorum bar / closed
  // results grid. Page paints its own 16-px sides; full-bleed gates the
  // modifier and hides the global MobileHeader.
  const isResidentMeetings = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/meetings';
  // Resident contract (Claude Design §14-dogovor) — sticky in-page header
  // + dark hero card + accordion conditions + two-column requisites +
  // sticky bottom action bar. Page paints its own 16-px sides; full-
  // bleed gates the modifier and hides the global MobileHeader.
  const isResidentContract = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/contract';
  // Resident finance (Claude Design §09-oplata) — only for residents:
  // sticky header + dark balance card + charges list. Staff hitting the
  // same /finance/charges URL keep the existing chrome (their UI is the
  // complex filter page).
  const isResidentFinance = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
    && location.pathname === '/finance/charges';
  // v118.102 — Director / Admin / Manager hitting /profile now renders
  // SettingsPage in the v241/v242 pinned-header + inner-scroller pattern.
  // Hide the global MobileHeader so its 42 px chrome doesn't stack on
  // top of the SettingsPage's own safe-area header (which would let the
  // status bar collide with the page title). Page paints its own
  // notch-aware header instead.
  // Extended to `/settings` too — SettingsPage is registered on both
  // routes, and reaching it via the sidebar (/settings) was still
  // stacking MobileHeader over the page's own pinned header.
  // marketplace_manager lands on StaffProfilePage on /profile and needs
  // the same full-bleed treatment so its sticky avatar header and
  // content cards go edge-to-edge instead of leaving beige main-content
  // padding on the sides.
  const isStaffSettingsFullBleed = ['admin', 'director', 'manager', 'department_head', 'marketplace_manager'].includes(user?.role || '')
    && (location.pathname === '/profile' || location.pathname === '/settings');
  const isResidentFullBleed = isResidentHome || isResidentVehicles || isResidentProfile || isResidentPasses || isResidentRate || isResidentContacts || isResidentAnnouncements || isResidentMeetings || isResidentContract || isResidentFinance || isStaffSettingsFullBleed;

  // Whether the MobileHeader is rendered (same condition as below).
  // Chat is a dedicated full-screen surface with its own header (back arrow +
  // channel info + actions), so we drop the generic mobile header there.
  // v118.103 — also hide MobileHeader while any full-screen modal is
  // open (BottomBar already does this via modalCount). The director's
  // "Создать заявку" sheet anchors bottom of viewport with max-h:90dvh,
  // leaving a 10% transparent strip at the top through which the
  // header chrome (burger/choko/bell) bled, visually covering the
  // sheet's own "Создать заявку" title + X close button. Hiding the
  // mobile header for the duration of the modal fixes the overlap
  // without changing per-modal z-index plumbing across the app.
  const modalCount = useModalStore((s) => s.count);
  const showMobileHeader = !isSuperAdmin
    && modalCount === 0
    && !isResidentFullBleed
    && location.pathname !== '/marketplace'
    && location.pathname !== '/apartment-rentals'
    && location.pathname !== '/profile'
    && location.pathname !== '/chat';

  // Sprint 87 splash-gate — рендер каркаса только после подгрузки
  // tenant config (или cached fallback). NativeSplashOverlay,
  // портованный к document.body, остаётся видимым в этом промежутке.
  if (!isConfigFetched) {
    if (configError && !hasCachedTenant) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center px-6 text-center"
          style={{ background: 'var(--app-bg, #F4F0E8)' }}
        >
          <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
          <h1 className="text-lg font-semibold mb-2">
            {language === 'ru' ? 'Не удалось загрузить конфигурацию' : 'Konfiguratsiyani yuklab bo\'lmadi'}
          </h1>
          <p className="text-sm text-gray-600 mb-6 max-w-xs">
            {language === 'ru' ? 'Проверьте подключение к интернету и попробуйте снова.' : 'Internetga ulanishni tekshiring va qayta urinib ko\'ring.'}
          </p>
          <button onClick={() => void refetchConfig()} className="btn-primary">
            {language === 'ru' ? 'Повторить' : 'Qayta urinish'}
          </button>
        </div>
      );
    }
    return null;
  }

  return (
    <div
      className="layout-root"
      style={impersonation ? { '--impersonation-h': '42px' } as React.CSSProperties : undefined}
    >
      {/* Offline detection banner */}
      <OfflineIndicator />

      {/* Skip navigation link for accessibility */}
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-indigo-600">
        {language === 'ru' ? 'Перейти к содержимому' : 'Kontentga o\'tish'}
      </a>
      {/* Impersonation banner — shown when super admin entered tenant via "Войти в админку УК" */}
      {impersonation && (
        <div className="fixed top-0 left-0 right-0 z-[200] bg-amber-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span className="text-[13px] font-semibold truncate">
              {language === 'ru' ? `Режим super admin — компания «${impersonation.tenant_name}»` : `Super admin rejimi — kompaniya «${impersonation.tenant_name}»`}
            </span>
          </div>
          <button
            onClick={handleExitImpersonation}
            className="flex items-center gap-1.5 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-[12px] font-bold flex-shrink-0 transition-colors active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {language === 'ru' ? 'Вернуться в супер-админку' : 'Super adminga qaytish'}
          </button>
        </div>
      )}

      {!isSuperAdmin && (
        <Sidebar
          onLogout={logout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Header - fixed at top; hidden for residents on home page, marketplace, and profile */}
      {showMobileHeader && (
        <MobileHeader
          onMenuClick={() => setSidebarOpen(true)}
          unreadCount={unreadCount}
        />
      )}

      <div
        ref={mainContentRef}
        className={`${isSuperAdmin ? "main-content-full" : "main-content"}${showMobileHeader ? ' has-mobile-header' : ''}`}
        style={impersonation && !showMobileHeader ? { paddingTop: '42px' } : undefined}
      >
        {/* Desktop Header */}
        <div className="hide-mobile">
          <Header />
        </div>

        <main id="main-content" role="main" className={isResidentFullBleed ? 'page-content page-content-full-bleed' : 'px-3 py-3 md:p-6 lg:p-7 xl:p-8 page-content'}>
          <Suspense fallback={<PageLoader />}>
            {/* v118.169 — reverted the v118.163 <AnimatedOutlet> cross-fade.
                The outlet pinned <Routes location={someSnapshot}> so its
                inner subtree read from the pinned location snapshot, not
                the live router. That broke every query-param-based tab
                switch on the resident BottomBar (Заявки uses '/?tab=
                requests' — same pathname, only search changes). The
                outlet's guard was pathname-only → search-only navs never
                triggered a swap, pages state stayed on the initial
                snapshot, useSearchParams inside the pinned Routes returned
                the OLD search, ResidentDashboard's activeTab stayed 'home'
                forever. Symptom: BottomBar highlights Заявки but the
                screen still renders Home.

                Back to the pre-v118.163 approach: <div key=pathname>
                triggers a fresh mount only on pathname change; <Routes>
                is NOT pinned, so it reads the live router location and
                query params flow through normally. The .page-transition
                CSS class provides the same 220 ms opacity fade the app
                had before v118.163 — see the .page-transition rule in
                index.css. Same iOS-safety guarantees preserved:
                  - Opacity-only, no transform → no WKWebView momentum-
                    scroll breakage on descendants.
                  - BottomBar (portaled to document.body) and MobileHeader
                    (sibling of <main>) sit OUTSIDE this wrapper — they
                    stay rock-still during the fade.
                  - position:fixed overlays inside pages still anchor to
                    the viewport, not this wrapper (no transform). */}
            <div key={location.pathname} className="page-transition">
            <Routes>
              <Route path="/" element={getDashboard()} />
              {/* Requests page - not accessible by super_admin (they manage tenants, not individual requests) */}
              {user?.role !== 'super_admin' && (
                <Route path="/requests" element={<RequestsPage />} />
              )}
              {['admin', 'manager', 'director', 'department_head'].includes(user?.role || '') && (
                <Route path="/residents" element={<ResidentsPage />} />
              )}
              <Route path="/executors" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'director', 'department_head', 'dispatcher']}>
                  <ExecutorsPage />
                </ProtectedRoute>
              } />
              <Route path="/rentals" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'director']} requiredFeature="rentals">
                  <RentalsPage />
                </ProtectedRoute>
              } />
              <Route path="/buildings" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'director', 'department_head']}>
                  <BuildingsPage />
                </ProtectedRoute>
              } />
              <Route path="/work-orders" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'director', 'department_head', 'executor']}>
                  <WorkOrdersPage />
                </ProtectedRoute>
              } />
              <Route path="/meetings" element={
                <ProtectedRoute requiredFeature="meetings">{getMeetingsPage()}</ProtectedRoute>
              } />
              <Route path="/announcements" element={
                <ProtectedRoute requiredFeature="announcements">{getAnnouncementsPage()}</ProtectedRoute>
              } />
              <Route path="/schedule" element={
                <ProtectedRoute allowedRoles={['executor']}>
                  <ExecutorSchedulePage />
                </ProtectedRoute>
              } />
              <Route path="/my-stats" element={
                <ProtectedRoute allowedRoles={['executor', 'security']}>
                  <ExecutorStatsPage />
                </ProtectedRoute>
              } />
              <Route path="/rate-employees" element={
                <ProtectedRoute allowedRoles={['resident']}>
                  <ResidentRateEmployeesPage />
                </ProtectedRoute>
              } />
              {/* v118.36 — /vehicles/add moved to top-level route in
                  App.tsx so AddCarPage owns the full viewport without
                  Layout's header / bottom nav.
                  v118.63 — /vehicles (гараж) тоже переехал на
                  top-level в App.tsx по тем же причинам: full-screen
                  без drawer + bell + bottom nav. */}
              <Route path="/vehicle-search" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'director', 'security', 'executor']} requiredFeature="vehicles">
                  <VehicleSearchPage />
                </ProtectedRoute>
              } />
              <Route path="/guest-access" element={
                <ProtectedRoute requiredFeature="qr">{getGuestAccessPage()}</ProtectedRoute>
              } />
              <Route path="/qr-scanner" element={
                <ProtectedRoute allowedRoles={['security']} requiredFeature="qr">
                  <GuardQRScannerPage />
                </ProtectedRoute>
              } />
              <Route path="/chat" element={
                <ProtectedRoute requiredFeature="chat"><ChatPage /></ProtectedRoute>
              } />
              <Route path="/profile" element={
                ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
                  ? <ResidentProfilePage />
                  : ['admin', 'director', 'manager'].includes(user?.role || '')
                    ? <SettingsPage />
                    : <StaffProfilePage />
              } />
              <Route path="/contract" element={<ResidentContractPage />} />
              {/* v118.93 — dropped requiredFeature="useful-contacts" gate.
                  Most tenant `features` JSON blobs don't list this string,
                  so hasFeature() returned false → ProtectedRoute redirected
                  /useful-contacts back to / and the "Полезные контакты"
                  Home swipe-card looked broken (tap → bounce to Home).
                  The page itself is universally useful (emergency services
                  + building contacts) and self-contained; no per-tenant
                  gate justified. ProtectedRoute kept for auth. */}
              <Route path="/useful-contacts" element={
                <ProtectedRoute><ResidentUsefulContactsPage /></ProtectedRoute>
              } />
              {/* /contacts — legacy alias that some UI copies still point at.
                  Redirect so the user doesn't hit the generic 404 screen. */}
              <Route path="/contacts" element={<Navigate to="/useful-contacts" replace />} />
              <Route path="/colleagues" element={
                <ProtectedRoute requiredFeature="colleagues"><ColleaguesSection /></ProtectedRoute>
              } />
              <Route path="/notepad" element={
                <ProtectedRoute requiredFeature="notepad"><NotepadPage /></ProtectedRoute>
              } />
              <Route path="/trainings" element={
                <ProtectedRoute requiredFeature="trainings"><TrainingsPage /></ProtectedRoute>
              } />
              <Route path="/team" element={
                <ProtectedRoute allowedRoles={['admin', 'director']}>
                  <TeamPage />
                </ProtectedRoute>
              } />
              <Route path="/reports" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager']}>
                  <ReportsPage />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager', 'department_head']}>
                  <SettingsPage />
                </ProtectedRoute>
              } />
              <Route path="/payments" element={
                <ProtectedRoute allowedRoles={['admin', 'manager', 'director']} requiredFeature="communal">
                  <PaymentsPage />
                </ProtectedRoute>
              } />
              {/* Finance module */}
              <Route path="/finance/estimates" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager']} requiredFeature="communal">
                  <FinanceEstimatesPage />
                </ProtectedRoute>
              } />
              <Route path="/finance/charges" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager', 'resident', 'tenant']} requiredFeature="communal">
                  <FinanceChargesPage />
                </ProtectedRoute>
              } />
              <Route path="/finance/debtors" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager']} requiredFeature="communal">
                  <FinanceDebtorsPage />
                </ProtectedRoute>
              } />
              <Route path="/finance/income" element={
                <ProtectedRoute allowedRoles={['admin', 'director']} requiredFeature="communal">
                  <FinanceIncomePage />
                </ProtectedRoute>
              } />
              <Route path="/finance/expenses" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager', 'resident', 'tenant']} requiredFeature="communal">
                  <FinanceExpensesPage />
                </ProtectedRoute>
              } />
              <Route path="/finance/materials" element={
                <ProtectedRoute allowedRoles={['admin', 'director', 'manager', 'executor', 'plumber', 'electrician']} requiredFeature="communal">
                  <FinanceMaterialsPage />
                </ProtectedRoute>
              } />
              <Route path="/finance/settings" element={
                <ProtectedRoute allowedRoles={['admin', 'director']} requiredFeature="communal">
                  <FinanceSettingsPage />
                </ProtectedRoute>
              } />
              <Route path="/monitoring" element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <MonitoringPage />
                </ProtectedRoute>
              } />
              {/* Sprint 87 v4 — /marketplace no longer carries
                  requiredFeature. Check moved into MarketplacePage so
                  a resident whose tenant hasn't enabled the feature
                  sees a purpose-built stub instead of Navigate('/').
                  Staff surfaces /marketplace-orders and /marketplace-
                  products keep the route-level gate — those views have
                  no meaningful stub. */}
              <Route path="/marketplace" element={
                <ProtectedRoute>
                  <MarketplacePage />
                </ProtectedRoute>
              } />
              {/* Resident-facing apartment-rentals announcement. Auth
                  only, no requiredFeature, no role restriction — the
                  feature does not exist for any tenant, so there is
                  nothing to enable. The screen itself says "в
                  разработке". Distinct from /rentals (RentalsPage, УК-
                  side contract table) which stays admin-only. */}
              <Route path="/apartment-rentals" element={
                <ProtectedRoute>
                  <ApartmentRentalsPage />
                </ProtectedRoute>
              } />
              <Route path="/marketplace-orders" element={
                <ProtectedRoute requiredFeature="marketplace">
                  <MarketplaceOrdersPage />
                </ProtectedRoute>
              } />
              <Route path="/marketplace-products" element={
                <ProtectedRoute requiredFeature="marketplace">
                  <MarketplaceManagerDashboard />
                </ProtectedRoute>
              } />
              {user?.role === 'super_admin' && (
                <Route path="/super-admin" element={<SuperAdminDashboard />} />
              )}
              {/* 404 — catch all unmatched routes */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </div>
          </Suspense>
        </main>
      </div>

      {/* Unified interactive bottom bar for all roles (mobile) */}
      <BottomBar />

      {/* Popup notifications for urgent announcements and completed requests */}
      <PopupManager popups={popups} onDismiss={dismissPopup} />

      {/* Performance Monitor (только в dev mode) */}
      <PerformanceMonitor />

      {/* Director onboarding wizard — shown on first login */}
      {showOnboarding && user && (
        <OnboardingWizard
          userId={user.id}
          onComplete={() => setShowOnboarding(false)}
        />
      )}

      {/* Role-based onboarding tooltips — shown once per role */}
      {!showOnboarding && user && user.role !== 'super_admin' && (
        <OnboardingTooltips role={user.role} userId={user.id} />
      )}
    </div>
  );
}
