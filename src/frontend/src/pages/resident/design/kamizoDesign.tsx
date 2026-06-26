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

// v118.71 — Silhouettes ported 1:1 from handoff kamizo-silhouettes.jsx —
// switched from filled-blob shapes to crisp stroke-outline line icons
// (strokeWidth 4.4, round caps/joins) that bleed off the bottom-right
// corner of each gradient card. Reads as intentional superapp decoration
// instead of an opaque smudge. Bumped wrap size to 196, anchor to
// right:-16 / bottom:-22 per handoff.
export function Silhouette({ kind, color = '#fff', opacity = 0.2, size = 196 }: { kind: string; color?: string; opacity?: number; size?: number }) {
  const wrap: React.CSSProperties = { position: 'absolute', right: -16, bottom: -22, width: size, height: size, pointerEvents: 'none' };
  const s = { fill: 'none', stroke: color, strokeWidth: 4.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, opacity };
  const svg = (children: React.ReactNode, vb = '0 0 100 100') => <svg viewBox={vb} style={wrap}>{children}</svg>;
  switch (kind) {
    // регистрация / онбординг → удостоверение жителя
    case 'check':
    case 'idcard':
      return svg(<g {...s}><rect x="14" y="26" width="72" height="50" rx="9" /><circle cx="36" cy="46" r="8.5" /><path d="M23 64c0-8 6-12 13-12s13 4 13 12" /><line x1="58" y1="44" x2="78" y2="44" /><line x1="58" y1="55" x2="73" y2="55" /></g>);
    // голосование → бюллетень с галочкой
    case 'ballot':
    case 'people':
      return svg(<g {...s}><rect x="26" y="14" width="48" height="62" rx="7" /><path d="M35 42l9 9 20-22" /><line x1="35" y1="62" x2="58" y2="62" /><line x1="35" y1="70" x2="50" y2="70" /></g>);
    // гостевой доступ → QR (finder-паттерны + сетка модулей)
    case 'qr': {
      const finder = (x: number, y: number) => (
        <g key={`f-${x}-${y}`}>
          <rect x={x} y={y} width="24" height="24" rx="5" fill="none" stroke={color} strokeWidth="4.6" />
          <rect x={x + 8} y={y + 8} width="8" height="8" rx="2" fill={color} stroke="none" />
        </g>
      );
      const mod: [number, number][] = [
        [42,6],[60,6],[42,15],[51,24],[60,15],
        [6,42],[15,42],[24,51],[6,60],[15,69],[24,42],
        [42,42],[51,42],[60,51],[42,51],[51,60],[69,42],[78,51],[87,42],
        [42,69],[51,78],[60,69],[42,87],[69,69],[78,69],[87,60],[69,87],[87,87],[78,78],
      ];
      return svg(<g opacity={opacity} fill={color}>{finder(6, 6)}{finder(70, 6)}{finder(6, 70)}{mod.map(([x, y], i) => <rect key={i} x={x} y={y} width="6" height="6" rx="1.5" />)}</g>);
    }
    // полезные контакты → телефонная трубка
    case 'phone':
      return svg(<path {...s} d="M30 18c-6 0-10 4-10 10 0 28 26 54 54 54 6 0 10-4 10-10v-9c0-3-2-5-5-6l-13-3c-3-1-6 0-7 3l-3 6c-10-5-18-13-23-23l6-3c3-1 4-4 3-7l-3-13c-1-3-3-5-6-5z" />);
    // оценка → звезда
    case 'star':
      return svg(<path {...s} d="M50 12l11 24 26 3-19.5 18 5.5 26-23-14-23 14 5.5-26L15 39l26-3z" />);
    // авто → силуэт машины
    case 'car':
      return svg(<g {...s}><path d="M15 56l7-20c1.4-4 5-7 9.5-7h37c4.5 0 8 3 9.5 7l7 20" /><rect x="9" y="55" width="82" height="23" rx="7" /><circle cx="30" cy="79" r="7.5" /><circle cx="70" cy="79" r="7.5" /></g>);
    // оплата → стопка монет (used by BalanceCard in ResidentHomeDesign)
    case 'coins':
      return svg(<g {...s}><ellipse cx="40" cy="30" rx="25" ry="8.5" /><path d="M15 30v11c0 4.7 11.2 8.5 25 8.5s25-3.8 25-8.5V30" /><ellipse cx="60" cy="58" rx="25" ry="8.5" /><path d="M35 58v11c0 4.7 11.2 8.5 25 8.5s25-3.8 25-8.5V58" /></g>);
    // заявка / протечка → капля
    case 'drop':
      return svg(<path {...s} d="M50 12s28 28 28 47a28 28 0 11-56 0C22 40 50 12 50 12z" />);
    // услуги / ремонт → гаечный ключ
    case 'wrench':
      return svg(<path {...s} d="M64 16a17 17 0 0019 23L60 62 39 83a8.5 8.5 0 01-12-12l21-21-19-19A17 17 0 0164 16z" />);
    // собрание / дом → здание
    case 'building':
      return svg(<g {...s}><rect x="26" y="18" width="48" height="64" rx="5" /><line x1="38" y1="32" x2="46" y2="32" /><line x1="54" y1="32" x2="62" y2="32" /><line x1="38" y1="46" x2="46" y2="46" /><line x1="54" y1="46" x2="62" y2="46" /><line x1="38" y1="60" x2="46" y2="60" /><line x1="54" y1="60" x2="62" y2="60" /></g>);
    default:
      return null;
  }
}

interface SwipeCard {
  id: string; Icon: (p: IP) => JSX.Element; silhouette?: string;
  badge?: string; title: string; sub?: string; cta?: string;
  gradient: string; shadow: string; onClick?: () => void;
}

// Default card-stack height was 230 — chosen before the registration
// card existed. The registration card is the densest (2-line title +
// "Не заполнено: пароль" sub + "Заполнить →" CTA), and at 230 it
// clipped the CTA below the card's `overflow:hidden` line. Bump the
// default to 250 (renders ~240 px tall) and tighten the internal
// rhythm (smaller avatar, tighter title leading, smaller CTA padding)
// so every card — registration + voting + guest + rate + contacts +
// find-car — has at least ~16 px breathing room below the CTA.
export function SwipeCardStack({ cards, height = 250 }: { cards: SwipeCard[]; height?: number }) {
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
    // v118.81 — isolation:isolate creates a new stacking context for the
    // whole swipe band. Required because the dots indicator below has
    // `position:relative + zIndex:20` which, without an isolated parent,
    // leaks up to compete with the sticky HomeHero (v222, zIndex:50)
    // at the .main-content level — dots painted ABOVE the hero on scroll.
    // Containing the z-index here keeps the dots above the cards inside
    // the band but below the hero externally.
    <div style={{ isolation: 'isolate' }}>
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
                // v118.70 — prototype boxShadow: brand drop + 1px inset top
                // sheen + 1px inset border. Gives the active card a
                // 3D-glossy "lifted" feel vs the flat shadow shipped before.
                boxShadow: absD === 0
                  ? `0 18px 44px -10px ${card.shadow}, inset 0 1px 0 rgba(255,255,255,0.28), inset 0 0 0 1px rgba(255,255,255,0.10)`
                  : '0 8px 20px rgba(0,0,0,0.12)',
                // v118.70 — switched flex-start → space-between to match
                // prototype: icon+title+sub at the top, CTA pinned at the
                // bottom of the card. Card height stays 250 so longer uz
                // translations don't clip; on the registration card this
                // leaves ~30 px of breathing room between sub and CTA,
                // which matches the handoff at scale.
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                pointerEvents: absD === 0 ? 'auto' : 'none', overflow: 'hidden', cursor: 'pointer',
              }}
            >
              {/* v118.70 — corner glow now a radial gradient (210×210, white
                  18%→0 at 68%) instead of a flat 150×150 solid white tint —
                  blends into the gradient body rather than reading as a
                  pasted-on disc. */}
              <div style={{ position: 'absolute', right: -56, top: -64, width: 210, height: 210, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 68%)', pointerEvents: 'none' }} />
              {/* v118.70 — silhouette opacity 0.16 → 0.22 per prototype */}
              {card.silhouette && <Silhouette kind={card.silhouette} opacity={0.22} />}
              {/* v118.70 — top sheen overlay (white 16%→0 in top 34%) — was
                  missing entirely. Gives the gradient a glossy "wet" reading
                  near the badge row. */}
              <div style={{ position: 'absolute', inset: 0, borderRadius: 26, background: 'linear-gradient(180deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 34%)', pointerEvents: 'none' }} />
              {card.badge && (
                <div style={{ position: 'absolute', top: 18, right: 18, background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)', padding: '5px 12px', borderRadius: 999, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{card.badge}</div>
              )}
              <div style={{ position: 'relative' }}>
                {/* v118.70 — icon circle bumped 48 → 52, icon size 24 → 26,
                    marginBottom 12 → 16 per prototype. */}
                <div style={{ width: 52, height: 52, borderRadius: 999, border: '2.5px solid rgba(255,255,255,0.55)', display: 'grid', placeItems: 'center', marginBottom: 16 }}>
                  <Ic size={26} stroke={2.4} />
                </div>
                {/* v118.70 — title 23 → 26 / lineHeight 1.12 → 1.05 per prototype */}
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, textWrap: 'pretty' }}>{card.title}</div>
                {/* v118.70 — sub fontSize 13 → 13.5, marginTop 6 → 8 per prototype */}
                {card.sub && <div style={{ fontSize: 13.5, opacity: 0.88, marginTop: 8, lineHeight: 1.35, maxWidth: '85%' }}>{card.sub}</div>}
              </div>
              {card.cta && (
                /* v118.70 — CTA padding 9×16 → 10×18, fontSize 13.5 → 14, drop
                    explicit marginTop (space-between handles vertical spacing) */
                <div style={{ position: 'relative', alignSelf: 'flex-start', background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', padding: '10px 18px', borderRadius: 14, fontSize: 14, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7 }}>{card.cta}</div>
              )}
            </button>
          );
        })}
      </div>
      {/* v118.70 — dots margin 6 → 14 per prototype */}
      <div style={{ position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 11, marginTop: 14 }}>
        {cards.map((_, i) => (
          /* className="icon-only" + inline minWidth/minHeight: 0 to escape
             the global `button:not(.icon-only){min-width:44px;min-height:44px}`
             rule in index.css that was inflating each dot button to a 44 px
             touch target and spreading the dots across the screen. */
          <button
            key={i}
            type="button"
            className="icon-only"
            onClick={() => setActive(i)}
            aria-label={`Карточка ${i + 1}`}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', margin: 0, lineHeight: 0, minWidth: 0, minHeight: 0, width: 'auto', height: 'auto' }}
          >
            <span style={{ display: 'block', height: 7, borderRadius: 4, width: i === active ? 22 : 7, background: i === active ? 'var(--brand-500)' : 'var(--stone-300)', transition: 'all 0.35s cubic-bezier(0.34,1.4,0.64,1)' }} />
          </button>
        ))}
      </div>
    </div>
  );
}
