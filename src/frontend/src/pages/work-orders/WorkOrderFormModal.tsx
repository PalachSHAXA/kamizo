// Sprint 26: extracted from WorkOrdersPage. Modal to create or edit
// a work order — title, type, priority, building/apartment, assigned
// executor, scheduled date/time, estimated duration, notes.

import { useState } from 'react';
import { X } from 'lucide-react';
import { useCRMStore } from '../../stores/crmStore';
import { useExecutorStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import type { WorkOrder } from './types';

export function WorkOrderFormModal({
  onClose,
  onSave
}: {
  onClose: () => void;
  onSave: (order: Omit<WorkOrder, 'id' | 'number' | 'status' | 'createdAt' | 'updatedAt'>) => void;
}) {
  const { language } = useLanguageStore();
  const { buildings, apartments } = useCRMStore();
  const executors = useExecutorStore(s => s.executors);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'planned' as WorkOrderType,
    priority: 'medium' as WorkOrderPriority,
    buildingId: '',
    apartmentId: '',
    assignedTo: '',
    scheduledDate: '',
    scheduledTime: '',
    estimatedDuration: 60,
  });

  const filteredApartments = apartments.filter(a => a.buildingId === formData.buildingId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: formData.title,
      description: formData.description,
      type: formData.type,
      priority: formData.priority,
      buildingId: formData.buildingId,
      apartmentId: formData.apartmentId || undefined,
      assignedTo: formData.assignedTo || undefined,
      scheduledDate: formData.scheduledDate || undefined,
      scheduledTime: formData.scheduledTime || undefined,
      estimatedDuration: formData.estimatedDuration,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4 z-[110]" onClick={onClose}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-xl max-h-[90dvh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base sm:text-lg md:text-xl font-bold text-gray-900">{language === 'ru' ? 'Новый наряд' : 'Yangi buyurtma'}</h2>
            <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation" aria-label="Закрыть">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Название *' : 'Nomi *'}</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={language === 'ru' ? 'Краткое описание работы' : 'Ishning qisqacha tavsifi'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Описание' : 'Tavsif'}</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder={language === 'ru' ? 'Подробное описание работ' : 'Ishlarning batafsil tavsifi'}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Тип работы' : 'Ish turi'}</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as WorkOrderType })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="planned">{language === 'ru' ? 'Плановый' : 'Rejalashtirilgan'}</option>
                <option value="preventive">{language === 'ru' ? 'Профилактика' : 'Profilaktika'}</option>
                <option value="emergency">{language === 'ru' ? 'Аварийный' : 'Favqulodda'}</option>
                <option value="seasonal">{language === 'ru' ? 'Сезонный' : 'Mavsumiy'}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Приоритет' : 'Ustuvorlik'}</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as WorkOrderPriority })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="low">{language === 'ru' ? 'Низкий' : 'Past'}</option>
                <option value="medium">{language === 'ru' ? 'Средний' : 'O\'rta'}</option>
                <option value="high">{language === 'ru' ? 'Высокий' : 'Yuqori'}</option>
                <option value="urgent">{language === 'ru' ? 'Срочный' : 'Shoshilinch'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Дом *' : 'Uy *'}</label>
              <select
                required
                value={formData.buildingId}
                onChange={(e) => setFormData({ ...formData, buildingId: e.target.value, apartmentId: '' })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">{language === 'ru' ? 'Выберите дом' : 'Binoni tanlang'}</option>
                {buildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Квартира' : 'Kvartira'}</label>
              <select
                value={formData.apartmentId}
                onChange={(e) => setFormData({ ...formData, apartmentId: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                disabled={!formData.buildingId}
              >
                <option value="">{language === 'ru' ? 'Общедомовые работы' : 'Umumuy ishlar'}</option>
                {filteredApartments.map(a => (
                  <option key={a.id} value={a.id}>{language === 'ru' ? 'Кв.' : 'Kv.'} {a.number}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Исполнитель' : 'Ijrochi'}</label>
            <select
              value={formData.assignedTo}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{language === 'ru' ? 'Не назначен' : 'Tayinlanmagan'}</option>
              {executors.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Дата' : 'Sana'}</label>
              <input
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'}</label>
              <input
                type="time"
                value={formData.scheduledTime}
                onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{language === 'ru' ? 'Длительность (мин)' : 'Davomiyligi (daq)'}</label>
              <input
                type="number"
                min="15"
                step="15"
                value={formData.estimatedDuration}
                onChange={(e) => setFormData({ ...formData, estimatedDuration: parseInt(e.target.value) || 60 })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {language === 'ru' ? 'Отмена' : 'Bekor qilish'}
            </button>
            <button type="submit" className="btn-primary">
              {language === 'ru' ? 'Создать' : 'Yaratish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
