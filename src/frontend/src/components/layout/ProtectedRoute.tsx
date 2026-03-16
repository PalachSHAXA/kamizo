import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

interface ProtectedRouteProps {
  allowedRoles: string[];
  children: React.ReactNode;
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const user = useAuthStore((s) => s.user);

  // If no user is logged in, redirect to home
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // If user's role is not in the allowed roles, redirect to home
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // User is authorized, render children
  return <>{children}</>;
}
