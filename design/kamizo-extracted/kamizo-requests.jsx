// kamizo-requests.jsx — Requests tab (Активные / На приёмке / История)
// FOUNDATION: beige, white cards, status tokens, segment tabs, filter accordion.

const STATUS = {
  new:              { label: 'Новая',       fg: 'var(--status-info)',     bg: 'var(--status-info-bg)' },
  assigned:         { label: 'Назначена',   fg: 'var(--status-info)',     bg: 'var(--status-info-bg)' },
  accepted:         { label: 'Принята',     fg: 'var(--status-info)',     bg: 'var(--status-info-bg)' },
  in_progress:      { label: 'В работе',    fg: 'var(--brand-dark)',      bg: 'var(--brand-tint)' },
  pending_approval: { label: 'На приёмке',  fg: 'var(--status-pending)',  bg: 'var(--status-pending-bg)' },
  completed:        { label: 'Завершена',   fg: 'var(--status-active)',   bg: 'var(--status-active-bg)' },
  cancelled:        { label: 'Отменена',    fg: 'var(--status-expired)',  bg: 'var(--status-expired-bg)' },
};

const CAT_ICON = {
  plumbing: IDrop, electric: IBolt, heating: IFlame, elevator: IElevator,
  cleaning: IBroom, parking: ICar, security: IShield, other: IDots,
};

function StageBar({ stage }) {
  // 4 stages: 0 Создана · 1 Назначена · 2 Выполняется · 3 Выполнено
  const steps = ['Создана', 'Назначена', 'Выполняется', 'Готово'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 12 }}>
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{
              width: 7, height: 7, borderRadius: 999,
              background: i <= stage ? 'var(--brand)' : 'var(--surface-sunken)',
            }} />
            <span style={{ fontSize: 9.5, fontWeight: i === stage ? 700 : 600, color: i <= stage ? 'var(--text-primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>{s}</span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, borderRadius: 999, background: i < stage ? 'var(--brand)' : 'var(--surface-sunken)' }} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// status → stage index
function stageOf(status) {
  if (['new'].includes(status)) return 0;
  if (['assigned', 'accepted'].includes(status)) return 1;
  if (['in_progress'].includes(status)) return 2;
  return 3;
}

function RequestCard({ r, onOpen, onApprove }) {
  const st = STATUS[r.status] || STATUS.new;
  const Cat = CAT_ICON[r.category] || IDots;
  const urgent = r.priority === 'urgent';
  return (
    <button onClick={onOpen} style={{
      position: 'relative', width: '100%', textAlign: 'left',
      background: 'var(--surface)', border: '1px solid var(--border-c)',
      borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)',
      padding: '14px 15px 14px 18px', cursor: 'pointer', overflow: 'hidden',
    }}>
      {/* status stripe */}
      <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, borderRadius: '0 3px 3px 0', background: urgent ? 'var(--status-critical)' : st.fg }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
          <Cat size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
            {urgent && (
              <span style={{ flex: '0 0 auto', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--status-critical)', background: 'var(--status-critical-bg)', padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase' }}>Срочно</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'var(--font-num)', fontVariantNumeric: 'tabular-nums' }}>#{r.number}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>·</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.executor || 'Ожидает мастера'}</span>
          </div>
        </div>
        <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: st.fg, background: st.bg, padding: '4px 9px', borderRadius: 999, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>{st.label}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.date}</span>
        </div>
      </div>

      {/* photo strip */}
      {r.photos > 0 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingLeft: 54 }}>
          {Array.from({ length: r.photos }).map((_, i) => (
            <div key={i} style={{ width: 44, height: 44, borderRadius: 10, background: `linear-gradient(135deg, #FDBA74, #C2410C)`, opacity: 0.85 - i * 0.12 }} />
          ))}
        </div>
      )}

      {/* active stage bar */}
      {['assigned', 'accepted', 'in_progress'].includes(r.status) && <StageBar stage={stageOf(r.status)} />}

      {/* approve CTA */}
      {r.status === 'pending_approval' && (
        <div onClick={(e) => { e.stopPropagation(); onApprove?.(); }} style={{
          marginTop: 12, padding: '11px', borderRadius: 'var(--radius-md)',
          background: 'var(--brand)', color: '#fff', textAlign: 'center',
          fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em', boxShadow: 'var(--sh-brand)',
        }}>Принять работу</div>
      )}
    </button>
  );
}

function RequestSkeleton() {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', padding: 15, display: 'flex', gap: 12 }}>
      <div style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--surface-sunken)' }} />
      <div style={{ flex: 1 }}>
        <div style={{ height: 14, width: '60%', borderRadius: 6, background: 'var(--surface-sunken)' }} />
        <div style={{ height: 11, width: '40%', borderRadius: 6, background: 'var(--surface-sunken)', marginTop: 8 }} />
      </div>
      <div style={{ width: 64, height: 20, borderRadius: 999, background: 'var(--surface-sunken)' }} />
    </div>
  );
}

function EmptyRequests({ onNew }) {
  return (
    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
      <div style={{ width: 72, height: 72, borderRadius: 999, background: 'var(--surface-sunken)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
        <IDoc size={32} />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Заявок пока нет</div>
      <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>Создайте заявку — сантехник, электрик,<br/>уборка и другое.</div>
      <button onClick={onNew} style={{ marginTop: 18, padding: '12px 22px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)' }}>Создать заявку</button>
    </div>
  );
}

function RequestsScreen({ activeTab = 'requests', onTabChange, onNewRequest, loading = false }) {
  const [sub, setSub] = React.useState('active');
  const [showFilters, setShowFilters] = React.useState(false);
  const [cat, setCat] = React.useState('all');
  const [detail, setDetail] = React.useState(null);
  const [approve, setApprove] = React.useState(null);

  const all = {
    active: [
      { number: '1842', title: 'Протечка в ванной', category: 'plumbing', status: 'in_progress', executor: 'Бахтиёр Р.', date: 'сегодня', photos: 2, priority: 'urgent' },
      { number: '1839', title: 'Не работает розетка', category: 'electric', status: 'accepted', executor: 'Хасан Т.', date: 'вчера', photos: 0 },
      { number: '1835', title: 'Шум в лифте', category: 'elevator', status: 'assigned', executor: 'Ожидает мастера', date: '2 дня назад', photos: 0 },
    ],
    pending_tab: [
      { number: '1840', title: 'Замена смесителя', category: 'plumbing', status: 'pending_approval', executor: 'Бахтиёр Р.', date: 'сегодня', photos: 1 },
    ],
    history_tab: [
      { number: '1801', title: 'Уборка подъезда', category: 'cleaning', status: 'completed', executor: 'Хочат-апа', date: '20 мая', photos: 0 },
      { number: '1796', title: 'Замена лампы', category: 'electric', status: 'completed', executor: 'Хасан Т.', date: '18 мая', photos: 0 },
      { number: '1782', title: 'Вывоз мусора', category: 'other', status: 'cancelled', executor: 'Отменена', date: '12 мая', photos: 0 },
    ],
  };

  const tabs = [
    { id: 'active', label: 'Активные', count: all.active.length },
    { id: 'pending_tab', label: 'На приёмке', count: all.pending_tab.length },
    { id: 'history_tab', label: 'История', count: null },
  ];

  let list = all[sub] || [];
  if (cat !== 'all') list = list.filter(r => r.category === cat);

  const cats = [
    { id: 'all', label: 'Все' }, { id: 'plumbing', label: 'Сантехника' },
    { id: 'electric', label: 'Электрика' }, { id: 'cleaning', label: 'Уборка' },
    { id: 'elevator', label: 'Лифт' },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, padding: '52px 16px 12px', background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em' }}>Заявки</div>
          <button onClick={() => setShowFilters(f => !f)} style={{
            width: 40, height: 40, borderRadius: 12,
            background: showFilters ? 'var(--brand)' : 'var(--surface)', border: '1px solid var(--border-c)',
            display: 'grid', placeItems: 'center', color: showFilters ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
          }} aria-label="Фильтры"><IFilter size={18} /></button>
        </div>

        {/* Segment tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 4, marginTop: 14, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 4 }}>
          {tabs.map(t => {
            const on = sub === t.id;
            return (
              <button key={t.id} onClick={() => setSub(t.id)} style={{
                padding: '9px 6px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: on ? 'var(--surface)' : 'transparent',
                color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: on ? 750 : 600, letterSpacing: '-0.01em',
                boxShadow: on ? 'var(--shadow-sm)' : 'none',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.2s var(--ease-emphasized)',
              }}>
                {t.label}
                {t.count != null && t.count > 0 && (
                  <span style={{ minWidth: 17, height: 17, padding: '0 5px', borderRadius: 999, background: on ? 'var(--brand)' : 'var(--border-strong)', color: on ? '#fff' : 'var(--text-secondary)', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filter accordion */}
        <div style={{ maxHeight: showFilters ? 60 : 0, overflow: 'hidden', transition: 'max-height 0.25s var(--ease-emphasized)' }}>
          <div style={{ display: 'flex', gap: 7, paddingTop: 12, overflowX: 'auto' }}>
            {cats.map(c => {
              const on = cat === c.id;
              return (
                <button key={c.id} onClick={() => setCat(c.id)} style={{
                  flex: '0 0 auto', padding: '7px 13px', borderRadius: 999,
                  background: on ? 'var(--ink)' : 'var(--surface-sunken)',
                  color: on ? 'var(--text-on-dark)' : 'var(--text-secondary)',
                  border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 650,
                }}>{c.label}</button>
              );
            })}
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          [0, 1, 2].map(i => <RequestSkeleton key={i} />)
        ) : list.length === 0 ? (
          cat !== 'all'
            ? <div style={{ textAlign: 'center', padding: '40px 24px' }}>
                <div style={{ fontSize: 14.5, fontWeight: 650 }}>Ничего не найдено</div>
                <button onClick={() => setCat('all')} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border-c)', fontSize: 13, fontWeight: 650, color: 'var(--brand-dark)', cursor: 'pointer' }}>Сбросить фильтр</button>
              </div>
            : <EmptyRequests onNew={onNewRequest} />
        ) : (
          list.map((r, i) => <RequestCard key={i} r={r} onOpen={() => setDetail(r)} onApprove={() => setApprove(r)} />)
        )}

        {!loading && list.length > 0 && (
          <button onClick={onNewRequest} style={{
            marginTop: 4, padding: '14px', borderRadius: 'var(--radius-lg)',
            background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer',
            fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: 'var(--sh-brand)',
          }}>
            <IPlus size={18} stroke={2.4} /> Новая заявка
          </button>
        )}
      </div>

      <TabBar active={activeTab} onChange={onTabChange} onFab={onNewRequest} />
      <RequestDetailsSheet open={!!detail} request={detail} onClose={() => setDetail(null)} onApprove={(r) => { setDetail(null); setApprove(r); }} />
      <ApproveModal open={!!approve} request={approve} onClose={() => setApprove(null)} onApprove={() => {}} onReject={() => {}} />
    </div>
  );
}

Object.assign(window, { RequestsScreen });
