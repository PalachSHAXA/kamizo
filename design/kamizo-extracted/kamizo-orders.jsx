// kamizo-orders.jsx — My marketplace orders (11). FOUNDATION. Parcel-track vibe.
// Order cards with item photo-stack, sum, status badge, delivery timeline; detail sheet.

function OrderTimeline({ stage, compact }) {
  const steps = ['Оформлен', 'Принят', 'В пути', 'Доставлен'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 5 : 6, marginTop: compact ? 12 : 8 }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: '0 0 auto' }}>
            <span style={{
              width: i === stage ? 11 : 9, height: i === stage ? 11 : 9, borderRadius: 999,
              background: i < stage ? 'var(--status-active)' : i === stage ? 'var(--brand)' : 'var(--surface-sunken)',
              boxShadow: i === stage ? '0 0 0 4px rgba(249,115,22,0.18)' : 'none',
              animation: i === stage ? 'kzPulse 1.6s infinite' : 'none',
              border: i > stage ? '1px solid var(--border-strong)' : 'none',
            }} />
            {!compact && <span style={{ fontSize: 10, fontWeight: i === stage ? 700 : 600, color: i <= stage ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s}</span>}
          </div>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 2, borderRadius: 999, background: i < stage ? 'var(--status-active)' : 'var(--surface-sunken)' }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function OrdersScreen({ activeTab = 'home', onTabChange }) {
  const [detail, setDetail] = React.useState(null);
  const fmt = (n) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const ST = {
    new: { label: 'Новый', fg: 'var(--status-info)', bg: 'var(--status-info-bg)' },
    in_work: { label: 'В работе', fg: 'var(--brand-dark)', bg: 'var(--brand-tint)' },
    in_transit: { label: 'В пути', fg: 'var(--brand-dark)', bg: 'var(--brand-tint)' },
    done: { label: 'Выполнен', fg: 'var(--status-active)', bg: 'var(--status-active-bg)' },
    cancelled: { label: 'Отменён', fg: 'var(--status-expired)', bg: 'var(--status-expired-bg)' },
  };
  const orders = [
    { id: 'o1', number: '4821', date: 'Сегодня, 11:20', sum: 208000, status: 'in_transit', stage: 2,
      items: [{ t: 'Генеральная уборка', p: 180000, c: 'linear-gradient(135deg,#5EE7E0,#0E9AAB)', I: IBroom }, { t: 'Мойка окон', p: 28000, c: 'linear-gradient(135deg,#FDBA74,#EA580C)', I: ISpark }] },
    { id: 'o2', number: '4798', date: 'Вчера', sum: 28000, status: 'done', stage: 3,
      items: [{ t: 'Доставка воды 19л', p: 28000, c: 'linear-gradient(135deg,#7DD3FC,#0EA5E9)', I: IPackage }] },
    { id: 'o3', number: '4756', date: '18 мая', sum: 95000, status: 'cancelled', stage: 0,
      items: [{ t: 'Фильтр для воды', p: 95000, c: 'linear-gradient(135deg,#93C5FD,#2F77C2)', I: IDrop }] },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      <div style={{ padding: '52px 16px 12px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Маркетплейс</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Мои заказы</div>
      </div>

      <div style={{ padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orders.map(o => {
          const st = ST[o.status];
          const cancelled = o.status === 'cancelled';
          return (
            <button key={o.id} onClick={() => setDetail(o)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 16, opacity: cancelled ? 0.62 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-num)', color: 'var(--text-secondary)' }}>Заказ №{o.number}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: st.fg, background: st.bg, padding: '3px 9px', borderRadius: 999 }}>{st.label}</span>
              </div>
              {/* photo-stack + sum */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <div style={{ display: 'flex' }}>
                  {o.items.map((it, i) => (
                    <div key={i} style={{ width: 42, height: 42, borderRadius: 11, background: it.c, display: 'grid', placeItems: 'center', marginLeft: i ? -12 : 0, border: '2px solid var(--surface)', filter: cancelled ? 'grayscale(1)' : 'none' }}><it.I size={18} style={{ color: 'rgba(255,255,255,0.85)' }} /></div>
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.items.map(i => i.t).join(', ')}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 1 }}>{o.date}</div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{fmt(o.sum)}</div>
              </div>
              {!cancelled && <OrderTimeline stage={o.stage} />}
            </button>
          );
        })}
      </div>

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(28,25,23,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '92%', overflow: 'auto', background: 'var(--app-bg)', borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)', boxShadow: '0 -10px 40px rgba(28,25,23,0.25)', paddingBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}><div style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--border-strong)' }} /></div>
            <div style={{ padding: '8px 20px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Заказ №{detail.number}</div>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: ST[detail.status].fg, background: ST[detail.status].bg, padding: '4px 10px', borderRadius: 999 }}>{ST[detail.status].label}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 3 }}>{detail.date}</div>
              {detail.status !== 'cancelled' && <div style={{ marginTop: 18 }}><OrderTimeline stage={detail.stage} /></div>}
              <div style={{ marginTop: 20, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Позиции</div>
              <div style={{ marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                {detail.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 13, borderBottom: i < detail.items.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 11, background: it.c, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><it.I size={18} style={{ color: 'rgba(255,255,255,0.85)' }} /></div>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{it.t}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(it.p)}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, padding: '0 2px' }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Итого</span>
                <span style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{fmt(detail.sum)} сум</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
                <button style={{ padding: '13px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--border-c)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><IChat size={16} /> Поддержка</button>
                <button style={{ padding: '13px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', border: 'none', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><IHistory size={16} /> Повторить</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { OrdersScreen });
