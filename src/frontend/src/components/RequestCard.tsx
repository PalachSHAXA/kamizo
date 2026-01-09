import { memo, useCallback } from 'react';
import { Clock, User, MapPin, Calendar, AlertCircle } from 'lucide-react';
import type { Request } from '../types';
import { STATUS_LABELS, PRIORITY_LABELS, SPECIALIZATION_LABELS } from '../types';

interface RequestCardProps {
  request: Request;
  onAssign?: (request: Request) => void;
  onView?: (request: Request) => void;
  showActions?: boolean;
  className?: string;
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-red-100 text-red-700',
  urgent: 'bg-red-600 text-white',
};

const statusColors = {
  new: 'bg-blue-100 text-blue-700',
  assigned: 'bg-purple-100 text-purple-700',
  accepted: 'bg-indigo-100 text-indigo-700',
  in_progress: 'bg-amber-100 text-amber-700',
  paused: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
  pending_approval: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-700',
  closed: 'bg-slate-100 text-slate-700',
};

/**
 * Мемоизированная карточка заявки
 * Не перерисовывается если props не изменились
 *
 * Performance:
 * - Рендерится только при изменении request object
 * - useCallback для обработчиков событий
 * - Минимальный JSX для быстрого рендера
 */
export const RequestCard = memo<RequestCardProps>(
  ({ request, onAssign, onView, showActions = false, className = '' }) => {
    // Мемоизированные обработчики
    const handleAssign = useCallback(() => {
      onAssign?.(request);
    }, [onAssign, request]);

    const handleView = useCallback(() => {
      onView?.(request);
    }, [onView, request]);

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 60) return `${diffMins} мин назад`;
      if (diffHours < 24) return `${diffHours} ч назад`;
      if (diffDays < 7) return `${diffDays} дн назад`;
      return date.toLocaleDateString('ru-RU');
    };

    return (
      <div className={`glass-card p-4 hover:shadow-lg transition-shadow ${className}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-semibold text-gray-900 truncate">{request.number}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[request.status]}`}>
                {STATUS_LABELS[request.status]}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[request.priority]}`}>
                {PRIORITY_LABELS[request.priority]}
              </span>
            </div>

            {/* Title */}
            <h3 className="font-medium text-gray-900 mb-1 line-clamp-1">{request.title}</h3>

            {/* Description */}
            {request.description && (
              <p className="text-sm text-gray-600 mb-3 line-clamp-2">{request.description}</p>
            )}

            {/* Meta info */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>{request.residentName}</span>
              </div>
              {request.apartment && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>кв. {request.apartment}</span>
                </div>
              )}
              <div className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDate(request.createdAt)}</span>
              </div>
              {request.category && (
                <div className="flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{SPECIALIZATION_LABELS[request.category as keyof typeof SPECIALIZATION_LABELS] || request.category}</span>
                </div>
              )}
            </div>

            {/* Executor info */}
            {request.executorName && (
              <div className="mt-2 text-xs text-gray-600">
                Исполнитель: <span className="font-medium">{request.executorName}</span>
              </div>
            )}

            {/* Scheduled date */}
            {request.scheduledDate && (
              <div className="mt-2 flex items-center gap-1 text-xs text-blue-600">
                <Calendar className="w-3.5 h-3.5" />
                <span>Запланировано: {new Date(request.scheduledDate).toLocaleDateString('ru-RU')}</span>
                {request.scheduledTime && <span>{request.scheduledTime}</span>}
              </div>
            )}
          </div>

          {/* Actions */}
          {showActions && (
            <div className="flex flex-col gap-2">
              {request.status === 'new' && onAssign && (
                <button
                  onClick={handleAssign}
                  className="px-3 py-1.5 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors text-sm whitespace-nowrap"
                >
                  Назначить
                </button>
              )}
              {onView && (
                <button
                  onClick={handleView}
                  className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm whitespace-nowrap"
                >
                  Открыть
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
  // Custom comparison для более точной проверки
  (prevProps, nextProps) => {
    return (
      prevProps.request.id === nextProps.request.id &&
      prevProps.request.status === nextProps.request.status &&
      prevProps.request.executorId === nextProps.request.executorId &&
      prevProps.showActions === nextProps.showActions
    );
  }
);

RequestCard.displayName = 'RequestCard';
