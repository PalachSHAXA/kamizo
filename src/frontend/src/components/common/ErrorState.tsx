import { AlertTriangle } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title,
  message,
  onRetry,
  className = '',
}: ErrorStateProps) {
  const { language } = useLanguageStore();

  const defaultTitle = language === 'ru' ? 'Произошла ошибка' : 'Xatolik yuz berdi';
  const defaultMessage = language === 'ru'
    ? 'Что-то пошло не так. Попробуйте позже.'
    : 'Nimadir xato ketdi. Keyinroq qayta urinib ko\'ring.';
  const retryLabel = language === 'ru' ? 'Повторить' : 'Qayta urinish';

  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-4 ${className}`}>
      <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />

      <h3 className="text-lg font-semibold text-red-600 mb-2">
        {title || defaultTitle}
      </h3>

      <p className="text-sm text-gray-500 max-w-sm mb-6">
        {message || defaultMessage}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors touch-manipulation"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
