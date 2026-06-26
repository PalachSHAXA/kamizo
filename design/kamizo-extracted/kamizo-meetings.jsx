// kamizo-meetings.jsx — Meetings list (05). Serious, trust-focused tone.
// Quorum = 50%+ of building area; vote weight = apartment m². Leads into VotingScreen.

function QuorumBar({ pct, need = 50 }) {
  const reached = pct >= need;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Кворум · <span style={{ fontVariantNumeric: 'tabular-nums', color: reached ? 'var(--status-active)' : 'var(--text-primary)', fontWeight: 800 }}>{pct}%</span> площади
        </span>
        {reached ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--status-active)', background: 'var(--status-active-bg)', padding: '3px 8px', borderRadius: 999 }}>
            <ICheck size={11} stroke={3} /> Собран
          </span>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>нужно {need}%</span>
        )}
      </div>
      <div style={{ position: 'relative', height: 8, borderRadius: 999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 999, background: reached ? 'var(--status-active)' : 'var(--brand)', transition: 'width 0.6s var(--ease-emphasized)' }} />
        {/* 50% threshold marker */}
        <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${need}%`, width: 2, background: 'var(--text-muted)', opacity: 0.5 }} />
      </div>
    </div>
  );
}

function MeetingCard({ m, onOpen }) {
  const st = {
    voting_open:       { label: 'Идёт голосование', fg: 'var(--brand-dark)', bg: 'var(--brand-tint)', live: true },
    schedule_poll_open:{ label: 'Опрос даты',       fg: 'var(--status-info)', bg: 'var(--status-info-bg)' },
    schedule_confirmed:{ label: 'Предстоит',        fg: 'var(--status-pending)', bg: 'var(--status-pending-bg)' },
    closed:            { label: 'Завершено',        fg: 'var(--status-expired)', bg: 'var(--status-expired-bg)' },
  }[m.status] || {};
  return (
    <button onClick={onOpen} style={{
      position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
      background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
      border: m.status === 'voting_open' ? '1.5px solid var(--brand-200)' : '1px solid var(--border-c)',
      boxShadow: 'var(--shadow-sm)', padding: 16, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: st.fg, background: st.bg, padding: '4px 10px', borderRadius: 999, letterSpacing: '0.02em' }}>
          {st.live && <span style={{ width: 6, height: 6, borderRadius: 999, background: st.fg, animation: 'kzPulse 1.6s infinite' }} />}
          {st.label}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-num)' }}>№{m.number}</span>
      </div>

      <div style={{ fontSize: 16.5, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1.3, marginTop: 12, textWrap: 'pretty' }}>{m.title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12.5, color: 'var(--text-secondary)' }}>
        <ICalendar size={14} /> {m.date}
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <span>{m.agenda} пункта повестки</span>
      </div>

      {m.status !== 'closed' ? (
        <QuorumBar pct={m.quorum} />
      ) : (
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          {[{ l: 'За', v: m.result.for, c: 'var(--status-active)' }, { l: 'Против', v: m.result.against, c: 'var(--status-critical)' }, { l: 'Возд.', v: m.result.abstain, c: 'var(--text-muted)' }].map((x, i) => (
            <div key={i} style={{ flex: 1, textAlign: 'center', padding: '8px 4px', borderRadius: 'var(--radius-sm)', background: 'var(--surface-sunken)' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: x.c, fontVariantNumeric: 'tabular-nums' }}>{x.v}%</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 1 }}>{x.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* CTA row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {m.voted ? <><ICheck size={13} stroke={2.6} style={{ color: 'var(--status-active)' }} /> Вы проголосовали</> : m.status === 'voting_open' ? <><IClock size={13} /> {m.left}</> : m.status === 'closed' ? 'Протокол готов' : 'Ваш вес: 67 м²'}
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700,
          color: m.status === 'voting_open' ? '#fff' : 'var(--brand-dark)',
          background: m.status === 'voting_open' ? 'var(--brand)' : 'transparent',
          padding: m.status === 'voting_open' ? '8px 14px' : '0', borderRadius: 999,
          boxShadow: m.status === 'voting_open' ? 'var(--sh-brand)' : 'none',
        }}>
          {m.status === 'voting_open' ? (m.voted ? 'Изменить голос' : 'Голосовать') : m.status === 'closed' ? 'Протокол' : 'Подробнее'}
          <IChevronR size={14} stroke={2.4} />
        </span>
      </div>
    </button>
  );
}

function MeetingsScreen({ activeTab = 'home', onTabChange, onVote }) {
  const meetings = [
    { number: '2024-12', status: 'voting_open', title: 'Капитальный ремонт лифтов в подъездах 1–3', date: 'до 28 мая', agenda: 4, quorum: 63, voted: false, left: 'осталось 2 дня' },
    { number: '2024-11', status: 'schedule_confirmed', title: 'Установка видеонаблюдения во дворе', date: '5 июня, 19:00', agenda: 2, quorum: 0, voted: false },
    { number: '2024-10', status: 'schedule_poll_open', title: 'Выбор подрядчика по озеленению', date: 'опрос до 1 июня', agenda: 1, quorum: 0, voted: false },
    { number: '2024-08', status: 'closed', title: 'Изменение тарифа на охрану', date: '20 апреля', agenda: 3, voted: true, result: { for: 72, against: 19, abstain: 9 } },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 5, padding: '52px 16px 14px', background: 'rgba(244,240,232,0.92)', backdropFilter: 'blur(14px)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Собрания собственников</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Голосование</div>
      </div>

      {/* Legal note */}
      <div style={{ margin: '8px 16px 0', padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-md)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <IShield size={17} style={{ color: 'var(--text-secondary)', flex: '0 0 auto', marginTop: 1 }} />
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
          Вес вашего голоса равен площади квартиры (<b style={{ color: 'var(--text-primary)' }}>67 м²</b>). Решение принимается при кворуме <b style={{ color: 'var(--text-primary)' }}>≥50%</b> площади дома.
        </div>
      </div>

      {/* List */}
      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {meetings.map((m, i) => (
          <MeetingCard key={i} m={m} onOpen={() => m.status === 'voting_open' && onVote && onVote()} />
        ))}
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { MeetingsScreen, QuorumBar });
