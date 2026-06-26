// kamizo-cards.jsx — Swipeable 3D card stack (HomeHighlights-style)
// Matches kamizo.uz: gradient hero cards, peeking next card, dots indicator,
// drag/swipe with touch + mouse. Brand orange + teal gradients.

function SwipeCardStack({ cards, height = 230 }) {
  const [active, setActive] = React.useState(0);
  const [drag, setDrag] = React.useState(0);
  const dragRef = React.useRef({ startX: 0, cur: 0, active: false, moved: 0 });

  const clamp = (n) => Math.max(0, Math.min(cards.length - 1, n));

  const onStart = (clientX) => {
    dragRef.current.startX = clientX;
    dragRef.current.active = true;
    dragRef.current.moved = 0;
  };
  const onMove = (clientX) => {
    const st = dragRef.current;
    if (!st.active) return;
    st.cur = clientX - st.startX;
    st.moved = Math.max(st.moved, Math.abs(st.cur));
    setDrag(st.cur);
  };
  const onEnd = () => {
    const st = dragRef.current;
    if (!st.active) return;
    st.active = false;
    if (st.cur < -50) setActive((a) => clamp(a + 1));
    else if (st.cur > 50) setActive((a) => clamp(a - 1));
    st.cur = 0;
    setDrag(0);
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
          const Icon = card.Icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => { if (i === active && dragRef.current.moved < 6) card.onClick?.(); }}
              style={{
                position: 'absolute', left: 0, right: 0, top: 0,
                height: height - 10,
                borderRadius: 26,
                background: card.gradient,
                color: '#fff', textAlign: 'left',
                padding: 22, border: 'none',
                transform: `translateX(${diff * 32 + d}px) translateZ(${-absD * 56}px) rotateY(${diff * -5 + (i === active ? drag * 0.05 : 0)}deg) scale(${1 - absD * 0.06})`,
                opacity: absD > 2 ? 0 : 1 - absD * 0.2,
                transition: dragRef.current.active ? 'none' : 'all 0.45s cubic-bezier(0.34,1.4,0.64,1)',
                zIndex: 10 - absD,
                boxShadow: absD === 0 ? `0 18px 44px -10px ${card.shadow}` : '0 8px 20px rgba(0,0,0,0.12)',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                pointerEvents: absD === 0 ? 'auto' : 'none',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {/* thematic silhouette + soft glow */}
              <div style={{ position: 'absolute', right: -40, top: -50, width: 150, height: 150, borderRadius: 999, background: 'rgba(255,255,255,0.1)' }} />
              {card.silhouette && <Silhouette kind={card.silhouette} opacity={0.16} />}

              {card.badge && (
                <div style={{
                  position: 'absolute', top: 18, right: 18,
                  background: 'rgba(255,255,255,0.25)', backdropFilter: 'blur(10px)',
                  padding: '5px 12px', borderRadius: 999,
                  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>{card.badge}</div>
              )}

              <div style={{ position: 'relative' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 999,
                  border: '2.5px solid rgba(255,255,255,0.55)',
                  display: 'grid', placeItems: 'center', marginBottom: 16,
                }}>
                  <Icon size={26} stroke={2.4} />
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.025em', lineHeight: 1.05, textWrap: 'pretty' }}>
                  {card.title}
                </div>
                {card.sub && (
                  <div style={{ fontSize: 13.5, opacity: 0.88, marginTop: 8, lineHeight: 1.35, maxWidth: '85%' }}>
                    {card.sub}
                  </div>
                )}
              </div>

              {card.cta && (
                <div style={{
                  position: 'relative', alignSelf: 'flex-start',
                  background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)',
                  padding: '10px 18px', borderRadius: 14,
                  fontSize: 14, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                }}>
                  {card.cta}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Dots */}
      <div style={{ position: 'relative', zIndex: 20, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14 }}>
        {cards.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`Карточка ${i + 1}`}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              padding: '8px 4px', margin: 0, lineHeight: 0,
            }}
          >
            <span style={{
              display: 'block', height: 7, borderRadius: 4,
              width: i === active ? 22 : 7,
              background: i === active ? 'var(--brand-500)' : 'var(--stone-300)',
              transition: 'all 0.35s cubic-bezier(0.34,1.4,0.64,1)',
            }} />
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SwipeCardStack });
