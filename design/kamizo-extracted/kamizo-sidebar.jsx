// kamizo-sidebar.jsx — Side drawer, richer layout (not just a flat list)
// Dark stone header + quick stats strip + 2-col service grid + compact nav list
// + footer profile card with logout.

function SidebarDrawer({ open = true, onClose, onNavigate }) {
  const go = (id) => { onNavigate && onNavigate(id); onClose && onClose(); };
  // Visual service grid (the "fun" part) — colorful tiles
  const grid = [
    { Icon: IDoc, label: 'Заявки', sub: '1 в работе', fg: '#EA580C', bg: 'var(--brand-tint)', to: 'requests' },
    { Icon: IUsers, label: 'Собрания', sub: 'голосование', fg: '#0E9AAB', bg: 'rgba(14,154,171,0.12)', dot: true, to: 'meetings' },
    { Icon: IQR, label: 'Пропуска', sub: '1 активный', fg: '#15A06E', bg: 'var(--status-active-bg)', to: 'guest' },
    { Icon: ICar, label: 'Транспорт', sub: '2 авто', fg: '#6366F1', bg: 'rgba(99,102,241,0.12)', to: 'vehicles' },
  ];

  // Secondary nav as compact list
  const list = [
    { Icon: IMegaphone, label: 'Объявления', badge: 2, to: 'announcements' },
    { Icon: ICard, label: 'Оплата', sub: '312 400 сум', to: 'finance' },
    { Icon: IStar, label: 'Оценить сотрудников', to: 'rate' },
    { Icon: IPhone, label: 'Полезные контакты', to: 'contacts' },
    { Icon: ISend, label: 'Чат с УК', dot: true, to: 'chat' },
    { Icon: IFile, label: 'Договор', sub: '№ 2024-1842', to: 'contract' },
    { Icon: IGlobe, label: 'Язык', sub: 'Русский', to: 'profile' },
  ];

  return (
    <>
      {open && (
        <div onClick={onClose} style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(28,25,23,0.45)', backdropFilter: 'blur(2px)',
        }} />
      )}

      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 61,
        width: 326, background: 'var(--app-bg)',
        boxShadow: '0 0 50px rgba(28,25,23,0.22)',
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.28s var(--ease-emphasized)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* ── Dark stone header ── */}
        <div style={{
          position: 'relative', padding: '52px 18px 20px',
          background: 'var(--dark-surface)', color: 'var(--text-on-dark)', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.18, background: 'radial-gradient(120% 90% at 95% 0%, #FB923C 0%, transparent 55%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 50, height: 50, borderRadius: 15,
              background: 'linear-gradient(135deg, #FB923C, #EA580C)', color: '#fff',
              display: 'grid', placeItems: 'center', flex: '0 0 auto',
              boxShadow: '0 6px 16px rgba(249,115,22,0.4)',
            }}>
              <IBuilding size={23} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: '#FDBA74', textTransform: 'uppercase' }}>ТСЖ «Камизо»</div>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 2 }}>Дом 12А · Кв. 47</div>
            </div>
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 999,
              background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)',
              display: 'grid', placeItems: 'center', color: 'var(--text-on-dark)', cursor: 'pointer',
            }} aria-label="Закрыть"><IClose size={16} /></button>
          </div>

          {/* stats strip */}
          <div style={{ position: 'relative', display: 'flex', gap: 0, marginTop: 16 }}>
            {[
              { v: '67', l: 'м² площадь' },
              { v: '2', l: 'авто' },
              { v: '4.9', l: 'рейтинг УК' },
            ].map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid rgba(244,240,232,0.12)' : 'none' }}>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(244,240,232,0.6)', marginTop: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 12px' }}>
          {/* Service grid */}
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '0 2px 8px' }}>
            Быстрый доступ
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {grid.map((g, i) => (
              <button key={i} onClick={() => go(g.to)} style={{
                position: 'relative',
                background: 'var(--surface)', border: '1px solid var(--border-c)',
                borderRadius: 'var(--radius-lg)', padding: 13, textAlign: 'left',
                cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
                display: 'flex', flexDirection: 'column', gap: 9,
              }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: g.bg, color: g.fg, display: 'grid', placeItems: 'center' }}>
                  <g.Icon size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {g.label}
                    {g.dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: g.fg, animation: 'kzPulse 1.6s infinite' }} />}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{g.sub}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Compact list */}
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '18px 2px 8px' }}>
            Ещё
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
            {list.map((it, i) => (
              <button key={i} onClick={() => go(it.to)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                borderBottom: i < list.length - 1 ? '1px solid var(--hairline)' : 'none',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--surface-sunken)', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                  <it.Icon size={17} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {it.label}
                    {it.dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-active)', animation: 'kzPulse 1.6s infinite' }} />}
                  </div>
                  {it.sub && <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{it.sub}</div>}
                </div>
                {it.badge ? (
                  <span style={{ minWidth: 20, height: 20, padding: '0 6px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{it.badge}</span>
                ) : (
                  <IChevronR size={15} style={{ color: 'var(--text-muted)' }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Footer profile card ── */}
        <div style={{ padding: '10px 16px 26px', background: 'var(--surface-2)', borderTop: '1px solid var(--border-c)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 11,
            background: 'var(--surface)', border: '1px solid var(--border-c)',
            borderRadius: 'var(--radius-lg)', padding: '10px 12px', boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{
              width: 42, height: 42, borderRadius: 999,
              background: 'linear-gradient(135deg, #FB923C, #EA580C)',
              color: '#fff', fontWeight: 800, fontSize: 14,
              display: 'grid', placeItems: 'center', flex: '0 0 auto',
            }}>ФК</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 750, letterSpacing: '-0.01em' }}>Фарход Каримов</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--status-active)', marginTop: 2 }}>
                <ICheck size={11} stroke={3} /> Верифицирован
              </div>
            </div>
            <button style={{
              width: 38, height: 38, borderRadius: 12,
              background: 'var(--status-critical-bg)', border: 'none', cursor: 'pointer',
              color: 'var(--status-critical)', display: 'grid', placeItems: 'center', flex: '0 0 auto',
            }} aria-label="Выйти"><ILogout size={18} /></button>
          </div>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SidebarDrawer });
