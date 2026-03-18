import { Phone, MapPin, Calendar, User, UserPlus } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SPECIALIZATION_LABELS, STATUS_LABELS, PRIORITY_LABELS } from '../../../types';
import type { RequestStatus, RequestPriority } from '../../../types';
import { formatAddress } from '../../../utils/formatAddress';
import { formatRequestNumber } from './types';
import type { RequestCardProps } from './types';

// Request Card Component
export function RequestCard({
  request,
  onAssign,
  compact = false
}: RequestCardProps) {
  const { language } = useLanguageStore();
  const getStatusBadge = (status: RequestStatus) => {
    const colors: Record<RequestStatus, string> = {
      new: 'bg-purple-100 text-purple-700',
      assigned: 'bg-blue-100 text-blue-700',
      accepted: 'bg-cyan-100 text-cyan-700',
      in_progress: 'bg-amber-100 text-amber-700',
      pending_approval: 'bg-orange-100 text-orange-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-red-100 text-red-700'
    };
    return <span className={`badge ${colors[status]}`}>{STATUS_LABELS[status]}</span>;
  };

  const getPriorityBadge = (priority: RequestPriority) => {
    const colors: Record<RequestPriority, string> = {
      low: 'bg-gray-100 text-gray-600',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-orange-100 text-orange-700',
      urgent: 'bg-red-100 text-red-700'
    };
    return <span className={`badge ${colors[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (compact) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 md:p-3 bg-white/30 rounded-xl hover:bg-white/50 transition-colors touch-manipulation gap-2">
        <div className="flex items-center gap-2 md:gap-3 flex-wrap min-w-0">
          <span className="text-xs md:text-sm text-gray-500">{formatRequestNumber(request.number)}</span>
          <span className="font-medium text-sm md:text-base truncate">{request.title}</span>
          {getStatusBadge(request.status)}
        </div>
        <div className="flex items-center gap-2 md:gap-3 justify-between sm:justify-end">
          <span className="text-xs md:text-sm text-gray-500 truncate">{request.residentName}</span>
          {request.status === 'new' && (
            <button onClick={onAssign} className="btn-secondary text-xs md:text-sm min-h-[44px] py-2 px-3 md:px-4 touch-manipulation active:scale-[0.98] flex-shrink-0">
              {language === 'ru' ? 'Назначить' : 'Tayinlash'}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-3 md:p-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 md:gap-3 flex-wrap mb-2">
            <span className="text-xs md:text-sm text-gray-500">{formatRequestNumber(request.number)}</span>
            <h3 className="font-semibold text-base md:text-lg">{request.title}</h3>
            {getStatusBadge(request.status)}
            {getPriorityBadge(request.priority)}
          </div>
          <p className="text-gray-600 mb-2 md:mb-3 text-sm md:text-base line-clamp-2">{request.description}</p>
          {/* Trash type and volume badges */}
          {request.category === 'trash' && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {request.title.includes(': ') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                  {request.title.split(': ').slice(1).join(': ')}
                </span>
              )}
              {request.description?.includes('\u041e\u0431\u044a\u0451\u043c: ') && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                  {request.description.split('\u041e\u0431\u044a\u0451\u043c: ')[1].split('\n')[0]}
                </span>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3 md:w-4 md:h-4" />
              {request.residentName}
            </span>
            <span className="flex items-center gap-1">
              <Phone className="w-3 h-3 md:w-4 md:h-4" />
              {request.residentPhone}
            </span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3 md:w-4 md:h-4" />
              <span className="truncate max-w-[120px] md:max-w-none">{formatAddress(request.address, request.apartment)}</span>
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3 md:w-4 md:h-4" />
              {formatDate(request.createdAt)}
            </span>
          </div>
          {request.executorName && (
            <div className="mt-2 text-xs md:text-sm">
              <span className="text-gray-500">{language === 'ru' ? 'Исполнитель: ' : 'Ijrochi: '}</span>
              <span className="font-medium">{request.executorName}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {request.status === 'new' && (
            <button onClick={onAssign} className="btn-primary flex items-center gap-2 min-h-[44px] py-2 px-3 md:py-2.5 md:px-4 touch-manipulation active:scale-[0.98] text-sm">
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">{language === 'ru' ? 'Назначить' : 'Tayinlash'}</span>
              <span className="sm:hidden">{language === 'ru' ? 'Назн.' : 'Tay.'}</span>
            </button>
          )}
          {request.status === 'assigned' && (
            <button onClick={onAssign} className="btn-secondary flex items-center gap-2 min-h-[44px] py-2 px-3 touch-manipulation active:scale-[0.98] text-sm">
              <span className="hidden sm:inline">{language === 'ru' ? 'Переназначить' : 'Qayta tayinlash'}</span>
              <span className="sm:hidden">{language === 'ru' ? 'Перен.' : 'Qayta'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
