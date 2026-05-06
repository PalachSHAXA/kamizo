import { Sparkles } from 'lucide-react';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * ComingSoonPill — single thin row that replaces the two large
 * Payment + Meters "В разработке" widgets. Brand-tinted soft background
 * with a left accent stripe so the user notices it (the previous gray
 * dashed pill was reading as inactive boilerplate).
 *
 * Once Click/Payme + meters integration ships, replace this with the
 * live PaymentWidget and MetersWidget — PaymentWidgetSoon / MetersWidgetSoon
 * stay in the repo as visual references.
 */
export function ComingSoonPill() {
  const { language } = useLanguageStore();

  return (
    <div
      className="relative flex items-center gap-3 pl-4 pr-3.5 py-3 rounded-[16px] overflow-hidden"
      role="note"
      aria-label={language === 'ru' ? 'Скоро доступные функции' : 'Tez orada keladigan funksiyalar'}
      style={{
        background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.10) 0%, rgba(var(--brand-rgb), 0.04) 100%)',
        border: '1px solid rgba(var(--brand-rgb), 0.18)',
      }}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-[4px]"
        style={{ background: 'rgb(var(--brand-rgb))' }}
        aria-hidden="true"
      />
      <div
        className="w-[32px] h-[32px] rounded-[10px] flex items-center justify-center shrink-0"
        style={{ background: 'rgba(var(--brand-rgb), 0.16)' }}
        aria-hidden="true"
      >
        <Sparkles className="w-[16px] h-[16px]" style={{ color: 'rgb(var(--brand-rgb))' }} strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-extrabold uppercase tracking-wider" style={{ color: 'rgb(var(--brand-rgb))' }}>
          {language === 'ru' ? 'Уже скоро' : 'Tez orada'}
        </div>
        <div className="text-[12.5px] text-gray-700 leading-tight mt-0.5 truncate">
          {language === 'ru'
            ? 'онлайн-оплата ЖКУ · показания счётчиков'
            : "onlayn to'lov · hisoblagich ko'rsatkichlari"}
        </div>
      </div>
    </div>
  );
}
