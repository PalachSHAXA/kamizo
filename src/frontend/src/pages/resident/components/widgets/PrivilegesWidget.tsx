import { useNavigate } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * PrivilegesWidget — soft promo strip pointing to /useful-contacts.
 *
 * Replaces the previous loud brand-gradient hero with two decorative
 * circles. The new pattern is a single white card with a left brand-tinted
 * tile holding the gift icon — same compact rhythm as AutoWidget so the
 * home feed reads as one consistent stack of cards instead of mixed weight.
 */
export function PrivilegesWidget() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();

  return (
    <button
      onClick={() => navigate('/useful-contacts')}
      className="w-full bg-white rounded-[20px] p-3.5 flex items-center gap-3 shadow-[0_2px_10px_rgba(0,0,0,0.04)] border border-black/[0.04] active:scale-[0.99] transition-transform touch-manipulation text-left"
    >
      <div
        className="w-[44px] h-[44px] rounded-[14px] flex items-center justify-center shrink-0"
        style={{
          background: 'rgba(var(--brand-rgb), 0.10)',
          color: 'rgb(var(--brand-rgb))',
        }}
        aria-hidden="true"
      >
        <Gift className="w-[20px] h-[20px]" strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'rgb(var(--brand-rgb))' }}
        >
          {language === 'ru' ? 'Привилегии' : 'Imtiyozlar'}
        </div>
        <div className="text-[14px] font-bold text-gray-900 truncate">
          {language === 'ru' ? 'Скидки от партнёров' : 'Hamkorlardan chegirmalar'}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5 truncate">
          {language === 'ru' ? 'Сервисы рядом с домом' : 'Yaqin atrofdagi xizmatlar'}
        </div>
      </div>
      <div className="w-9 h-9 rounded-[12px] bg-gray-50 flex items-center justify-center shrink-0">
        <ChevronRight className="w-[18px] h-[18px] text-gray-400" />
      </div>
    </button>
  );
}
