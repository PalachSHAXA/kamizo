import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Car, MapPin, Plus, ChevronRight } from 'lucide-react';
import { useVehicleStore } from '../../../../stores/dataStore';
import { useAuthStore } from '../../../../stores/authStore';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * AutoWidget — shows the resident's primary car + a quick "Найти" button.
 * Hidden if the resident has no registered vehicles.
 *
 * The 'Find' interaction is intentionally a UX placeholder for now: it just
 * pulses for 2-3 seconds. A real implementation would beep the car alarm via
 * a building-side integration; once that ships, swap the setTimeout for a
 * real API call.
 */
export function AutoWidget() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const vehiclesData = useVehicleStore(s => s.vehicles);

  const myVehicles = vehiclesData.filter(v => v.ownerId === user?.id);
  const primary = myVehicles[0];

  const [finding, setFinding] = useState(false);
  const handleFind = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFinding(true);
    setTimeout(() => setFinding(false), 2500);
  };

  if (!primary) {
    // No cars registered — show a small CTA to add one
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

  return (
    <div className="bg-white rounded-[22px] p-[16px_18px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04]">
      <button
        onClick={() => navigate('/vehicles')}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-[42px] h-[42px] rounded-[13px] bg-teal-50 flex items-center justify-center text-teal-600 shrink-0">
            <Car className="w-5 h-5" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[14px] font-bold text-gray-900">
              {primary.brand} {primary.model}
            </div>
            <div className="text-[12px] text-gray-400 font-mono tracking-wider">
              {primary.plateNumber}
            </div>
          </div>
        </div>
        <button
          onClick={handleFind}
          className="h-9 px-3.5 rounded-[12px] flex items-center gap-1.5 transition-all touch-manipulation"
          style={{
            background: finding ? '#14B8A6' : '#14B8A610',
            color: finding ? 'white' : '#14B8A6',
          }}
        >
          <MapPin className="w-3.5 h-3.5" />
          <span className="text-[11px] font-semibold">
            {finding
              ? (language === 'ru' ? 'Ищем...' : 'Qidirmoqda...')
              : (language === 'ru' ? 'Найти' : 'Topish')}
          </span>
        </button>
      </button>

      {/* Parking + status row */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[10px] bg-gray-50">
          <span className="text-[12px]">🅿️</span>
          <div>
            <div className="text-[10px] text-gray-400">
              {language === 'ru' ? 'Парковка' : 'To\'xtash joyi'}
            </div>
            <div className="text-[12px] font-semibold text-gray-900">
              {primary.parkingSpot || '—'}
            </div>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-[10px] bg-gray-50">
          <ChevronRight className="w-3 h-3 text-gray-400" />
          <div>
            <div className="text-[10px] text-gray-400">
              {language === 'ru' ? 'Всего авто' : 'Jami avto'}
            </div>
            <div className="text-[12px] font-semibold text-gray-900">
              {myVehicles.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
