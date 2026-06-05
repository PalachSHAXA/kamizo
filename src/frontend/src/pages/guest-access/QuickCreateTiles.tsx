// Sprint 21: extracted from ResidentGuestAccessPage. Three preset
// cards on the top of the create-pass screen (Гость / Курьер /
// Семья) — taps fire onPick with a QuickPreset shape so the form
// pre-fills.

import { Users, Package, User, Car } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import type { QuickPreset } from './utils';

// QUICK_PRESETS was originally declared in the parent file (back when the
// page was 1300+ LOC). The sprint-21 split missed moving it, so the only
// consumer (this component) read it as a free identifier and crashed at
// runtime. Re-homed here with QuickCreateTiles, the single caller.
const QUICK_PRESETS: QuickPreset[] = [
  {
    visitor: 'guest', access: 'day',
    icon: <Users className="w-4 h-4" />, bg: 'bg-emerald-50', fg: 'text-emerald-600',
    titleRu: 'Гость', titleUz: 'Mehmon', subRu: 'до 24 ч', subUz: '24 soatgacha',
  },
  {
    visitor: 'courier', access: 'single_use',
    icon: <Package className="w-4 h-4" />, bg: 'bg-amber-50', fg: 'text-amber-600',
    titleRu: 'Доставка', titleUz: 'Yetkazib berish', subRu: 'на 24 ч', subUz: '24 soat',
  },
  {
    visitor: 'other', access: 'day',
    icon: <User className="w-4 h-4" />, bg: 'bg-sky-50', fg: 'text-sky-600',
    titleRu: 'Услуги', titleUz: 'Xizmatlar', subRu: 'мастер', subUz: 'usta',
  },
  {
    visitor: 'taxi', access: 'single_use',
    icon: <Car className="w-4 h-4" />, bg: 'bg-violet-50', fg: 'text-violet-600',
    titleRu: 'Такси', titleUz: 'Taksi', subRu: '1 проезд', subUz: '1 marta',
  },
];

export function QuickCreateTiles({ onPick }: { onPick: (preset: QuickPreset) => void }) {
  const { language } = useLanguageStore();
  return (
    <div className="px-3 md:px-0 space-y-2">
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 px-1">
        {language === 'ru' ? 'Создать новый' : 'Yangi yaratish'}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {QUICK_PRESETS.map((p) => (
          <button
            key={`${p.visitor}-${p.access}`}
            onClick={() => onPick(p)}
            className="bg-white rounded-[14px] p-3 flex items-center gap-3 text-left active:scale-[0.97] transition-transform touch-manipulation min-h-[60px] shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${p.bg} ${p.fg}`}>
              {p.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[14px] text-gray-900 leading-tight truncate">
                {language === 'ru' ? p.titleRu : p.titleUz}
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                {language === 'ru' ? p.subRu : p.subUz}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Main page component
