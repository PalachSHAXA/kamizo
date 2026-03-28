import { useRef } from 'react';
import { Lock } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';
import { useTenantStore } from '../stores/tenantStore';

interface FeatureLockedModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName?: string;
}

export function FeatureLockedModal({ isOpen, onClose, featureName }: FeatureLockedModalProps) {
  const { language } = useLanguageStore();
  const { config } = useTenantStore();
  const tenantName = config?.tenant?.name || 'УК';
  const swipeRef = useRef<{ startY: number; startX: number } | null>(null);

  if (!isOpen) return null;

  const handleTouchStart = (e: React.TouchEvent) => {
    swipeRef.current = { startY: e.touches[0].clientY, startX: e.touches[0].clientX };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swipeRef.current) return;
    const diffY = e.changedTouches[0].clientY - swipeRef.current.startY;
    const diffX = Math.abs(e.changedTouches[0].clientX - swipeRef.current.startX);
    // Swipe down > 60px and mostly vertical = close
    if (diffY > 60 && diffX < diffY) {
      onClose();
    }
    swipeRef.current = null;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[200] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="w-full sm:max-w-[380px] bg-white rounded-t-[20px] sm:rounded-[20px] p-6 pb-8 animate-[slide-up_0.25s_ease-out]"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))' }}
      >
        {/* Handle */}
        <div className="flex justify-center mb-4 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
            <Lock className="w-7 h-7 text-gray-400" />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-[18px] font-bold text-gray-900 text-center mb-2">
          {language === 'ru'
            ? `${featureName || 'Функция'} недоступна`
            : `${featureName || 'Funksiya'} mavjud emas`}
        </h3>

        {/* Description */}
        <p className="text-[14px] text-gray-500 text-center leading-relaxed mb-6">
          {language === 'ru'
            ? `Эта функция ещё не активирована для вашего дома. Обратитесь к ${tenantName} для подключения.`
            : `Bu funksiya sizning uyingiz uchun hali faollashtirilmagan. Ulash uchun ${tenantName}ga murojaat qiling.`}
        </p>

        {/* Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 bg-primary-500 text-white font-semibold rounded-[14px] active:scale-[0.97] transition-all touch-manipulation"
        >
          {language === 'ru' ? 'Понятно' : 'Tushunarli'}
        </button>
      </div>
    </div>
  );
}
