import { Wrench } from 'lucide-react';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * ComingSoonPill — single thin row that replaces the two large
 * Payment + Meters "В разработке" widgets. Same honest message
 * (these features aren't ready) but in 50px instead of 340px,
 * keeping the home tab from feeling like a long string of
 * placeholders.
 *
 * Once Click/Payme + meters integration ships, replace this
 * with the live PaymentWidget and MetersWidget — the file
 * pair PaymentWidgetSoon / MetersWidgetSoon stays in the repo
 * as visual references for what the future widgets should
 * look like.
 */
export function ComingSoonPill() {
  const { language } = useLanguageStore();

  return (
    <div
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-[14px] border border-dashed border-gray-300 bg-white/60"
      role="note"
      aria-label={language === 'ru' ? 'Скоро доступные функции' : 'Tez orada keladigan funksiyalar'}
    >
      <Wrench className="w-[14px] h-[14px] text-gray-400 shrink-0" strokeWidth={2.2} />
      <div className="text-[12px] text-gray-500 leading-tight flex-1">
        <span className="font-bold text-gray-700">
          {language === 'ru' ? 'Уже скоро: ' : 'Tez orada: '}
        </span>
        {language === 'ru'
          ? 'онлайн-оплата ЖКУ · показания счётчиков'
          : 'onlayn to\'lov · hisoblagich ko\'rsatkichlari'}
      </div>
    </div>
  );
}
