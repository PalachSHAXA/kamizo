// Marketplace checkout success screen — approved design.
// Отдельный от <SuccessScreen> компонент, потому что тот шэрится
// с rentals и никакой анимации не имеет. Здесь строго один сценарий:
// заказ создан, показать пружинистую зелёную галочку с конфетти,
// заголовок + номер заказа + ETA, кнопка «К моим заказам» + ссылка
// «Продолжить покупки».
//
// Анимация ре-плейится по тапу на круг: анимационная область
// перемонтируется через ключ `replayKey`.

import { useState } from 'react';

interface Props {
  orderNumber: string;
  etaLabel: string;
  language: 'ru' | 'uz';
  onBack: () => void;
  onMyOrders: () => void;
  onContinueShopping: () => void;
}

// Цвета из спецификации.
const INK = '#141413';
const INK_DIM = '#8a8985';
const HINT = '#b9b7b1';
const GREEN_A = '#7FB981';
const GREEN_B = '#5A9B5E';
const RING = '#6FA672';
const CONFETTI = ['#5A9B5E', '#D97757', '#F0DEC7', '#141413'];

// 10 частиц конфетти, разлетающихся по кругу.
const PARTICLES = Array.from({ length: 10 }).map((_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  const distance = 78 + Math.random() * 18;
  return {
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance),
    color: CONFETTI[i % CONFETTI.length],
    size: 6 + Math.round(Math.random() * 3),
    square: i % 3 === 0,
    delay: 0.35 + (i / 10) * 0.09,
  };
});

export function MarketplaceOrderSuccess({
  orderNumber, etaLabel, language, onBack, onMyOrders, onContinueShopping,
}: Props) {
  const [replayKey, setReplayKey] = useState(0);
  const t = (ru: string, uz: string) => language === 'ru' ? ru : uz;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'linear-gradient(180deg, #FFF8EF 0%, #FCEBD9 55%, #FBDFC4 100%)',
        display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        color: INK,
      }}
    >
      {/* Верхняя панель: только back. */}
      <div style={{ padding: '12px 16px 0' }}>
        <button
          type="button"
          onClick={onBack}
          aria-label={t('Назад', 'Orqaga')}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(255,255,255,0.55)',
            border: 'none', color: INK,
            display: 'grid', placeItems: 'center',
            font: '600 22px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            cursor: 'pointer', padding: 0,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          ‹
        </button>
      </div>

      {/* Центральная зона: анимация + текст. */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px', gap: 18 }}>
        {/* Анимационный блок — ремаунт через key при повторном тапе. */}
        <AnimatedCheck key={replayKey} onTap={() => setReplayKey(k => k + 1)} />

        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <h1 style={{
            fontSize: 22, fontWeight: 800, color: INK, margin: 0,
            letterSpacing: '-0.02em', lineHeight: 1.2,
            animation: 'msuFadeUp 0.5s cubic-bezier(0.22,0.61,0.36,1) 0.55s both',
          }}>
            {t('Готово! Заказ принят', 'Tayyor! Buyurtma qabul qilindi')}
          </h1>
          <div style={{
            fontSize: 14, color: INK_DIM, letterSpacing: '-0.01em',
            fontVariantNumeric: 'tabular-nums',
            animation: 'msuFadeUp 0.5s cubic-bezier(0.22,0.61,0.36,1) 0.68s both',
          }}>
            №&nbsp;{orderNumber} · {t('доставим сегодня за', 'bugun yetkazamiz')} {etaLabel}
          </div>
          <div style={{
            fontSize: 12, color: HINT, letterSpacing: '-0.005em',
            animation: 'msuFadeUp 0.5s cubic-bezier(0.22,0.61,0.36,1) 0.82s both',
          }}>
            {t('Нажмите на значок, чтобы посмотреть ещё раз', "Yana ko'rish uchun belgini bosing")}
          </div>
        </div>
      </div>

      {/* Низ: основной CTA + текстовая ссылка. */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={onMyOrders}
          style={{
            width: '100%', height: 52, borderRadius: 26,
            background: INK, color: '#FFFFFF',
            border: 'none', font: '600 15px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            letterSpacing: '-0.005em', cursor: 'pointer', padding: 0,
            animation: 'msuFadeUp 0.45s cubic-bezier(0.22,0.61,0.36,1) 0.95s both',
          }}
        >
          {t('К моим заказам', 'Buyurtmalarim')}
        </button>
        <button
          type="button"
          onClick={onContinueShopping}
          style={{
            background: 'transparent', border: 'none', color: INK_DIM,
            font: '500 13px/1 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
            padding: '6px 12px', cursor: 'pointer',
            animation: 'msuFadeUp 0.45s cubic-bezier(0.22,0.61,0.36,1) 1.05s both',
          }}
        >
          {t('Продолжить покупки', 'Xarid qilishni davom ettirish')}
        </button>
      </div>

      {/* Keyframes — inline style, чтобы компонент был самодостаточным. */}
      <style>{`
        @keyframes msuFadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes msuPop {
          0%   { transform: scale(0.3); }
          55%  { transform: scale(1.12); }
          78%  { transform: scale(0.96); }
          100% { transform: scale(1); }
        }
        @keyframes msuRing { 0% { transform: scale(0.55); opacity: 0.9; } 100% { transform: scale(1.55); opacity: 0; } }
        @keyframes msuCheckDraw { from { stroke-dashoffset: 60; } to { stroke-dashoffset: 0; } }
        @keyframes msuParticle {
          0%   { opacity: 0; transform: translate(0,0) scale(0.4); }
          25%  { opacity: 1; }
          100% { opacity: 0; transform: translate(var(--tx), var(--ty)) scale(0.7); }
        }
      `}</style>
    </div>
  );
}

// Изолированный анимационный блок — переDESTROYится по key.
function AnimatedCheck({ onTap }: { onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label="replay"
      style={{
        position: 'relative', width: 200, height: 200,
        display: 'grid', placeItems: 'center',
        background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {/* Кольцо-волна — растёт и растворяется. */}
      <span
        aria-hidden
        style={{
          position: 'absolute', width: 132, height: 132, borderRadius: '50%',
          border: `2px solid ${RING}`, opacity: 0,
          animation: 'msuRing 0.85s cubic-bezier(0.22,0.61,0.36,1) 0.15s both',
          transformOrigin: 'center',
        }}
      />
      {/* Основной круг с галочкой — пружинистый поп. */}
      <span
        aria-hidden
        style={{
          position: 'relative', width: 132, height: 132, borderRadius: '50%',
          background: `linear-gradient(160deg, ${GREEN_A} 0%, ${GREEN_B} 100%)`,
          boxShadow: '0 12px 32px rgba(90,155,94,0.32), 0 4px 10px rgba(90,155,94,0.18)',
          display: 'grid', placeItems: 'center',
          animation: 'msuPop 0.7s cubic-bezier(0.34,1.56,0.64,1) both',
          transformOrigin: 'center',
        }}
      >
        <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
          <path
            d="M18 33 L28 43 L46 22"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 60,
              strokeDashoffset: 60,
              animation: 'msuCheckDraw 0.45s cubic-bezier(0.22,0.61,0.36,1) 0.32s both',
            }}
          />
        </svg>
      </span>
      {/* Конфетти — 10 частиц вокруг. */}
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          aria-hidden
          style={{
            position: 'absolute', left: '50%', top: '50%',
            width: p.size, height: p.size,
            background: p.color,
            borderRadius: p.square ? 1 : '50%',
            marginLeft: -p.size / 2, marginTop: -p.size / 2,
            opacity: 0,
            animation: `msuParticle 0.75s cubic-bezier(0.22,0.61,0.36,1) ${p.delay}s both`,
            ['--tx' as string]: `${p.dx}px`,
            ['--ty' as string]: `${p.dy}px`,
          } as React.CSSProperties}
        />
      ))}
    </button>
  );
}
