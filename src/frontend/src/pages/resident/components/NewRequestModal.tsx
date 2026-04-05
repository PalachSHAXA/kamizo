import { useState } from 'react';
import { X, Calendar, MapPin, Send } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SERVICE_CATEGORIES, PRIORITY_LABELS, PRIORITY_LABELS_UZ } from '../../../types';
import type { RequestPriority } from '../../../types';
import { formatAddress } from '../../../utils/formatAddress';
import type { NewRequestModalProps } from './types';

// Time slots for scheduling
const TIME_SLOTS = [
  { value: '09:00-11:00', label: '09:00 - 11:00' },
  { value: '11:00-13:00', label: '11:00 - 13:00' },
  { value: '13:00-15:00', label: '13:00 - 15:00' },
  { value: '15:00-17:00', label: '15:00 - 17:00' },
  { value: '17:00-19:00', label: '17:00 - 19:00' },
];

// Trash removal types for selection
const TRASH_TYPES = [
  { value: 'construction', label: 'Строительный мусор', icon: '🧱', description: 'Кирпич, бетон, штукатурка' },
  { value: 'furniture', label: 'Старая мебель', icon: '🛋️', description: 'Диваны, шкафы, кровати' },
  { value: 'household', label: 'Бытовой мусор', icon: '🗑️', description: 'Обычные бытовые отходы' },
  { value: 'appliances', label: 'Бытовая техника', icon: '📺', description: 'Холодильники, стиральные машины' },
  { value: 'garden', label: 'Садовый мусор', icon: '🌿', description: 'Ветки, листья, трава' },
  { value: 'mixed', label: 'Смешанный', icon: '📦', description: 'Разные виды мусора' },
];

const TRASH_VOLUME = [
  { value: 'small', label: 'До 1 м³', description: '1-2 мешка, небольшие предметы', icon: '📦' },
  { value: 'medium', label: '1-3 м³', description: 'Несколько мешков, мелкая мебель', icon: '📦📦' },
  { value: 'large', label: '3-5 м³', description: 'Много мусора, крупная мебель', icon: '🚛' },
  { value: 'truck', label: 'Более 5 м³', description: 'Полная машина, капремонт', icon: '🚚' },
];

export function NewRequestModal({ category, user, onClose, onSubmit }: NewRequestModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<RequestPriority>('medium');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');

  // Trash removal-specific fields
  const [trashType, setTrashType] = useState('');
  const [trashVolume, setTrashVolume] = useState('');
  const [trashDetails, setTrashDetails] = useState('');
  const [trashDate, setTrashDate] = useState('');
  const [trashTime, setTrashTime] = useState('');
  const { language } = useLanguageStore();

  const categoryInfo = SERVICE_CATEGORIES.find(c => c.id === category);

  // Get minimum date (today)
  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  // Get maximum date (30 days from now)
  const getMaxDate = () => {
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    return maxDate.toISOString().split('T')[0];
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // For trash removal category, build structured title and description
    if (category === 'trash') {
      const typeLabel = TRASH_TYPES.find(t => t.value === trashType)?.label || trashType;
      const volumeLabel = TRASH_VOLUME.find(v => v.value === trashVolume)?.label || trashVolume;

      if (!trashType || !trashVolume || !trashDate || !trashTime) return;

      let finalTitle = `Вывоз мусора: ${typeLabel}`;
      let finalDescription = `Тип мусора: ${typeLabel}\nОбъём: ${volumeLabel}`;
      if (trashDetails.trim()) {
        finalDescription += `\n\nДополнительно: ${trashDetails.trim()}`;
      }

      onSubmit({
        title: finalTitle,
        description: finalDescription,
        category,
        priority,
        scheduledDate: trashDate,
        scheduledTime: trashTime
      });
      return;
    }

    // For other categories, use regular title/description
    if (!title.trim() || !description.trim()) return;
    onSubmit({
      title,
      description,
      category,
      priority,
      scheduledDate: scheduledDate || undefined,
      scheduledTime: scheduledTime || undefined
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[110] flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="w-full md:max-w-lg md:mx-4 bg-white rounded-t-[20px] md:rounded-[20px] flex flex-col overflow-hidden max-h-[88dvh] md:max-h-[90dvh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-2.5 pb-1 md:hidden">
          <div className="w-9 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{categoryInfo?.icon}</span>
            <div>
              <h2 className="text-[17px] font-bold text-gray-900">{language === 'ru' ? 'Новая заявка' : 'Yangi ariza'}</h2>
              <p className="text-[13px] text-gray-500 font-medium">{language === 'ru' ? categoryInfo?.name : categoryInfo?.nameUz}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-full transition-colors touch-manipulation"
          >
            <X className="w-[18px] h-[18px] text-gray-400" />
          </button>
        </div>

        {/* Scrollable form content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {category === 'trash' ? (
            <>
              {/* Trash Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Тип мусора' : 'Chiqindi turi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setTrashType(type.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all touch-manipulation ${
                        trashType === type.value
                          ? 'border-primary-500 bg-primary-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      <span className="text-xl">{type.icon}</span>
                      <div className="font-medium text-sm mt-1">{type.label}</div>
                      <div className="text-xs text-gray-500">{type.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trash Volume Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Объём мусора' : 'Chiqindi hajmi'} *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TRASH_VOLUME.map((vol) => (
                    <button
                      key={vol.value}
                      type="button"
                      onClick={() => setTrashVolume(vol.value)}
                      className={`p-3 rounded-xl border-2 text-left transition-all touch-manipulation ${
                        trashVolume === vol.value
                          ? 'border-primary-500 bg-primary-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      <span className="text-lg">{vol.icon}</span>
                      <div className="font-medium text-sm mt-1">{vol.label}</div>
                      <div className="text-xs text-gray-500">{vol.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Trash Date and Time */}
              <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
                <label className="block text-sm font-medium text-primary-700 mb-3 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {language === 'ru' ? 'Дата и время вывоза' : 'Olib ketish sanasi va vaqti'} *
                </label>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="trash-date" className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дата' : 'Sana'} <span className="text-red-500">*</span></label>
                    <input
                      id="trash-date"
                      type="date"
                      value={trashDate}
                      onChange={(e) => setTrashDate(e.target.value)}
                      min={getMinDate()}
                      max={getMaxDate()}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
                      aria-label={language === 'ru' ? 'Дата вывоза мусора' : 'Chiqindi olib ketish sanasi'}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="trash-time" className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'} <span className="text-red-500">*</span></label>
                    <select
                      id="trash-time"
                      value={trashTime}
                      onChange={(e) => setTrashTime(e.target.value)}
                      className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
                      aria-label={language === 'ru' ? 'Время вывоза мусора' : 'Chiqindi olib ketish vaqti'}
                      required
                    >
                      <option value="">{language === 'ru' ? 'Выберите время' : 'Vaqtni tanlang'}</option>
                      {TIME_SLOTS.map((slot) => (
                        <option key={slot.value} value={slot.value}>
                          {slot.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Details */}
              <div>
                <label htmlFor="trash-details" className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Дополнительная информация' : 'Qo\'shimcha ma\'lumot'}
                </label>
                <textarea
                  id="trash-details"
                  value={trashDetails}
                  onChange={(e) => setTrashDetails(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[80px] text-base resize-none"
                  placeholder={language === 'ru' ? 'Укажите детали: этаж, место складирования, особые условия...' : 'Tafsilotlarni ko\'rsating: qavat, saqlash joyi...'}
                  aria-label={language === 'ru' ? 'Дополнительная информация' : 'Qo\'shimcha ma\'lumot'}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="request-title" className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Заголовок' : 'Sarlavha'} *
                </label>
                <input
                  id="request-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                  placeholder={language === 'ru' ? 'Кратко опишите проблему' : 'Muammoni qisqacha tavsiflang'}
                  aria-label={language === 'ru' ? 'Заголовок заявки' : 'Ariza sarlavhasi'}
                  required
                />
              </div>

              <div>
                <label htmlFor="request-description" className="block text-sm font-medium text-gray-700 mb-2">
                  {language === 'ru' ? 'Описание' : 'Tavsif'} *
                </label>
                <textarea
                  id="request-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-primary-500 focus:border-transparent min-h-[90px] text-sm resize-none"
                  placeholder={language === 'ru' ? 'Подробно опишите проблему' : 'Muammoni batafsil tavsiflang'}
                  aria-label={language === 'ru' ? 'Описание проблемы' : 'Muammo tavsifi'}
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {language === 'ru' ? 'Приоритет' : 'Muhimlik'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['low', 'medium', 'high', 'urgent'] as RequestPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={`py-3 px-4 rounded-xl text-sm font-semibold transition-all touch-manipulation ${
                    priority === p
                      ? p === 'urgent' ? 'bg-red-500 text-white shadow-md' :
                        p === 'high' ? 'bg-orange-500 text-white shadow-md' :
                        p === 'medium' ? 'bg-primary-500 text-white shadow-md' :
                        'bg-gray-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 active:bg-gray-200'
                  }`}
                >
                  {language === 'ru' ? PRIORITY_LABELS[p] : PRIORITY_LABELS_UZ[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Scheduled Date and Time - only for non-trash categories */}
          {category !== 'trash' && (
            <div className="bg-primary-50 rounded-xl p-4 border border-primary-200">
              <label className="block text-sm font-medium text-primary-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {language === 'ru' ? 'Желаемое время (необязательно)' : 'Istalgan vaqt (ixtiyoriy)'}
              </label>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Дата' : 'Sana'}</label>
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={getMinDate()}
                    max={getMaxDate()}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{language === 'ru' ? 'Время' : 'Vaqt'}</label>
                  <select
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 bg-white text-sm"
                    disabled={!scheduledDate}
                  >
                    <option value="">{language === 'ru' ? 'Любое' : 'Istalgan'}</option>
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {scheduledDate && (
                <p className="text-xs text-primary-600 mt-2">
                  {language === 'ru' ? 'Мы постараемся выполнить заявку в указанное время' : 'Arizani belgilangan vaqtda bajarishga harakat qilamiz'}
                </p>
              )}
            </div>
          )}

          {/* Address info */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Адрес' : 'Manzil'}</div>
              <div className="font-medium text-sm">{formatAddress(user?.address, user?.apartment)}</div>
            </div>
          </div>
        </form>

        {/* Fixed footer button */}
        <div className="px-5 py-4 border-t border-gray-100 bg-white" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))' }}>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim())}
            className={`w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all touch-manipulation ${
              (category === 'trash' ? (!trashType || !trashVolume || !trashDate || !trashTime) : (!title.trim() || !description.trim()))
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-primary-500 text-white active:scale-[0.98] shadow-lg shadow-primary-500/25'
            }`}
          >
            <Send className="w-[18px] h-[18px]" />
            {language === 'ru' ? 'Отправить заявку' : 'Arizani yuborish'}
          </button>
        </div>
      </div>
    </div>
  );
}
