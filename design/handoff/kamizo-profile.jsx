// kamizo-profile.jsx — Resident profile, premium dark hero + stats + tiles + settings.

function ProfileScreen({ activeTab = 'profile', onTabChange }) {
  const tiles = [
    { Icon: IFile, label: 'Договор', sub: '№ 2024-1842', fg: '#EA580C', bg: 'var(--brand-tint)' },
    { Icon: IQR, label: 'QR пропуск', sub: 'Активен', fg: '#15A06E', bg: 'var(--status-active-bg)' },
    { Icon: ICard, label: 'Оплата', sub: '312 400 сум', fg: '#2F77C2', bg: 'var(--status-info-bg)' },
    { Icon: IStar, label: 'Бонусы', sub: '1 240 баллов', fg: '#7C3AED', bg: 'rgba(124,58,237,0.12)' },
  ];

  const sections = [
    {
      title: 'Дом и квартира',
      items: [
        { Icon: IBuilding, label: 'Адрес', value: 'Дом 12А, ул. Навои', chevron: true },
        { Icon: IHome, label: 'Квартира', value: 'Кв. 45 · 67 м² · 2 комн.', chevron: true },
        { Icon: IUsers, label: 'Состав семьи', value: '4 человека', chevron: true },
      ],
    },
    {
      title: 'Безопасность',
      items: [
        { Icon: IPhone, label: 'Телефон', value: '+998 (90) ··· 47 12', editable: true },
        { Icon: IKey, label: 'Сменить пароль', chevron: true },
        { Icon: IShield, label: 'Двухфакторная защита', value: 'Включена', badge: true },
      ],
    },
    {
      title: 'Приложение',
      items: [
        { Icon: IGlobe, label: 'Язык', value: 'Русский', chevron: true },
        { Icon: IBell, label: 'Уведомления', value: 'Все', chevron: true },
        { Icon: IDownload, label: 'Установить как приложение', accent: true, chevron: true },
      ],
    },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Premium dark hero */}
      <div style={{ padding: '52px 16px 0' }}>
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)', background: 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)', color: 'var(--text-on-dark)', padding: 20 }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.4, background: 'radial-gradient(90% 80% at 90% 0%, rgba(251,146,60,0.45), transparent 55%)' }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 66, height: 66, borderRadius: 999, background: 'linear-gradient(135deg, #FB923C, #EA580C)', color: '#fff', fontWeight: 800, fontSize: 23, display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 6px 16px rgba(249,115,22,0.4)' }}>ФК</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Фарход Каримов</div>
              <div style={{ fontSize: 12.5, color: 'rgba(244,240,232,0.6)', marginTop: 2 }}>Собственник · с октября 2023</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 7, padding: '3px 9px', borderRadius: 999, background: 'rgba(34,197,94,0.18)', color: '#86EFAC', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                <ICheck size={11} stroke={3} /> Верифицирован
              </div>
            </div>
            <button style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center', color: 'var(--text-on-dark)', cursor: 'pointer', flex: '0 0 auto' }} aria-label="Изменить"><IEdit size={16} /></button>
          </div>
          {/* stats strip */}
          <div style={{ position: 'relative', display: 'flex', marginTop: 18 }}>
            {[{ v: '12', l: 'заявок' }, { v: '4.9', l: 'рейтинг' }, { v: '1 240', l: 'баллов' }].map((s, i) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', borderRight: i < 2 ? '1px solid rgba(244,240,232,0.12)' : 'none' }}>
                <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(244,240,232,0.6)', marginTop: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick tiles */}
      <div style={{ padding: '16px 16px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {tiles.map((t, i) => (
          <button key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: 13, background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: t.bg, color: t.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><t.Icon size={20} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{t.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Settings sections */}
      <div style={{ padding: '20px 16px 16px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {sections.map((s, si) => (
          <div key={si}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '0 4px', marginBottom: 8 }}>{s.title}</div>
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
              {s.items.map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderBottom: i < s.items.length - 1 ? '1px solid var(--hairline)' : 'none', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: it.accent ? 'var(--brand-tint)' : 'var(--surface-sunken)', color: it.accent ? 'var(--brand-dark)' : 'var(--text-secondary)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><it.Icon size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em', color: it.accent ? 'var(--brand-dark)' : 'var(--text-primary)' }}>{it.label}</div>
                    {it.value && !it.badge && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1 }}>{it.value}</div>}
                  </div>
                  {it.badge && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--status-active)', background: 'var(--status-active-bg)', padding: '3px 9px', borderRadius: 999 }}>{it.value}</span>}
                  {it.editable && <IEdit size={15} style={{ color: 'var(--text-muted)' }} />}
                  {it.chevron && <IChevronR size={16} style={{ color: 'var(--text-muted)' }} />}
                </div>
              ))}
            </div>
          </div>
        ))}

        <button style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-md)', padding: '14px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--status-critical)', fontSize: 14, fontWeight: 700, boxShadow: 'var(--shadow-sm)' }}>
          <ILogout size={16} /> Выйти из аккаунта
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Kamizo · версия 2.4.1</div>
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { ProfileScreen });
