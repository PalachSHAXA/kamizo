import { useState, useEffect, useLayoutEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { useLanguageStore } from '../stores/languageStore';

interface Tip {
  textRu: string;
  textUz: string;
  /** data-tour selector value — the element the spotlight should anchor to */
  target?: string;
  /** Preferred card position relative to the target. Auto-flipped if off-screen. */
  cardAnchor?: 'above' | 'below' | 'center';
}

// Role-based tip definitions — anchored to real DOM elements via data-tour attributes.
// If target element is not found, the card falls back to centered mode with no spotlight.
const ROLE_TIPS: Record<string, Tip[]> = {
  resident: [
    {
      textRu: '👋 Создайте заявку — нажмите «Вызвать мастера»',
      textUz: '👋 Ariza yarating — «Usta chaqirish»ni bosing',
      target: 'home-call-master',
      cardAnchor: 'below',
    },
    {
      textRu: '💬 Чат с управляющей компанией',
      textUz: '💬 Boshqaruv kompaniyasi bilan chat',
      target: 'bottombar-chat',
      cardAnchor: 'above',
    },
    {
      textRu: '🚪 QR-пропуск для гостей',
      textUz: '🚪 Mehmonlar uchun QR-o\'tkazma',
      target: 'home-guests',
      cardAnchor: 'above',
    },
  ],
  manager: [
    {
      textRu: '📬 Заявки жителей — назначайте исполнителей',
      textUz: '📬 Aholining arizalari — ijrochilarni tayinlang',
      target: 'bottombar-requests',
      cardAnchor: 'above',
    },
    {
      textRu: '💬 Чат с жителями и командой',
      textUz: '💬 Aholi va jamoa bilan chat',
      target: 'bottombar-chat',
      cardAnchor: 'above',
    },
  ],
  executor: [
    {
      textRu: '🔧 Ваши задачи — список заявок',
      textUz: '🔧 Vazifalaringiz — arizalar ro\'yxati',
      target: 'bottombar-home',
      cardAnchor: 'above',
    },
    {
      textRu: '📅 График работы',
      textUz: '📅 Ish jadvali',
      target: 'bottombar-schedule',
      cardAnchor: 'above',
    },
  ],
  security: [
    {
      textRu: '📱 QR-сканер — по центру панели',
      textUz: '📱 QR-skaner — panel markazida',
      target: 'bottombar-qr',
      cardAnchor: 'above',
    },
    {
      textRu: '🚗 Поиск машины по номеру',
      textUz: '🚗 Raqam bo\'yicha mashina qidirish',
      target: 'bottombar-vehicle',
      cardAnchor: 'above',
    },
  ],
};

interface OnboardingTooltipsProps {
  role: string;
  userId: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const CARD_GAP = 12;
const CARD_MARGIN = 16;
const CARD_MAX_WIDTH = 320;

export function OnboardingTooltips({ role, userId }: OnboardingTooltipsProps) {
  const { language } = useLanguageStore();
  const [currentTip, setCurrentTip] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ w: window.innerWidth, h: window.innerHeight });

  const tips = ROLE_TIPS[role] || [];
  const tip = tips[currentTip];

  // Show on first visit only
  useEffect(() => {
    if (tips.length === 0) return;
    const key = `onboarding_seen_${role}_${userId}`;
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => {
        // Hotfix: claim global overlay slot so push-prompt and SW-update banner
        // hold their messages until the tour finishes.
        localStorage.setItem('overlay_active', 'tour');
        setVisible(true);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [role, userId, tips.length]);

  // Release the overlay slot if the user reloads/closes the tab while the tour
  // is open — otherwise the flag would stick and silently block push prompts
  // until next dismissal.
  useEffect(() => {
    const release = () => {
      if (localStorage.getItem('overlay_active') === 'tour') {
        localStorage.removeItem('overlay_active');
      }
    };
    window.addEventListener('beforeunload', release);
    return () => window.removeEventListener('beforeunload', release);
  }, []);

  // Measure the target element — re-runs on tip change, resize, and orientation change
  useLayoutEffect(() => {
    if (!visible || !tip) return;

    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      if (!tip.target) {
        setTargetRect(null);
        return;
      }
      const el = document.querySelector<HTMLElement>(`[data-tour="${tip.target}"]`);
      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        setTargetRect(null);
        return;
      }
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    // Initial measure — next frame so layout has settled after any mount animations
    const rafId = requestAnimationFrame(measure);

    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('scroll', measure, true);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [visible, tip]);

  const dismiss = () => {
    localStorage.setItem(`onboarding_seen_${role}_${userId}`, '1');
    if (localStorage.getItem('overlay_active') === 'tour') {
      localStorage.removeItem('overlay_active');
    }
    setVisible(false);
  };

  const next = () => {
    if (currentTip < tips.length - 1) {
      setCurrentTip(prev => prev + 1);
    } else {
      dismiss();
    }
  };

  if (!visible || !tip) return null;

  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;

  // Build spotlight rect with padding around the element
  const spotlight = targetRect ? {
    top: Math.max(4, targetRect.top - SPOTLIGHT_PADDING),
    left: Math.max(4, targetRect.left - SPOTLIGHT_PADDING),
    width: Math.min(viewport.w - 8, targetRect.width + SPOTLIGHT_PADDING * 2),
    height: targetRect.height + SPOTLIGHT_PADDING * 2,
  } : null;

  // Decide card position — auto-flip if preferred side doesn't fit
  const getCardStyle = (): React.CSSProperties => {
    // No target or center anchor → center of viewport
    if (!spotlight || tip.cardAnchor === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: `min(${CARD_MAX_WIDTH}px, calc(100vw - ${CARD_MARGIN * 2}px))`,
      };
    }

    const cardEstHeight = 180; // rough estimate for flip decision
    const spaceBelow = viewport.h - (spotlight.top + spotlight.height);
    const spaceAbove = spotlight.top;

    let placeBelow: boolean;
    if (tip.cardAnchor === 'below') {
      placeBelow = spaceBelow >= cardEstHeight || spaceBelow >= spaceAbove;
    } else {
      placeBelow = spaceAbove < cardEstHeight && spaceBelow > spaceAbove;
    }

    // Card horizontal: center on target but clamp to viewport
    const targetCenterX = spotlight.left + spotlight.width / 2;
    const cardWidth = Math.min(CARD_MAX_WIDTH, viewport.w - CARD_MARGIN * 2);
    let cardLeft = targetCenterX - cardWidth / 2;
    cardLeft = Math.max(CARD_MARGIN, Math.min(viewport.w - cardWidth - CARD_MARGIN, cardLeft));

    const style: React.CSSProperties = {
      left: `${cardLeft}px`,
      width: `${cardWidth}px`,
    };

    if (placeBelow) {
      const top = spotlight.top + spotlight.height + CARD_GAP;
      style.top = `${Math.min(top, viewport.h - cardEstHeight - CARD_MARGIN)}px`;
    } else {
      const bottom = viewport.h - spotlight.top + CARD_GAP;
      style.bottom = `${Math.min(bottom, viewport.h - cardEstHeight - CARD_MARGIN)}px`;
    }

    return style;
  };

  const isLast = currentTip === tips.length - 1;

  return (
    <div
      className="fixed inset-0 z-[250]"
      style={{ pointerEvents: 'auto' }}
      onClick={dismiss}
    >
      {/* Spotlight with cutout effect via large box-shadow */}
      {spotlight ? (
        <div
          className="absolute pointer-events-none transition-all duration-200"
          style={{
            top: `${spotlight.top}px`,
            left: `${spotlight.left}px`,
            width: `${spotlight.width}px`,
            height: `${spotlight.height}px`,
            borderRadius: '14px',
            boxShadow: '0 0 0 200vmax rgba(0,0,0,0.62)',
            border: '2px solid rgba(255,255,255,0.4)',
            zIndex: 251,
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-[252] bg-white rounded-2xl shadow-2xl p-4 overflow-hidden"
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
            aria-label={t('Закрыть', 'Yopish')}
          >
            <X className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-800 leading-snug mb-4 break-words">
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
