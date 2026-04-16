import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  // If set, the route is only accessible when the current tenant has this
  // feature enabled. Useful for locking routes like /marketplace so a user
  // cannot bypass the drawer/dashboard lock by typing the URL directly.
  requiredFeature?: string;
}

export function ProtectedRoute({ children, allowedRoles, requiredFeature }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const hasFeature = useTenantStore((s) => s.hasFeature);
  const config = useTenantStore((s) => s.config);
  const location = useLocation();

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Feature gate — only enforce when we actually have tenant config loaded.
  // Super_admin bypasses tenant feature checks (they administer all tenants).
  if (requiredFeature && config?.tenant && user.role !== 'super_admin' && !hasFeature(requiredFeature)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
