import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useFeatureBlocked } from '../hooks/useFeatureBlocked';
import { FeatureUnavailable } from './FeatureUnavailable';

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
  const location = useLocation();
  // Гейт по фиче считается общим хуком — тем же, которым Sidebar решает,
  // рисовать ли замок. Хук сам не срабатывает, пока конфиг тенанта не
  // загружен: раньше на холодном старте hasFeature отдавал false для
  // всего и любой feature-маршрут успевал редиректнуть на главную.
  const featureBlocked = useFeatureBlocked(requiredFeature);

  if (!token || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  // Раньше здесь был <Navigate to="/" replace />: пользователь жал пункт
  // меню и без объяснений оказывался на главной. Показываем экран с
  // причиной и путём к решению вместо молчаливого выброса.
  if (requiredFeature && featureBlocked) {
    return <FeatureUnavailable featureKey={requiredFeature} />;
  }

  return <>{children}</>;
}
