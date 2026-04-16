import { Calendar, User, Star, Ban } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import type { HistoryRequestCardProps } from './types';

export function HistoryRequestCard({ request, onClick }: HistoryRequestCardProps) {
  const { language } = useLanguageStore();
  const locale = language === 'ru' ? 'ru-RU' : 'uz-UZ';
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr.endsWith?.('Z') ? dateStr : dateStr + 'Z');
    return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  };

  const isCancelled = request.status === 'cancelled';

  const getCancelledByLabel = (cancelledBy?: string) => {
    if (language === 'ru') {
      switch (cancelledBy) {
        case 'resident': return 'Вами';
        case 'executor': return 'Исполнителем';
        case 'manager': return 'Менеджером';
        case 'admin': return 'Администратором';
        default: return '';
      }
    } else {
      switch (cancelledBy) {
        case 'resident': return 'Siz tomondan';
        case 'executor': return 'Ijrochi tomondan';
        case 'manager': return 'Menejer tomondan';
        case 'admin': return 'Administrator tomondan';
        default: return '';
      }
    }
  };

  return (
    <div
      className={`glass-card p-4 cursor-pointer hover:bg-white/40 transition-colors ${
        isCancelled ? 'border-l-4 border-red-400' : 'border-l-4 border-green-400'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm text-gray-500">#{request.number}</span>
            <h3 className={`font-semibold ${isCancelled ? 'text-gray-500' : ''}`} title={request.title}>{request.title}</h3>
            {isCancelled ? (
              <span className="badge bg-red-100 text-red-700 flex items-center gap-1">
                <Ban className="w-3 h-3" />
                {language === 'ru' ? 'Отменена' : 'Bekor qilindi'}
              </span>
            ) : (
              <span className="badge badge-done">{language === 'ru' ? 'Выполнена' : 'Bajarildi'}</span>
            )}
          </div>
          <p className="text-gray-600 text-sm mt-1">{request.description}</p>

          {isCancelled ? (
            <div className="mt-3 p-3 bg-red-50 rounded-lg">
              <div className="text-sm text-red-700">
                <span className="font-medium">{language === 'ru' ? 'Отменена' : 'Bekor qilindi'} {getCancelledByLabel(request.cancelledBy)}</span>
                {request.cancellationReason && (
                  <p className="mt-1 text-red-600">{request.cancellationReason}</p>
                )}
              </div>
              <div className="text-xs text-red-500 mt-1">
                {request.cancelledAt && formatDate(request.cancelledAt)}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(request.approvedAt || request.completedAt || request.createdAt)}
                </span>
                {request.executorName && (
                  <span className="flex items-center gap-1">
                    <User className="w-4 h-4" />
                    {request.executorName}
                  </span>
                )}
              </div>
              {request.rating && (
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                    />
                  ))}
                  {request.feedback && (
                    <span className="text-sm text-gray-500 ml-2">"{request.feedback}"</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
