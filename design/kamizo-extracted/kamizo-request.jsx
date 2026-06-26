// kamizo-request.jsx — New Request wizard, 3-step bottom sheet
// Steps: 1) category, 2) description + photos + slot, 3) confirm.

const reqStyles = {
  backdrop: {
    position: 'absolute', inset: 0, zIndex: 30,
    background: 'rgba(28, 25, 23, 0.45)',
    backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    background: 'var(--bg-elevated)',
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    boxShadow: '0 -10px 40px rgba(0,0,0,0.18)',
    maxHeight: '88%',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  grabber: {
    width: 38, height: 5, background: 'var(--stone-300)',
    borderRadius: 999, margin: '8px auto 0',
  },
  header: {
    padding: '6px 18px 8px',
    display: 'flex', alignItems: 'center', gap: 10,
  },
  back: {
    width: 36, height: 36, borderRadius: 999,
    background: 'var(--stone-100)', border: 'none',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
    color: 'var(--text-2)',
  },
  closeBtn: {
    width: 36, height: 36, borderRadius: 999,
    background: 'var(--stone-100)', border: 'none',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
    color: 'var(--text-2)', marginLeft: 'auto',
  },
  stepDots: {
    display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto', marginRight: 8,
  },
  body: {
    flex: 1, overflow: 'auto', padding: '4px 20px 18px',
  },
  footer: {
    padding: '12px 20px 28px',
    background: '#fff',
    borderTop: '1px solid var(--hairline)',
  },
  primary: {
    width: '100%', padding: '14px 16px',
    borderRadius: 14, border: 'none', cursor: 'pointer',
    background: 'var(--amber-600)', color: '#fff',
    fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    boxShadow: 'var(--sh-amber)',
  },
  primaryDisabled: { background: 'var(--stone-200)', color: 'var(--text-3)', boxShadow: 'none' },
  ghost: {
    width: '100%', padding: '14px 16px',
    borderRadius: 14, border: '1px solid var(--border-strong)', cursor: 'pointer',
    background: '#fff', color: 'var(--text)',
    fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
  },
  h1: {
    fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em',
    color: 'var(--text)', marginTop: 6, lineHeight: 1.2,
    textWrap: 'pretty',
  },
  sub: {
    fontSize: 13.5, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.4,
  },
};

function Dot({ active }) {
  return <span style={{
    width: active ? 18 : 6, height: 6, borderRadius: 999,
    background: active ? 'var(--amber-600)' : 'var(--stone-300)',
    transition: 'all .25s',
  }} />;
}

// ─────────────────────────────────────────────────────────────
// Step 1: Category
const CATEGORIES = [
  { id: 'plumbing',  Icon: IDrop,    label: 'Сантехника',     sub: 'Протечка, давление, унитаз', color: '#2563EB', bg: '#DBEAFE', sla: '~2 ч' },
  { id: 'electric',  Icon: IBolt,    label: 'Электрика',      sub: 'Свет, розетки, щиток',        color: '#F59E0B', bg: '#FEF3C7', sla: '~3 ч' },
  { id: 'heating',   Icon: IFlame,   label: 'Отопление',      sub: 'Холодные батареи, протечка', color: '#DC2626', bg: '#FEE2E2', sla: '~4 ч' },
  { id: 'elevator',  Icon: IElevator,label: 'Лифт',           sub: 'Не работает, шум, кнопки',    color: '#57534E', bg: '#F5F5F4', sla: 'срочно' },
  { id: 'cleaning',  Icon: IBroom,   label: 'Уборка',         sub: 'Подъезд, мусор, лестница',    color: '#16A34A', bg: '#DCFCE7', sla: 'до завтра' },
  { id: 'parking',   Icon: ICar,     label: 'Парковка',       sub: 'Шлагбаум, чужое авто',        color: '#7C3AED', bg: '#EDE9FE', sla: '~1 ч' },
  { id: 'security',  Icon: IShield,  label: 'Безопасность',   sub: 'Двери, домофон, камеры',      color: '#0891B2', bg: '#CFFAFE', sla: '~30 мин' },
  { id: 'other',     Icon: IDots,    label: 'Другое',         sub: 'Опишите своими словами',      color: '#78716C', bg: '#F5F5F4', sla: '—' },
];

function StepCategory({ value, onChange }) {
  return (
    <div>
      <div style={reqStyles.h1}>С чем нужна помощь?</div>
      <div style={reqStyles.sub}>Выберите категорию — мы направим заявку нужному мастеру.</div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {CATEGORIES.map(c => {
          const sel = value === c.id;
          return (
            <button key={c.id} onClick={() => onChange(c.id)} style={{
              textAlign: 'left', cursor: 'pointer',
              padding: 14,
              background: sel ? 'var(--amber-50)' : '#fff',
              border: sel ? '1.5px solid var(--amber-600)' : '1px solid var(--border)',
              borderRadius: 16, position: 'relative',
              boxShadow: sel ? '0 4px 12px rgba(217,119,6,0.12)' : 'var(--sh-1)',
              transition: 'all .15s',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: c.bg, color: c.color,
                display: 'grid', placeItems: 'center', marginBottom: 10,
              }}>
                <c.Icon size={19} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em' }}>{c.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1, lineHeight: 1.3 }}>{c.sub}</div>
              <div style={{ marginTop: 8, fontSize: 11, fontWeight: 600, color: sel ? 'var(--amber-700)' : 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <IClock size={11} stroke={2.2} /> {c.sla}
              </div>
              {sel && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 20, height: 20, borderRadius: 999,
                  background: 'var(--amber-600)', color: '#fff',
                  display: 'grid', placeItems: 'center',
                }}>
                  <ICheck size={12} stroke={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2: Description + photos + slot
const SLOTS = [
  { id: 'asap',     label: 'Как можно скорее', sub: 'обычно ~2 ч' },
  { id: 'today_pm', label: 'Сегодня 15–18', sub: 'Бахтиёр Р.' },
  { id: 'tom_am',   label: 'Завтра 09–12', sub: '3 мастера свободны' },
  { id: 'tom_pm',   label: 'Завтра 14–17', sub: '2 мастера свободны' },
];

function StepDescribe({ value, onChange, slot, onSlot, photos, onPhotos }) {
  return (
    <div>
      <div style={reqStyles.h1}>Расскажите подробнее</div>
      <div style={reqStyles.sub}>Чем точнее опишете — тем быстрее придёт мастер с нужными инструментами.</div>

      {/* Description */}
      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
          Описание
        </label>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Например: капает из-под раковины, образовалась лужа..."
          style={{
            width: '100%', minHeight: 96, marginTop: 6,
            padding: '12px 14px',
            background: 'var(--stone-50)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            fontFamily: 'inherit', fontSize: 14.5, color: 'var(--text)',
            resize: 'none', outline: 'none', lineHeight: 1.4,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Минимум 12 символов</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {value.length}/500
          </span>
        </div>
      </div>

      {/* Photos */}
      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
          Фото (по желанию)
        </label>
        <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
          {photos.map((p, i) => (
            <div key={i} style={{
              width: 72, height: 72, borderRadius: 12, position: 'relative',
              background: `linear-gradient(135deg, ${p.bg1}, ${p.bg2})`,
              overflow: 'hidden',
            }}>
              <button onClick={() => onPhotos(photos.filter((_, j) => j !== i))} style={{
                position: 'absolute', top: 4, right: 4,
                width: 18, height: 18, borderRadius: 999,
                background: 'rgba(0,0,0,0.55)', color: '#fff',
                border: 'none', cursor: 'pointer',
                display: 'grid', placeItems: 'center',
              }}>
                <IClose size={11} stroke={3} />
              </button>
            </div>
          ))}
          {photos.length < 4 && (
            <button onClick={() => onPhotos([...photos, { bg1: '#FCD34D', bg2: '#D97706' }])} style={{
              width: 72, height: 72, borderRadius: 12,
              background: 'var(--stone-50)',
              border: '1.5px dashed var(--stone-300)',
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 4, color: 'var(--text-2)',
            }}>
              <ICamera size={18} />
              <span style={{ fontSize: 10, fontWeight: 600 }}>Добавить</span>
            </button>
          )}
        </div>
      </div>

      {/* Slot */}
      <div style={{ marginTop: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '0.01em' }}>
          Когда вам удобно?
        </label>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SLOTS.map(s => {
            const sel = slot === s.id;
            return (
              <button key={s.id} onClick={() => onSlot(s.id)} style={{
                cursor: 'pointer', textAlign: 'left',
                padding: '12px 14px',
                background: sel ? 'var(--amber-50)' : '#fff',
                border: sel ? '1.5px solid var(--amber-600)' : '1px solid var(--border)',
                borderRadius: 14,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 999,
                  border: sel ? '5px solid var(--amber-600)' : '1.5px solid var(--stone-300)',
                  background: '#fff', flex: '0 0 auto',
                }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>{s.label}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 1 }}>{s.sub}</div>
                </div>
                {s.id === 'asap' && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
                    padding: '3px 7px', borderRadius: 999,
                    background: 'var(--amber-600)', color: '#fff',
                    textTransform: 'uppercase',
                  }}>срочно</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3: Confirm
function StepConfirm({ data }) {
  const cat = CATEGORIES.find(c => c.id === data.category) || CATEGORIES[0];
  const slot = SLOTS.find(s => s.id === data.slot) || SLOTS[0];
  return (
    <div>
      <div style={reqStyles.h1}>Проверьте и отправьте</div>
      <div style={reqStyles.sub}>Заявка уйдёт диспетчеру вашего дома. Вы получите уведомление, когда мастер примет её.</div>

      <div style={{
        marginTop: 18, padding: 16, borderRadius: 16,
        background: '#fff', border: '1px solid var(--border)', boxShadow: 'var(--sh-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: cat.bg, color: cat.color,
            display: 'grid', placeItems: 'center',
          }}>
            <cat.Icon size={22} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 650, letterSpacing: '-0.01em' }}>{cat.label}</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>Кв. 47, Дом 12А</div>
          </div>
        </div>

        <div style={{ marginTop: 14, padding: 12, borderRadius: 12, background: 'var(--stone-50)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Описание</div>
          <div style={{ fontSize: 13.5, color: 'var(--text)', marginTop: 4, lineHeight: 1.4 }}>
            {data.description || '—'}
          </div>
        </div>

        {data.photos.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
            {data.photos.map((p, i) => (
              <div key={i} style={{
                width: 48, height: 48, borderRadius: 10,
                background: `linear-gradient(135deg, ${p.bg1}, ${p.bg2})`,
              }} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ padding: 10, background: 'var(--stone-50)', borderRadius: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Когда</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{slot.label}</div>
          </div>
          <div style={{ padding: 10, background: 'var(--stone-50)', borderRadius: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Стоимость</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>Бесплатно</div>
          </div>
        </div>
      </div>

      <div style={{
        marginTop: 12, padding: '10px 14px',
        background: 'var(--info-bg)', borderRadius: 12,
        display: 'flex', gap: 10, alignItems: 'flex-start',
        border: '1px solid #BFDBFE',
      }}>
        <IInfo size={16} style={{ color: '#1D4ED8', flex: '0 0 auto', marginTop: 1 }} />
        <div style={{ fontSize: 12, color: '#1E3A8A', lineHeight: 1.4 }}>
          Если работа платная — мастер согласует цену перед началом. Никаких сюрпризов.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Wizard shell
function NewRequestSheet({ open, onClose, onSubmitted }) {
  const [step, setStep] = React.useState(0);
  const [category, setCategory] = React.useState('plumbing');
  const [description, setDescription] = React.useState('Капает из-под раковины в ванной, образовалась небольшая лужа.');
  const [photos, setPhotos] = React.useState([{ bg1: '#FCD34D', bg2: '#D97706' }]);
  const [slot, setSlot] = React.useState('asap');
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setStep(0); setSubmitted(false); }
  }, [open]);

  if (!open) return null;

  const canNext = (() => {
    if (step === 0) return !!category;
    if (step === 1) return description.trim().length >= 12 && !!slot;
    return true;
  })();

  const titleByStep = ['Категория', 'Детали', 'Подтверждение'];

  if (submitted) {
    return (
      <div style={reqStyles.backdrop} onClick={onClose}>
        <div style={{ ...reqStyles.sheet, maxHeight: '60%' }} onClick={e => e.stopPropagation()}>
          <div style={reqStyles.grabber} />
          <div style={{ padding: '32px 24px 24px', textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: 999,
              background: 'var(--success-bg)', color: 'var(--success)',
              display: 'grid', placeItems: 'center', margin: '0 auto 16px',
            }}>
              <ICheck size={36} stroke={2.6} />
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Заявка #1843 отправлена
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 8, lineHeight: 1.4 }}>
              Диспетчер назначит мастера в&nbsp;течение 15 минут. Вы получите push-уведомление.
            </div>
          </div>
          <div style={reqStyles.footer}>
            <button style={reqStyles.primary} onClick={onSubmitted}>
              Готово
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={reqStyles.backdrop} onClick={onClose}>
      <div style={reqStyles.sheet} onClick={e => e.stopPropagation()}>
        <div style={reqStyles.grabber} />
        <div style={reqStyles.header}>
          {step > 0 ? (
            <button style={reqStyles.back} onClick={() => setStep(step - 1)} aria-label="Назад">
              <IArrowL size={18} />
            </button>
          ) : (
            <div style={{ width: 36 }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Шаг {step + 1} из 3
            </div>
            <div style={{ fontSize: 14, fontWeight: 650, marginTop: 1 }}>
              {titleByStep[step]}
            </div>
          </div>
          <button style={reqStyles.closeBtn} onClick={onClose} aria-label="Закрыть">
            <IClose size={16} stroke={2.4} />
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '4px 0 8px' }}>
          {[0,1,2].map(i => <Dot key={i} active={i === step} />)}
        </div>

        <div style={reqStyles.body}>
          {step === 0 && <StepCategory value={category} onChange={setCategory} />}
          {step === 1 && (
            <StepDescribe
              value={description} onChange={setDescription}
              slot={slot} onSlot={setSlot}
              photos={photos} onPhotos={setPhotos}
            />
          )}
          {step === 2 && (
            <StepConfirm data={{ category, description, photos, slot }} />
          )}
        </div>

        <div style={reqStyles.footer}>
          <button
            style={{
              ...reqStyles.primary,
              ...(canNext ? {} : reqStyles.primaryDisabled),
            }}
            disabled={!canNext}
            onClick={() => {
              if (step < 2) setStep(step + 1);
              else setSubmitted(true);
            }}
          >
            {step < 2 ? 'Далее' : 'Отправить заявку'}
            {step < 2 && <IArrowR size={16} stroke={2.4} />}
          </button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewRequestSheet });
