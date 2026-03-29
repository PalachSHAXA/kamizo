import { useState, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';

interface Tip {
  textRu: string;
  textUz: string;
  // Spotlight area: percentage of viewport (top/left/width/height)
  spotlight?: { top: number; left: number; width: number; height: number; radius?: number };
  // Where to pin the tooltip card (relative to spotlight or viewport)
  cardAnchor?: 'above-spotlight' | 'below-spotlight' | 'center';
}

// Role-based tip definitions
// Layout knowledge: bottom bar ~56px at bottom, sidebar ~240px at left on desktop
const ROLE_TIPS: Record<string, Tip[]> = {
  resident: [
    {
      textRu: '👋 Здесь можно создать заявку — нажмите «Вызвать мастера»',
      textUz: '👋 Bu yerda ariza yaratishingiz mumkin — «Usta chaqirish»ni bosing',
      spotlight: { top: 30, left: 10, width: 80, height: 12, radius: 12 },
      cardAnchor: 'below-spotlight',
    },
    {
      textRu: '📋 Здесь ваши активные заявки — следите за статусом',
      textUz: '📋 Bu yerda sizning faol arizalaringiz — holatni kuzating',
      spotlight: { top: 47, left: 4, width: 92, height: 28, radius: 12 },
      cardAnchor: 'above-spotlight',
    },
    {
      textRu: '💬 Чат с УК — нажмите иконку чата внизу экрана',
      textUz: '💬 UK bilan chat — ekranning pastidagi chat ikonkasini bosing',
      spotlight: { top: 87, left: 57, width: 14, height: 10, radius: 10 },
      cardAnchor: 'above-spotlight',
    },
    {
      textRu: '🚪 QR-пропуск для гостей — нажмите «Гости» в меню',
      textUz: '🚪 Mehmonlar uchun QR-o\'tkazma — menyuda «Mehmonlar»ni bosing',
      spotlight: { top: 87, left: 71, width: 14, height: 10, radius: 10 },
      cardAnchor: 'above-spotlight',
    },
  ],
  manager: [
    {
      textRu: '📬 Входящие заявки от жителей — обрабатывайте и назначайте исполнителей',
      textUz: '📬 Aholidan kelgan arizalar — ko\'rib chiqing va ijrochilarni tayinlang',
      spotlight: { top: 28, left: 4, width: 92, height: 32, radius: 12 },
      cardAnchor: 'above-spotlight',
    },
    {
      textRu: '👤 Кнопка «Назначить» появляется в карточке заявки',
      textUz: '👤 «Tayinlash» tugmasi ariza kartasida paydo bo\'ladi',
      spotlight: { top: 50, left: 55, width: 40, height: 8, radius: 8 },
      cardAnchor: 'above-spotlight',
    },
    {
      textRu: '🏘️ Управление зданиями и жителями — в боковом меню слева',
      textUz: '🏘️ Binolar va aholini boshqarish — chap yon menyuda',
      spotlight: { top: 10, left: 0, width: 4, height: 70, radius: 0 },
      cardAnchor: 'center',
    },
  ],
  executor: [
    {
      textRu: '🔧 Ваши назначенные задачи — список заявок для выполнения',
      textUz: '🔧 Sizning tayinlangan vazifalaringiz — bajarish uchun arizalar ro\'yxati',
      spotlight: { top: 20, left: 4, width: 92, height: 40, radius: 12 },
      cardAnchor: 'above-spotlight',
    },
    {
      textRu: '📅 Ваш график работы — нажмите «График» в меню внизу',
      textUz: '📅 Sizning ish jadvalingiz — pastki menyuda «Jadval»ni bosing',
      spotlight: { top: 87, left: 14, width: 14, height: 10, radius: 10 },
      cardAnchor: 'above-spotlight',
    },
  ],
};

interface OnboardingTooltipsProps {
  role: string;
  userId: string;
}

export function OnboardingTooltips({ role, userId }: OnboardingTooltipsProps) {
  const { language } = useLanguageStore();
  const [currentTip, setCurrentTip] = useState(0);
  const [visible, setVisible] = useState(false);

  const tips = ROLE_TIPS[role] || [];

  useEffect(() => {
    if (tips.length === 0) return;
    const key = `onboarding_seen_${role}_${userId}`;
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => setVisible(true), 900);
      return () => clearTimeout(timer);
    }
  }, [role, userId, tips.length]);

  const dismiss = () => {
    localStorage.setItem(`onboarding_seen_${role}_${userId}`, '1');
    setVisible(false);
  };

  const next = () => {
    if (currentTip < tips.length - 1) {
      setCurrentTip(prev => prev + 1);
    } else {
      dismiss();
    }
  };

  if (!visible || tips.length === 0) return null;

  const tip = tips[currentTip];
  const isLast = currentTip === tips.length - 1;
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  const sa = tip.spotlight;

  // Determine tooltip card vertical position
  const getCardStyle = (): React.CSSProperties => {
    if (!sa || tip.cardAnchor === 'center') {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }
    if (tip.cardAnchor === 'above-spotlight') {
      // Position card above the spotlight area
      const topPercent = sa.top - 2;
      return { bottom: `${100 - topPercent}%`, left: '50%', transform: 'translateX(-50%)' };
    }
    // below-spotlight
    const bottomPercent = sa.top + sa.height + 2;
    return { top: `${bottomPercent}%`, left: '50%', transform: 'translateX(-50%)' };
  };

  return (
    <div
      className="fixed inset-0 z-[250]"
      style={{ pointerEvents: 'auto' }}
      onClick={dismiss}
    >
      {/* Spotlight element — box-shadow creates the dark overlay around the highlighted area */}
      {sa && (
        <div
          className="absolute pointer-events-none"
          style={{
            top: `${sa.top}vh`,
            left: `${sa.left}vw`,
            width: `${sa.width}vw`,
            height: `${sa.height}vh`,
            borderRadius: `${sa.radius ?? 12}px`,
            boxShadow: '0 0 0 200vmax rgba(0,0,0,0.62)',
            border: '2px solid rgba(255,255,255,0.35)',
            zIndex: 251,
          }}
        />
      )}

      {/* Fallback backdrop when no spotlight */}
      {!sa && (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-[252] w-[calc(100vw-32px)] max-w-sm bg-white rounded-2xl shadow-2xl p-4"
        style={getCardStyle()}
        onClick={e => e.stopPropagation()}
      >
        {/* Progress dots + close */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1.5 items-center">
            {tips.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentTip ? 'w-5 bg-primary-500' : i < currentTip ? 'w-1.5 bg-primary-200' : 'w-1.5 bg-gray-200'
                }`}
              />
            ))}
            <span className="text-xs text-gray-400 ml-1">
              {currentTip + 1}/{tips.length}
            </span>
          </div>
          <button
            onClick={dismiss}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors touch-manipulation active:scale-90"
          >
            <X className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        <p className="text-[14px] text-gray-800 leading-relaxed mb-4">
          {language === 'ru' ? tip.textRu : tip.textUz}
        </p>

        <div className="flex gap-2.5">
          <button
            onClick={dismiss}
            className="flex-1 py-2.5 text-gray-500 text-[13px] font-medium rounded-[12px] bg-gray-100 active:scale-[0.97] transition-all touch-manipulation"
          >
            {t('Пропустить', 'O\'tkazib yuborish')}
          </button>
          <button
            onClick={next}
            className="flex-1 py-2.5 bg-primary-500 text-white text-[13px] font-semibold rounded-[12px] flex items-center justify-center gap-1 active:scale-[0.97] transition-all touch-manipulation"
          >
            {isLast ? t('Готово', 'Tayyor') : (
              <>
                {t('Далее', 'Keyingi')}
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
