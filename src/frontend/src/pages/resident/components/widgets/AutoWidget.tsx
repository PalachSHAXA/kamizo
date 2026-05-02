import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, MapPin, Plus, Search, Phone, X, AlertCircle } from 'lucide-react';
import { useVehicleStore } from '../../../../stores/dataStore';
import { useAuthStore } from '../../../../stores/authStore';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * AutoWidget — primary car card for residents.
 *
 * Shows the resident's main car (brand, plate, parking spot). The previous
 * version had a "Найти" button that just pulsed; useless on the home screen
 * because the car already belongs to the resident — there's nothing to find.
 *
 * Replaced with a real ЖКХ pain-point: "Кто загородил?" — searches the
 * tenant's vehicle registry by license plate to find the owner of a car
 * that's blocking yours in the courtyard, and offers to call them.
 */
export function AutoWidget() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const vehiclesData = useVehicleStore(s => s.vehicles);

  const myVehicles = vehiclesData.filter(v => v.ownerId === user?.id);
  const primary = myVehicles[0];

  const [searchOpen, setSearchOpen] = useState(false);
  const [plateQuery, setPlateQuery] = useState('');

  if (!primary) {
    return (
      <button
        onClick={() => navigate('/vehicles')}
        className="w-full bg-white rounded-[22px] p-[16px_18px] flex items-center gap-3 shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04] active:scale-[0.99] transition-transform touch-manipulation text-left"
      >
        <div className="w-[42px] h-[42px] rounded-[13px] bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
          <Car className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-gray-900">
            {language === 'ru' ? 'Добавить автомобиль' : 'Avtomobil qo\'shish'}
          </div>
          <div className="text-[12px] text-gray-400 mt-0.5">
            {language === 'ru' ? 'Для проезда на территорию' : 'Hududga kirish uchun'}
          </div>
        </div>
        <Plus className="w-5 h-5 text-gray-300 shrink-0" />
      </button>
    );
  }

  // Plate search: matches against any vehicle in the tenant's registry
  // (excluding the user's own cars). Returns the first match — courtyard
  // collisions are 1:1 in practice. If no match, suggest leaving a notice
  // via the chat with УК.
  const otherVehicles = vehiclesData.filter(v => v.ownerId !== user?.id);
  const trimmedQuery = plateQuery.trim().toUpperCase().replace(/\s+/g, '');
  const match = trimmedQuery.length >= 3
    ? otherVehicles.find(v => (v.plateNumber || '').toUpperCase().replace(/\s+/g, '').includes(trimmedQuery))
    : null;

  return (
    <>
      <div className="bg-white rounded-[22px] p-[16px_18px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04]">
        <button
          onClick={() => navigate('/vehicles')}
          className="w-full flex items-center gap-3 text-left"
        >
          <div className="w-[44px] h-[44px] rounded-[14px] bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shrink-0 shadow-[0_4px_12px_rgba(20,184,166,0.25)]">
            <Car className="w-[22px] h-[22px] text-white" strokeWidth={2.2} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-teal-600">
              {language === 'ru' ? 'Моё авто' : 'Mening avtomobilim'}
            </div>
            <div className="text-[15px] font-bold text-gray-900 truncate">
              {primary.brand} {primary.model}
            </div>
            <div className="text-[12px] text-gray-500 font-mono tracking-wider mt-0.5">
              {primary.plateNumber}
              {primary.parkingSpot && (
                <span className="ml-2 text-gray-400 font-sans">· 🅿️ {primary.parkingSpot}</span>
              )}
            </div>
          </div>
        </button>

        {/* Action: search blocker */}
        <button
          onClick={(e) => { e.stopPropagation(); setSearchOpen(true); }}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-[12px] bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 active:scale-[0.98] transition-transform touch-manipulation"
        >
          <Search className="w-4 h-4 text-amber-600" strokeWidth={2.2} />
          <span className="text-[13px] font-bold text-amber-700">
            {language === 'ru' ? 'Кто загородил моё авто?' : 'Kim mening avtomobilimni to\'sib qo\'ydi?'}
          </span>
        </button>

        {myVehicles.length > 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate('/vehicles'); }}
            className="mt-2 w-full text-center text-[12px] font-medium text-gray-400 active:text-gray-600 transition-colors"
          >
            {language === 'ru' ? `Ещё ${myVehicles.length - 1} авто →` : `Yana ${myVehicles.length - 1} avto →`}
          </button>
        )}
      </div>

      {/* Plate-search bottom sheet */}
      {searchOpen && (
        <div className="fixed inset-0 z-[120] flex items-end md:items-center md:justify-center" onClick={() => setSearchOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full md:max-w-md md:mx-4 bg-white rounded-t-[24px] md:rounded-[24px] flex flex-col overflow-hidden max-h-[85dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>
            <div className="flex items-start justify-between px-5 pt-3 pb-2">
              <div>
                <h3 className="text-[18px] font-extrabold text-gray-900">
                  {language === 'ru' ? 'Поиск владельца' : 'Egasini qidirish'}
                </h3>
                <p className="text-[12px] text-gray-500 mt-0.5">
                  {language === 'ru'
                    ? 'Введите номер авто, перегородившего ваш выезд'
                    : 'Chiqishingizni to\'sgan avtomobil raqamini kiriting'}
                </p>
              </div>
              <button
                onClick={() => setSearchOpen(false)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 shrink-0"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="px-5 py-3">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  type="text"
                  value={plateQuery}
                  onChange={(e) => setPlateQuery(e.target.value)}
                  placeholder={language === 'ru' ? 'Например 01A123BC' : 'Masalan 01A123BC'}
                  className="w-full pl-10 pr-3 py-3 rounded-[14px] border-2 border-gray-100 focus:border-amber-400 bg-gray-50 focus:bg-white text-[15px] font-mono tracking-wider uppercase outline-none transition-colors"
                  autoFocus
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex-1 overflow-y-auto">
              {trimmedQuery.length < 3 ? (
                <div className="rounded-[14px] bg-gray-50 p-4 text-center">
                  <Car className="w-8 h-8 text-gray-300 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-[12px] text-gray-400">
                    {language === 'ru' ? 'Минимум 3 символа' : 'Kamida 3 ta belgi'}
                  </p>
                </div>
              ) : match ? (
                <div className="rounded-[14px] bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-11 h-11 rounded-[12px] bg-emerald-500 flex items-center justify-center text-white font-bold text-[14px]">
                      {(match.ownerName || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-bold text-gray-900 truncate">{match.ownerName || (language === 'ru' ? 'Жилец' : 'Aholi')}</div>
                      <div className="text-[11px] text-gray-500">
                        {match.brand} {match.model} · <span className="font-mono">{match.plateNumber}</span>
                      </div>
                    </div>
                  </div>
                  {match.ownerPhone ? (
                    <a
                      href={`tel:${match.ownerPhone}`}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] bg-emerald-500 active:scale-[0.98] transition-transform touch-manipulation"
                    >
                      <Phone className="w-4 h-4 text-white" strokeWidth={2.2} />
                      <span className="text-[14px] font-bold text-white">{match.ownerPhone}</span>
                    </a>
                  ) : (
                    <div className="text-[12px] text-gray-500 text-center py-2">
                      {language === 'ru' ? 'Контакт не указан' : 'Kontakt ko\'rsatilmagan'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[14px] bg-amber-50 border border-amber-200 p-4">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13px] font-bold text-amber-800 mb-1">
                        {language === 'ru' ? 'Не нашли владельца' : 'Egasi topilmadi'}
                      </div>
                      <div className="text-[12px] text-amber-700 leading-snug">
                        {language === 'ru'
                          ? 'Авто не зарегистрировано в системе. Можно сообщить охране через чат с УК.'
                          : 'Avto tizimda ro\'yxatdan o\'tmagan. Qo\'riqchiga UK chati orqali xabar bering.'}
                      </div>
                      <button
                        onClick={() => { setSearchOpen(false); navigate('/chat'); }}
                        className="mt-2 text-[12px] font-bold text-amber-600 underline-offset-2 hover:underline"
                      >
                        {language === 'ru' ? 'Написать в УК →' : 'UK ga yozish →'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
