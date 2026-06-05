// Sprint 21: extracted from ResidentGuestAccessPage. The full form
// for creating a new guest pass — visitor type, access type, duration,
// custom datetime range, vehicle plate field, contact details. Calls
// back up with the newly-created code so the parent can show the
// resulting QR.

import { useState } from 'react';
import {
  X, ArrowLeft, ChevronRight, Calendar, Clock, Car, Package, User, Users,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useGuestAccessStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import {
  VISITOR_TYPE_LABELS, ACCESS_TYPE_LABELS,
  type GuestAccessCode, type VisitorType, type AccessType,
} from '../../types';

export function CreatePassForm({
  onClose,
  onCreated,
  initialVisitorType,
  initialAccessType,
}: {
  onClose: () => void;
  onCreated: (code: GuestAccessCode) => void;
  initialVisitorType?: VisitorType;
  initialAccessType?: AccessType;
}) {
  const { user } = useAuthStore();
  const createGuestAccessCode = useGuestAccessStore(s => s.createGuestAccessCode);
  const { language } = useLanguageStore();

  // Quick-create tiles pre-fill both visitor and access type — skip wizard
  // straight to step 3 (details) when both are passed in.
  const skipToDetails = !!initialVisitorType && !!initialAccessType;
  const [step, setStep] = useState(skipToDetails ? 3 : 1);
  const [visitorType, setVisitorType] = useState<VisitorType | null>(initialVisitorType ?? null);
  const [accessType, setAccessType] = useState<AccessType | null>(initialAccessType ?? null);
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [hasVehicle, setHasVehicle] = useState(initialVisitorType === 'taxi');
  const [visitorVehiclePlate, setVisitorVehiclePlate] = useState('');
  const [customDate, setCustomDate] = useState('');
  const [notes, setNotes] = useState('');

  const visitorTypes: { type: VisitorType; icon: React.ReactNode }[] = [
    { type: 'courier', icon: <Package className="w-8 h-8" /> },
    { type: 'guest', icon: <Users className="w-8 h-8" /> },
    { type: 'taxi', icon: <Car className="w-8 h-8" /> },
    { type: 'other', icon: <User className="w-8 h-8" /> },
  ];

  const accessTypes: AccessType[] = ['single_use', 'day', 'week', 'custom'];

  const [isCreating, setIsCreating] = useState(false);

  const [createError, setCreateError] = useState<string | null>(null);

  // Name is required for person-type visitors — without it the guard has
  // nothing to match against at the gate. Couriers/taxis are identified by
  // package/plate so name stays optional.
  const needsVisitorName = visitorType === 'guest' || visitorType === 'other';
  const canSubmit =
    !!visitorType &&
    !!accessType &&
    !isCreating &&
    (!needsVisitorName || visitorName.trim().length >= 2) &&
    (accessType !== 'custom' || !!customDate);

  const handleCreate = async () => {
    if (!visitorType || !accessType || !user || isCreating) {
      return;
    }

    if (needsVisitorName && visitorName.trim().length < 2) {
      setCreateError(language === 'ru'
        ? 'Укажите имя гостя — охраннику нужно кого-то ждать на входе'
        : 'Mehmon ismini kiriting — qo\'riqchi kimni kutishini bilishi kerak');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      let validUntil: string | undefined;
      if (accessType === 'custom' && customDate) {
        const parsed = new Date(customDate);
        if (isNaN(parsed.getTime())) {
          setCreateError(language === 'ru' ? 'Некорректная дата' : 'Noto\'g\'ri sana');
          setIsCreating(false);
          return;
        }
        // Prevent dates too far in the future (max 1 year)
        const maxDate = new Date();
        maxDate.setFullYear(maxDate.getFullYear() + 1);
        if (parsed > maxDate) {
          setCreateError(language === 'ru' ? 'Дата не может быть более 1 года от текущей' : 'Sana joriy sanadan 1 yildan oshmasligi kerak');
          setIsCreating(false);
          return;
        }
        if (parsed <= new Date()) {
          setCreateError(language === 'ru' ? 'Дата должна быть в будущем' : 'Sana kelajakda bo\'lishi kerak');
          setIsCreating(false);
          return;
        }
        validUntil = parsed.toISOString();
      }

      const code = await createGuestAccessCode({
        residentId: user.id,
        residentName: user.name,
        residentPhone: user.phone || 'Не указан',
        residentApartment: user.apartment || '',
        residentAddress: user.address || '',
        visitorType,
        visitorName: visitorName || undefined,
        visitorPhone: visitorPhone || undefined,
        visitorVehiclePlate: visitorVehiclePlate || undefined,
        accessType,
        validUntil,
        notes: notes || undefined,
      });

      if (code) {
        onCreated(code);
      } else {
        setCreateError(language === 'ru' ? 'Не удалось создать пропуск' : 'Ruxsatnoma yaratib bo\'lmadi');
      }
    } catch (err: unknown) {
      console.error('Failed to create pass:', err);
      setCreateError((err instanceof Error ? err.message : null) || (language === 'ru' ? 'Ошибка создания' : 'Yaratishda xatolik'));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl touch-manipulation" aria-label="Назад">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-base sm:text-lg font-bold">
              {language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-xl touch-manipulation" aria-label="Закрыть">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex-1 flex items-center">
                <div className={`w-full h-1.5 rounded-full ${s <= step ? 'bg-primary-500' : 'bg-gray-200'}`} />
              </div>
            ))}
          </div>
          <div className="text-xs text-gray-500 mt-2 text-center">
            {language === 'ru' ? `Шаг ${step} из 3` : `${step}-qadam 3 dan`}
          </div>
        </div>

        <div className="p-4">
          {/* Step 1: Visitor Type */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'Кого ожидаете?' : 'Kimni kutayapsiz?'}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {visitorTypes.map(({ type, icon }) => {
                  const label = VISITOR_TYPE_LABELS[type];
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setVisitorType(type);
                        // Reset vehicle fields when changing visitor type
                        setHasVehicle(type === 'taxi');
                        setVisitorVehiclePlate('');
                        setStep(2);
                      }}
                      className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${
                        visitorType === type
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={visitorType === type ? 'text-primary-600' : 'text-gray-600'}>
                        {icon}
                      </div>
                      <span className="font-medium text-sm">
                        {language === 'ru' ? label.label : label.labelUz}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Access Type */}
          {step === 2 && (
            <div className="space-y-3">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'На какой срок?' : 'Qancha muddatga?'}
              </h3>
              <div className="space-y-2">
                {accessTypes.map((type) => {
                  const label = ACCESS_TYPE_LABELS[type];
                  // Compute concrete end time for display
                  const now = new Date();
                  let endTime = '';
                  if (type === 'single_use') {
                    const t = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    endTime = language === 'ru' ? `до ${t.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : `${t.toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} gacha`;
                  } else if (type === 'day') {
                    const t = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                    endTime = language === 'ru' ? `до ${t.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : `${t.toLocaleString('uz-UZ', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} gacha`;
                  } else if (type === 'week') {
                    const t = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                    endTime = language === 'ru' ? `до ${t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}` : `${t.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' })} gacha`;
                  }
                  return (
                    <button
                      key={type}
                      onClick={() => {
                        setAccessType(type);
                        setStep(3);
                      }}
                      className={`w-full px-4 py-3 rounded-xl border-2 flex items-center gap-3 transition-all text-left ${
                        accessType === type
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        accessType === type ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {type === 'single_use' && <span className="text-base font-bold">1</span>}
                        {type === 'day' && <Clock className="w-4 h-4" />}
                        {type === 'week' && <Calendar className="w-4 h-4" />}
                        {type === 'custom' && <Calendar className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">
                          {language === 'ru' ? label.label : label.labelUz}
                        </div>
                        <div className="text-xs text-gray-500">
                          {endTime || (language === 'ru' ? label.description : label.descriptionUz)}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 3: Details */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="font-medium text-center">
                {language === 'ru' ? 'Дополнительно' : 'Qo\'shimcha'}
              </h3>

              {accessType === 'custom' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Действует до *' : 'Gacha amal qiladi *'}
                  </label>
                  <input
                    type="datetime-local"
                    value={customDate}
                    onChange={(e) => { setCustomDate(e.target.value); setCreateError(null); }}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    min={new Date().toISOString().slice(0, 16)}
                    max={(() => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 16); })()}
                  />
                </div>
              )}

              {(visitorType === 'guest' || visitorType === 'other') && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Имя гостя' : 'Mehmon ismi'}
                      {needsVisitorName && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={visitorName}
                      onChange={(e) => setVisitorName(e.target.value)}
                      placeholder={language === 'ru' ? 'Иван Иванов' : 'Ism Familiya'}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {language === 'ru' ? 'Телефон гостя' : 'Mehmon telefoni'}
                    </label>
                    <input
                      type="tel" inputMode="tel" autoComplete="tel"
                      value={visitorPhone}
                      onChange={(e) => setVisitorPhone(e.target.value)}
                      placeholder="+998 90 123 45 67"
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0"
                    />
                  </div>
                </>
              )}

              {/* Vehicle: taxi always shows plate, others show toggle */}
              {visitorType === 'taxi' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {language === 'ru' ? 'Гос. номер такси' : 'Taksi davlat raqami'}
                  </label>
                  <input
                    type="text"
                    value={visitorVehiclePlate}
                    onChange={(e) => setVisitorVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="01 A 123 BC"
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 font-mono tracking-widest"
                  />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Car className="w-4 h-4 text-gray-500" />
                      <span className="text-sm font-medium text-gray-700">
                        {language === 'ru' ? 'Приедет на авто?' : 'Avtomobil bilan keladimi?'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setHasVehicle(!hasVehicle); if (hasVehicle) setVisitorVehiclePlate(''); }}
                      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${hasVehicle ? 'bg-primary-500' : 'bg-gray-300'}`}
                    >
                      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${hasVehicle ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                  {hasVehicle && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {language === 'ru' ? 'Гос. номер автомобиля' : 'Davlat raqami'}
                      </label>
                      <input
                        type="text"
                        value={visitorVehiclePlate}
                        onChange={(e) => setVisitorVehiclePlate(e.target.value.toUpperCase())}
                        placeholder="01 A 123 BC"
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 font-mono tracking-widest"
                      />
                    </div>
                  )}
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {language === 'ru' ? 'Примечание' : 'Izoh'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={language === 'ru' ? 'Опционально...' : 'Ixtiyoriy...'}
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary-500 focus:ring-0 resize-none"
                />
              </div>

              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm text-center">
                  {createError}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={!canSubmit}
                className="w-full py-4 min-h-[44px] bg-primary-500 hover:bg-primary-600 active:bg-primary-700 disabled:bg-gray-300 text-gray-900 font-bold rounded-lg sm:rounded-xl transition-colors touch-manipulation"
              >
                {isCreating
                  ? (language === 'ru' ? 'Создание...' : 'Yaratilmoqda...')
                  : (language === 'ru' ? 'Создать пропуск' : 'Ruxsatnoma yaratish')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

