import { Suspense, useEffect } from 'react';
import { lazyWithRetry } from './utils/lazyWithRetry';
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
import { LoginPage } from './pages/LoginPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PushNotificationPrompt } from './components/PushNotificationPrompt';
import { SWUpdateBanner } from './components/SWUpdateBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import Toast from './components/Toast';
import { ThemeProvider } from './components/common/ThemeProvider';
import { NativeSplashOverlay } from './components/NativeSplashOverlay';
import { NavigationDirectionTracker } from './components/NavigationDirectionTracker';
import { getRouteRoles, isResidentMeetingsRole } from './navigation/adminNavigation';

const Layout = lazyWithRetry(() =>
  import('./components/layout/Layout').then((module) => ({ default: module.Layout }))
);

const AppShellFallback = () => (
  <div
    className="min-h-[100dvh] bg-[var(--app-bg,#F4F0E8)]"
    aria-busy="true"
    aria-label="Загрузка приложения"
  >
    <div className="h-16 border-b border-black/5 bg-white/70 px-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-xl bg-black/10 animate-pulse" />
      <div className="h-4 w-28 rounded-full bg-black/10 animate-pulse" />
    </div>
    <div className="mx-auto flex max-w-7xl">
      <div className="hidden md:block w-60 shrink-0 p-5 space-y-3" aria-hidden="true">
        {[72, 88, 64, 80].map((width) => (
          <div key={width} className="h-9 rounded-xl bg-black/[0.06] animate-pulse" style={{ width: `${width}%` }} />
        ))}
      </div>
      <div className="flex-1 p-4 sm:p-6 space-y-4" aria-hidden="true">
        <div className="h-7 w-44 rounded-full bg-black/10 animate-pulse" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-28 rounded-2xl border border-black/5 bg-white/60 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  </div>
);

// v118.36 — AddCarPage is rendered OUTSIDE the Layout shell so it
// gets the full screen with no top app header (drawer / logo / bell)
// and no bottom navigation bar. Same pattern as /login. Lazy-loaded
// because it's a leaf screen reached only from the garage's "Add"
// button — keeps the main bundle small.
const AddCarPage = lazyWithRetry(() => import('./pages/AddCarPage'));
// v118.63 — ResidentVehiclesPage (гараж) выведен из Layout: должен
// быть full-screen без top header (drawer + bell) и без bottom nav.
// Той же схеме как AddCarPage. Named export → требуется .then().
const ResidentVehiclesPage = lazyWithRetry(() =>
  import('./pages/ResidentVehiclesPage').then((m) => ({ default: m.ResidentVehiclesPage }))
);
// v118.67 — ResidentAnnouncementsPage тоже full-screen для residents.
// /announcements используется также staff'ом (executor, admin, manager
// и т.д.) через их Sidebar nav — для них нужен Layout chrome. Поэтому
// делаем role-split: resident → full-screen, остальные → fall through
// в Layout (через AnnouncementsRoleSplit ниже в JSX).
const ResidentAnnouncementsPage = lazyWithRetry(() =>
  import('./pages/ResidentAnnouncementsPage').then((m) => ({ default: m.ResidentAnnouncementsPage }))
);
// v118.72 — /notifications standalone page for residents. Same role-split
// pattern as /announcements (v118.67): residents → full-screen, staff fall
// through to Layout which currently 404s for /notifications (no staff
// notifications page exists yet; that's a future addition).
const NotificationsPage = lazyWithRetry(() =>
  import('./pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage }))
);
// v118.77 — /meetings standalone page for residents. Role-split shape
// matches /announcements (v118.67) and /notifications (v118.72): resident
// → full-screen ResidentMeetingsPage; commercial owners use the same
// ownership experience, while staff/tenant fall through to Layout.
const ResidentMeetingsPage = lazyWithRetry(() =>
  import('./pages/ResidentMeetingsPage').then((m) => ({ default: m.ResidentMeetingsPage }))
);

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

// v118.77 — MeetingsRoleSplit. Owners use the standalone voting page;
// tenants remain non-voting users and staff keep the management page.
function MeetingsRoleSplit() {
  const { user } = useAuthStore();
  if (isResidentMeetingsRole(user?.role)) {
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
      // Feature-guard: не дёргаем API отключённых фич — backend вернёт
      // 403 «Feature X is not available in your plan», сторы поймают
      // это toast'ом. Пример пострадавшего: my-humo (4 фичи из 16) —
      // резидент видел красные ошибки на входе. Проверяем
      // синхронно через getState(), потому что мы уже внутри
      // setTimeout — вызвать хук здесь нельзя.
      const has = useTenantStore.getState().hasFeature;
      fetchBuildings();
      if (['admin', 'manager', 'department_head', 'dispatcher'].includes(user.role)) {
        fetchExecutors();
      }
      if (has('requests')) fetchRequests();
      if (user.role === 'resident' && has('vehicles')) {
        fetchVehicles();
      }
      // /api/notifications — общий транспорт для ВСЕХ типов уведомлений
      // (announcement, meeting, marketplace_order, request_*,
      // guest_pass_revoked, rental_*). Не гейтится фичей — тенант без
      // chat всё равно должен получать уведомления о своих заявках.
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
          {/* v118.166 + Sprint 87 cold-start fix — kept as the FIRST
              child of BrowserRouter so its createPortal(→ document.body)
              still commits BEFORE Layout/BottomBar's own portal calls
              (mount order relative to BottomBar is preserved — both
              are descendants of BrowserRouter now, but NativeSplashOverlay
              is earlier in the child list, so its DOM node lands first
              and z-index:9999 wins from the start). Moved INSIDE the
              router — instead of ABOVE it — so it can call useLocation()
              to trip the /login route-bypass dismiss criterion (see the
              canDismiss block-comment in NativeSplashOverlay.tsx).
              Belt-and-braces with `body.app-booting` which hides the
              bottom bar during the boot window anyway.

              The overlay renders on every launch on top of everything
              and self-unmounts on ANY of: config resolved / on /login /
              config error with no cache / 20 s hard-timeout backstop.
              Theme is picked by local clock time (07–19 → light, else
              dark). The native @capacitor/splash-screen is configured
              neutral cream + launch AutoHide:false; this component
              calls SplashScreen.hide() from a `playing + 2 RAFs`
              gated effect so the user sees a single seamless splash
              with zero coverage gap. See NativeSplashOverlay.tsx. */}
          <NativeSplashOverlay />
          {/* v118.79 — stamps body.dataset.nav with push/pop so CSS
              can pick the correct slide direction on each route change. */}
          <NavigationDirectionTracker />
          <Suspense fallback={<AppShellFallback />}>
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
            {/* /meetings is standalone for resident and commercial owners;
                staff and tenants fall through to Layout. */}
            <Route path="/meetings" element={
              <ProtectedRoute allowedRoles={getRouteRoles('meetings')} requiredFeature="meetings">
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
          </Suspense>
          <SWUpdateBanner />
        </BrowserRouter>
      </ErrorBoundary>
      <Toast />
      {/* v118.166 — NativeSplashOverlay moved to BEFORE the routing
          tree (see above) so its portal commits before
          BottomBar's — same DOM target (document.body), but earlier
          in React's commit order. The old placement here has been
          removed to avoid a duplicate mount. */}
    </>
  );
}

export default App;
