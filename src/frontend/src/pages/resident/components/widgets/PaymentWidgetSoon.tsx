import { CreditCard, Droplet, Flame, Zap, Home as HomeIcon } from 'lucide-react';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * PaymentWidgetSoon — visually mirrors the future PaymentWidget so УК and
 * residents can see what's coming, but is clearly marked as not-yet-active.
 *
 * Differences from the future "live" version:
 *   - Numbers are placeholders ("—") not real sums
 *   - Pay button is disabled and labelled "В разработке" instead of "Оплатить"
 *   - "Уже скоро" badge replaces the "через N дн" deadline pill
 *   - Soft opacity on the breakdown row to signal inactive
 *
 * When Click/Payme integration ships, swap this for the live widget that
 * pulls from the finance API and enables the pay button.
 */
export function PaymentWidgetSoon() {
  const { language } = useLanguageStore();

  const breakdown = [
    { label: language === 'ru' ? 'Вода' : 'Suv', icon: Droplet, color: '#3B82F6' },
    { label: language === 'ru' ? 'Газ' : 'Gaz', icon: Flame, color: '#F59E0B' },
    { label: language === 'ru' ? 'Свет' : 'Yorug\'lik', icon: Zap, color: '#FBBF24' },
    { label: language === 'ru' ? 'Услуги' : 'Xizmatlar', icon: HomeIcon, color: '#10B981' },
  ];

  return (
    <div className="bg-white rounded-[22px] p-[16px_18px] shadow-[0_4px_20px_rgba(0,0,0,0.05)] border border-black/[0.04]">
      {/* Header with 'уже скоро' badge */}
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-400" />
          <span className="text-[13px] font-bold text-gray-500">
            {language === 'ru' ? 'Коммунальные' : 'Kommunal'}
          </span>
        </div>
        <div className="px-2.5 py-[3px] rounded-[8px] bg-amber-100 text-amber-700 text-[10px] font-bold">
          {language === 'ru' ? 'УЖЕ СКОРО' : 'TEZ ORADA'}
        </div>
      </div>

      {/* Amount row — placeholder + disabled button */}
      <div className="flex items-center justify-between mb-3.5">
        <div>
          <div className="text-[10px] text-gray-400">
            {language === 'ru' ? 'Онлайн-оплата ЖКУ' : 'Onlayn to\'lov'}
          </div>
          <div className="text-[24px] font-extrabold text-gray-300 leading-none mt-1">
            — <span className="text-[13px] font-semibold text-gray-300">{language === 'ru' ? 'сум' : "so'm"}</span>
          </div>
        </div>
        <button
          disabled
          className="px-[18px] py-[10px] rounded-[14px] bg-gray-100 text-gray-400 text-[13px] font-bold cursor-not-allowed select-none"
        >
          {language === 'ru' ? 'В разработке' : 'Ishlab chiqilmoqda'}
        </button>
      </div>

      {/* Breakdown row — visible but greyed out */}
      <div className="flex gap-2 opacity-50">
        {breakdown.map(item => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="flex-1 py-2 px-1 rounded-[10px] bg-gray-50 text-center"
            >
              <Icon className="w-3 h-3 mx-auto" style={{ color: item.color }} />
              <div className="text-[9px] text-gray-400 mt-1">{item.label}</div>
              <div className="text-[10px] font-bold text-gray-300 mt-0.5">—</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
