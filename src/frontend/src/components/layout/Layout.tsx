import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { usePopupNotifications } from '../../hooks/usePopupNotifications';
import { useWebSocketSync } from '../../hooks/useWebSocketSync';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileHeader } from './MobileHeader';
import { PopupManager } from '../PopupNotification';
import { PerformanceMonitor } from '../PerformanceMonitor';
import { BottomBar } from '../BottomBar';
import { Loader2 } from 'lucide-react';

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

export function Layout() {
  const location = useLocation();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { getUnreadCount, fetchAnnouncements } = useDataStore();
  const unreadCount = user ? getUnreadCount(user.id) : 0;

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
    // Only trigger from left 25px edge
    if (x < 25 && !sidebarOpen) {
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

  return (
    <div className="min-h-screen min-h-dvh">
      {!isSuperAdmin && (
        <Sidebar
          onLogout={logout}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile Header - hidden for residents on home page (custom header), marketplace (own header), and profile */}
      {!isSuperAdmin && !(user?.role === 'resident' && location.pathname === '/') && location.pathname !== '/marketplace' && location.pathname !== '/profile' && (
        <MobileHeader
          onMenuClick={() => setSidebarOpen(true)}
          unreadCount={unreadCount}
        />
      )}

      <div className={isSuperAdmin ? "main-content-full" : "main-content"}>
        {/* Desktop Header */}
        <div className="hide-mobile">
          <Header />
        </div>

        <main className="px-3 py-3 md:p-6 lg:p-7 xl:p-8 page-content">
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
              <Route path="/executors" element={<ExecutorsPage />} />
              <Route path="/rentals" element={<RentalsPage />} />
              <Route path="/buildings" element={<BuildingsPage />} />
              <Route path="/work-orders" element={<WorkOrdersPage />} />
              <Route path="/meetings" element={getMeetingsPage()} />
              <Route path="/announcements" element={getAnnouncementsPage()} />
              <Route path="/schedule" element={<ExecutorSchedulePage />} />
              <Route path="/my-stats" element={<ExecutorStatsPage />} />
              <Route path="/rate-employees" element={<ResidentRateEmployeesPage />} />
              <Route path="/vehicles" element={<ResidentVehiclesPage />} />
              <Route path="/vehicle-search" element={<VehicleSearchPage />} />
              <Route path="/guest-access" element={getGuestAccessPage()} />
              <Route path="/qr-scanner" element={<GuardQRScannerPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/profile" element={
                ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '')
                  ? <ResidentProfilePage />
                  : ['admin', 'director', 'manager'].includes(user?.role || '')
                    ? <SettingsPage />
                    : <StaffProfilePage />
              } />
              <Route path="/contract" element={<ResidentContractPage />} />
              <Route path="/useful-contacts" element={<ResidentUsefulContactsPage />} />
              <Route path="/colleagues" element={<ColleaguesSection />} />
              <Route path="/notepad" element={<NotepadPage />} />
              <Route path="/trainings" element={<TrainingsPage />} />
              <Route path="/team" element={<TeamPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/monitoring" element={<MonitoringPage />} />
              <Route path="/marketplace" element={<MarketplacePage />} />
              <Route path="/marketplace-orders" element={<MarketplaceOrdersPage />} />
              <Route path="/marketplace-products" element={<MarketplaceManagerDashboard />} />
              {user?.role === 'super_admin' && (
                <Route path="/super-admin" element={<SuperAdminDashboard />} />
              )}
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
    </div>
  );
}
