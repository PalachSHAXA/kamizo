// kamizo-finance.jsx — Payments & charges (09). FOUNDATION. Money = trust:
// clean, big tabular-nums. Dark balance card → charges list → building expenses.

function FinanceScreen({ activeTab = 'home', onTabChange, state = 'due' }) {
  // state: 'due' | 'overdue' | 'clear'
  const [expanded, setExpanded] = React.useState(null);

  const balance = state === 'clear' ? 0 : state === 'overdue' ? 624800 : 312400;
  const fmt = (n) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

  const charges = [
    { id: 'c1', label: 'Содержание дома', period: 'Май 2025', sum: 142000, status: 'due', items: [['Уборка', 48000], ['Лифт', 54000], ['Освещение МОП', 40000]] },
    { id: 'c2', label: 'Охрана', period: 'Май 2025', sum: 90400, status: 'due', items: [['Пост охраны', 72000], ['Видеонаблюдение', 18400]] },
    { id: 'c3', label: 'Вывоз мусора', period: 'Май 2025', sum: 80000, status: state === 'overdue' ? 'overdue' : 'due', items: [['Базовый тариф', 80000]] },
    { id: 'c4', label: 'Содержание дома', period: 'Апрель 2025', sum: 142000, status: 'paid', items: [['Уборка', 48000], ['Лифт', 54000], ['Освещение МОП', 40000]] },
  ];

  const expenses = [
    { label: 'Зарплата персонала', pct: 42, color: 'var(--brand)' },
    { label: 'Ремонт и материалы', pct: 26, color: 'var(--status-info)' },
    { label: 'Коммунальные МОП', pct: 18, color: 'var(--status-active)' },
    { label: 'Прочее', pct: 14, color: 'var(--text-muted)' },
  ];

  const ST = {
    paid: { label: 'Оплачено', fg: 'var(--status-active)', bg: 'var(--status-active-bg)' },
    due: { label: 'К оплате', fg: 'var(--status-pending)', bg: 'var(--status-pending-bg)' },
    overdue: { label: 'Просрочено', fg: 'var(--status-critical)', bg: 'var(--status-critical-bg)' },
  };

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 124 }}>
      {/* Header */}
      <div style={{ padding: '52px 16px 8px' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Кв. 45 · Дом 12А</div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.025em', marginTop: 2 }}>Оплата</div>
      </div>

      {/* Balance card */}
      <div style={{ padding: '8px 16px 0' }}>
        <div style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 'var(--radius-xl)', padding: 20,
          background: state === 'overdue'
            ? 'linear-gradient(155deg, #7A2520 0%, #2A1816 100%)'
            : state === 'clear'
              ? 'linear-gradient(155deg, #15734F 0%, #143A2A 100%)'
              : 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)',
          color: 'var(--text-on-dark)',
        }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.4, background: state === 'overdue' ? 'radial-gradient(90% 80% at 88% 0%, rgba(226,72,61,0.5), transparent 55%)' : state === 'clear' ? 'radial-gradient(90% 80% at 88% 0%, rgba(21,160,110,0.5), transparent 55%)' : 'radial-gradient(90% 80% at 88% 0%, rgba(251,146,60,0.5), transparent 55%)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(244,240,232,0.7)' }}>
              {state === 'clear' ? 'Баланс квартиры' : state === 'overdue' ? 'Просроченная задолженность' : 'К оплате за май'}
            </div>
            {state === 'clear' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 999, background: 'rgba(34,197,94,0.2)', color: '#86EFAC', display: 'grid', placeItems: 'center' }}><ICheck size={24} stroke={2.6} /></div>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Нет задолженности</div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6, flexWrap: 'nowrap' }}>
                <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, whiteSpace: 'nowrap' }}>{fmt(balance)}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'rgba(244,240,232,0.7)' }}>сум</span>
              </div>
            )}
            {state !== 'clear' && (
              <div style={{ fontSize: 12.5, color: 'rgba(244,240,232,0.7)', marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IClock size={13} /> {state === 'overdue' ? 'Просрочено с 10 мая · начисляется пеня' : 'Срок до 10 июня'}
              </div>
            )}
            <button style={{
              width: '100%', marginTop: 16, padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
              background: state === 'clear' ? 'rgba(244,240,232,0.15)' : 'var(--brand)', color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: state === 'clear' ? 'none' : 'var(--sh-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {state === 'clear' ? 'История платежей' : <><ICard size={17} /> Оплатить {fmt(balance)} сум</>}
            </button>
          </div>
        </div>
      </div>

      {/* Charges */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Начисления</span>
          <button style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--brand-dark)', background: 'transparent', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><IDownload size={14} /> Акт сверки</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {charges.map(c => {
            const st = ST[c.status];
            const open = expanded === c.id;
            return (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <button onClick={() => setExpanded(open ? null : c.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: 15, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>{c.period}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>{fmt(c.sum)}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: st.fg, background: st.bg, padding: '2px 7px', borderRadius: 999, marginTop: 3, display: 'inline-block' }}>{st.label}</span>
                  </div>
                  <IChevronD size={16} style={{ color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flex: '0 0 auto' }} />
                </button>
                {open && (
                  <div style={{ padding: '0 15px 14px 15px' }}>
                    <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {c.items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{it[0]}</span>
                          <span style={{ fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>{fmt(it[1])} сум</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Building expenses */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 10 }}>Куда идут средства дома</div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 16 }}>
          <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
            {expenses.map((e, i) => <div key={i} style={{ width: `${e.pct}%`, background: e.color }} />)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {expenses.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: e.color, flex: '0 0 auto' }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>{e.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{e.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { FinanceScreen });
