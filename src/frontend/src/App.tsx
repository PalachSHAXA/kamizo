import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useCRMStore } from './stores/crmStore';
import {
  useExecutorStore,
  useRequestStore,
  useVehicleStore,
  useNotificationStore,
} from './stores/dataStore';
import { useTenantStore } from './stores/tenantStore';
import { applyTenantBrand } from './utils/tenantBrand';
import { Layout } from './components/layout';
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PushNotificationPrompt } from './components/PushNotificationPrompt';
import { SWUpdateBanner } from './components/SWUpdateBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import Toast from './components/Toast';
import { ThemeProvider } from './components/common/ThemeProvider';
import { NativeSplashOverlay } from './components/NativeSplashOverlay';
import { NavigationDirectionTracker } from './components/NavigationDirectionTracker';

// v118.36 — AddCarPage is rendered OUTSIDE the Layout shell so it
// gets the full screen with no top app header (drawer / logo / bell)
// and no bottom navigation bar. Same pattern as /login. Lazy-loaded
// because it's a leaf screen reached only from the garage's "Add"
// button — keeps the main bundle small.
const AddCarPage = lazy(() => import('./pages/AddCarPage'));
// v118.63 — ResidentVehiclesPage (гараж) выведен из Layout: должен
// быть full-screen без top header (drawer + bell) и без bottom nav.
// Той же схеме как AddCarPage. Named export → требуется .then().
const ResidentVehiclesPage = lazy(() =>
  import('./pages/ResidentVehiclesPage').then((m) => ({ default: m.ResidentVehiclesPage }))
);
// v118.67 — ResidentAnnouncementsPage тоже full-screen для residents.
// /announcements используется также staff'ом (executor, admin, manager
// и т.д.) через их Sidebar nav — для них нужен Layout chrome. Поэтому
// делаем role-split: resident → full-screen, остальные → fall through
// в Layout (через AnnouncementsRoleSplit ниже в JSX).
const ResidentAnnouncementsPage = lazy(() =>
  import('./pages/ResidentAnnouncementsPage').then((m) => ({ default: m.ResidentAnnouncementsPage }))
);
// v118.72 — /notifications standalone page for residents. Same role-split
// pattern as /announcements (v118.67): residents → full-screen, staff fall
// through to Layout which currently 404s for /notifications (no staff
// notifications page exists yet; that's a future addition).
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
// v118.77 — /meetings standalone page for residents. Role-split shape
// matches /announcements (v118.67) and /notifications (v118.72): resident
// → full-screen ResidentMeetingsPage; staff/tenant/commercial_owner fall
// through to Layout (whose nested /meetings Route hands them off to
// MeetingsPage via getMeetingsPage()).
const ResidentMeetingsPage = lazy(() =>
  import('./pages/ResidentMeetingsPage').then((m) => ({ default: m.ResidentMeetingsPage }))
);

// Handle auto_auth parameter from super admin impersonation
// Must run before React mounts to set localStorage before zustand rehydrates
(() => {
  try {
    const params = new URLSearchParams(window.location.search);
    const autoAuth = params.get('auto_auth');
    if (autoAuth) {
      const decoded = JSON.parse(decodeURIComponent(atob(autoAuth)));
      if (decoded?.state?.user && decoded?.state?.token) {
        // Set zustand persist storage
        localStorage.setItem('uk-auth-storage', JSON.stringify(decoded));
        // Set auth_token for API requests
        localStorage.setItem('auth_token', decoded.state.token);
        // Store impersonation metadata for the banner
        if (decoded.is_impersonated) {
          localStorage.setItem('kamizo_impersonation', JSON.stringify({
            origin_url: decoded.super_admin_url || '',
            tenant_name: decoded.tenant_name || '',
          }));
        } else {
          localStorage.removeItem('kamizo_impersonation');
        }
        // Remove the param from URL and reload cleanly
        params.delete('auto_auth');
        const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
        window.history.replaceState({}, '', cleanUrl);
        window.location.reload();
      }
    }
  } catch (e) {
    console.error('Auto-auth failed:', e);
  }
})();

// v118.67 — AnnouncementsRoleSplit: top-level route element для
// /announcements. Resident-роли получают full-screen ResidentAnnouncementsPage,
// staff/executor — fall through в Layout (которое матчит свой
// nested /announcements route и через getAnnouncementsPage() рендерит
// правильную staff-вариацию с обычным chrome — header + Sidebar).
function AnnouncementsRoleSplit() {
  const { user } = useAuthStore();
  const isResidentRole = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '');
  if (isResidentRole) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--app-bg, #F4F0E8)' }} />}>
        <ResidentAnnouncementsPage />
      </Suspense>
    );
  }
  return <Layout />;
}

// v118.72 — same shape as AnnouncementsRoleSplit. Residents see the
// standalone Claude-Design notifications page; other roles fall through
// to Layout (which doesn't yet match /notifications, so it 404s into
// home — staff don't use this route today).
function NotificationsRoleSplit() {
  const { user } = useAuthStore();
  const isResidentRole = ['resident', 'tenant', 'commercial_owner'].includes(user?.role || '');
  if (isResidentRole) {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--app-bg, #F4F0E8)' }} />}>
        <NotificationsPage />
      </Suspense>
    );
  }
  return <Layout />;
}

// v118.77 — MeetingsRoleSplit. Narrower role check than the others:
// ONLY 'resident' (NOT tenant/commercial_owner) gets the standalone
// page because Layout's existing getMeetingsPage() helper only routes
// 'resident' to ResidentMeetingsPage; tenant + commercial_owner already
// see the staff MeetingsPage today, and we mustn't regress them.
function MeetingsRoleSplit() {
  const { user } = useAuthStore();
  if (user?.role === 'resident') {
    return (
      <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--app-bg, #F4F0E8)' }} />}>
        <ResidentMeetingsPage />
      </Suspense>
    );
  }
  return <Layout />;
}

function App() {
  const { user } = useAuthStore();
  const { fetchBuildings } = useCRMStore();
  // Audit P0: was useDataStore() (full barrel) — top-level App was being
  // re-rendered by every store change in the app. Focused selectors limit
  // re-renders to actual changes in the fetched actions (which are stable
  // refs so this hook effectively never re-renders App from this line).
  const fetchExecutors = useExecutorStore(s => s.fetchExecutors);
  const fetchRequests = useRequestStore(s => s.fetchRequests);
  const fetchVehicles = useVehicleStore(s => s.fetchVehicles);
  const { fetchConfig } = useTenantStore();
  const tenantColor = useTenantStore(s => s.config?.tenant?.color);
  const tenantColorSecondary = useTenantStore(s => s.config?.tenant?.color_secondary);

  // Load tenant config on app start.
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // v118.126 — platform-split branding. Native shell always renders
  // Kamizo orange (one brand on the App Store); web cabinets render
  // the УК's saved primary/secondary colours from the super-admin
  // editor. The split is enforced inside applyTenantBrand via
  // Capacitor.isNativePlatform(); we pass both colours unconditionally
  // and let the util decide.
  useEffect(() => {
    applyTenantBrand(tenantColor, tenantColorSecondary);
  }, [tenantColor, tenantColorSecondary]);

  // v118.119 — the sim-testing auto-login block that lived here is
  // gone. It raced with zustand persist rehydration on cold start
  // and force-signed-in as a hardcoded resident, breaking every
  // multi-tenant flow (super-admin impersonation, real tenant admin
  // login). Sim testing now requires manual credential entry — the
  // correct production behaviour. The LoginPage's existing
  // import.meta.env.DEV-gated preview buttons stay intact for quick
  // visual checks (separate code path).

  const fetchNotificationsFromAPI = useNotificationStore(s => s.fetchNotificationsFromAPI);

  // v118.116 — Load data from API when user logs in. Was firing
  // 5 simultaneous fetches synchronously the moment `user` flipped
  // from null → object, and on cold network this overlapped with
  // fetchConfig + the prior sim-testing auto-login. The re-render
  // storm from each store's `set({isLoading:true})` + their
  // eventual responses made the UI feel frozen for 10-15 s after
  // splash on cold start. Deferring the fetches to a setTimeout(0)
  // lets React commit the first interactive paint BEFORE the
  // network storm kicks off. The setInterval (30 s poll) is also
  // deferred so the first poll doesn't pile on either.
  useEffect(() => {
    if (!user || user.role === 'super_admin') return;

    let cancelled = false;
    let notifInterval: number | null = null;

    const launchFetches = window.setTimeout(() => {
      if (cancelled) return;
      fetchBuildings();
      if (['admin', 'manager', 'department_head', 'dispatcher'].includes(user.role)) {
        fetchExecutors();
      }
      fetchRequests();
      if (user.role === 'resident') {
        fetchVehicles();
      }
      fetchNotificationsFromAPI();
      notifInterval = window.setInterval(fetchNotificationsFromAPI, 30000);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(launchFetches);
      if (notifInterval !== null) window.clearInterval(notifInterval);
    };
  }, [user, fetchBuildings, fetchExecutors, fetchRequests, fetchVehicles, fetchNotificationsFromAPI]);

  return (
    <>
      <ThemeProvider />
      <ErrorBoundary>
        <BrowserRouter>
          {/* v118.79 — stamps body.dataset.nav with push/pop so CSS
              can pick the correct slide direction on each route change. */}
          <NavigationDirectionTracker />
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
            {/* v118.36 — full-screen chrome-less routes go HERE, before
                the Layout-wrapped /* catch-all. AddCarPage owns the whole
                viewport so the user gets the design's own sticky header
                (← + "Добавить авто") at the top instead of being squeezed
                between the app drawer header and the bottom nav bar. */}
            <Route path="/vehicles/add" element={
              <ProtectedRoute allowedRoles={['resident']} requiredFeature="vehicles">
                <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--app-bg, #F4F0E8)' }} />}>
                  <AddCarPage />
                </Suspense>
              </ProtectedRoute>
            } />
            {/* v118.44 — EDIT mode is the same AddCarPage component
                in dual-mode, gated by the :id URL param. Sibling
                route so both ADD and EDIT render full-screen
                chrome-less (no app header, no bottom nav). Save
                routes through vehicleStore.updateVehicle. */}
            <Route path="/vehicles/edit/:id" element={
              <ProtectedRoute allowedRoles={['resident']} requiredFeature="vehicles">
                <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--app-bg, #F4F0E8)' }} />}>
                  <AddCarPage />
                </Suspense>
              </ProtectedRoute>
            } />
            {/* v118.63 — /vehicles (гараж) тоже full-screen без
                Layout chrome (нет drawer, bell, bottom nav). Своя
                back-кнопка внутри страницы навигирует в '/'. */}
            <Route path="/vehicles" element={
              <ProtectedRoute allowedRoles={['resident']} requiredFeature="vehicles">
                <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--app-bg, #F4F0E8)' }} />}>
                  <ResidentVehiclesPage />
                </Suspense>
              </ProtectedRoute>
            } />
            {/* v118.67 — /announcements role-split. Resident → full-screen
                ResidentAnnouncementsPage без Layout chrome. Staff/executor
                → Layout (через AnnouncementsRoleSplit). НЕ используем
                allowedRoles здесь иначе ProtectedRoute редиректит staff
                на / при попытке открыть /announcements через Sidebar. */}
            <Route path="/announcements" element={
              <ProtectedRoute requiredFeature="announcements">
                <AnnouncementsRoleSplit />
              </ProtectedRoute>
            } />
            {/* v118.72 — /notifications standalone fullscreen for residents.
                No requiredFeature gate (notifications are universal). */}
            <Route path="/notifications" element={
              <ProtectedRoute>
                <NotificationsRoleSplit />
              </ProtectedRoute>
            } />
            {/* v118.77 — /meetings standalone fullscreen for residents.
                Staff/tenant/commercial_owner fall through to Layout. */}
            <Route path="/meetings" element={
              <ProtectedRoute requiredFeature="meetings">
                <MeetingsRoleSplit />
              </ProtectedRoute>
            } />
            <Route path="/*" element={
              <ProtectedRoute>
                <Layout />
                <PushNotificationPrompt />
              </ProtectedRoute>
            } />
          </Routes>
          <SWUpdateBanner />
        </BrowserRouter>
      </ErrorBoundary>
      <Toast />
      {/* v118.13 — webview splash overlay. Renders on every launch on
          top of everything; self-unmounts after ~3 s. Theme is picked
          by local clock time (07–19 → light, else dark) so the splash
          matches morning vs evening regardless of the iOS appearance
          setting. The native @capacitor/splash-screen is configured
          neutral cream + launchAutoHide:false; this component calls
          SplashScreen.hide() in its useEffect so the user sees a
          single seamless splash. See NativeSplashOverlay.tsx. */}
      <NativeSplashOverlay />
    </>
  );
}

export default App;
