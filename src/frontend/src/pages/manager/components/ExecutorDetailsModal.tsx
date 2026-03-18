import { Phone, Star, Trash2, X, User, Calendar } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SPECIALIZATION_LABELS } from '../../../types';
import type { ExecutorSpecialization } from '../../../types';
import { formatRequestNumber } from './types';
import type { ExecutorDetailsModalProps } from './types';

// Executor Details Modal
export function ExecutorDetailsModal({
  executor,
  requests,
  onClose,
  onStatusChange,
  onDelete
}: ExecutorDetailsModalProps) {
  const { language } = useLanguageStore();
  const executorRequests = requests.filter(r => r.executorId === executor.id);
  const completedRequests = executorRequests.filter(r => r.status === 'completed');
  const activeRequests = executorRequests.filter(r => ['assigned', 'accepted', 'in_progress', 'pending_approval'].includes(r.status));

  // Calculate average completion time
  const avgTime = completedRequests.length > 0
    ? completedRequests.reduce((sum, r) => sum + (r.workDuration || 0), 0) / completedRequests.length
    : 0;

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} ${language === 'ru' ? 'сек' : 'son'}`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} ${language === 'ru' ? 'мин' : 'daq'}`;
    return `${Math.floor(seconds / 3600)}${language === 'ru' ? 'ч' : 's'} ${Math.floor((seconds % 3600) / 60)}${language === 'ru' ? 'мин' : 'daq'}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'available': return <span className="badge bg-green-100 text-green-700">{language === 'ru' ? 'Доступен' : 'Mavjud'}</span>;
      case 'busy': return <span className="badge bg-amber-100 text-amber-700">{language === 'ru' ? 'Занят' : 'Band'}</span>;
      case 'offline': return <span className="badge bg-gray-100 text-gray-600">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</span>;
      default: return <span className="badge">{status}</span>;
    }
  };

  const getRequestStatusBadge = (status: string) => {
    const labels: Record<string, { bg: string; text: string; label: string }> = {
      'assigned': { bg: 'bg-blue-100', text: 'text-blue-700', label: language === 'ru' ? 'Назначена' : 'Tayinlangan' },
      'accepted': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: language === 'ru' ? 'Принята' : 'Qabul qilingan' },
      'in_progress': { bg: 'bg-amber-100', text: 'text-amber-700', label: language === 'ru' ? 'В работе' : 'Jarayonda' },
      'pending_approval': { bg: 'bg-purple-100', text: 'text-purple-700', label: language === 'ru' ? 'Ожидает' : 'Kutilmoqda' },
      'completed': { bg: 'bg-green-100', text: 'text-green-700', label: language === 'ru' ? 'Выполнена' : 'Bajarilgan' },
    };
    const info = labels[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status };
    return <span className={`badge ${info.bg} ${info.text} text-xs`}>{info.label}</span>;
  };

  // TODO: migrate to <Modal> component
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="glass-card p-3 sm:p-4 md:p-5 xl:p-6 w-full max-w-lg mx-3 md:mx-4 max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4 md:mb-6 gap-3">
          <div className="flex items-center gap-3 md:gap-4 min-w-0">
            <div className="w-14 h-14 md:w-16 md:h-16 bg-primary-100 rounded-full flex items-center justify-center text-lg md:text-xl font-bold text-primary-700 flex-shrink-0">
              {executor.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg md:text-xl font-bold truncate">{executor.name}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-sm text-gray-500">
                  {SPECIALIZATION_LABELS[executor.specialization as ExecutorSpecialization]}
                </span>
                {getStatusBadge(executor.status)}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-white/30 rounded-lg sm:rounded-xl touch-manipulation active:bg-gray-200 flex-shrink-0" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contact Info */}
        <div className="glass-card bg-white/30 p-3 md:p-4 rounded-xl mb-4">
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-gray-500" />
            <a href={`tel:${executor.phone}`} className="text-primary-600 font-medium">
              {executor.phone}
            </a>
          </div>
          <div className="flex items-center gap-2 text-sm mt-2">
            <User className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">{language === 'ru' ? 'Логин' : 'Login'}: <span className="font-mono">{executor.login}</span></span>
          </div>
          <div className="flex items-center gap-2 text-sm mt-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">{language === 'ru' ? 'Добавлен' : 'Qo\'shilgan'}: {formatDate(executor.createdAt)}</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 xl:gap-4 mb-4">
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="flex items-center justify-center gap-1 text-amber-500 mb-1">
              <Star className="w-4 h-4 fill-amber-400" />
              <span className="text-xl md:text-2xl font-bold">{executor.rating.toFixed(1)}</span>
            </div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Рейтинг' : 'Reyting'}</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-green-600">{completedRequests.length}</div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Выполнено' : 'Bajarilgan'}</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-primary-600">{activeRequests.length}</div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Активных' : 'Faol'}</div>
          </div>
          <div className="glass-card bg-white/30 p-3 text-center rounded-xl">
            <div className="text-xl md:text-2xl font-bold text-purple-600">{formatDuration(avgTime)}</div>
            <div className="text-xs text-gray-500">{language === 'ru' ? 'Ср. время' : 'O\'rt. vaqt'}</div>
          </div>
        </div>

        {/* Status Change */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">{language === 'ru' ? 'Статус' : 'Holat'}</label>
          <select
            value={executor.status}
            onChange={(e) => onStatusChange(e.target.value as 'available' | 'busy' | 'offline')}
            className="glass-input w-full"
          >
            <option value="available">{language === 'ru' ? 'Доступен' : 'Mavjud'}</option>
            <option value="busy">{language === 'ru' ? 'Занят' : 'Band'}</option>
            <option value="offline">{language === 'ru' ? 'Оффлайн' : 'Oflayn'}</option>
          </select>
        </div>

        {/* Active Requests */}
        {activeRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{language === 'ru' ? 'Активные заявки' : 'Faol arizalar'}</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {activeRequests.map(request => (
                <div key={request.id} className="glass-card bg-white/30 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400">{formatRequestNumber(request.number)}</span>
                        {getRequestStatusBadge(request.status)}
                      </div>
                      <div className="text-sm font-medium truncate">{request.title}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Completed */}
        {completedRequests.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{language === 'ru' ? 'Последние выполненные' : 'Oxirgi bajarilganlar'}</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {completedRequests.slice(0, 5).map(request => (
                <div key={request.id} className="glass-card bg-white/30 p-2.5 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatRequestNumber(request.number)}</span>
                        {request.rating && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-500">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {request.rating}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium truncate">{request.title}</div>
                    </div>
                    {request.workDuration && (
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatDuration(request.workDuration)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 md:gap-3 pt-2">
          <button
            onClick={onDelete}
            className="btn-secondary flex-1 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center justify-center gap-2 touch-manipulation"
          >
            <Trash2 className="w-4 h-4" />
            {language === 'ru' ? 'Удалить' : 'O\'chirish'}
          </button>
          <button onClick={onClose} className="btn-primary flex-1 min-h-[44px] py-2.5 text-sm touch-manipulation active:scale-[0.98]">
            {language === 'ru' ? 'Закрыть' : 'Yopish'}
          </button>
        </div>
      </div>
    </div>
  );
}
