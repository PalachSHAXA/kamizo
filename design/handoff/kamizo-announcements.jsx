// kamizo-announcements.jsx — Announcements feed (06). FOUNDATION palette.
// Filter chips Все/Непрочитанные · cover photo · category chip · unread brand-tint
// + orange dot · urgent critical stripe + Важно badge · tap to expand.

function AnnouncementsScreen({ activeTab = 'home', onTabChange }) {
  const [filter, setFilter] = React.useState('all');
  const [expanded, setExpanded] = React.useState('a2');
  const [read, setRead] = React.useState({ a3: true, a4: true, a5: true });

  const items = [
    { id: 'a1', urgent: true, cover: 'linear-gradient(135deg, #C2410C, #7C2D12)', coverIcon: IBolt,
      cat: 'Авария', catFg: 'var(--status-critical)', catBg: 'var(--status-critical-bg)',
      title: 'Отключение электричества 28 мая', author: 'УК «Камизо»', date: '2 ч назад',
      preview: 'С 09:00 до 16:00 в подъездах 1–3 плановые работы по замене щита.',
      body: 'Уважаемые жители! 28 мая с 09:00 до 16:00 в подъездах 1, 2 и 3 будут проводиться плановые работы по замене распределительного щита. Электроснабжение и лифты на это время отключены. Просим заранее зарядить устройства.',
      attach: { name: 'График работ.pdf', size: '124 КБ' } },
    { id: 'a2', cat: 'Уведомление', catFg: 'var(--status-info)', catBg: 'var(--status-info-bg)',
      title: 'Профилактика крыши 26 мая', author: 'УК «Камизо»', date: '3 ч назад',
      preview: 'Проход на технический этаж ограничен с 09:00 до 14:00.',
      body: 'Будет проведена очистка ливневой системы и проверка кровли. Жильцов верхних этажей просим закрыть окна на чердачных проёмах с 09:00 до 14:00.' },
    { id: 'a3', cover: 'linear-gradient(135deg, #15A06E, #0E7A52)', coverIcon: ITree,
      cat: 'Благоустройство', catFg: 'var(--status-active)', catBg: 'var(--status-active-bg)',
      title: 'Высадили 6 чинаров во дворе', author: 'УК «Камизо»', date: 'вчера',
      preview: 'Спасибо инициативной группе соседей. Полив организован до апреля.',
      body: 'Совместно с инициативной группой во дворе высажено 6 молодых чинаров. Полив организован силами УК до укоренения. Просьба не парковаться на газоне у новых посадок.' },
    { id: 'a4', cat: 'Соседи', catFg: 'var(--brand-dark)', catBg: 'var(--brand-tint)',
      title: 'Найдена кошка у 3-го подъезда', author: 'Дильнора · кв. 23', date: 'вчера',
      preview: 'Серая, в красном ошейнике. Если ваша — звоните.',
      body: 'Возле 3-го подъезда найдена серая кошка в красном ошейнике, ласковая. Временно у меня (кв. 23). Хозяев прошу позвонить.' },
    { id: 'a5', cat: 'Уведомление', catFg: 'var(--status-expired)', catBg: 'var(--status-expired-bg)',
      title: 'Вывоз ёлок с 5 по 15 января', author: 'УК «Камизо»', date: '3 дня назад',
      preview: 'Складывать у мусорной площадки без украшений.',
      body: 'Пункт сбора — у мусорной площадки. Снимайте мишуру и игрушки. Вывоз по будням.' },
  ];

  const isUnread = (a) => !read[a.id];
  const list = filter === 'unread' ? items.filter(isUnread) : items;
  const unreadCount = items.filter(isUnread).length;

  const open = (a) => {
    setExpanded(expanded === a.id ? null : a.id);
    if (isUnread(a)) setRead(r => ({ ...r, [a.id]: true }));
  };

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, padding: '52px 16px 12px', background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Дом 12А</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Объявления</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {[{ id: 'all', label: `Все · ${items.length}` }, { id: 'unread', label: `Непрочитанные · ${unreadCount}` }].map(f => {
            const on = filter === f.id;
            return <button key={f.id} onClick={() => setFilter(f.id)} style={{ padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 650, background: on ? 'var(--ink)' : 'var(--surface)', color: on ? 'var(--text-on-dark)' : 'var(--text-secondary)', border: '1px solid', borderColor: on ? 'var(--ink)' : 'var(--border-c)', cursor: 'pointer' }}>{f.label}</button>;
          })}
        </div>
      </div>

      {/* Feed */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.map(a => {
          const unread = isUnread(a);
          const isOpen = expanded === a.id;
          return (
            <div key={a.id} style={{
              position: 'relative',
              background: unread ? 'var(--brand-tint)' : 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid', borderColor: a.urgent ? 'var(--status-critical-bg)' : (unread ? 'var(--brand-200)' : 'var(--border-c)'),
              boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
              opacity: unread ? 1 : 0.92,
            }}>
              {a.urgent && <div style={{ height: 4, background: 'var(--status-critical)' }} />}

              {/* cover */}
              {a.cover && (
                <div style={{ position: 'relative', height: 96, background: a.cover, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                  {a.coverIcon && <a.coverIcon size={42} style={{ color: 'rgba(255,255,255,0.55)' }} />}
                </div>
              )}

              <button onClick={() => open(a)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: 15 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {a.urgent && <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--status-critical)', background: 'var(--status-critical-bg)', padding: '2px 7px', borderRadius: 999, textTransform: 'uppercase' }}>Важно</span>}
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.02em', color: a.catFg, background: a.catBg, padding: '3px 9px', borderRadius: 999 }}>{a.cat}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.date}</span>
                  {unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--brand)', flex: '0 0 auto' }} />}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.3, marginTop: 9 }}>{a.title}</div>
                <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.45, ...(isOpen ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>
                  {isOpen ? a.body : a.preview}
                </div>

                {isOpen && a.attach && (
                  <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)' }}>
                    <IFile size={16} style={{ color: 'var(--brand-dark)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 650 }}>{a.attach.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.attach.size}</div>
                    </div>
                    <IDownload size={16} style={{ color: 'var(--text-secondary)' }} />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  <span>{a.author}</span>
                  <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 650, color: 'var(--brand-dark)' }}>
                    {isOpen ? 'Свернуть' : 'Читать'} <IChevronD size={13} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </span>
                </div>
              </button>
            </div>
          );
        })}

        {list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ width: 72, height: 72, borderRadius: 999, background: 'var(--surface-sunken)', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}><IMegaphone size={32} /></div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Всё прочитано</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 }}>Новых объявлений нет</div>
          </div>
        )}
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { AnnouncementsScreen });
