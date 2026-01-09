import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { useCRMStore } from './stores/crmStore';
import { useDataStore } from './stores/dataStore';
import { Layout } from './components/layout';
import { LoginPage } from './pages/LoginPage';
import { PushNotificationPrompt } from './components/PushNotificationPrompt';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  const { user } = useAuthStore();
  const { fetchBuildings } = useCRMStore();
  const { fetchExecutors, fetchRequests, fetchVehicles } = useDataStore();

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
