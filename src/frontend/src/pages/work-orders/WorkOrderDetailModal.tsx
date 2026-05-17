// Sprint 26: extracted from WorkOrdersPage. Modal that shows full
// detail of one work order (status timeline, building / apartment,
// assigned executor, materials, checklist) with status-change
// actions.

import { Check, X } from 'lucide-react';
import { StatusBadge } from '../../components/common';
import type { StatusTone } from '../../theme';
import { useCRMStore } from '../../stores/crmStore';
import { useExecutorStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import type { WorkOrder, WorkOrderStatus } from './types';

export function WorkOrderDetailModal({
  order,
  onClose,
  onUpdateStatus
}: {
  order: WorkOrder;
  onClose: () => void;
  onUpdateStatus: (status: WorkOrderStatus) => void;
}) {
  const { language } = useLanguageStore();
  const { buildings, apartments } = useCRMStore();
  const executors = useExecutorStore(s => s.executors);

  const building = buildings.find(b => b.id === order.buildingId);
  const apartment = apartments.find(a => a.id === order.apartmentId);
  const executor = executors.find(e => e.id === order.assignedTo);

  const getStatusTone = (status: WorkOrderStatus): StatusTone => {
    switch (status) {
      case 'pending': return 'expired';
      case 'scheduled': return 'info';
      case 'in_progress': return 'pending';
      case 'completed': return 'active';
      case 'cancelled': return 'critical';
    }
  };

  const getStatusLabel = (status: WorkOrderStatus) => {
    switch (status) {
      case 'pending': return language === 'ru' ? 'Ожидает' : 'Kutilmoqda';
      case 'scheduled': return language === 'ru' ? 'Запланирован' : 'Rejalashtirilgan';
      case 'in_progress': return language === 'ru' ? 'Выполняется' : 'Bajarilmoqda';
      case 'completed': return language === 'ru' ? 'Завершен' : 'Yakunlangan';
      case 'cancelled': return language === 'ru' ? 'Отменен' : 'Bekor qilingan';
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('ru-RU');
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return language === 'ru' ? `${hours}ч ${mins}м` : `${hours}s ${mins}d`;
    }
    return language === 'ru' ? `${mins}м` : `${mins}d`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[110]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-2xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-gray-500">{order.number}</span>
                <StatusBadge status={getStatusTone(order.status)} size="sm">
                  {getStatusLabel(order.status)}
                </StatusBadge>
              </div>
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{order.title}</h2>
            </div>
            <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation" aria-label="Закрыть">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Description */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">{language === 'ru' ? 'Описание' : 'Tavsif'}</h3>
            <p className="text-gray-600">{order.description}</p>
          </div>

          {/* Details Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Объект' : 'Obyekt'}</p>
              <p className="font-medium">{building?.name || '-'}</p>
              {apartment && <p className="text-sm text-gray-500">{language === 'ru' ? 'Кв.' : 'Kv.'} {apartment.number}</p>}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</p>
              <p className="font-medium">{executor?.name || (language === 'ru' ? 'Не назначен' : 'Tayinlanmagan')}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Запланировано' : 'Rejalashtirilgan'}</p>
              <p className="font-medium">{order.scheduledDate ? `${order.scheduledDate} ${order.scheduledTime || ''}` : '-'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-500 mb-1">{language === 'ru' ? 'Длительность' : 'Davomiyligi'}</p>
              <p className="font-medium">{formatDuration(order.estimatedDuration)}</p>
              {order.actualDuration && (
                <p className="text-sm text-gray-500">{language === 'ru' ? 'Факт:' : 'Haqiqiy:'} {formatDuration(order.actualDuration)}</p>
              )}
            </div>
          </div>

          {/* Timeline */}
          {(order.startedAt || order.completedAt) && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{language === 'ru' ? 'Хронология' : 'Tarix'}</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-gray-400 rounded-full" />
                  <span className="text-sm text-gray-600">{language === 'ru' ? 'Создан:' : 'Yaratilgan:'} {formatDate(order.createdAt)}</span>
                </div>
                {order.startedAt && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-400 rounded-full" />
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Начат:' : 'Boshlangan:'} {formatDate(order.startedAt)}</span>
                  </div>
                )}
                {order.completedAt && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-green-400 rounded-full" />
                    <span className="text-sm text-gray-600">{language === 'ru' ? 'Завершен:' : 'Yakunlangan:'} {formatDate(order.completedAt)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Checklist */}
          {order.checklist && order.checklist.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{language === 'ru' ? 'Чек-лист' : 'Nazorat ro\'yxati'}</h3>
              <div className="space-y-2">
                {order.checklist.map((item, index) => (
                  <div key={index} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                    <div className={`w-5 h-5 rounded flex items-center justify-center ${
                      item.completed ? 'bg-green-500 text-white' : 'bg-gray-200'
                    }`}>
                      {item.completed && <Check className="w-3 h-3" />}
                    </div>
                    <span className={item.completed ? 'text-gray-500 line-through' : 'text-gray-700'}>
                      {item.item}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials */}
          {order.materials && order.materials.length > 0 && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">{language === 'ru' ? 'Материалы' : 'Materiallar'}</h3>
              <div className="bg-gray-50 rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">{language === 'ru' ? 'Наименование' : 'Nomi'}</th>
                      <th className="px-4 py-2 text-right text-gray-600">{language === 'ru' ? 'Количество' : 'Miqdori'}</th>
                      <th className="px-4 py-2 text-left text-gray-600">{language === 'ru' ? 'Ед.' : 'O\'lch.'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.materials.map((material, index) => (
                      <tr key={index} className="border-t border-gray-100">
                        <td className="px-4 py-2">{material.name}</td>
                        <td className="px-4 py-2 text-right">{material.quantity}</td>
                        <td className="px-4 py-2">{material.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            {order.status === 'pending' && (
              <button
                onClick={() => onUpdateStatus('scheduled')}
                className="btn-primary"
              >
                {language === 'ru' ? 'Запланировать' : 'Rejalashtirish'}
              </button>
            )}
            {order.status === 'scheduled' && (
              <button
                onClick={() => onUpdateStatus('in_progress')}
                className="btn-primary"
              >
                {language === 'ru' ? 'Начать выполнение' : 'Bajarishni boshlash'}
              </button>
            )}
            {order.status === 'in_progress' && (
              <button
                onClick={() => onUpdateStatus('completed')}
                className="btn-primary"
              >
                {language === 'ru' ? 'Завершить' : 'Yakunlash'}
              </button>
            )}
            {order.status !== 'completed' && order.status !== 'cancelled' && (
              <button
                onClick={() => onUpdateStatus('cancelled')}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                {language === 'ru' ? 'Отменить' : 'Bekor qilish'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
