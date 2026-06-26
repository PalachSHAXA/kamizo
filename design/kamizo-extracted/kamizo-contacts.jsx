// kamizo-contacts.jsx — "Полезное рядом" — partner directory (soft advertising)
// + compact emergency strip. Promo cards with discounts for химчистка/клининг/etc.

function ContactsScreen({ activeTab = 'home', onTabChange }) {
  const [cat, setCat] = React.useState('all');

  // Emergency — compact horizontal pills (not the hero anymore)
  const emergency = [
    { label: 'Полиция', tel: '102', Icon: IShield },
    { label: 'Пожарная', tel: '101', Icon: IFlame },
    { label: 'Скорая', tel: '103', Icon: IDrop },
    { label: 'Газ', tel: '104', Icon: IBolt },
  ];

  const cats = [
    { id: 'all', label: 'Все' },
    { id: 'clean', label: 'Чистота' },
    { id: 'home', label: 'Для дома' },
    { id: 'food', label: 'Еда' },
    { id: 'health', label: 'Здоровье' },
  ];

  // Partner promos — the "hidden advertising" surface
  const partners = [
    {
      id: 'p1', cat: 'clean', featured: true,
      name: 'Lavanda', tagline: 'Химчистка и прачечная',
      promo: '−20% жителям дома', note: 'Бесплатный забор вещей от подъезда',
      rating: 4.9, reviews: 214, Icon: ISpark,
      grad: 'linear-gradient(140deg, #5EE7E0, #0E9AAB)', tel: '+998 90 700 12 12',
    },
    {
      id: 'p2', cat: 'clean',
      name: 'CleanPro', tagline: 'Генеральная уборка квартир',
      promo: 'Первая уборка −30%', note: 'Эко-средства, выезд за 2 часа',
      rating: 4.8, reviews: 168, Icon: IBroom,
      grad: 'linear-gradient(140deg, #FB923C, #EA580C)', tel: '+998 90 311 45 45',
    },
    {
      id: 'p3', cat: 'food',
      name: 'Osh Markazi', tagline: 'Доставка домашней еды',
      promo: 'Бесплатная доставка', note: 'Обеды и ужины по подписке',
      rating: 4.7, reviews: 421, Icon: ITruck,
      grad: 'linear-gradient(140deg, #FBBF24, #D97706)', tel: '+998 71 200 33 33',
    },
    {
      id: 'p4', cat: 'home',
      name: 'MebelFix', tagline: 'Ремонт и сборка мебели',
      promo: 'Замер бесплатно', note: 'Мастер в день обращения',
      rating: 4.6, reviews: 89, Icon: IWrench,
      grad: 'linear-gradient(140deg, #818CF8, #6366F1)', tel: '+998 93 808 70 70',
    },
    {
      id: 'p5', cat: 'health',
      name: 'Аптека 24', tagline: 'Круглосуточно у дома',
      promo: '−15% по карте жителя', note: 'Доставка лекарств за 30 мин',
      rating: 4.9, reviews: 302, Icon: IDrop,
      grad: 'linear-gradient(140deg, #34D399, #15A06E)', tel: '+998 71 244 90 90',
    },
  ];

  const list = cat === 'all' ? partners : partners.filter(p => p.cat === cat);

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)' }}>
        <div style={{ padding: '52px 16px 10px' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Сервисы рядом с домом</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Полезное рядом</div>
        </div>
        {/* Category chips */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto' }}>
          {cats.map(c => {
            const on = cat === c.id;
            return <button key={c.id} onClick={() => setCat(c.id)} style={{ flex: '0 0 auto', padding: '8px 15px', borderRadius: 999, background: on ? 'var(--ink)' : 'var(--surface-sunken)', color: on ? 'var(--text-on-dark)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 650 }}>{c.label}</button>;
          })}
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* Emergency compact strip */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto' }}>
          {emergency.map((e, i) => (
            <button key={i} style={{
              flex: '1 0 auto', minWidth: 76, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '11px 8px', borderRadius: 'var(--radius-md)',
              background: 'var(--surface)', border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
            }} aria-label={`Позвонить ${e.label}`}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--status-critical-bg)', color: 'var(--status-critical)', display: 'grid', placeItems: 'center' }}><e.Icon size={16} /></div>
              <span style={{ fontSize: 11.5, fontWeight: 650 }}>{e.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--status-critical)', fontFamily: 'var(--font-num)' }}>{e.tel}</span>
            </button>
          ))}
        </div>

        {/* Partner promo cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.map(p => p.featured ? (
            // Featured big card
            <div key={p.id} style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)', background: p.grad, color: '#fff', padding: 18, boxShadow: '0 12px 28px -10px rgba(14,154,171,0.5)' }}>
              <div style={{ position: 'absolute', right: -30, top: -40, width: 150, height: 150, borderRadius: 999, background: 'rgba(255,255,255,0.13)' }} />
              <Silhouette kind="star" opacity={0.14} />
              <div style={{ position: 'relative' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', background: 'rgba(255,255,255,0.22)', padding: '4px 10px', borderRadius: 999 }}>Партнёр дома</span>
                <div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 12 }}>{p.name}</div>
                <div style={{ fontSize: 13.5, opacity: 0.9, marginTop: 2 }}>{p.tagline}</div>
                <div style={{ fontSize: 17, fontWeight: 800, marginTop: 12 }}>{p.promo}</div>
                <div style={{ fontSize: 12.5, opacity: 0.88, marginTop: 3 }}>{p.note}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
                  <button style={{ flex: 1, padding: '12px', borderRadius: 'var(--radius-md)', background: '#fff', color: '#0E7A88', border: 'none', fontSize: 14, fontWeight: 750, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}><IPhone size={16} /> Связаться</button>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700 }}><IStar size={14} /> {p.rating}</div>
                </div>
              </div>
            </div>
          ) : (
            // Regular partner row
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 14 }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: p.grad, color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><p.Icon size={24} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 15.5, fontWeight: 750, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', flex: '0 0 auto' }}><IStar size={11} style={{ color: '#F59E0B' }} /> {p.rating}</span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.tagline}</div>
                <div style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 800, color: 'var(--brand-dark)', background: 'var(--brand-tint)', padding: '3px 9px', borderRadius: 999, marginTop: 8 }}>{p.promo}</div>
              </div>
              <button style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--brand)', color: '#fff', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: '0 0 auto', boxShadow: 'var(--sh-brand)' }} aria-label={`Позвонить ${p.name}`}><IPhone size={18} /></button>
            </div>
          ))}
        </div>

        {/* Soft ad-slot CTA */}
        <div style={{ marginTop: 16, padding: '16px', borderRadius: 'var(--radius-lg)', border: '1.5px dashed var(--border-strong)', textAlign: 'center', background: 'var(--surface-2)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>Здесь может быть ваш сервис</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>Размещайте предложения для жителей дома — химчистка, доставка, ремонт</div>
          <button style={{ marginTop: 12, padding: '10px 20px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--brand-dark)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Стать партнёром</button>
        </div>
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { ContactsScreen });
