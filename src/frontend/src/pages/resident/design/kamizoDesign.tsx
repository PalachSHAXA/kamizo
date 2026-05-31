/* Kamizo design primitives — ported 1:1 from the Claude Design handoff
   (kamizo-icons.jsx, kamizo-silhouettes.jsx, kamizo-cards.jsx).
   Stroke icon set, faint thematic silhouettes, and the swipeable 3D card
   stack used by the resident home. Kept verbatim so screens render exactly
   as designed. */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from 'react';

type IP = { size?: number; stroke?: number; style?: React.CSSProperties };

const Icon = ({ children, size = 22, stroke = 1.75, ...rest }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

export const IBell = (p: IP) => <Icon {...p}><path d="M6 8a6 6 0 1112 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 004 0"/></Icon>;
export const IBolt = (p: IP) => <Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Icon>;
export const IDrop = (p: IP) => <Icon {...p}><path d="M12 3s7 7 7 12a7 7 0 11-14 0c0-5 7-12 7-12z"/></Icon>;
export const IFlame = (p: IP) => <Icon {...p}><path d="M12 3c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-9z"/></Icon>;
export const IBroom = (p: IP) => <Icon {...p}><path d="M19 4l-9 9"/><path d="M14 9l-7 7-3 4 4-3 7-7"/><path d="M8 21c0-3 4-3 4 0"/></Icon>;
export const IWrench = (p: IP) => <Icon {...p}><path d="M14 7a4 4 0 105 5l-3-3 3-3a4 4 0 00-5 1z" fill="none"/><path d="M13 9L4 18a2 2 0 003 3l9-9"/></Icon>;
export const IElevator = (p: IP) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 9l3-3 3 3M9 15l3 3 3-3"/></Icon>;
export const ILeaf = (p: IP) => <Icon {...p}><path d="M20 4c0 8-5 13-13 13a7 7 0 010-14c5 0 13 1 13 1z"/><path d="M14 10l-7 7"/></Icon>;
export const IShield = (p: IP) => <Icon {...p}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/></Icon>;
export const ICar = (p: IP) => <Icon {...p}><path d="M5 13l2-5h10l2 5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><circle cx="7.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/></Icon>;
export const IDots = (p: IP) => <Icon {...p}><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></Icon>;
export const IChevronR = (p: IP) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>;
export const IPlus = (p: IP) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
export const ICheck = (p: IP) => <Icon {...p}><path d="M5 12l4 4 10-10"/></Icon>;
export const IClock = (p: IP) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>;
export const IUsers = (p: IP) => <Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 3-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.8"/><path d="M15 14c2.5 0 6 1.5 6 4.5"/></Icon>;
export const IHome = (p: IP) => <Icon {...p}><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-4v-7H8v7H4a1 1 0 01-1-1z"/></Icon>;
export const IUser = (p: IP) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/></Icon>;
export const IDoc = (p: IP) => <Icon {...p}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h4"/></Icon>;
export const ICard = (p: IP) => <Icon {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></Icon>;
export const IDownload = (p: IP) => <Icon {...p}><path d="M12 4v12M6 12l6 6 6-6M4 21h16"/></Icon>;
export const IMegaphone = (p: IP) => <Icon {...p}><path d="M3 10v4h3l8 4V6L6 10z"/><path d="M17 9a4 4 0 010 6"/></Icon>;
export const IUmbrella = (p: IP) => <Icon {...p}><path d="M3 12a9 9 0 0118 0z"/><path d="M12 3v9M12 18a2 2 0 002 2"/></Icon>;
export const ILock = (p: IP) => <Icon {...p}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></Icon>;
export const IQR = (p: IP) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1v1M14 20h3v1M20 17v4"/></Icon>;
export const IPhone = (p: IP) => <Icon {...p}><path d="M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></Icon>;
export const IStar = (p: IP) => <Icon {...p}><path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></Icon>;
export const IChat = (p: IP) => <Icon {...p}><path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.5A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></Icon>;
export const IPin = (p: IP) => <Icon {...p}><path d="M12 2c4 0 7 3 7 7 0 5-7 13-7 13S5 14 5 9c0-4 3-7 7-7z"/><circle cx="12" cy="9" r="2.5"/></Icon>;

export function Silhouette({ kind, color = '#fff', opacity = 0.14 }: { kind: string; color?: string; opacity?: number }) {
  const common = { fill: color, opacity };
  const wrap: React.CSSProperties = { position: 'absolute', right: -6, bottom: -10, width: 180, height: 180, pointerEvents: 'none' };
  const svg = (children: React.ReactNode, vb = '0 0 100 100') => <svg viewBox={vb} style={wrap}>{children}</svg>;
  switch (kind) {
    case 'people':
      return svg(<g {...common}><circle cx="28" cy="34" r="11"/><path d="M10 78c0-12 8-20 18-20s18 8 18 20z"/><circle cx="60" cy="30" r="13"/><path d="M38 80c0-14 10-23 22-23s22 9 22 23z"/><circle cx="86" cy="36" r="9"/><path d="M72 78c0-10 6-16 14-16s14 6 14 16z"/></g>);
    case 'qr':
      return svg(<g {...common}><rect x="6" y="6" width="26" height="26" rx="3"/><rect x="14" y="14" width="10" height="10" rx="1" fill="none"/><rect x="68" y="6" width="26" height="26" rx="3"/><rect x="6" y="68" width="26" height="26" rx="3"/><rect x="44" y="6" width="8" height="8"/><rect x="44" y="20" width="8" height="8"/><rect x="68" y="44" width="8" height="8"/><rect x="86" y="44" width="8" height="8"/><rect x="44" y="44" width="8" height="8"/><rect x="44" y="68" width="8" height="8"/><rect x="44" y="86" width="8" height="8"/><rect x="68" y="68" width="12" height="12"/><rect x="86" y="86" width="8" height="8"/></g>);
    case 'star':
      return svg(<path {...common} d="M50 8l12 26 28 3-21 19 6 28-25-15-25 15 6-28L20 37l28-3z"/>);
    case 'phone':
      return svg(<path {...common} d="M30 18c-6 0-10 4-10 9 0 28 26 54 54 54 5 0 9-4 9-10v-9c0-3-2-5-5-6l-13-3c-3-1-6 0-7 3l-3 6c-10-5-18-13-23-23l6-3c3-1 4-4 3-7l-3-13c-1-3-3-5-6-5z"/>);
    case 'car':
      return svg(<g {...common}><path d="M14 56l8-22c1-4 5-7 9-7h38c4 0 8 3 9 7l8 22z"/><rect x="6" y="54" width="88" height="26" rx="6"/><circle cx="28" cy="80" r="7" fill="#000" opacity="0.25"/><circle cx="72" cy="80" r="7" fill="#000" opacity="0.25"/></g>);
    case 'check':
      return svg(<g {...common}><rect x="22" y="10" width="56" height="78" rx="8"/><rect x="34" y="4" width="32" height="14" rx="5" fill="#000" opacity="0.18"/><path d="M36 44l8 8 18-18" stroke={color} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={opacity}/></g>);
    case 'drop':
      return svg(<path {...common} d="M50 8s30 30 30 50a30 30 0 11-60 0C20 38 50 8 50 8z"/>);
    case 'wrench':
      return svg(<path {...common} d="M62 16a18 18 0 0021 24L62 61 39 84a9 9 0 01-13-13l23-23-21-21a18 18 0 0134-11z"/>);
    default:
      return null;
  }
}

interface SwipeCard {
  id: string; Icon: (p: IP) => JSX.Element; silhouette?: string;
  badge?: string; title: string; sub?: string; cta?: string;
  gradient: string; shadow: string; onClick?: () => void;
}

export function SwipeCardStack({ cards, height = 230 }: { cards: SwipeCard[]; height?: number }) {
  const [active, setActive] = useState(0);
  const [, setDrag] = useState(0);
  const dragRef = useRef({ startX: 0, cur: 0, active: false, moved: 0 });
  const drag = dragRef.current.cur;
  const clamp = (n: number) => Math.max(0, Math.min(cards.length - 1, n));
  const onStart = (clientX: number) => { dragRef.current.startX = clientX; dragRef.current.active = true; dragRef.current.moved = 0; };
  const onMove = (clientX: number) => {
    const st = dragRef.current; if (!st.active) return;
    st.cur = clientX - st.startX; st.moved = Math.max(st.moved, Math.abs(st.cur)); setDrag(st.cur);
  };
  const onEnd = () => {
    const st = dragRef.current; if (!st.active) return; st.active = false;
    if (st.cur < -50) setActive((a) => clamp(a + 1)); else if (st.cur > 50) setActive((a) => clamp(a - 1));
    st.cur = 0; setDrag(0);
  };

  return (
    <div>
      <div
        onTouchStart={(e) => onStart(e.touches[0].clientX)}
        onTouchMove={(e) => onMove(e.touches[0].clientX)}
        onTouchEnd={onEnd}
        onMouseDown={(e) => onStart(e.clientX)}
        onMouseMove={(e) => onMove(e.clientX)}
        onMouseUp={onEnd}
        onMouseLeave={onEnd}
        style={{ position: 'relative', height, perspective: 1000, cursor: 'grab', userSelect: 'none', touchAction: 'pan-y' }}
      >
        {cards.map((card, i) => {
          const diff = i - active;
          const absD = Math.abs(diff);
          if (absD > 3) return null;
          const d = i === active ? drag * 0.85 : 0;
          const Ic = card.Icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => { if (i === active && dragRef.current.moved < 6) card.onClick?.(); }}
              style={{
                position: 'absolute', left: 0, right: 0, top: 0, height: height - 10, borderRadius: 26,
                background: card.gradient, color: '#fff', textAlign: 'left', padding: 22, border: 'none',
                transform: `translateX(${diff * 32 + d}px) translateZ(${-absD * 56}px) rotateY(${diff * -5 + (i === active ? drag * 0.05 : 0)}deg) scale(${1 - absD * 0.06})`,
                opacity: absD > 2 ? 0 : 1 - absD * 0.2,
                transition: dragRef.current.active ? 'none' : 'all 0.45s cubic-bezier(0.34,1.4,0.64,1)',
                zIndex: 10 - absD,
                boxShadow: absD === 0 ? `0 18px 44px -10px ${card.shadow}` : '0 8px 20px rgba(0,0,0,0.12)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                pointerEvents: absD === 0 ? 'auto' : 'none', overflow: 'hidden', cursor: 'pointer',
              }}
            >
              <div style={{ position: 'absolute', right: -40, top: -50, width: 150, height: 150, borderRadius: 999, background: 'rgba(255,255,255,0.1)' }} />
              {card.silhouette && <Silhouette kind={card.silhouette} opacity={0.16} />}
              {card.badge && (
                <div style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)', padding: '5px 12px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{card.badge}</div>
              )}
              <div style={{ position: 'relative' }}>
                <div style={{ width: 52, height: 52, borderRadius: 999, border: '2.5px solid rgba(255,255,255,0.55)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
                  <Ic size={26} stroke={2.4} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, textWrap: 'pretty' }}>{card.title}</div>
                {card.sub && <div style={{ fontSize: 13.5, opacity: 0.88, marginTop: 8, lineHeight: 1.35, maxWidth: '85%' }}>{card.sub}</div>}
              </div>
              {card.cta && (
                <div style={{ position: 'relative', alignSelf: 'flex-start', background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', padding: '10px 18px', borderRadius: 14, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>{card.cta}</div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 }}>
        {cards.map((_, i) => (
          <button key={i} type="button" onClick={() => setActive(i)} aria-label={`Карточка ${i + 1}`} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 4px', margin: 0, lineHeight: 0 }}>
            <span style={{ display: 'block', height: 7, borderRadius: 4, width: i === active ? 22 : 7, background: i === active ? 'var(--brand-500)' : 'var(--stone-300)', transition: 'all 0.35s cubic-bezier(0.34,1.4,0.64,1)' }} />
          </button>
        ))}
      </div>
    </div>
  );
}
