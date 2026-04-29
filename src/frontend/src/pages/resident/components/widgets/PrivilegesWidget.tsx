import { useNavigate } from 'react-router-dom';
import { Gift, ChevronRight } from 'lucide-react';
import { useLanguageStore } from '../../../../stores/languageStore';

/**
 * PrivilegesWidget — promo banner that points the resident to the
 * /useful-contacts page where the partner discounts live. Visual is
 * brand-gradient with two decorative circles for Uber/Wolt-style polish.
 *
 * Future: read actual coupon count from `ad_coupons` table once the
 * backend exposes a 'my-coupons' endpoint, then label
 *   "У вас ${count} активных скидок".
 * For now we say a generic "Привилегии резидента" — honest, not promising
 * specific numbers.
 */
export function PrivilegesWidget() {
  const navigate = useNavigate();
  const { language } = useLanguageStore();

  return (
    <button
      onClick={() => navigate('/useful-contacts')}
      className="w-full rounded-[22px] p-[18px_20px] text-white flex items-center gap-[14px] cursor-pointer relative overflow-hidden text-left active:scale-[0.99] transition-transform touch-manipulation"
      style={{
        background: 'linear-gradient(135deg, rgb(var(--brand-rgb)) 0%, #FB923C 100%)',
        boxShadow: '0 8px 25px rgba(var(--brand-rgb), 0.25)',
      }}
    >
      {/* Decorative circles for visual depth */}
      <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-7 left-1/2 w-[100px] h-[100px] rounded-full bg-white/[0.06] pointer-events-none" />

      <div className="relative z-10 w-12 h-12 rounded-[14px] bg-white/20 flex items-center justify-center shrink-0">
        <Gift className="w-6 h-6" strokeWidth={2.2} />
      </div>
      <div className="flex-1 relative z-10">
        <div className="text-[15px] font-extrabold">
          {language === 'ru' ? 'Привилегии резидента' : 'Rezident imtiyozlari'}
        </div>
        <div className="text-[11px] opacity-80 mt-0.5">
          {language === 'ru' ? 'Скидки от партнёров и сервисов рядом' : 'Hamkor va xizmatlardan chegirmalar'}
        </div>
      </div>
      <div className="relative z-10 w-9 h-9 rounded-[12px] bg-white/20 flex items-center justify-center">
        <ChevronRight className="w-5 h-5" />
      </div>
    </button>
  );
}
