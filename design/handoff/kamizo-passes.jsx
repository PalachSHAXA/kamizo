// kamizo-guest.jsx — Guest passes (07). Ticket-style hero + quick-create tiles
// + past passes list. FOUNDATION palette. QR rendered via QRPattern.

function QRPattern({ size = 132 }) {
  const grid = 19, cell = size / grid, cells = [];
  for (let r = 0; r < grid; r++) for (let c = 0; c < grid; c++) {
    if ((r < 7 && c < 7) || (r < 7 && c > 11) || (r > 11 && c < 7)) continue;
    if ((r * 31 + c * 17 + r * c) % 7 < 3) cells.push({ r, c });
  }
  const Finder = ({ x, y }) => (
    <g transform={`translate(${x},${y})`}>
      <rect width={cell * 7} height={cell * 7} fill="#1C1917" />
      <rect x={cell} y={cell} width={cell * 5} height={cell * 5} fill="#fff" />
      <rect x={cell * 2} y={cell * 2} width={cell * 3} height={cell * 3} fill="#1C1917" />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect width={size} height={size} fill="#fff" />
      {cells.map((c, i) => <rect key={i} x={c.c * cell} y={c.r * cell} width={cell} height={cell} fill="#1C1917" />)}
      <Finder x={0} y={0} /><Finder x={size - cell * 7} y={0} /><Finder x={0} y={size - cell * 7} />
    </svg>
  );
}

function GuestAccessScreen({ activeTab = 'home', onTabChange, onCreate }) {
  const tiles = [
    { Icon: IUser, label: 'Гость', sub: 'до 24 ч' },
    { Icon: ICar, label: 'Такси', sub: '1 проезд' },
    { Icon: IPackage, label: 'Доставка', sub: 'на 2 ч' },
    { Icon: IWrench, label: 'Мастер', sub: 'по визиту' },
  ];
  const past = [
    { name: 'Сабина · подруга', type: 'Гость', when: 'вчера, 19:04', status: 'used' },
    { name: 'Yandex Доставка', type: 'Доставка', when: '23 мая', status: 'used' },
    { name: 'Мастер по интернету', type: 'Услуги', when: '20 мая', status: 'expired' },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, padding: '52px 16px 12px', background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>QR-доступ</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Пропуска</div>
        </div>
        <button style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer' }} aria-label="История"><IHistory size={18} /></button>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* Ticket hero */}
        <div style={{ position: 'relative', filter: 'drop-shadow(0 16px 32px rgba(28,25,23,0.22))' }}>
          {/* notches */}
          <div style={{ position: 'absolute', left: -9, top: '58%', width: 18, height: 18, borderRadius: 999, background: 'var(--app-bg)', zIndex: 2 }} />
          <div style={{ position: 'absolute', right: -9, top: '58%', width: 18, height: 18, borderRadius: 999, background: 'var(--app-bg)', zIndex: 2 }} />

          <div style={{ borderRadius: 'var(--radius-xl)', overflow: 'hidden', background: 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)', color: 'var(--text-on-dark)' }}>
            {/* top: meta */}
            <div style={{ position: 'relative', padding: '18px 18px 0' }}>
              <div style={{ position: 'absolute', inset: 0, opacity: 0.4, background: 'radial-gradient(90% 80% at 90% 0%, rgba(251,146,60,0.5), transparent 55%)' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#86EFAC', background: 'rgba(34,197,94,0.18)', padding: '4px 10px', borderRadius: 999 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: '#22C55E', animation: 'kzPulse 1.6s infinite' }} /> Активен
                </span>
                <span style={{ fontSize: 12, color: 'rgba(244,240,232,0.7)', fontWeight: 600 }}>действует ещё 2 ч</span>
              </div>
              <div style={{ position: 'relative', marginTop: 14, marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ padding: 7, background: '#fff', borderRadius: 14, flex: '0 0 auto' }}><QRPattern size={108} /></div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'rgba(244,240,232,0.55)', textTransform: 'uppercase' }}>Гость</div>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15, marginTop: 3 }}>Сабина</div>
                  <div style={{ fontSize: 12.5, color: 'rgba(244,240,232,0.7)', marginTop: 8, lineHeight: 1.5 }}>Подъезд + двор<br/>Использовано: 1 из 3</div>
                </div>
              </div>
            </div>

            {/* perforation */}
            <div style={{ borderTop: '2px dashed rgba(244,240,232,0.22)', margin: '0 14px' }} />

            {/* actions */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, padding: 14 }}>
              {[{ I: IShare, l: 'Поделиться' }, { I: ICopy, l: 'Код' }, { I: IClose, l: 'Отозвать', danger: true }].map((b, i) => (
                <button key={i} style={{ padding: '10px', borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer', background: b.danger ? 'rgba(226,72,61,0.18)' : 'rgba(244,240,232,0.12)', color: b.danger ? '#FCA5A5' : 'var(--text-on-dark)', fontSize: 12, fontWeight: 650, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><b.I size={14} /> {b.l}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick create */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '20px 2px 10px' }}>Создать пропуск</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {tiles.map((t, i) => (
            <button key={i} onClick={onCreate} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 14, background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><t.Icon size={20} /></div>
              <div><div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{t.label}</div><div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{t.sub}</div></div>
            </button>
          ))}
        </div>

        {/* Past passes */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '20px 2px 10px' }}>Недавние</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          {past.map((p, i) => {
            const exp = p.status === 'expired';
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', borderBottom: i < past.length - 1 ? '1px solid var(--hairline)' : 'none', opacity: exp ? 0.55 : 1 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-sunken)', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', flex: '0 0 auto', filter: exp ? 'grayscale(1)' : 'none' }}><IQR size={17} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em' }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{p.type} · {p.when}</div>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: exp ? 'var(--status-expired-bg)' : 'var(--status-info-bg)', color: exp ? 'var(--status-expired)' : 'var(--status-info)' }}>{exp ? 'Истёк' : 'Использован'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { GuestAccessScreen, QRPattern });
