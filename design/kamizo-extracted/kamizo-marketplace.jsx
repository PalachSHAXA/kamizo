// kamizo-marketplace.jsx — Marketplace storefront (10). FOUNDATION, warm shopping.
// Sticky category chips · 2-col product grid · cart counter · detail bottom-sheet.

function MarketplaceScreen({ activeTab = 'home', onTabChange }) {
  const [cat, setCat] = React.useState('all');
  const [cart, setCart] = React.useState(2);
  const [bump, setBump] = React.useState(false);
  const [detail, setDetail] = React.useState(null);

  const cats = [
    { id: 'all', label: 'Все' }, { id: 'home', label: 'Для дома' },
    { id: 'service', label: 'Услуги' }, { id: 'food', label: 'Продукты' }, { id: 'eco', label: 'Эко' },
  ];

  const products = [
    { id: 'p1', cat: 'service', title: 'Генеральная уборка', price: 180000, rating: 4.9, cover: 'linear-gradient(135deg, #5EE7E0, #0E9AAB)', Icon: IBroom },
    { id: 'p2', cat: 'home', title: 'Фильтр для воды', price: 95000, rating: 4.7, cover: 'linear-gradient(135deg, #93C5FD, #2F77C2)', Icon: IDrop },
    { id: 'p3', cat: 'service', title: 'Мойка окон', price: 60000, rating: 4.8, cover: 'linear-gradient(135deg, #FDBA74, #EA580C)', Icon: ISpark },
    { id: 'p4', cat: 'eco', title: 'Сбор вторсырья', price: 0, rating: 5.0, cover: 'linear-gradient(135deg, #86EFAC, #15A06E)', Icon: ITree },
    { id: 'p5', cat: 'home', title: 'Замена замка', price: 120000, rating: 4.6, cover: 'linear-gradient(135deg, #C4B5FD, #7C3AED)', Icon: IKey },
    { id: 'p6', cat: 'food', title: 'Доставка воды 19л', price: 28000, rating: 4.9, cover: 'linear-gradient(135deg, #7DD3FC, #0EA5E9)', Icon: IPackage },
  ];

  const list = cat === 'all' ? products : products.filter(p => p.cat === cat);
  const fmt = (n) => n.toLocaleString('ru-RU').replace(/,/g, ' ');
  const addToCart = () => { setCart(c => c + 1); setBump(true); setTimeout(() => setBump(false), 300); };

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)' }}>
        <div style={{ padding: '52px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Магазин при УК</div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Маркетплейс</div>
          </div>
          <button style={{ position: 'relative', width: 44, height: 44, borderRadius: 14, background: 'var(--surface)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--text-primary)', cursor: 'pointer', transform: bump ? 'scale(1.15)' : 'scale(1)', transition: 'transform 0.2s var(--ease-spring)' }} aria-label="Корзина">
            <IPackage size={20} />
            {cart > 0 && <span style={{ position: 'absolute', top: 6, right: 7, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid var(--surface)' }}>{cart}</span>}
          </button>
        </div>
        {/* category chips */}
        <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', overflowX: 'auto' }}>
          {cats.map(c => {
            const on = cat === c.id;
            return <button key={c.id} onClick={() => setCat(c.id)} style={{ flex: '0 0 auto', padding: '8px 15px', borderRadius: 999, background: on ? 'var(--ink)' : 'var(--surface-sunken)', color: on ? 'var(--text-on-dark)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 650 }}>{c.label}</button>;
          })}
        </div>
      </div>

      {/* grid */}
      <div style={{ padding: '14px 16px' }}>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-secondary)' }}>
            <div style={{ width: 70, height: 70, borderRadius: 999, background: 'var(--surface-sunken)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><IPackage size={30} /></div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Скоро здесь появятся товары</div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {list.map(p => (
              <div key={p.id} style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => setDetail(p)} style={{ border: 'none', padding: 0, cursor: 'pointer', background: 'transparent' }}>
                  <div style={{ height: 96, background: p.cover, display: 'grid', placeItems: 'center' }}><p.Icon size={34} style={{ color: 'rgba(255,255,255,0.7)' }} /></div>
                </button>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                    <IStar size={12} style={{ color: '#F59E0B' }} />
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)' }}>{p.rating.toFixed(1)}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 650, letterSpacing: '-0.01em', lineHeight: 1.25, minHeight: 34 }}>{p.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{p.price === 0 ? 'Бесплатно' : fmt(p.price)}</span>
                    <button onClick={addToCart} style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand-tint)', color: 'var(--brand-dark)', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: '0 0 auto' }} aria-label="В корзину"><IPlus size={18} stroke={2.4} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* detail sheet */}
      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(28,25,23,0.5)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '90%', overflow: 'auto', background: 'var(--app-bg)', borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)', boxShadow: '0 -10px 40px rgba(28,25,23,0.25)' }}>
            <div style={{ height: 180, background: detail.cover, display: 'grid', placeItems: 'center', position: 'relative' }}>
              <detail.Icon size={56} style={{ color: 'rgba(255,255,255,0.8)' }} />
              <button onClick={() => setDetail(null)} style={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, borderRadius: 999, background: 'rgba(28,25,23,0.4)', border: 'none', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><IClose size={17} /></button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 8 }}>
                <IStar size={14} style={{ color: '#F59E0B' }} /><span style={{ fontSize: 13, fontWeight: 700 }}>{detail.rating.toFixed(1)}</span>
                <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>· 128 заказов</span>
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>{detail.title}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.5 }}>Услуга от проверенного партнёра вашего дома. Оплата онлайн, выезд по записи. Гарантия качества от УК «Камизо».</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 16 }}>
                <span style={{ fontSize: 28, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{detail.price === 0 ? 'Бесплатно' : fmt(detail.price)}</span>
                {detail.price > 0 && <span style={{ fontSize: 15, color: 'var(--text-secondary)', fontWeight: 600 }}>сум</span>}
              </div>
              <button onClick={() => { addToCart(); setDetail(null); }} style={{ width: '100%', marginTop: 18, padding: '15px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IPackage size={17} /> Заказать</button>
            </div>
          </div>
        </div>
      )}

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { MarketplaceScreen });
