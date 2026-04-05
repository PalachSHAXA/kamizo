import { useState } from 'react';
import { CheckCircle, Star, RefreshCw } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { PRIORITY_LABELS, PRIORITY_LABELS_UZ } from '../../../types';
import { RequestStatusTracker } from '../../../components/RequestStatusTracker';
import type { RequestDetailsModalProps } from './types';

export function RequestDetailsModal({
  request,
  onClose,
  onApprove,
  onCancel,
  onReschedule,
  hasActiveReschedule
}: RequestDetailsModalProps) {
  const { language } = useLanguageStore();
  const [descExpanded, setDescExpanded] = useState(false);
  const isLongDesc = (request.description?.length || 0) > 100;
  // Reschedule is available for assigned/accepted/in_progress/pending_approval requests with an executor
  const canReschedule = ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(request.status) && request.executorId && !hasActiveReschedule;

  return (
    <div className="modal-backdrop">
      <div className="w-full max-w-lg mx-4 max-h-[90dvh] overflow-y-auto">
        {/* Status Tracker */}
        <RequestStatusTracker
          request={request}
          executorName={request.executorName}
          language={language}
          onCancel={['new', 'assigned', 'accepted'].includes(request.status) ? onCancel : undefined}
          showActions={true}
        />

        {/* Additional Details */}
        <div className="mt-4 bg-white rounded-2xl shadow-lg p-4 space-y-4">
          {/* Description */}
          <div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">
              {language === 'ru' ? 'Описание' : 'Tavsif'}
            </h3>
            <p className="text-sm text-gray-600">
              {isLongDesc && !descExpanded ? request.description.slice(0, 100) + '...' : request.description}
              {isLongDesc && (
                <button onClick={() => setDescExpanded(!descExpanded)} className="text-primary-500 text-xs ml-1">
                  {descExpanded ? (language === 'ru' ? 'Свернуть' : 'Yopish') : (language === 'ru' ? 'Ещё' : 'Ko\'proq')}
                </button>
              )}
            </p>
          </div>

          {/* Priority */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              {language === 'ru' ? 'Приоритет:' : 'Muhimlik:'}
            </span>
            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
              request.priority === 'urgent' ? 'bg-red-100 text-red-700' :
              request.priority === 'high' ? 'bg-orange-100 text-orange-700' :
              request.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-700'
            }`}>
              {language === 'ru' ? PRIORITY_LABELS[request.priority] : PRIORITY_LABELS_UZ[request.priority]}
            </span>
          </div>

          {/* Rating if completed */}
          {request.status === 'completed' && request.rating && (
            <div className="p-4 bg-yellow-50 rounded-xl">
              <h3 className="font-medium mb-2">
                {language === 'ru' ? 'Ваша оценка' : 'Sizning bahoyingiz'}
              </h3>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    className={`w-6 h-6 ${star <= request.rating! ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
                  />
                ))}
                <span className="ml-2 text-lg font-semibold">{request.rating}/5</span>
              </div>
              {request.feedback && (
                <p className="mt-2 text-gray-600 italic">"{request.feedback}"</p>
              )}
            </div>
          )}

          {/* Approve button for pending_approval */}
          {request.status === 'pending_approval' && (
            <button
              onClick={onApprove}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            >
              <CheckCircle className="w-5 h-5" />
              {language === 'ru' ? 'Подтвердить выполнение' : 'Bajarilganini tasdiqlash'}
            </button>
          )}

          {/* Reschedule button for active requests */}
          {canReschedule && (
            <button
              onClick={onReschedule}
              className="w-full py-3 min-h-[44px] bg-amber-100 hover:bg-amber-200 active:bg-amber-300 text-amber-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all touch-manipulation"
            >
              <RefreshCw className="w-4 h-4" />
              {language === 'ru' ? 'Перенести на другое время' : 'Boshqa vaqtga ko\'chirish'}
            </button>
          )}

          {/* Show if there's an active reschedule request */}
          {hasActiveReschedule && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-700">
              <RefreshCw className="w-4 h-4" />
              <span className="text-sm">
                {language === 'ru' ? 'Ожидается ответ на запрос о переносе' : 'Ko\'chirish so\'roviga javob kutilmoqda'}
              </span>
            </div>
          )}
        </div>

        {/* Close button at bottom */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-3.5 min-h-[48px] bg-white active:bg-gray-100 rounded-xl font-semibold text-gray-600 transition-colors touch-manipulation shadow-lg"
          style={{ marginBottom: 'max(50px, env(safe-area-inset-bottom, 50px))' }}
        >
          {language === 'ru' ? 'Закрыть' : 'Yopish'}
        </button>
      </div>
    </div>
  );
}
