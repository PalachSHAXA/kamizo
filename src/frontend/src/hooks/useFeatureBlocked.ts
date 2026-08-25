import { useAuthStore } from '../stores/authStore';
import { useTenantStore } from '../stores/tenantStore';

/**
 * Единая проверка «этот раздел закрыт фича-флагом тенанта».
 *
 * Один источник истины для ProtectedRoute (пускать ли на маршрут) и
 * Sidebar (рисовать ли замок). Раньше эти два места считали доступ
 * по-разному, и получалась худшая из комбинаций: пункт меню выглядел
 * рабочим, а маршрут молча выбрасывал на главную.
 *
 * Возвращает true ТОЛЬКО когда точно известно, что фичи нет:
 *   • конфиг тенанта уже загружен (иначе на холодном старте hasFeature
 *     отдаёт false для всего и любой гейт срабатывал бы ложно);
 *   • тенант вообще есть (на apex/до логина ничего не режем — это
 *     решает бэк через context);
 *   • роль не super_admin (он администрирует все тенанты).
 */
export function useFeatureBlocked(feature?: string | null): boolean {
  const role = useAuthStore((s) => s.user?.role);
  const config = useTenantStore((s) => s.config);
  const isConfigFetched = useTenantStore((s) => s.isConfigFetched);
  const hasFeature = useTenantStore((s) => s.hasFeature);

  if (!feature) return false;
  if (!isConfigFetched) return false;
  if (!config?.tenant) return false;
  if (role === 'super_admin') return false;
  return !hasFeature(feature);
}
