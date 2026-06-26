// kamizo-newrequest.jsx — New request flow: service catalog → form
// FOUNDATION palette. Two steps in one component (NewRequestFlow):
//   step 'catalog' — ServiceSheet: search + category chips + 2-col service tiles
//   step 'form'    — RequestForm: description, priority segments, date/time slots,
//                    photo grid (N/5), sticky submit; success check state.
// Base styles are always visible (no animation-gated opacity).

// Per-service color tones — drawn from the FOUNDATION semantic palette so the
// grid reads as organized color-coding, not rainbow. `dark` = solid stone chip.
const NR_TONES = {
  blue:   { fg: '#2F77C2', tint: 'rgba(47,119,194,0.13)',  ring: '#2F77C2', glow: 'rgba(47,119,194,0.20)' },
  amber:  { fg: '#D97706', tint: 'rgba(245,158,11,0.16)',  ring: '#F59E0B', glow: 'rgba(245,158,11,0.22)' },
  red:    { fg: '#E2483D', tint: 'rgba(226,72,61,0.13)',   ring: '#E2483D', glow: 'rgba(226,72,61,0.20)' },
  green:  { fg: '#15A06E', tint: 'rgba(21,160,110,0.14)',  ring: '#15A06E', glow: 'rgba(21,160,110,0.20)' },
  brand:  { fg: '#EA580C', tint: '#FFF1E6',                ring: '#F97316', glow: 'rgba(249,115,22,0.22)' },
  stone:  { fg: '#6F6A62', tint: 'rgba(28,25,23,0.07)',    ring: '#A8A29E', glow: 'rgba(28,25,23,0.12)' },
  dark:   { fg: '#F4F0E8', tint: '#1C1917',                ring: '#1C1917', glow: 'rgba(28,25,23,0.26)' },
};

const NR_SERVICES = [
  { id: 'plumbing',  Icon: IDrop,     label: 'Сантехника', sub: 'Протечка, кран, унитаз', cat: 'home',      tone: 'blue',  tag: 'Часто' },
  { id: 'electric',  Icon: IBolt,     label: 'Электрика',  sub: 'Свет, розетки, щиток',   cat: 'home',      tone: 'amber', tag: 'Часто' },
  { id: 'heating',   Icon: IFlame,    label: 'Отопление',  sub: 'Батареи, протечка',      cat: 'home',      tone: 'red'   },
  { id: 'elevator',  Icon: IElevator, label: 'Лифт',       sub: 'Не работает, шум',       cat: 'building',  tone: 'dark'  },
  { id: 'cleaning',  Icon: IBroom,    label: 'Уборка',     sub: 'Подъезд, лестница',      cat: 'building',  tone: 'green' },
  { id: 'trash',     Icon: ITruck,    label: 'Вывоз мусора', sub: 'Крупногабарит',        cat: 'building',  tone: 'stone' },
  { id: 'parking',   Icon: ICar,      label: 'Парковка',   sub: 'Шлагбаум, чужое авто',   cat: 'territory', tone: 'brand' },
  { id: 'security',  Icon: IShield,   label: 'Безопасность', sub: 'Домофон, камеры',      cat: 'territory', tone: 'blue'  },
  { id: 'other',     Icon: IDots,     label: 'Другое',     sub: 'Опишите проблему',       cat: 'home',      tone: 'stone' },
];

const NR_CATS = [
  { id: 'all', label: 'Все' },
  { id: 'home', label: 'В квартире' },
  { id: 'building', label: 'В доме' },
  { id: 'territory', label: 'Двор' },
];

const NR_SLOTS = [
  { id: 'asap', label: 'Как можно скорее', sub: '~2 ч' },
  { id: 'today_pm', label: 'Сегодня 15–18', sub: 'Бахтиёр Р.' },
  { id: 'tom_am', label: 'Завтра 09–12', sub: '3 мастера' },
  { id: 'tom_pm', label: 'Завтра 14–17', sub: '2 мастера' },
];

// ── Step 1: catalog ──────────────────────────────────────────
function ServiceSheet({ onPick, onClose }) {
  const [q, setQ] = React.useState('');
  const [cat, setCat] = React.useState('all');
  const [sel, setSel] = React.useState(null);

  let list = NR_SERVICES;
  if (cat !== 'all') list = list.filter(s => s.cat === cat);
  if (q.trim()) list = list.filter(s => (s.label + ' ' + s.sub).toLowerCase().includes(q.toLowerCase()));

  const selSvc = NR_SERVICES.find(s => s.id === sel);
  const selTone = selSvc ? NR_TONES[selSvc.tone] : null;

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(28,25,23,0.5)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '92%', display: 'flex', flexDirection: 'column',
        background: 'var(--app-bg)', borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
        boxShadow: '0 -10px 40px rgba(28,25,23,0.3)', overflow: 'hidden',
      }}>
        {/* ── dark stone hero header: title + search + chips ── */}
        <div style={{
          position: 'relative', overflow: 'hidden', flexShrink: 0,
          background: 'linear-gradient(155deg, #33302C 0%, #1C1917 70%)',
          padding: '11px 16px 15px', color: 'var(--text-on-dark)',
          borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
        }}>
          {/* warm glow accent */}
          <div style={{ position: 'absolute', top: -70, right: -40, width: 200, height: 200, borderRadius: 999, background: 'radial-gradient(circle, rgba(249,115,22,0.35), transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ width: 38, height: 5, borderRadius: 999, background: 'rgba(244,240,232,0.3)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 }}>С чем нужна помощь?</div>
                <div style={{ fontSize: 12.5, color: 'rgba(244,240,232,0.6)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: 'var(--status-active)', boxShadow: '0 0 0 3px rgba(21,160,110,0.25)' }} />
                  8 мастеров на смене · среднее время 2 ч
                </div>
              </div>
              <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 999, background: 'rgba(244,240,232,0.1)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', color: 'var(--text-on-dark)', cursor: 'pointer', flex: '0 0 auto' }} aria-label="Закрыть"><IClose size={16} /></button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(244,240,232,0.09)', border: '1px solid rgba(244,240,232,0.14)', borderRadius: 'var(--radius-md)', padding: '11px 13px' }}>
              <ISearch size={17} style={{ color: 'rgba(244,240,232,0.55)' }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск услуги" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14.5, fontFamily: 'var(--font)', color: 'var(--text-on-dark)' }} />
            </div>
            <div style={{ display: 'flex', gap: 7, marginTop: 11, overflowX: 'auto' }}>
              {NR_CATS.map(c => {
                const on = cat === c.id;
                return <button key={c.id} onClick={() => setCat(c.id)} style={{ flex: '0 0 auto', padding: '7px 14px', borderRadius: 999, background: on ? 'var(--brand)' : 'rgba(244,240,232,0.09)', color: on ? '#fff' : 'rgba(244,240,232,0.72)', border: on ? 'none' : '1px solid rgba(244,240,232,0.14)', cursor: 'pointer', fontSize: 12.5, fontWeight: 650, transition: 'background .15s' }}>{c.label}</button>;
              })}
            </div>
          </div>
        </div>

        {/* tiles */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {/* emergency / dispatcher quick-call */}
          {(cat === 'all' && !q.trim()) && (
            <a href="tel:1059" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 14, borderRadius: 'var(--radius-md)', background: 'var(--status-critical-bg)', border: '1px solid rgba(226,72,61,0.22)' }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--status-critical)', color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 4px 12px rgba(226,72,61,0.3)' }}><IPhone size={19} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 750, color: '#B91C1C', letterSpacing: '-0.01em' }}>Авария или ЧП?</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>Дежурный диспетчер · круглосуточно</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--status-critical)', display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 auto' }}>1059 <IChevronR size={15} stroke={2.6} /></div>
            </a>
          )}

          {list.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
              <div style={{ width: 60, height: 60, borderRadius: 999, background: 'var(--surface-sunken)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><ISearch size={26} /></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Ничего не найдено</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Попробуйте другой запрос</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {list.map(s => {
                const on = sel === s.id;
                const t = NR_TONES[s.tone] || NR_TONES.brand;
                return (
                  <button key={s.id} onClick={() => setSel(s.id)} style={{
                    position: 'relative', textAlign: 'left', cursor: 'pointer', overflow: 'hidden',
                    background: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 15,
                    border: on ? `2px solid ${t.ring}` : '1px solid var(--border-c)',
                    boxShadow: on ? `0 8px 20px ${t.glow}` : 'var(--shadow-sm)',
                    transform: on ? 'translateY(-1px)' : 'none',
                    transition: 'border-color .15s, box-shadow .15s, transform .12s var(--ease-spring)',
                  }}>
                    {/* tinted color wash behind icon */}
                    <div style={{ position: 'absolute', top: -24, left: -24, width: 78, height: 78, borderRadius: 999, background: t.tint, opacity: on ? 1 : 0.55, transition: 'opacity .15s' }} />
                    <div style={{ position: 'relative' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 13, background: t.tint, color: t.fg, display: 'grid', placeItems: 'center', marginBottom: 11 }}>
                        <s.Icon size={22} />
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{s.label}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.3 }}>{s.sub}</div>
                    </div>
                    {s.tag && !on && (
                      <span style={{ position: 'absolute', top: 12, right: 12, fontSize: 9.5, fontWeight: 750, letterSpacing: '0.02em', color: t.fg, background: t.tint, padding: '3px 7px', borderRadius: 999, textTransform: 'uppercase' }}>{s.tag}</span>
                    )}
                    {on && <div style={{ position: 'absolute', top: 12, right: 12, width: 22, height: 22, borderRadius: 999, background: t.ring, color: '#fff', display: 'grid', placeItems: 'center' }}><ICheck size={13} stroke={3} /></div>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* continue */}
        <div style={{ flexShrink: 0, padding: '12px 16px 26px', borderTop: '1px solid var(--border-c)', background: 'var(--surface)' }}>
          <button onClick={() => sel && onPick(sel)} disabled={!sel} style={{
            width: '100%', padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
            background: sel ? 'var(--brand)' : 'var(--surface-sunken)',
            color: sel ? '#fff' : 'var(--text-muted)', cursor: sel ? 'pointer' : 'default',
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', boxShadow: sel ? 'var(--sh-brand)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background .15s',
          }}>{sel ? <>Продолжить с «{selSvc.label}» <IArrowR size={17} stroke={2.4} /></> : 'Выберите услугу'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Step 2: form ─────────────────────────────────────────────
function RequestForm({ serviceId, onBack, onClose, onSubmitted }) {
  const svc = NR_SERVICES.find(s => s.id === serviceId) || NR_SERVICES[0];
  const tone = NR_TONES[svc.tone] || NR_TONES.brand;
  const [desc, setDesc] = React.useState('');
  const [priority, setPriority] = React.useState('normal');
  const [slot, setSlot] = React.useState('asap');
  const [photos, setPhotos] = React.useState([1]);
  const [touched, setTouched] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const valid = desc.trim().length >= 8;

  const submit = () => {
    setTouched(true);
    if (!valid || sending) return;
    setSending(true);
    setTimeout(() => { setSending(false); setDone(true); }, 900);
  };

  if (done) {
    return (
      <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(28,25,23,0.5)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
        <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--app-bg)', borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)', padding: '32px 24px 30px', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 999, background: 'var(--status-active-bg)', color: 'var(--status-active)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>
            <ICheck size={42} stroke={2.6} />
          </div>
          <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>Заявка #UK-S-1843 создана</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.45 }}>Диспетчер назначит мастера в&nbsp;течение 15&nbsp;минут. Уведомим вас в&nbsp;приложении.</div>
          <button onClick={onSubmitted} style={{ width: '100%', marginTop: 22, padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)' }}>К моим заявкам</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(28,25,23,0.5)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxHeight: '94%', display: 'flex', flexDirection: 'column', background: 'var(--app-bg)', borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)', boxShadow: '0 -10px 40px rgba(28,25,23,0.25)', overflow: 'hidden' }}>
        {/* header */}
        <div style={{ flexShrink: 0, padding: '10px 16px 14px', borderBottom: '1px solid var(--border-c)', background: 'var(--surface)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
            <div style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--border-strong)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={onBack} style={{ width: 36, height: 36, borderRadius: 999, background: 'var(--surface-sunken)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto' }} aria-label="Назад"><IArrowL size={18} /></button>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: tone.tint, color: tone.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><svc.Icon size={21} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.02em' }}>{svc.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Кв. 45 · Дом 12А · автоматически</div>
            </div>
          </div>
        </div>

        {/* body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
          {/* description */}
          <label style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Опишите проблему</label>
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Например: капает из-под раковины, под ней лужа со вчера" style={{
            width: '100%', minHeight: 92, marginTop: 8, padding: '12px 14px', boxSizing: 'border-box',
            background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
            border: `1px solid ${touched && !valid ? 'var(--status-critical)' : 'var(--border-c)'}`,
            fontFamily: 'var(--font)', fontSize: 14.5, color: 'var(--text-primary)', resize: 'none', outline: 'none', lineHeight: 1.4,
          }} />
          {touched && !valid && <div style={{ fontSize: 12, color: 'var(--status-critical)', marginTop: 4 }}>Опишите проблему — минимум 8 символов</div>}

          {/* priority */}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8 }}>Приоритет</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', padding: 4 }}>
            {[{ id: 'normal', label: 'Обычный' }, { id: 'urgent', label: 'Срочный' }].map(p => {
              const on = priority === p.id;
              const crit = p.id === 'urgent';
              return <button key={p.id} onClick={() => setPriority(p.id)} style={{
                padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: on ? (crit ? 'var(--status-critical)' : 'var(--surface)') : 'transparent',
                color: on ? (crit ? '#fff' : 'var(--text-primary)') : 'var(--text-secondary)',
                fontSize: 13.5, fontWeight: on ? 750 : 600, boxShadow: on && !crit ? 'var(--shadow-sm)' : 'none',
              }}>{p.label}</button>;
            })}
          </div>

          {/* time slots */}
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8 }}>Когда удобно</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {NR_SLOTS.map(s => {
              const on = slot === s.id;
              return <button key={s.id} onClick={() => setSlot(s.id)} style={{
                textAlign: 'left', padding: '11px 13px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                background: on ? 'var(--brand-tint)' : 'var(--surface)',
                border: on ? '1.5px solid var(--brand)' : '1px solid var(--border-c)',
              }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: on ? 'var(--brand-dark)' : 'var(--text-primary)', letterSpacing: '-0.01em' }}>{s.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1 }}>{s.sub}</div>
              </button>;
            })}
          </div>

          {/* photos */}
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Фото</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{photos.length}/5</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {photos.map((p, i) => (
              <div key={i} style={{ width: 72, height: 72, borderRadius: 12, background: 'linear-gradient(135deg, #FDBA74, #C2410C)', position: 'relative' }}>
                <button onClick={() => setPhotos(photos.filter((_, j) => j !== i))} style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#fff', border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><IClose size={12} stroke={3} /></button>
              </div>
            ))}
            {photos.length < 5 && (
              <button onClick={() => setPhotos([...photos, photos.length + 1])} style={{ width: 72, height: 72, borderRadius: 12, background: 'var(--surface)', border: '1.5px dashed var(--border-strong)', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, color: 'var(--text-secondary)' }}>
                <ICamera size={20} /><span style={{ fontSize: 10, fontWeight: 600 }}>Добавить</span>
              </button>
            )}
          </div>
        </div>

        {/* sticky submit */}
        <div style={{ flexShrink: 0, padding: '12px 16px 26px', borderTop: '1px solid var(--border-c)', background: 'var(--surface)' }}>
          <button onClick={submit} disabled={sending} style={{
            width: '100%', padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
            background: 'var(--brand)', color: '#fff', cursor: sending ? 'default' : 'pointer',
            fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', boxShadow: 'var(--sh-brand)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: sending ? 0.8 : 1,
          }}>
            {sending ? <><span style={{ width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: 999, animation: 'kzSpin 0.7s linear infinite' }} /> Отправляем…</> : <><ISend size={16} /> Отправить заявку</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Flow wrapper ─────────────────────────────────────────────
function NewRequestFlow({ open = true, onClose, onSubmitted }) {
  const [step, setStep] = React.useState('catalog');
  const [serviceId, setServiceId] = React.useState(null);
  if (!open) return null;
  return step === 'catalog'
    ? <ServiceSheet onClose={onClose} onPick={(id) => { setServiceId(id); setStep('form'); }} />
    : <RequestForm serviceId={serviceId} onBack={() => setStep('catalog')} onClose={onClose} onSubmitted={onSubmitted} />;
}

Object.assign(window, { NewRequestFlow, ServiceSheet, RequestForm });
