import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
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
const ManagerDashboard = lazy(() => import('../../pages/ManagerDashboard').then(m => ({ default: m.ManagerDashboard })));
const DepartmentHeadDashboard = lazy(() => import('../../pages/DepartmentHeadDashboard').then(m => ({ default: m.DepartmentHeadDashboard })));
const ExecutorDashboard = lazy(() => import('../../pages/ExecutorDashboard').then(m => ({ default: m.ExecutorDashboard })));
const ExecutorSchedulePage = lazy(() => import('../../pages/ExecutorSchedulePage').then(m => ({ default: m.ExecutorSchedulePage })));
const ExecutorStatsPage = lazy(() => import('../../pages/ExecutorStatsPage').then(m => ({ default: m.ExecutorStatsPage })));
const ExecutorAnnouncementsPage = lazy(() => import('../../pages/ExecutorAnnouncementsPage').then(m => ({ default: m.ExecutorAnnouncementsPage })));
const ResidentDashboard = lazy(() => import('../../pages/ResidentDashboard').then(m => ({ default: m.ResidentDashboard })));
const AdminDashboard = lazy(() => import('../../pages/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const DirectorDashboard = lazy(() => import('../../pages/DirectorDashboard').then(m => ({ default: m.DirectorDashboard })));
const BuildingsPage = lazy(() => import('../../pages/BuildingsPage').then(m => ({ default: m.BuildingsPage })));
const AnnouncementsPage = lazy(() => import('../../pages/AnnouncementsPage').then(m => ({ default: m.AnnouncementsPage })));
const MeetingsPage = lazy(() => import('../../pages/MeetingsPage').then(m => ({ default: m.MeetingsPage })));
const ResidentAnnouncementsPage = lazy(() => import('../../pages/ResidentAnnouncementsPage').then(m => ({ default: m.ResidentAnnouncementsPage })));
const ResidentMeetingsPage = lazy(() => import('../../pages/ResidentMeetingsPage').then(m => ({ default: m.ResidentMeetingsPage })));
const ResidentRateEmployeesPage = lazy(() => import('../../pages/ResidentRateEmployeesPage').then(m => ({ default: m.ResidentRateEmployeesPage })));
const WorkOrdersPage = lazy(() => import('../../pages/WorkOrdersPage').then(m => ({ default: m.WorkOrdersPage })));
const TrainingsPage = lazy(() => import('../../pages/TrainingsPage'));
const ColleaguesSection = lazy(() => import('../../pages/ColleaguesSection').then(m => ({ default: m.ColleaguesSection })));
const ResidentVehiclesPage = lazy(() => import('../../pages/ResidentVehiclesPage').then(m => ({ default: m.ResidentVehiclesPage })));
const VehicleSearchPage = lazy(() => import('../../pages/VehicleSearchPage').then(m => ({ default: m.VehicleSearchPage })));
const ResidentGuestAccessPage = lazy(() => import('../../pages/ResidentGuestAccessPage').then(m => ({ default: m.ResidentGuestAccessPage })));
const GuardQRScannerPage = lazy(() => import('../../pages/GuardQRScannerPage').then(m => ({ default: m.GuardQRScannerPage })));
const ManagerGuestAccessPage = lazy(() => import('../../pages/ManagerGuestAccessPage').then(m => ({ default: m.ManagerGuestAccessPage })));
const ResidentsPage = lazy(() => import('../../pages/ResidentsPage').then(m => ({ default: m.ResidentsPage })));
const ChatPage = lazy(() => import('../../pages/ChatPage').then(m => ({ default: m.ChatPage })));
const ResidentProfilePage = lazy(() => import('../../pages/ResidentProfilePage').then(m => ({ default: m.ResidentProfilePage })));
const StaffProfilePage = lazy(() => import('../../pages/StaffProfilePage').then(m => ({ default: m.StaffProfilePage })));
const ResidentContractPage = lazy(() => import('../../pages/ResidentContractPage').then(m => ({ default: m.ResidentContractPage })));
const ResidentUsefulContactsPage = lazy(() => import('../../pages/ResidentUsefulContactsPage'));
const AdvertiserDashboard = lazy(() => import('../../pages/AdvertiserDashboard').then(m => ({ default: m.AdvertiserDashboard })));
const NotepadPage = lazy(() => import('../../pages/NotepadPage').then(m => ({ default: m.NotepadPage })));
const TenantDashboard = lazy(() => import('../../pages/tenant/TenantDashboard').then(m => ({ default: m.TenantDashboard })));
const ExecutorsPage = lazy(() => import('../../pages/shared/ExecutorsPage').then(m => ({ default: m.ExecutorsPage })));
const RequestsPage = lazy(() => import('../../pages/shared/RequestsPage').then(m => ({ default: m.RequestsPage })));
const RentalsPage = lazy(() => import('../../pages/manager/RentalsPage').then(m => ({ default: m.RentalsPage })));
const TeamPage = lazy(() => import('../../pages/admin/TeamPage').then(m => ({ default: m.TeamPage })));
const ReportsPage = lazy(() => import('../../pages/admin/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('../../pages/admin/SettingsPage').then(m => ({ default: m.SettingsPage })));
const MonitoringPage = lazy(() => import('../../pages/admin/MonitoringPage').then(m => ({ default: m.MonitoringPage })));
const MarketplacePage = lazy(() => import('../../pages/MarketplacePage').then(m => ({ default: m.MarketplacePage })));
const MarketplaceManagerDashboard = lazy(() => import('../../pages/MarketplaceManagerDashboard').then(m => ({ default: m.MarketplaceManagerDashboard })));
const MarketplaceOrdersPage = lazy(() => import('../../pages/MarketplaceOrdersPage').then(m => ({ default: m.MarketplaceOrdersPage })));
const SuperAdminDashboard = lazy(() => import('../../pages/admin/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const PaymentsPage = lazy(() => import('../../pages/PaymentsPage').then(m => ({ default: m.PaymentsPage })));
// Finance module pages
const FinanceEstimatesPage = lazy(() => import('../../pages/finance/EstimatesPage'));
const FinanceChargesPage = lazy(() => import('../../pages/finance/ChargesPage'));
const FinanceDebtorsPage = lazy(() => import('../../pages/finance/DebtorsPage'));
const FinanceIncomePage = lazy(() => import('../../pages/finance/IncomePage'));
const FinanceMaterialsPage = lazy(() => import('../../pages/finance/MaterialsPage'));
const FinanceSettingsPage = lazy(() => import('../../pages/finance/SettingsPage'));
const FinanceExpensesPage = lazy(() => import('../../pages/finance/ExpensesPage'));

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const { language } = useLanguageStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { getUnreadCount, fetchAnnouncements } = useDataStore();
  const unreadCount = user ? getUnreadCount(user.id) : 0;

  // Director onboarding wizard
  const [showOnboarding, setShowOnboarding] = useState(false);
  useEffect(() => {
    if (user?.role !== 'director' || !user?.id) return;
    // Fast check via localStorage first
    if (localStorage.getItem(`kamizo_ob_done_${user.id}`)) return;
    // Async check via settings API
    settingsApi.get('onboarding_completed').then(res => {
      if (!res.data?.value) setShowOnboarding(true);
    }).catch(() => {
      // If API fails, show wizard (better to show than miss)
      setShowOnboarding(true);
    });
  }, [user?.role, user?.id]);

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

  // Fetch announcements on mount (for badge in sidebar) - skip for super_admin
  useEffect(() => {
    if (user?.role !== 'super_admin') {
      fetchAnnouncements();
    }
  }, [fetchAnnouncements, user?.role]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Listen for custom event to open sidebar (from ResidentDashboard custom header)
  useEffect(() => {
    const handleOpenSidebar = () => setSidebarOpen(true);
    window.addEventListener('open-sidebar', handleOpenSidebar);
    return () => window.removeEventListener('open-sidebar', handleOpenSidebar);
  }, []);

  // Swipe from left edge to open sidebar
  const swipeRef = useRef<{ startX: number; startY: number; started: boolean }>({ startX: 0, startY: 0, started: false });
  const handleGlobalTouchStart = useCallback((e: TouchEvent) => {
    const x = e.touches[0].clientX;
    // Only trigger from left 15px edge (avoid conflict with iOS back gesture zone ~20px)
    if (x < 15 && !sidebarOpen) {
      swipeRef.current = { startX: x, startY: e.touches[0].clientY, started: true };
    }
  }, [sidebarOpen]);

  const handleGlobalTouchEnd = useCallback((e: TouchEvent) => {
    if (!swipeRef.current.started) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - swipeRef.current.startX;
    const diffY = Math.abs(endY - swipeRef.current.startY);
    // Swipe right > 60px and mostly horizontal
    if (diffX > 60 && diffY < diffX) {
      setSidebarOpen(true);
    }
    swipeRef.current.started = false;
  }, []);

  useEffect(() => {
    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true });
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleGlobalTouchStart);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [handleGlobalTouchStart, handleGlobalTouchEnd]);

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

  // Whether the MobileHeader is rendered (same condition as below).
  // Chat is a dedicated full-screen surface with its own header (back arrow +
  // channel info + actions), so we drop the generic mobile header there.
  const showMobileHeader = !isSuperAdmin
    && location.pathname !== '/marketplace'
    && location.pathname !== '/profile'
    && location.pathname !== '/chat';

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
        className={`${isSuperAdmin ? "main-content-full" : "main-content"}${showMobileHeader ? ' has-mobile-header' : ''}`}
        style={impersonation && !showMobileHeader ? { paddingTop: '42px' } : undefined}
      >
        {/* Desktop Header */}
        <div className="hide-mobile">
          <Header />
        </div>

        <main id="main-content" role="main" className="px-3 py-3 md:p-6 lg:p-7 xl:p-8 page-content">
          <Suspense fallback={<PageLoader />}>
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
              <Route path="/vehicles" element={
                <ProtectedRoute allowedRoles={['resident']} requiredFeature="vehicles">
                  <ResidentVehiclesPage />
                </ProtectedRoute>
              } />
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
              <Route path="/useful-contacts" element={
                <ProtectedRoute requiredFeature="useful-contacts"><ResidentUsefulContactsPage /></ProtectedRoute>
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
              <Route path="/marketplace" element={
                <ProtectedRoute requiredFeature="marketplace">
                  <MarketplacePage />
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
