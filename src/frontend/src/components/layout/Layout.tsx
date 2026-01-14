import { useState, useEffect, lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useDataStore } from '../../stores/dataStore';
import { usePopupNotifications } from '../../hooks/usePopupNotifications';
import { useWebSocketSync } from '../../hooks/useWebSocketSync';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { MobileHeader } from './MobileHeader';
import { PopupManager } from '../PopupNotification';
import { PerformanceMonitor } from '../PerformanceMonitor';
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
const ResidentContractPage = lazy(() => import('../../pages/ResidentContractPage').then(m => ({ default: m.ResidentContractPage })));
const ResidentUsefulContactsPage = lazy(() => import('../../pages/ResidentUsefulContactsPage'));
const AdvertiserDashboard = lazy(() => import('../../pages/AdvertiserDashboard').then(m => ({ default: m.AdvertiserDashboard })));
const CouponCheckerDashboard = lazy(() => import('../../pages/CouponCheckerDashboard').then(m => ({ default: m.CouponCheckerDashboard })));
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

  // Fetch announcements on mount (for badge in sidebar)
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // Close sidebar when route changes on mobile
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Determine which dashboard to show based on role and account_type
  const getDashboard = () => {
    // Check account_type or role for special accounts
    if (user?.account_type === 'advertiser' || user?.role === 'advertiser') {
      return <AdvertiserDashboard />;
    }
    if (user?.account_type === 'coupon_checker' || user?.role === 'coupon_checker') {
      return <CouponCheckerDashboard />;
    }
    if (user?.role === 'marketplace_manager') {
      return <MarketplaceManagerDashboard />;
    }

    switch (user?.role) {
      case 'admin':
        return <AdminDashboard />;
      case 'director':
        return <DirectorDashboard />;
      case 'department_head':
        return <DepartmentHeadDashboard />;
      case 'executor':
        return <ExecutorDashboard />;
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
    if (user?.role === 'executor') {
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

  return (
    <div className="min-h-screen min-h-dvh">
      <Sidebar
        onLogout={logout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile Header */}
      <MobileHeader
        onMenuClick={() => setSidebarOpen(true)}
        unreadCount={unreadCount}
      />

      <div className="main-content">
        {/* Desktop Header */}
        <div className="hide-mobile">
          <Header />
        </div>

        <main className="p-4 md:p-6 page-content">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={getDashboard()} />
              <Route path="/requests" element={<RequestsPage />} />
              <Route path="/residents" element={<ResidentsPage />} />
              <Route path="/executors" element={<ExecutorsPage />} />
              <Route path="/rentals" element={<RentalsPage />} />
              <Route path="/buildings" element={<BuildingsPage />} />
              <Route path="/work-orders" element={<WorkOrdersPage />} />
              <Route path="/meetings" element={getMeetingsPage()} />
              <Route path="/announcements" element={getAnnouncementsPage()} />
              <Route path="/schedule" element={<ExecutorSchedulePage />} />
              <Route path="/stats" element={<ExecutorStatsPage />} />
              <Route path="/rate-employees" element={<ResidentRateEmployeesPage />} />
              <Route path="/vehicles" element={<ResidentVehiclesPage />} />
              <Route path="/vehicle-search" element={<VehicleSearchPage />} />
              <Route path="/guest-access" element={getGuestAccessPage()} />
              <Route path="/qr-scanner" element={<GuardQRScannerPage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/profile" element={<ResidentProfilePage />} />
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
            </Routes>
          </Suspense>
        </main>
      </div>

      {/* Popup notifications for urgent announcements and completed requests */}
      <PopupManager popups={popups} onDismiss={dismissPopup} />

      {/* Performance Monitor (только в dev mode) */}
      <PerformanceMonitor />
    </div>
  );
}
