// kamizo-request-details.jsx — Request details bottom sheet (opens on card tap)
// Matches reference: orange header (category + #), status title, 4-step icon
// progress (Создана→Назначена→Выполняется→Выполнено), submitted time, description,
// priority, photos, executor (when assigned), and contextual action button.

const RD_STAGES = [
  { key: 'created',  label: 'Создана',     Icon: ICheck },
  { key: 'assigned', label: 'Назначена',   Icon: IUser },
  { key: 'progress', label: 'Выполняется', Icon: IWrench },
  { key: 'done',     label: 'Выполнено',   Icon: IStar },
];

const RD_CAT = {
  plumbing: { Icon: IDrop, label: 'Сантехника' },
  electric: { Icon: IBolt, label: 'Электрика' },
  heating:  { Icon: IFlame, label: 'Отопление' },
  elevator: { Icon: IElevator, label: 'Лифт' },
  cleaning: { Icon: IBroom, label: 'Уборка' },
  other:    { Icon: IDots, label: 'Заявка' },
};

const RD_PRIORITY = {
  low:    { label: 'Низкий',  fg: 'var(--status-expired)', bg: 'var(--status-expired-bg)' },
  medium: { label: 'Средний', fg: 'var(--status-pending)', bg: 'var(--status-pending-bg)' },
  high:   { label: 'Высокий', fg: 'var(--brand-dark)',     bg: 'var(--brand-tint)' },
  urgent: { label: 'Срочный', fg: 'var(--status-critical)',bg: 'var(--status-critical-bg)' },
};

function RDProgress({ stage }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '4px 0' }}>
      {RD_STAGES.map((s, i) => {
        const done = i < stage;
        const active = i === stage;
        const reached = i <= stage;
        return (
          <React.Fragment key={s.key}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: '0 0 auto', width: 64 }}>
              <div style={{
                width: 46, height: 46, borderRadius: 999,
                background: active ? 'var(--brand)' : done ? 'var(--brand-tint)' : 'var(--surface-sunken)',
                color: active ? '#fff' : done ? 'var(--brand-dark)' : 'var(--text-muted)',
                display: 'grid', placeItems: 'center',
                boxShadow: active ? '0 0 0 5px rgba(249,115,22,0.16)' : 'none',
              }}>
                <s.Icon size={21} stroke={2.1} />
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 750 : 600, color: reached ? 'var(--text-primary)' : 'var(--text-muted)', marginTop: 7, textAlign: 'center', lineHeight: 1.15 }}>{s.label}</span>
            </div>
            {i < RD_STAGES.length - 1 && (
              <div style={{ flex: 1, height: 3, borderRadius: 999, marginTop: 21, background: i < stage ? 'var(--brand)' : 'var(--surface-sunken)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function RequestDetailsSheet({ open, request, onClose, onApprove }) {
  if (!open || !request) return null;
  const r = request;
  const cat = RD_CAT[r.category] || RD_CAT.other;
  const pr = RD_PRIORITY[r.priority] || RD_PRIORITY.medium;
  const stage = (function () {
    if (r.status === 'new') return 0;
    if (['assigned', 'accepted'].includes(r.status)) return 1;
    if (r.status === 'in_progress') return 2;
    return 3; // pending_approval / completed
  })();
  const statusTitle = ['Заявка создана', 'Исполнитель назначен', 'Мастер выполняет работу', r.status === 'pending_approval' ? 'Ждёт вашей приёмки' : 'Работа выполнена'][stage];
  const statusSub = ['Ожидаем назначения исполнителя', `Назначен: ${r.executor}`, `${r.executor} в работе`, r.status === 'pending_approval' ? 'Подтвердите и оцените работу' : 'Заявка закрыта'][stage];

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(28,25,23,0.5)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-end',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '92%', overflow: 'auto',
        background: 'var(--app-bg)',
        borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
        boxShadow: '0 -10px 40px rgba(28,25,23,0.25)',
        paddingBottom: 24,
      }}>
        {/* grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--border-strong)' }} />
        </div>

        {/* card */}
        <div style={{ margin: '6px 16px 0', background: 'var(--surface)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
          {/* orange header */}
          <div style={{ position: 'relative', background: 'linear-gradient(135deg, #FB923C, #EA580C)', padding: '18px 18px 20px', color: '#fff', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 999, background: 'rgba(255,255,255,0.12)' }} />
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 56, height: 56, borderRadius: 999, background: 'rgba(255,255,255,0.22)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                <cat.Icon size={27} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>{cat.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, opacity: 0.85, fontFamily: 'var(--font-num)', marginTop: 2 }}>#UK-S-{r.number}</div>
              </div>
            </div>
          </div>

          {/* status title */}
          <div style={{ textAlign: 'center', padding: '20px 18px 16px' }}>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>{statusTitle}</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 }}>{statusSub}</div>
          </div>

          <div style={{ height: 1, background: 'var(--border-c)' }} />

          {/* progress */}
          <div style={{ padding: '18px 14px 14px' }}>
            <RDProgress stage={stage} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, color: 'var(--text-secondary)' }}>
              <IClock size={16} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>Подана: {r.submitted || '31.05.2026 03:25'}</span>
            </div>
          </div>

          <div style={{ height: 1, background: 'var(--border-c)' }} />

          {/* action */}
          <div style={{ padding: 16 }}>
            {r.status === 'pending_approval' ? (
              <button onClick={() => onApprove && onApprove(r)} style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)' }}>Принять работу</button>
            ) : ['completed', 'cancelled'].includes(r.status) ? (
              <button style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border-c)', fontSize: 15, fontWeight: 650, cursor: 'pointer' }}>Повторить заявку</button>
            ) : (
              <button style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', color: 'var(--status-critical)', border: '1px solid var(--border-c)', fontSize: 15, fontWeight: 650, cursor: 'pointer' }}>Отменить заявку</button>
            )}
          </div>
        </div>

        {/* details card */}
        <div style={{ margin: '12px 16px 0', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Описание</div>
          <div style={{ fontSize: 14.5, color: 'var(--text-primary)', marginTop: 6, lineHeight: 1.45 }}>{r.description || 'Капает из-под раковины в ванной, образовалась лужа.'}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-secondary)' }}>Приоритет:</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: pr.fg, background: pr.bg, padding: '4px 11px', borderRadius: 999 }}>{pr.label}</span>
          </div>

          {/* photos */}
          {r.photos > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginTop: 18 }}>Фото</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {Array.from({ length: r.photos }).map((_, i) => (
                  <div key={i} style={{ width: 72, height: 72, borderRadius: 12, background: 'linear-gradient(135deg, #FDBA74, #C2410C)', opacity: 0.9 - i * 0.1 }} />
                ))}
              </div>
            </>
          )}

          {/* executor */}
          {r.executor && !['Ожидает мастера', 'Отменена'].includes(r.executor) && (
            <>
              <div style={{ height: 1, background: 'var(--hairline)', margin: '16px 0' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--brand-tint)', color: 'var(--brand-dark)', fontWeight: 800, fontSize: 14, display: 'grid', placeItems: 'center' }}>
                  {r.executor.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{r.executor}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>Мастер · {cat.label}</div>
                </div>
                <button style={{ width: 42, height: 42, borderRadius: 999, background: 'var(--status-active)', color: '#fff', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer' }} aria-label="Позвонить"><IPhone size={18} /></button>
              </div>
            </>
          )}
        </div>

        <button onClick={onClose} style={{
          margin: '14px 16px 0', width: 'calc(100% - 32px)',
          padding: '13px', borderRadius: 'var(--radius-md)',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 650, color: 'var(--text-secondary)',
        }}>Закрыть</button>
      </div>
    </div>
  );
}

Object.assign(window, { RequestDetailsSheet });
