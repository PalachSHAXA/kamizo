import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useCRMStore } from './stores/crmStore';
import { useDataStore } from './stores/dataStore';
import { useTenantStore } from './stores/tenantStore';
import { Layout } from './components/layout';
import { LoginPage } from './pages/LoginPage';
import { PushNotificationPrompt } from './components/PushNotificationPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';

// Convert hex color to RGB components
const hexToRgb = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
};

// Mix color with white (lighten) or black (darken)
const mixColor = (hex: string, mixWith: 'white' | 'black', percent: number) => {
  const { r, g, b } = hexToRgb(hex);
  const target = mixWith === 'white' ? 255 : 0;
  const factor = percent / 100;
  const mr = Math.round(r + (target - r) * factor);
  const mg = Math.round(g + (target - g) * factor);
  const mb = Math.round(b + (target - b) * factor);
  return `#${mr.toString(16).padStart(2, '0')}${mg.toString(16).padStart(2, '0')}${mb.toString(16).padStart(2, '0')}`;
};

function App() {
  const { user } = useAuthStore();
  const { fetchBuildings } = useCRMStore();
  const { fetchExecutors, fetchRequests, fetchVehicles } = useDataStore();
  const { fetchConfig, config: tenantConfig } = useTenantStore();

  // Load tenant config on app start
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Apply tenant brand colors as CSS variables
  useEffect(() => {
    const tenant = tenantConfig?.tenant;
    if (tenant?.color) {
      const root = document.documentElement;
      const color = tenant.color;
      const { r, g, b } = hexToRgb(color);

      // Core CSS variables
      root.style.setProperty('--brand', color);
      root.style.setProperty('--brand-light', tenant.color_secondary || mixColor(color, 'white', 30));
      root.style.setProperty('--brand-dark', mixColor(color, 'black', 25));
      root.style.setProperty('--brand-rgb', `${r}, ${g}, ${b}`);
      root.style.setProperty('--brand-bg', mixColor(color, 'white', 95));

      // Tailwind shade variables
      root.style.setProperty('--brand-50', mixColor(color, 'white', 92));
      root.style.setProperty('--brand-100', mixColor(color, 'white', 85));
      root.style.setProperty('--brand-200', mixColor(color, 'white', 72));
      root.style.setProperty('--brand-300', mixColor(color, 'white', 55));
      root.style.setProperty('--brand-400', mixColor(color, 'white', 30));
      root.style.setProperty('--brand-500', color);
      root.style.setProperty('--brand-600', mixColor(color, 'black', 15));
      root.style.setProperty('--brand-700', mixColor(color, 'black', 30));
      root.style.setProperty('--brand-800', mixColor(color, 'black', 45));
      root.style.setProperty('--brand-900', mixColor(color, 'black', 60));
    }
  }, [tenantConfig]);

  // Load data from API when user logs in
  useEffect(() => {
    if (user) {
      console.log('User logged in, fetching data from API...');
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
    }
  }, [user, fetchBuildings, fetchExecutors, fetchRequests, fetchVehicles]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        {user ? (
          <>
            <Layout />
            <PushNotificationPrompt />
          </>
        ) : (
          <LoginPage />
        )}
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
