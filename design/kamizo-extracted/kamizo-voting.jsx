// kamizo-voting.jsx — Voting screen
// Sections: Header, vote summary card (quorum, deadline), agenda items
// (each with For/Against/Abstain), objection textarea (reveal on Against),
// total badge + OTP confirm.

const voteStyles = {
  page: { minHeight: '100%', background: 'var(--bg)', paddingBottom: 200 },
  topbar: {
    position: 'sticky', top: 0, zIndex: 5,
    padding: '54px 16px 12px',
    background: 'rgba(245,245,244,0.85)',
    backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', gap: 10,
    borderBottom: '1px solid var(--hairline)',
  },
  iconBtn: {
    width: 36, height: 36, borderRadius: 999,
    background: '#fff', border: '1px solid var(--border)',
    display: 'grid', placeItems: 'center', cursor: 'pointer',
    color: 'var(--text-2)',
  },
  topTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em',
  },
  hero: {
    margin: '14px 16px 0',
    background: 'linear-gradient(155deg, #92400E 0%, #44403C 100%)',
    borderRadius: 22, padding: 18, color: '#fff',
    position: 'relative', overflow: 'hidden',
    boxShadow: '0 14px 36px -10px rgba(68, 64, 60, 0.5)',
  },
  section: { padding: '0 16px', marginTop: 22 },
  sectionTitle: {
    fontSize: 12.5, fontWeight: 600, letterSpacing: '0.04em',
    color: 'var(--text-3)', textTransform: 'uppercase',
    padding: '0 4px 10px',
  },
  card: {
    background: '#fff', border: '1px solid var(--border)',
    borderRadius: 18, padding: 16,
    boxShadow: 'var(--sh-1)',
    marginBottom: 10,
  },
  agendaH: {
    display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12,
  },
  agendaIdx: {
    width: 26, height: 26, borderRadius: 8,
    background: 'var(--amber-50)', color: 'var(--amber-700)',
    display: 'grid', placeItems: 'center',
    fontSize: 13, fontWeight: 700, flex: '0 0 auto',
  },
  agendaTitle: {
    fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em',
    lineHeight: 1.3, color: 'var(--text)', textWrap: 'pretty',
  },
  agendaDesc: {
    fontSize: 12.5, color: 'var(--text-2)', marginTop: 4,
    lineHeight: 1.4,
  },
  voteRow: {
    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6,
    marginTop: 6,
  },
};

// ─────────────────────────────────────────────────────────────
function VoteHero() {
  return (
    <div style={voteStyles.hero}>
      <div style={{ position:'absolute', right:-40, top:-40, width:160, height:160, borderRadius:999, background:'rgba(251,191,36,0.18)' }} />
      <div style={{ position:'absolute', right:60, bottom:-60, width:120, height:120, borderRadius:999, background:'rgba(251,191,36,0.10)' }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 9px', borderRadius: 999,
          background: 'rgba(251,191,36,0.22)', color: '#FB923C',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: '#FB923C' }} />
          Идёт
        </span>
        <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }}>
          Голосование №2024-12
        </span>
      </div>

      <div style={{ position: 'relative', fontSize: 19, fontWeight: 650, lineHeight: 1.25, letterSpacing: '-0.02em', textWrap: 'pretty' }}>
        Капитальный ремонт лифтов в подъездах 1–3
      </div>

      <div style={{ position: 'relative', marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <Stat label="Кворум" value="63%" sub="38 из 60" />
        <Stat label="Осталось" value="2 дн" sub="до 28.12" />
        <Stat label="Бюджет" value="184М" sub="сум" />
      </div>

      {/* Quorum bar */}
      <div style={{ position: 'relative', marginTop: 14 }}>
        <div style={{
          height: 6, borderRadius: 999,
          background: 'rgba(255,255,255,0.18)',
        }}>
          <div style={{ width: '63%', height: '100%', borderRadius: 999, background: '#FB923C' }} />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          Для принятия решения нужно ≥ 50% голосов от собственников
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div style={{
      padding: '10px 0',
      borderRight: '1px solid rgba(255,255,255,0.12)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>
        {sub}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function VoteButton({ kind, label, count, total, selected, onClick }) {
  const colors = {
    for:     { fg: '#15803D', bg: '#DCFCE7', sel: '#16A34A' },
    against: { fg: '#B91C1C', bg: '#FEE2E2', sel: '#DC2626' },
    abstain: { fg: '#57534E', bg: '#F5F5F4', sel: '#78716C' },
  }[kind];
  const Glyph = kind === 'for' ? ICheck : kind === 'against' ? IClose : IDots;
  const pct = Math.round((count / total) * 100);
  return (
    <button onClick={onClick} style={{
      cursor: 'pointer', border: 'none',
      padding: '10px 8px', borderRadius: 12,
      background: selected ? colors.sel : colors.bg,
      color: selected ? '#fff' : colors.fg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      position: 'relative',
      boxShadow: selected ? `0 4px 12px ${colors.sel}40` : 'none',
      transition: 'all .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Glyph size={14} stroke={2.6} />
        <span style={{ fontSize: 12.5, fontWeight: 650 }}>{label}</span>
      </div>
      <div style={{ fontSize: 10.5, opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
        {count} · {pct}%
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
const AGENDA = [
  {
    title: 'Утвердить смету: 184 000 000 сум',
    desc: 'Включает 2 лифта Otis, монтаж, лицензирование, гарантия 5 лет.',
    counts: { for: 22, against: 8, abstain: 8 },
  },
  {
    title: 'Выбрать подрядчика «LiftCenter Tashkent»',
    desc: 'Опыт 12 лет, рекомендованы УК. Альтернатива: «Asia Lift Group».',
    counts: { for: 25, against: 5, abstain: 8 },
  },
  {
    title: 'Распределить расходы пропорционально площади',
    desc: 'Альтернатива — равными долями на квартиру.',
    counts: { for: 19, against: 12, abstain: 7 },
  },
  {
    title: 'Сроки: январь–март 2025',
    desc: 'Подъезды поочерёдно, временные лестничные маршруты сохраняются.',
    counts: { for: 30, against: 2, abstain: 6 },
  },
];

function AgendaItem({ idx, item, vote, onVote, objection, onObjection }) {
  const total = item.counts.for + item.counts.against + item.counts.abstain;
  return (
    <div style={voteStyles.card}>
      <div style={voteStyles.agendaH}>
        <div style={voteStyles.agendaIdx}>{idx + 1}</div>
        <div style={{ flex: 1 }}>
          <div style={voteStyles.agendaTitle}>{item.title}</div>
          <div style={voteStyles.agendaDesc}>{item.desc}</div>
        </div>
      </div>

      <div style={voteStyles.voteRow}>
        <VoteButton kind="for"     label="За"        count={item.counts.for + (vote === 'for' ? 1 : 0)}    total={total + 1} selected={vote === 'for'}    onClick={() => onVote(vote === 'for' ? null : 'for')} />
        <VoteButton kind="against" label="Против"   count={item.counts.against + (vote === 'against' ? 1 : 0)} total={total + 1} selected={vote === 'against'} onClick={() => onVote(vote === 'against' ? null : 'against')} />
        <VoteButton kind="abstain" label="Воздерж." count={item.counts.abstain + (vote === 'abstain' ? 1 : 0)} total={total + 1} selected={vote === 'abstain'} onClick={() => onVote(vote === 'abstain' ? null : 'abstain')} />
      </div>

      {/* Result bar */}
      <div style={{
        marginTop: 12, height: 4, borderRadius: 999,
        background: 'var(--stone-150)', display: 'flex', overflow: 'hidden',
      }}>
        <div style={{ width: `${(item.counts.for / total) * 100}%`, background: 'var(--success)' }} />
        <div style={{ width: `${(item.counts.against / total) * 100}%`, background: 'var(--danger)' }} />
        <div style={{ width: `${(item.counts.abstain / total) * 100}%`, background: 'var(--stone-400)' }} />
      </div>

      {/* Objection reveal */}
      {vote === 'against' && (
        <div style={{
          marginTop: 12,
          padding: 12,
          background: '#FEF2F2', borderRadius: 12,
          border: '1px solid #FECACA',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <IInfo size={13} /> Обоснуйте возражение
          </div>
          <textarea
            value={objection}
            onChange={e => onObjection(e.target.value)}
            placeholder="Например: смета завышена по сравнению с похожими проектами в районе..."
            style={{
              width: '100%', minHeight: 64,
              padding: '10px 12px',
              background: '#fff',
              border: '1px solid #FECACA',
              borderRadius: 10,
              fontFamily: 'inherit', fontSize: 13, color: 'var(--text)',
              resize: 'none', outline: 'none', lineHeight: 1.4,
              boxSizing: 'border-box',
            }}
          />
          <div style={{ marginTop: 4, fontSize: 11, color: '#7F1D1D' }}>
            Возражение прикрепляется к&nbsp;протоколу собрания.
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function VoteSummaryBar({ votes, onConfirm, ready }) {
  const counts = { for: 0, against: 0, abstain: 0 };
  Object.values(votes).forEach(v => { if (v) counts[v]++; });
  const filled = Object.values(votes).filter(Boolean).length;
  const total = AGENDA.length;

  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30,
      padding: '12px 16px 28px',
      background: 'linear-gradient(180deg, rgba(245,245,244,0) 0%, rgba(245,245,244,0.95) 25%, #F5F5F4 100%)',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{
        background: '#fff', border: '1px solid var(--border)',
        borderRadius: 20, padding: 14,
        boxShadow: '0 8px 24px rgba(28,25,23,0.10)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)' }}>
            Заполнено <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: 'var(--text)' }}>{filled}/{total}</span> пунктов
          </div>
          <div style={{ display: 'flex', gap: 10, fontSize: 11.5, fontWeight: 600 }}>
            <span style={{ color: 'var(--success)' }}>За {counts.for}</span>
            <span style={{ color: 'var(--danger)' }}>Против {counts.against}</span>
            <span style={{ color: 'var(--text-3)' }}>Воздерж. {counts.abstain}</span>
          </div>
        </div>
        <button
          onClick={onConfirm}
          disabled={!ready}
          style={{
            width: '100%', padding: '14px 16px',
            borderRadius: 14, border: 'none', cursor: ready ? 'pointer' : 'default',
            background: ready ? 'var(--amber-600)' : 'var(--stone-200)',
            color: ready ? '#fff' : 'var(--text-3)',
            fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: ready ? 'var(--sh-amber)' : 'none',
          }}>
          {ready ? 'Подтвердить голос по SMS' : `Заполните все ${total} пункта`}
          {ready && <IArrowR size={16} stroke={2.4} />}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// OTP modal
function OTPModal({ open, onClose, onDone }) {
  const [code, setCode] = React.useState(['', '', '', '']);
  const [sent, setSent] = React.useState(true);
  const refs = React.useRef([]);

  React.useEffect(() => { if (open) { setCode(['','','','']); refs.current[0]?.focus(); } }, [open]);

  if (!open) return null;
  const filled = code.every(d => d.length === 1);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(28,25,23,0.55)',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div style={{
        width: '100%', background: '#fff',
        borderTopLeftRadius: 26, borderTopRightRadius: 26,
        padding: '24px 22px 32px',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 38, height: 5, background: 'var(--stone-300)', borderRadius: 999, margin: '-12px auto 16px' }} />
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'var(--amber-50)', color: 'var(--amber-700)',
          display: 'grid', placeItems: 'center', margin: '0 auto 14px',
        }}>
          <IShield size={28} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 700, textAlign: 'center', letterSpacing: '-0.02em' }}>
          Подтверждение голоса
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>
          Введите код из&nbsp;SMS, отправленного на&nbsp;<b style={{ color: 'var(--text)' }}>+998 90 ··· 47 12</b>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 20 }}>
          {[0,1,2,3].map(i => (
            <input
              key={i}
              ref={el => refs.current[i] = el}
              value={code[i]}
              maxLength={1}
              inputMode="numeric"
              onChange={e => {
                const v = e.target.value.replace(/\D/g, '');
                const next = [...code]; next[i] = v; setCode(next);
                if (v && i < 3) refs.current[i+1]?.focus();
              }}
              onKeyDown={e => {
                if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i-1]?.focus();
              }}
              style={{
                width: 56, height: 64,
                borderRadius: 14,
                border: code[i] ? '2px solid var(--amber-600)' : '1.5px solid var(--stone-300)',
                fontSize: 24, fontWeight: 700, textAlign: 'center',
                fontVariantNumeric: 'tabular-nums', color: 'var(--text)',
                outline: 'none', background: code[i] ? 'var(--amber-50)' : '#fff',
                fontFamily: 'inherit',
              }}
            />
          ))}
        </div>

        <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)' }}>
          {sent ? 'Не пришёл код? ' : ''}<a style={{ color: 'var(--amber-700)', fontWeight: 600 }}>Отправить снова через 0:42</a>
        </div>

        <button
          disabled={!filled}
          onClick={() => onDone()}
          style={{
            width: '100%', marginTop: 20,
            padding: '14px 16px',
            borderRadius: 14, border: 'none',
            cursor: filled ? 'pointer' : 'default',
            background: filled ? 'var(--amber-600)' : 'var(--stone-200)',
            color: filled ? '#fff' : 'var(--text-3)',
            fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em',
            boxShadow: filled ? 'var(--sh-amber)' : 'none',
          }}>
          Подтвердить
        </button>
        <button onClick={onClose} style={{
          width: '100%', marginTop: 8, padding: '12px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 13.5, color: 'var(--text-2)', fontWeight: 500,
        }}>
          Отменить
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function VotingScreen({ onClose }) {
  const [votes, setVotes] = React.useState({});
  const [objections, setObjections] = React.useState({});
  const [otp, setOtp] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const ready = AGENDA.every((_, i) => votes[i]);

  if (done) {
    return (
      <div className="kz-screen" style={voteStyles.page}>
        <div style={voteStyles.topbar}>
          <button style={voteStyles.iconBtn} onClick={onClose}><IArrowL size={18} /></button>
          <div style={voteStyles.topTitle}>Голос принят</div>
          <div style={{ width: 36 }} />
        </div>
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div style={{
            width: 88, height: 88, borderRadius: 999,
            background: 'var(--success-bg)', color: 'var(--success)',
            display: 'grid', placeItems: 'center', margin: '0 auto 18px',
          }}>
            <ICheck size={44} stroke={2.6} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Спасибо, ваш голос учтён
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 10, lineHeight: 1.45 }}>
            Бюллетень №<b style={{ color: 'var(--text)' }}>0042-А</b> подписан и&nbsp;добавлен в&nbsp;протокол. Итоги — после закрытия 28 декабря.
          </div>

          <div style={{
            marginTop: 22, padding: 16, borderRadius: 16,
            background: '#fff', border: '1px solid var(--border)',
            textAlign: 'left', boxShadow: 'var(--sh-1)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 8 }}>
              Ваш бюллетень
            </div>
            {AGENDA.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: i < AGENDA.length - 1 ? '1px solid var(--hairline)' : 'none' }}>
                <div style={voteStyles.agendaIdx}>{i+1}</div>
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>{a.title}</div>
                <div style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  background: votes[i] === 'for' ? 'var(--success-bg)' : votes[i] === 'against' ? 'var(--danger-bg)' : 'var(--stone-150)',
                  color: votes[i] === 'for' ? '#15803D' : votes[i] === 'against' ? '#B91C1C' : 'var(--text-2)',
                }}>
                  {votes[i] === 'for' ? 'За' : votes[i] === 'against' ? 'Против' : 'Воздерж.'}
                </div>
              </div>
            ))}
          </div>

          <button onClick={onClose} style={{
            marginTop: 20, padding: '14px 24px',
            borderRadius: 14, border: 'none', cursor: 'pointer',
            background: 'var(--amber-600)', color: '#fff',
            fontSize: 15, fontWeight: 650,
            boxShadow: 'var(--sh-amber)',
          }}>
            На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="kz-screen" style={voteStyles.page}>
      <div style={voteStyles.topbar}>
        <button style={voteStyles.iconBtn} onClick={onClose}><IArrowL size={18} /></button>
        <div style={voteStyles.topTitle}>Голосование</div>
        <button style={voteStyles.iconBtn}><IInfo size={18} /></button>
      </div>

      <VoteHero />

      <div style={voteStyles.section}>
        <div style={voteStyles.sectionTitle}>Повестка · 4 пункта</div>
        {AGENDA.map((item, i) => (
          <AgendaItem
            key={i} idx={i} item={item}
            vote={votes[i]}
            onVote={v => setVotes({ ...votes, [i]: v })}
            objection={objections[i] || ''}
            onObjection={t => setObjections({ ...objections, [i]: t })}
          />
        ))}
      </div>

      <div style={{ padding: '0 16px', marginTop: 8 }}>
        <div style={{
          padding: 12, borderRadius: 12,
          background: 'var(--stone-100)', border: '1px solid var(--border)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <ILock size={16} style={{ color: 'var(--text-3)', flex: '0 0 auto', marginTop: 1 }} />
          <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
            Голос подтверждается кодом из SMS и&nbsp;юридически приравнивается к&nbsp;подписи на&nbsp;собрании собственников.
          </div>
        </div>
      </div>

      <VoteSummaryBar votes={votes} ready={ready} onConfirm={() => setOtp(true)} />

      <OTPModal open={otp} onClose={() => setOtp(false)} onDone={() => { setOtp(false); setDone(true); }} />
    </div>
  );
}

Object.assign(window, { VotingScreen });
