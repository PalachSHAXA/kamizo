import { useEffect } from 'react';
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

  // Load tenant config on app start.
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Paint the UI in the tenant's chosen primary colour. The super-admin
  // editor stores tenants.color, and this applies it to the brand CSS
  // tokens at runtime (see utils/tenantBrand). On the main / no-tenant
  // domain tenantColor is undefined → the static Kamizo-orange defaults
  // from index.css are used. Runs whenever the resolved tenant colour
  // changes (persisted config makes it available before the fetch returns,
  // minimising any colour flash).
  useEffect(() => {
    applyTenantBrand(tenantColor);
  }, [tenantColor]);

  const fetchNotificationsFromAPI = useNotificationStore(s => s.fetchNotificationsFromAPI);

  // Load data from API when user logs in (super_admin only manages tenants, skip tenant data)
  useEffect(() => {
    if (user && user.role !== 'super_admin') {
      fetchBuildings();

      // Load executors for staff roles
      if (['admin', 'manager', 'department_head', 'dispatcher'].includes(user.role)) {
        fetchExecutors();
      }

      // Load requests for all roles
      fetchRequests();

      // Load vehicles for residents (needed for onboarding check)
      if (user.role === 'resident') {
        fetchVehicles();
      }

      // Fetch notifications from API and poll every 30 seconds
      fetchNotificationsFromAPI();
      const notifInterval = setInterval(fetchNotificationsFromAPI, 30000);
      return () => clearInterval(notifInterval);
    }
  }, [user, fetchBuildings, fetchExecutors, fetchRequests, fetchVehicles, fetchNotificationsFromAPI]);

  return (
    <>
      <ThemeProvider />
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
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
    </>
  );
}

export default App;
