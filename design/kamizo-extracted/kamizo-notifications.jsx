// kamizo-notifications.jsx — Notifications center (opens from bell)
// FOUNDATION palette: beige bg, white cards, orange accent, status colors.

function NotificationsScreen({ onClose }) {
  const [filter, setFilter] = React.useState('all');

  const groups = [
    {
      label: 'Сегодня',
      items: [
        { id: 'n1', unread: true, Icon: ICheck, fg: 'var(--status-active)', bg: 'var(--status-active-bg)',
          title: 'Работа выполнена', body: 'Замена смесителя (#1840) завершена. Оцените мастера.',
          time: '10:42', cta: 'Оценить', kind: 'request' },
        { id: 'n2', unread: true, Icon: IUsers, fg: 'var(--brand-dark)', bg: 'var(--brand-tint)',
          title: 'Открыто голосование', body: 'Капремонт лифтов в подъездах 1–3. Ваш голос важен.',
          time: '09:15', cta: 'Голосовать', kind: 'vote' },
        { id: 'n3', unread: true, Icon: IBolt, fg: 'var(--status-critical)', bg: 'var(--status-critical-bg)',
          title: 'Отключение электричества', body: '28 мая с 09:00 до 16:00, подъезды 1–3.',
          time: '08:30', kind: 'announcement' },
      ],
    },
    {
      label: 'Вчера',
      items: [
        { id: 'n4', unread: false, Icon: IClock, fg: 'var(--status-pending)', bg: 'var(--status-pending-bg)',
          title: 'Перенос визита', body: 'Электрик предложил завтра 14:00 вместо сегодня.',
          time: 'вчера, 16:20', cta: 'Ответить', kind: 'reschedule' },
        { id: 'n5', unread: false, Icon: IQR, fg: 'var(--status-active)', bg: 'var(--status-active-bg)',
          title: 'Гость прошёл', body: 'Сабина воспользовалась QR-пропуском в 19:04.',
          time: 'вчера, 19:04', kind: 'guest' },
      ],
    },
    {
      label: 'Ранее',
      items: [
        { id: 'n6', unread: false, Icon: ITree, fg: 'var(--status-active)', bg: 'var(--status-active-bg)',
          title: 'Благоустройство двора', body: 'Высадили 6 чинаров. Спасибо инициативной группе.',
          time: '24 мая', kind: 'announcement' },
        { id: 'n7', unread: false, Icon: ICard, fg: 'var(--text-secondary)', bg: 'var(--surface-sunken)',
          title: 'Начисление за май', body: 'Сформирован счёт на 312 400 сум. Срок до 10 июня.',
          time: '23 мая', kind: 'finance' },
      ],
    },
  ];

  const totalUnread = groups.flatMap(g => g.items).filter(i => i.unread).length;

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: '52px 16px 12px',
        background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--border-c)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border-c)',
            display: 'grid', placeItems: 'center', color: 'var(--text-primary)', cursor: 'pointer',
          }} aria-label="Назад">
            <IArrowL size={19} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Уведомления</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 1 }}>
              {totalUnread} непрочитанных
            </div>
          </div>
          <button style={{
            fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)',
            background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 4px',
          }}>Прочитать всё</button>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto' }}>
          {[
            { id: 'all', label: 'Все' },
            { id: 'request', label: 'Заявки' },
            { id: 'vote', label: 'Собрания' },
            { id: 'announcement', label: 'Объявления' },
            { id: 'finance', label: 'Оплата' },
          ].map(f => {
            const isActive = filter === f.id;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                flex: '0 0 auto',
                padding: '7px 14px', borderRadius: 999,
                fontSize: 13, fontWeight: 650,
                background: isActive ? 'var(--ink)' : 'var(--surface)',
                color: isActive ? 'var(--text-on-dark)' : 'var(--text-secondary)',
                border: '1px solid', borderColor: isActive ? 'var(--ink)' : 'var(--border-c)',
                cursor: 'pointer', letterSpacing: '-0.01em',
              }}>{f.label}</button>
            );
          })}
        </div>
      </div>

      {/* Groups */}
      <div style={{ padding: '14px 16px' }}>
        {groups.map((g, gi) => {
          const items = filter === 'all' ? g.items : g.items.filter(i => i.kind === filter);
          if (!items.length) return null;
          return (
            <div key={gi} style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '0 4px 8px' }}>
                {g.label}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map(n => (
                  <div key={n.id} style={{
                    position: 'relative',
                    background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-sm)',
                    padding: 14, display: 'flex', gap: 12,
                  }}>
                    {n.unread && (
                      <span style={{ position: 'absolute', top: 16, right: 14, width: 8, height: 8, borderRadius: 999, background: 'var(--brand)' }} />
                    )}
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: n.bg, color: n.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                      <n.Icon size={19} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{n.title}</div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{n.time}</span>
                        {n.cta && (
                          <button style={{
                            fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)',
                            background: 'var(--brand-tint)', border: 'none', borderRadius: 999,
                            padding: '5px 12px', cursor: 'pointer',
                          }}>{n.cta}</button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { NotificationsScreen });
