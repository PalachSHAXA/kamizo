import { Link } from 'react-router-dom';
import { Home, Lock, Settings } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';
import { useAuthStore } from '../stores/authStore';
import { FEATURE_REGISTRY } from './FeatureLockedModal';

interface FeatureUnavailableProps {
  featureKey: string;
}

/**
 * Экран «модуль отключён» для маршрута под фича-гейтом.
 *
 * Заменяет прежний <Navigate to="/" replace /> в ProtectedRoute. Тот
 * редирект был молчаливым: пользователь жал пункт меню, страница не
 * открывалась, и его без единого слова возвращало на главную — выглядело
 * как сломанная кнопка. Здесь мы прямо называем раздел, причину и того,
 * кто может включить модуль.
 */
export function FeatureUnavailable({ featureKey }: FeatureUnavailableProps) {
  const { language } = useLanguageStore();
  const { user } = useAuthStore();
  const ru = language === 'ru';

  const entry = FEATURE_REGISTRY[featureKey];
  const name = entry ? (ru ? entry.ru.name : entry.uz.name) : (ru ? 'Раздел' : 'Bo\'lim');
  const desc = entry ? (ru ? entry.ru.desc : entry.uz.desc) : null;

  // Кто может включить модуль сам — совпадает с проверкой isAdminLevel
  // на бэке (PATCH /api/tenant/features).
  const canEnable = user?.role === 'admin' || user?.role === 'director';

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6 gap-4">
      <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center">
        <Lock className="w-9 h-9 text-amber-500" />
      </div>

      <div className="text-[20px] font-bold text-gray-800">
        {ru ? `Модуль «${name}» отключён` : `«${name}» moduli o'chirilgan`}
      </div>

      {desc && (
        <div className="text-[14px] text-gray-500 max-w-sm leading-relaxed">{desc}</div>
      )}

      <div className="text-[14px] text-gray-500 max-w-sm leading-relaxed">
        {canEnable
          ? (ru
              ? 'Включите его в настройках — раздел «Модули», и страница станет доступна.'
              : 'Uni sozlamalardagi «Modullar» bo\'limida yoqing — shundan so\'ng sahifa ochiladi.')
          : (ru
              ? 'Попросите администратора или директора вашей УК включить модуль в настройках.'
              : 'Boshqaruv kompaniyangiz administratori yoki direktoridan modulni yoqishni so\'rang.')}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-2 w-full max-w-xs">
        {canEnable && (
          <Link
            to="/settings"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-white font-semibold text-[14px] active:scale-95 transition-transform touch-manipulation min-h-[48px]"
          >
            <Settings className="w-4 h-4" />
            {ru ? 'Настройки' : 'Sozlamalar'}
          </Link>
        )}
        <Link
          to="/"
          className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-[14px] bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-[14px] active:scale-95 transition-transform touch-manipulation min-h-[48px]"
        >
          <Home className="w-4 h-4" />
          {ru ? 'На главную' : 'Bosh sahifa'}
        </Link>
      </div>
    </div>
  );
}
