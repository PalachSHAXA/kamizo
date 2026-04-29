import { Gauge, Droplet, Flame, Zap } from 'lucide-react';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * MetersWidgetSoon — placeholder version of the meter-readings widget.
 * Same visual structure as the future live widget so the layout stays
 * stable when the integration ships, but every interactive element is
 * disabled and clearly marked as in-development.
 *
 * Showing placeholder rows (Холодная / Горячая / Электро) lets the user
 * understand "I will be entering 3 meter readings here" without making
 * any input that would lead nowhere right now.
 */
export function MetersWidgetSoon() {
  const { language } = useLanguageStore();

  const meters = [
    { icon: Droplet, label: language === 'ru' ? 'Холодная вода' : 'Sovuq suv', unit: 'м³', color: '#3B82F6' },
    { icon: Flame, label: language === 'ru' ? 'Горячая вода' : 'Issiq suv', unit: 'м³', color: '#EF4444' },
    { icon: Zap, label: language === 'ru' ? 'Электричество' : 'Elektr', unit: 'кВт', color: '#F59E0B' },
  ];

  return (
    <div className="bg-white rounded-[22px] p-[16px_18px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-gray-400" />
          <span className="text-[13px] font-bold text-gray-500">
            {language === 'ru' ? 'Счётчики' : 'Hisoblagichlar'}
          </span>
        </div>
        <div className="px-2.5 py-[3px] rounded-[8px] bg-amber-100 text-amber-700 text-[10px] font-bold">
          {language === 'ru' ? 'УЖЕ СКОРО' : 'TEZ ORADA'}
        </div>
      </div>

      {/* Meter rows — visible structure, disabled interactions */}
      <div className="flex flex-col gap-2 opacity-60">
        {meters.map(m => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="flex items-center gap-2.5 p-[10px_12px] rounded-[12px] bg-gray-50"
            >
              <div
                className="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
                style={{ background: `${m.color}12` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color: m.color }} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-gray-400">{m.label}</div>
                <div className="text-[14px] font-extrabold text-gray-300 tabular-nums">
                  — <span className="text-[10px] font-medium text-gray-300">{m.unit}</span>
                </div>
              </div>
              <button
                disabled
                className="px-3 py-[6px] rounded-[9px] bg-gray-100 text-gray-400 text-[10px] font-semibold cursor-not-allowed select-none"
              >
                {language === 'ru' ? 'Скоро' : 'Tez orada'}
              </button>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-gray-400 mt-3 text-center leading-snug">
        {language === 'ru'
          ? 'Передача показаний — на этапе интеграции с УК'
          : 'Hisoblagich ko\'rsatkichlari — UK bilan integratsiya bosqichida'}
      </p>
    </div>
  );
}
