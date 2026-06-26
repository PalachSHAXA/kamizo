// kamizo-home.jsx — Resident Home, FOUNDATION §01 (beige + orange + dark stone)
// Structure (top→bottom):
//   1. Dark stone hero: time greeting + name 28/800 + glass address pill + mini-status
//   2. Swipe highlights band (3D card stack) — kept per user request
//   3. 4 quick-action tiles (Заявка / Пропуск / Оплата / Авто)
//   4. "Ждёт вашей оценки" approval card (brand-tint)
//   5. Amber reschedule alert
//   6. Widgets feed: announcements · meeting (quorum bar) · balance (dark) · coming-soon
//   7. PWA install banner
// Bottom nav with center FAB.

const homeStyles = {
  page: { minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 },
  section: { padding: '0 16px', marginTop: 16 },
  secLabel: {
    display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
    padding: '0 4px', marginBottom: 10,
  },
  secTitle: { fontSize: 13, fontWeight: 700, letterSpacing: '0.02em', color: 'var(--text-secondary)', textTransform: 'uppercase' },
  secMore: { fontSize: 13, fontWeight: 700, color: 'var(--brand-dark)' },
};

function KamizoLogo({ light = false }) {
  const c = light ? '#FDBA74' : '#EA580C';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path d="M7 4 L7 20 M7 12 L16 4 M9.5 12 L17 20" stroke={c} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: light ? 'var(--text-on-dark)' : 'var(--text-primary)' }}>Kamizo</span>
    </div>
  );
}

function MenuGlyph({ light = false }) {
  const c = light ? '#FDBA74' : '#EA580C';
  return (
    <svg width="22" height="15" viewBox="0 0 22 15">
      <rect y="0" width="22" height="3" rx="1.5" fill={c} />
      <rect y="6" width="15" height="3" rx="1.5" fill={c} />
      <rect y="12" width="22" height="3" rx="1.5" fill={c} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. Warm stone hero (espresso + orange glow — less flat-black)
function HomeHero({ name = 'Фарход', apt = 'ул. Навои, 25 · кв. 45', activeCount = 2, onMenu, onBell, bellOpen }) {
  return (
    <div style={{
      position: 'relative',
      background: 'linear-gradient(160deg, #4A3B30 0%, #34291F 55%, #2A2018 100%)',
      borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
      padding: '52px 18px 26px',
      overflow: 'hidden',
      color: 'var(--text-on-dark)',
    }}>
      {/* warm orange glow + subtle courtyard wash */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.55,
        background: 'radial-gradient(90% 70% at 88% -10%, rgba(251,146,60,0.5) 0%, transparent 55%), radial-gradient(70% 60% at 0% 110%, rgba(217,119,6,0.18) 0%, transparent 60%)',
      }} />
      {/* ЖК skyline silhouette along the bottom of the hero */}
      <svg viewBox="0 0 402 120" preserveAspectRatio="xMidYMax meet" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', height: 120, opacity: 0.13 }}>
        <g fill="#FAFAF9">
          <rect x="2" y="44" width="46" height="76" />
          <rect x="54" y="22" width="38" height="98" />
          <rect x="150" y="8" width="44" height="112" />
          <rect x="200" y="40" width="34" height="80" />
          <rect x="300" y="30" width="40" height="90" />
          <rect x="346" y="54" width="54" height="66" />
          <rect x="100" y="58" width="44" height="62" />
          <rect x="244" y="62" width="50" height="58" />
        </g>
        <g fill="#2A2018" opacity="0.55">
          {[[8,52],[20,52],[32,52],[8,66],[20,66],[32,66],[8,80],[20,80],[32,80],
            [60,30],[72,30],[84,30],[60,46],[72,46],[84,46],[60,62],[72,62],[84,62],[60,78],[72,78],[84,78],
            [156,18],[168,18],[180,18],[156,34],[168,34],[180,34],[156,50],[168,50],[180,50],[156,66],[168,66],[180,66],[156,82],[168,82],[180,82],
            [206,50],[218,50],[206,66],[218,66],[206,82],[218,82],
            [306,40],[318,40],[306,56],[318,56],[306,72],[318,72],[306,88],[318,88],
            [354,64],[368,64],[382,64],[354,80],[368,80],[382,80],
            [108,68],[122,68],[108,84],[122,84],
            [252,72],[266,72],[280,72],[252,90],[266,90],[280,90]].map(([x,y],i)=>(
            <rect key={i} x={x} y={y} width="7" height="9" rx="1" />
          ))}
        </g>
      </svg>

      {/* top bar */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <button onClick={onMenu} style={{
          width: 44, height: 44, borderRadius: 14,
          background: 'rgba(244,240,232,0.12)', border: '1px solid rgba(244,240,232,0.14)',
          display: 'grid', placeItems: 'center', cursor: 'pointer',
        }} aria-label="Меню">
          <MenuGlyph light />
        </button>
        <KamizoLogo light />
        <button onClick={onBell} style={{
          position: 'relative',
          width: 44, height: 44, borderRadius: 14,
          background: bellOpen ? 'var(--brand)' : 'rgba(244,240,232,0.12)',
          border: '1px solid rgba(244,240,232,0.14)',
          display: 'grid', placeItems: 'center', cursor: 'pointer', color: bellOpen ? '#fff' : 'var(--text-on-dark)',
          transition: 'background 0.18s',
        }} aria-label="Уведомления">
          <IBell size={20} />
          <span style={{ position: 'absolute', top: 8, right: 9, minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: 'var(--status-critical)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid #34291F' }}>2</span>
        </button>
      </div>

      {/* greeting + status row */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 14 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(244,240,232,0.7)', letterSpacing: '-0.01em' }}>
            Добрый вечер 👋
          </div>
          <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05, marginTop: 3 }}>
            {name}
          </div>
          {/* glass address pill */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            marginTop: 14, padding: '8px 13px',
            background: 'rgba(244,240,232,0.12)',
            border: '1px solid rgba(244,240,232,0.14)',
            backdropFilter: 'blur(8px)',
            borderRadius: 13,
            fontSize: 13.5, fontWeight: 600, color: 'var(--text-on-dark)', letterSpacing: '-0.01em',
          }}>
            <IPin size={15} style={{ color: 'var(--brand-light)' }} />
            {apt}
          </div>
        </div>
        <div style={{
          flex: '0 0 auto',
          padding: '8px 12px', borderRadius: 13,
          background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.3)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#FDBA74', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{activeCount}</div>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: 'rgba(244,240,232,0.7)', marginTop: 3 }}>активные<br/>заявки</div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. Quick-action tiles
function QuickTiles({ onNewRequest, onTabChange }) {
  const tiles = [
    { Icon: IWrench, label: 'Заявка', badge: null, onClick: onNewRequest },
    { Icon: IQR, label: 'Пропуск', badge: '1', onClick: () => onTabChange?.('guest') },
    { Icon: ICard, label: 'Оплата', badge: null, soon: true },
    { Icon: ICar, label: 'Авто', badge: '2', onClick: () => onTabChange?.('vehicles') },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
      {tiles.map((t, i) => (
        <button key={i} onClick={t.onClick} style={{
          position: 'relative',
          background: 'var(--surface)', border: '1px solid var(--border-c)',
          borderRadius: 'var(--radius-lg)', padding: '14px 8px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          cursor: 'pointer', boxShadow: 'var(--shadow-sm)',
        }}>
          <div style={{
            width: 46, height: 46, borderRadius: 999,
            background: 'var(--brand-tint)', color: 'var(--brand-dark)',
            display: 'grid', placeItems: 'center',
          }}>
            <t.Icon size={22} stroke={1.9} />
          </div>
          <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{t.label}</span>
          {t.badge && (
            <span style={{
              position: 'absolute', top: 10, right: 12,
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
              background: 'var(--brand)', color: '#fff', fontSize: 10.5, fontWeight: 800,
              display: 'grid', placeItems: 'center',
            }}>{t.badge}</span>
          )}
          {t.soon && (
            <span style={{ position: 'absolute', top: 12, right: 12, color: 'var(--text-muted)' }}><ILock size={12} /></span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. Approval card
function ApprovalCard({ onApprove }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF3EA 0%, #FFE6D2 100%)',
      border: '1px solid var(--brand-200)',
      borderRadius: 'var(--radius-lg)', padding: 16,
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 13,
          background: '#fff', color: 'var(--brand-dark)',
          display: 'grid', placeItems: 'center', flex: '0 0 auto',
          boxShadow: '0 0 0 4px rgba(249,115,22,0.12)',
          animation: 'kzPulse 1.8s infinite',
        }}>
          <ICheck size={22} stroke={2.4} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', color: 'var(--brand-dark)', textTransform: 'uppercase' }}>
            Ждёт вашей оценки
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.015em', marginTop: 2 }}>
            Замена смесителя · #1840
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
            Бахтиёр Р. · работа заняла 45 мин
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={onApprove} style={{
          flex: 1, padding: '12px', borderRadius: 'var(--radius-md)',
          background: 'var(--brand)', color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em',
          boxShadow: 'var(--sh-brand)',
        }}>Принять работу</button>
        <button style={{
          padding: '12px 16px', borderRadius: 'var(--radius-md)',
          background: 'var(--surface)', color: 'var(--text-primary)',
          border: '1px solid var(--border-c)', cursor: 'pointer',
          fontSize: 14, fontWeight: 650,
        }}>Подробнее</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 5. Reschedule alert
function RescheduleAlert() {
  return (
    <button style={{
      width: '100%', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '13px 14px', borderRadius: 'var(--radius-lg)',
      background: 'var(--status-pending-bg)', border: '1px solid rgba(245,158,11,0.3)',
      cursor: 'pointer',
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(245,158,11,0.18)', color: '#B45309', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <IClock size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: '#92400E', letterSpacing: '-0.01em' }}>Запрос на перенос визита</div>
        <div style={{ fontSize: 12.5, color: '#A16207', marginTop: 1 }}>Электрик предлагает завтра 14:00 вместо сегодня</div>
      </div>
      <IChevronR size={18} style={{ color: '#B45309' }} />
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// 6a. Meeting widget with quorum bar
function MeetingWidget({ onOpenVote }) {
  return (
    <button onClick={onOpenVote} style={{
      width: '100%', textAlign: 'left',
      background: 'var(--surface)', border: '1px solid var(--border-c)',
      borderRadius: 'var(--radius-lg)', padding: 16, cursor: 'pointer',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em',
          padding: '4px 9px', borderRadius: 999,
          background: 'var(--status-active-bg)', color: 'var(--status-active)', textTransform: 'uppercase',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-active)', animation: 'kzPulse 1.6s infinite' }} />
          Голосование
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>осталось 2 дня</span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25, textWrap: 'pretty' }}>
        Капитальный ремонт лифтов в подъездах 1–3
      </div>
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
          <span>Кворум · по площади</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>63%</span>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
          <div style={{ width: '63%', height: '100%', borderRadius: 999, background: 'var(--brand)' }} />
        </div>
      </div>
    </button>
  );
}

// 6b. Balance card (dark stone)
function BalanceCard({ overdue = false }) {
  const accent = overdue ? 'var(--status-critical)' : '#FDBA74';
  return (
    <div style={{
      background: overdue ? 'linear-gradient(150deg, #44211E, #211E1B)' : 'var(--dark-surface)',
      borderRadius: 'var(--radius-lg)', padding: 18, color: 'var(--text-on-dark)',
      position: 'relative', overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ position: 'absolute', right: -20, top: -16, width: 130, height: 130, borderRadius: 999, background: overdue ? 'rgba(226,72,61,0.14)' : 'rgba(249,115,22,0.12)' }} />
      <Silhouette kind="coins" color={overdue ? '#FCA5A5' : '#FDBA74'} opacity={0.16} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', color: 'rgba(244,240,232,0.6)', textTransform: 'uppercase' }}>
          Начислено за май
        </div>
        <span style={{ fontSize: 10.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: overdue ? 'var(--status-critical-bg)' : 'rgba(244,240,232,0.12)', color: overdue ? '#FCA5A5' : 'rgba(244,240,232,0.8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {overdue ? 'Просрочено' : 'К оплате'}
        </span>
      </div>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 12 }}>
        <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>312 400</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'rgba(244,240,232,0.65)' }}>сум</span>
      </div>
      <div style={{ position: 'relative', fontSize: 12.5, color: 'rgba(244,240,232,0.6)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
        <IClock size={13} /> Срок оплаты до 10 июня
      </div>
      <button style={{
        position: 'relative', width: '100%', marginTop: 14, padding: '12px',
        borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
        background: overdue ? 'var(--status-critical)' : 'var(--brand)', color: '#fff',
        fontSize: 14, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        opacity: 0.65,
      }}>
        Оплатить онлайн <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: 'rgba(255,255,255,0.25)' }}>СКОРО</span>
      </button>
    </div>
  );
}

// 6c. Announcements mini-list
function AnnMini() {
  const items = [
    { icon: IBolt, fg: 'var(--status-critical)', tag: 'Срочно', tagFg: 'var(--status-critical)', tagBg: 'var(--status-critical-bg)', accent: 'var(--status-critical)', title: 'Отключение электричества 28 мая', body: 'С 09:00 до 16:00 в подъездах 1–3. Лифты работать не будут.', time: '2 ч назад' },
    { icon: IUmbrella, fg: 'var(--status-info)', tag: 'УК', tagFg: 'var(--status-info)', tagBg: 'var(--status-info-bg)', accent: 'transparent', title: 'Профилактика крыши 26 мая', body: 'Проход на техэтаж ограничен с 09:00 до 14:00.', time: '3 ч назад' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((a, i) => (
        <div key={i} style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: '14px 16px', overflow: 'hidden' }}>
          {a.accent !== 'transparent' && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: a.accent }} />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: a.tagFg, background: a.tagBg, padding: '3px 9px', borderRadius: 999 }}>
              <a.icon size={12} /> {a.tag}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>{a.time}</span>
          </div>
          <div style={{ fontSize: 15.5, fontWeight: 750, letterSpacing: '-0.015em', lineHeight: 1.25, textWrap: 'pretty' }}>{a.title}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.body}</div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 7. PWA banner
function PWABanner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-2)', border: '1px dashed var(--border-strong)',
    }}>
      <div style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--brand-tint)', color: 'var(--brand-dark)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
        <IDownload size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em' }}>Установите Kamizo на экран</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Быстрый доступ как у приложения</div>
      </div>
      <button style={{ padding: '8px 14px', borderRadius: 999, background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Установить</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom tab bar — floating pill + center FAB. Active tab becomes a
// brand-tinted lozenge with icon + label; inactive are icon-only.
function TabBar({ active = 'home', onChange, onFab }) {
  const left = [
    { id: 'home', Icon: IHome, label: 'Главная' },
    { id: 'requests', Icon: IDoc, label: 'Заявки' },
  ];
  const right = [
    { id: 'chat', Icon: IChat, label: 'Чат' },
    { id: 'profile', Icon: IUser, label: 'Профиль' },
  ];
  const item = (t) => {
    const isActive = active === t.id;
    return (
      <button key={t.id} onClick={() => onChange?.(t.id)} style={{
        flex: isActive ? '0 0 auto' : '0 0 auto',
        background: isActive ? 'var(--brand-tint)' : 'transparent',
        border: 'none', cursor: 'pointer', borderRadius: 999,
        display: 'flex', alignItems: 'center', gap: 7,
        padding: isActive ? '9px 15px' : '9px 11px',
        color: isActive ? 'var(--brand-dark)' : 'var(--text-muted)',
        transition: 'all 0.24s var(--ease-spring)',
      }}>
        <t.Icon size={22} stroke={isActive ? 2.3 : 1.9} />
        {isActive && <span style={{ fontSize: 13, fontWeight: 750, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{t.label}</span>}
      </button>
    );
  };
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      padding: '0 14px 22px', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        background: 'rgba(255,255,255,0.86)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 26,
        boxShadow: '0 10px 30px rgba(28,25,23,0.14), 0 2px 6px rgba(28,25,23,0.06)',
        padding: '8px 10px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{left.map(item)}</div>
        <button onClick={onFab} aria-label="Новая заявка" style={{
          width: 52, height: 52, borderRadius: 999, flex: '0 0 auto',
          background: 'linear-gradient(135deg, #FB923C, #EA580C)',
          border: 'none', cursor: 'pointer',
          display: 'grid', placeItems: 'center', color: '#fff',
          boxShadow: '0 6px 16px rgba(249,115,22,0.45)',
        }}>
          <IPlus size={25} stroke={2.6} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{right.map(item)}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Notification popover — drops from the bell, not a full screen
function NotificationPopover({ open, onClose, onSeeAll }) {
  if (!open) return null;
  const items = [
    { Icon: ICheck, fg: 'var(--status-active)', bg: 'var(--status-active-bg)', title: 'Работа выполнена', body: 'Замена смесителя #1840 — оцените мастера', time: '10:42', unread: true },
    { Icon: IUsers, fg: 'var(--brand-dark)', bg: 'var(--brand-tint)', title: 'Открыто голосование', body: 'Капремонт лифтов · ваш голос важен', time: '09:15', unread: true },
    { Icon: IBolt, fg: 'var(--status-critical)', bg: 'var(--status-critical-bg)', title: 'Отключение электричества', body: '28 мая 09:00–16:00, подъезды 1–3', time: '08:30', unread: false },
  ];
  return (
    <>
      {/* click-catcher */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 70 }} />
      {/* popover */}
      <div style={{
        position: 'absolute', top: 96, right: 14, zIndex: 71,
        width: 312, maxWidth: 'calc(100% - 28px)',
        background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-c)',
        boxShadow: '0 20px 50px -12px rgba(28,25,23,0.4)',
        overflow: 'hidden',
        transformOrigin: 'top right',
      }}>
        {/* little arrow */}
        <div style={{ position: 'absolute', top: -7, right: 22, width: 14, height: 14, background: 'var(--surface)', borderLeft: '1px solid var(--border-c)', borderTop: '1px solid var(--border-c)', transform: 'rotate(45deg)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em' }}>Уведомления</div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-dark)', background: 'var(--brand-tint)', padding: '3px 8px', borderRadius: 999 }}>2 новых</span>
        </div>
        <div>
          {items.map((n, i) => (
            <div key={i} style={{
              display: 'flex', gap: 11, padding: '11px 16px',
              borderTop: '1px solid var(--hairline)',
              background: n.unread ? 'var(--surface-2)' : 'transparent',
              position: 'relative',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: n.bg, color: n.fg, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                <n.Icon size={17} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{n.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 1, lineHeight: 1.35 }}>{n.body}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{n.time}</div>
              </div>
              {n.unread && <span style={{ position: 'absolute', top: 14, right: 16, width: 7, height: 7, borderRadius: 999, background: 'var(--brand)' }} />}
            </div>
          ))}
        </div>
        <button onClick={onSeeAll} style={{
          width: '100%', padding: '13px', border: 'none', borderTop: '1px solid var(--border-c)',
          background: 'transparent', color: 'var(--brand-dark)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer',
        }}>Показать все →</button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
function HomeScreen({ onOpenVote, onNewRequest, onTabChange, activeTab = 'home', onMenu }) {
  const [bell, setBell] = React.useState(false);
  const cards = [
    { id: 'onboarding', Icon: ICheck, silhouette: 'check', badge: 'Важно', title: 'Завершите регистрацию', sub: 'Не заполнено: пароль', cta: 'Заполнить →',
      gradient: 'linear-gradient(150deg, #2DD4CF 0%, #0E9AAB 100%)', shadow: 'rgba(14,154,171,0.5)' },
    { id: 'voting', Icon: IUsers, silhouette: 'people', badge: 'Голосование', title: 'Ремонт лифтов · идёт голосование', sub: 'Ваш голос · 67 м² · осталось 2 дня', cta: 'Проголосовать →',
      gradient: 'linear-gradient(150deg, #FB923C 0%, #EA580C 100%)', shadow: 'rgba(249,115,22,0.5)', onClick: onOpenVote },
    { id: 'guest', Icon: IQR, silhouette: 'qr', badge: 'QR', title: 'Гостевой пропуск', sub: 'QR для гостя или доставки', cta: 'Создать →',
      gradient: 'linear-gradient(150deg, #34D399 0%, #15A06E 100%)', shadow: 'rgba(21,160,110,0.5)' },
    { id: 'contacts', Icon: IPhone, silhouette: 'phone', badge: 'Контакты', title: 'Полезные контакты', sub: 'Экстренные службы и мастера дома', cta: 'Открыть →',
      gradient: 'linear-gradient(150deg, #60A5FA 0%, #2F77C2 100%)', shadow: 'rgba(47,119,194,0.5)', onClick: () => onTabChange?.('contacts') },
    { id: 'rate', Icon: IStar, silhouette: 'star', badge: 'Оценка', title: 'Оцените УК', sub: 'Раз в месяц · займёт 30 секунд', cta: 'Оценить →',
      gradient: 'linear-gradient(150deg, #A78BFA 0%, #7C3AED 100%)', shadow: 'rgba(124,58,237,0.5)', onClick: () => onTabChange?.('rate') },
    { id: 'find-car', Icon: ICar, silhouette: 'car', badge: 'Авто', title: 'Найти владельца авто', sub: 'Поиск соседа по номеру машины', cta: 'Найти →',
      gradient: 'linear-gradient(150deg, #FBBF24 0%, #D97706 100%)', shadow: 'rgba(217,119,6,0.5)', onClick: () => onTabChange?.('vehicles') },
  ];

  return (
    <div className="kz-screen" style={homeStyles.page}>
      <HomeHero onMenu={onMenu} onBell={() => setBell(b => !b)} bellOpen={bell} />
      <NotificationPopover open={bell} onClose={() => setBell(false)} onSeeAll={() => { setBell(false); onTabChange?.('notifications'); }} />

      {/* Highlights swipe band */}
      <div style={{ ...homeStyles.section, marginTop: 18 }}>
        <SwipeCardStack cards={cards} height={210} />
      </div>

      {/* Quick tiles */}
      <div style={homeStyles.section}>
        <QuickTiles onNewRequest={onNewRequest} onTabChange={onTabChange} />
      </div>

      {/* Approval */}
      <div style={homeStyles.section}>
        <ApprovalCard onApprove={() => {}} />
      </div>

      {/* Reschedule */}
      <div style={homeStyles.section}>
        <RescheduleAlert />
      </div>

      {/* Meeting */}
      <div style={homeStyles.section}>
        <div style={homeStyles.secLabel}>
          <span style={homeStyles.secTitle}>Собрание</span>
          <span style={homeStyles.secMore}>Все →</span>
        </div>
        <MeetingWidget onOpenVote={onOpenVote} />
      </div>

      {/* Balance */}
      <div style={homeStyles.section}>
        <div style={homeStyles.secLabel}>
          <span style={homeStyles.secTitle}>Оплата</span>
        </div>
        <BalanceCard />
      </div>

      {/* Announcements */}
      <div style={homeStyles.section}>
        <div style={homeStyles.secLabel}>
          <span style={homeStyles.secTitle}>Объявления</span>
          <span style={homeStyles.secMore}>Все →</span>
        </div>
        <AnnMini />
      </div>

      {/* PWA */}
      <div style={homeStyles.section}>
        <PWABanner />
      </div>

      <TabBar active={activeTab} onChange={onTabChange} onFab={onNewRequest} />
    </div>
  );
}

Object.assign(window, { HomeScreen, TabBar, KamizoLogo });
