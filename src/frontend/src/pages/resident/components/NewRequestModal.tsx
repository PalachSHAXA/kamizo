import { useRef, useState } from 'react';
import { Calendar, MapPin, Send, Camera, X as XIcon, ImagePlus } from 'lucide-react';
import { useLanguageStore } from '../../../stores/languageStore';
import { SERVICE_CATEGORIES, PRIORITY_LABELS, PRIORITY_LABELS_UZ } from '../../../types';
import type { RequestPriority } from '../../../types';
import { formatAddress } from '../../../utils/formatAddress';
import { Sheet } from '../../../components/common';
import { useModalPresence } from '../../../stores/modalStore';
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
  useModalPresence();
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
  const [photos, setPhotos] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { language } = useLanguageStore();

  // Photo handling: read into data-URLs, cap at 5 photos, ~3MB each before
  // base64 inflation. Persisted as JSON string in requests.photos column.
  // Compress is light — full image fidelity isn't needed for ЖКХ context.
  const MAX_PHOTOS = 5;
  const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3MB

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setPhotoError(language === 'ru' ? `Максимум ${MAX_PHOTOS} фото` : `Maksimum ${MAX_PHOTOS} ta rasm`);
      return;
    }
    const accepted = files.slice(0, remaining);
    const newPhotos: string[] = [];
    for (const file of accepted) {
      if (!file.type.startsWith('image/')) {
        setPhotoError(language === 'ru' ? 'Только изображения' : 'Faqat rasmlar');
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setPhotoError(language === 'ru' ? 'Файл больше 3 МБ' : 'Fayl 3 MB dan katta');
        continue;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }).catch(() => null);
      if (dataUrl) newPhotos.push(dataUrl);
    }
    setPhotos((p) => [...p, ...newPhotos]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, idx) => idx !== i));

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

      const finalTitle = `Вывоз мусора: ${typeLabel}`;
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
        scheduledTime: trashTime,
        photos: photos.length > 0 ? photos : undefined,
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
      scheduledTime: scheduledTime || undefined,
      photos: photos.length > 0 ? photos : undefined,
    });
  };

  const title_ = language === 'ru' ? 'Новая заявка' : 'Yangi ariza';
  const subtitle_ = language === 'ru' ? categoryInfo?.name : categoryInfo?.nameUz;
  const isTrashFlow = category === 'trash';
  const canSubmit = isTrashFlow
    ? !!(trashType && trashVolume && trashDate && trashTime)
    : !!(title.trim() && description.trim());

  return (
    <Sheet
      isOpen
      onClose={onClose}
      title={title_}
      subtitle={subtitle_ ? `${categoryInfo?.icon ?? ''} ${subtitle_}` : undefined}
      size="lg"
      footer={
        <button
          type="submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`w-full py-3.5 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all touch-manipulation min-h-[48px] ${
            canSubmit
              ? 'bg-primary-500 text-white active:scale-[0.98] shadow-lg shadow-primary-500/25'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          <Send className="w-[18px] h-[18px]" />
          {language === 'ru' ? 'Отправить заявку' : 'Arizani yuborish'}
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* Photos — visible to executor and management */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-gray-500" />
              {language === 'ru' ? 'Фото проблемы' : 'Muammo rasmlari'}
              <span className="ml-auto text-xs font-normal text-gray-400">
                {photos.length}/{MAX_PHOTOS}
              </span>
            </label>
            <p className="text-xs text-gray-500 -mt-0.5 mb-2 leading-snug">
              {language === 'ru'
                ? 'Прикрепите фото — мастер и управляющая компания увидят их вместе с заявкой'
                : 'Rasm biriktiring — usta va boshqaruv kompaniyasi arizangiz bilan birga ko\'radi'}
            </p>

            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2 mb-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 backdrop-blur flex items-center justify-center active:scale-90 transition-transform touch-manipulation"
                      aria-label={language === 'ru' ? 'Удалить фото' : 'Rasmni o\'chirish'}
                    >
                      <XIcon className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 active:border-primary-300 active:bg-primary-50 transition-colors touch-manipulation flex items-center justify-center gap-2"
              >
                <ImagePlus className="w-5 h-5 text-gray-400" strokeWidth={2} />
                <span className="text-sm font-semibold text-gray-500">
                  {language === 'ru' ? 'Добавить фото' : 'Rasm qo\'shish'}
                </span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
              aria-label={language === 'ru' ? 'Выбрать фото' : 'Rasm tanlang'}
            />
            {photoError && (
              <div className="text-xs text-red-500 mt-1.5">{photoError}</div>
            )}
          </div>

          {/* Address info */}
          <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
            <MapPin className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-xs text-gray-500">{language === 'ru' ? 'Адрес' : 'Manzil'}</div>
              <div className="font-medium text-sm">{formatAddress(user?.address, user?.apartment)}</div>
            </div>
          </div>
      </form>
    </Sheet>
  );
}
