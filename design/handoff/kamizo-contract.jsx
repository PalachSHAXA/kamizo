// kamizo-contract.jsx — Resident contract (14). Official but warm. FOUNDATION.
// Dark header card + accordion sections + two-column requisites + sticky actions.

function ContractScreen({ activeTab = 'profile', onTabChange, signed = true }) {
  const [open, setOpen] = React.useState('s1');
  const sections = [
    { id: 's1', title: '1. Предмет договора', body: 'УК «Камизо» обязуется оказывать услуги по управлению, содержанию и текущему ремонту общего имущества многоквартирного дома по адресу: ул. Навои, 25. Собственник обязуется оплачивать услуги в порядке и сроки, установленные настоящим договором.' },
    { id: 's2', title: '2. Права и обязанности сторон', body: 'УК обеспечивает круглосуточное аварийно-диспетчерское обслуживание, ведёт техническую документацию, информирует собственников о работах. Собственник обеспечивает доступ к общему имуществу для проведения работ и своевременно вносит плату.' },
    { id: 's3', title: '3. Стоимость и порядок расчётов', body: 'Тариф на содержание — 3 200 сум за м² в месяц. Оплата до 10 числа месяца, следующего за расчётным. При просрочке начисляется пеня 0,1% за каждый день.' },
    { id: 's4', title: '4. Срок действия', body: 'Договор заключён на 1 год с автоматической пролонгацией, если ни одна из сторон не заявит о расторжении за 30 дней до окончания срока.' },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--app-bg)', paddingBottom: 120 }}>
      {/* Header */}
      <div style={{ padding: '52px 16px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => onTabChange && onTabChange('profile')} style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer' }} aria-label="Назад"><IArrowL size={19} /></button>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Договор</div>
      </div>

      <div style={{ padding: '8px 16px 0' }}>
        {/* Contract hero card */}
        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-xl)', padding: 20, background: 'linear-gradient(160deg, #4A3B30 0%, #2A2018 100%)', color: 'var(--text-on-dark)' }}>
          <div style={{ position: 'absolute', inset: 0, opacity: 0.4, background: 'radial-gradient(90% 80% at 88% 0%, rgba(251,146,60,0.45), transparent 55%)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ width: 46, height: 46, borderRadius: 13, background: 'rgba(244,240,232,0.14)', display: 'grid', placeItems: 'center' }}><IFile size={24} /></div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: signed ? 'rgba(34,197,94,0.18)' : 'rgba(245,158,11,0.2)', color: signed ? '#86EFAC' : '#FCD34D' }}>
                {signed ? <><ICheck size={11} stroke={3} /> Действует</> : 'На подписании'}
              </span>
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 14 }}>Договор управления</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div><div style={{ fontSize: 10.5, color: 'rgba(244,240,232,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Номер</div><div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-num)', marginTop: 2 }}>2024-1842</div></div>
              <div><div style={{ fontSize: 10.5, color: 'rgba(244,240,232,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>Дата</div><div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>15.10.2023</div></div>
            </div>
          </div>
        </div>

        {/* Sections accordion */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '20px 2px 10px' }}>Условия</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sections.map(s => {
            const isOpen = open === s.id;
            return (
              <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <button onClick={() => setOpen(isOpen ? null : s.id)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 15, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em' }}>{s.title}</span>
                  <IChevronD size={17} style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flex: '0 0 auto' }} />
                </button>
                {isOpen && <div style={{ padding: '0 15px 15px', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{s.body}</div>}
              </div>
            );
          })}
        </div>

        {/* Requisites */}
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-secondary)', textTransform: 'uppercase', padding: '20px 2px 10px' }}>Реквизиты сторон</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[{ t: 'Управляющая компания', l: ['ООО «Камизо»', 'ИНН 302456789', 'Ташкент, Навои 25'] }, { t: 'Собственник', l: ['Фарход Каримов', 'Кв. 45 · 67 м²', 'тел. ···47 12'] }].map((c, i) => (
            <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand-dark)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{c.t}</div>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {c.l.map((x, j) => <div key={j} style={{ fontSize: 12.5, color: j === 0 ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: j === 0 ? 700 : 500 }}>{x}</div>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky actions */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 16px 26px', background: 'rgba(244,240,232,0.95)', backdropFilter: 'blur(14px)', borderTop: '1px solid var(--border-c)', display: 'flex', gap: 10 }}>
        <button style={{ flex: signed ? 1 : '0 0 auto', padding: '14px 18px', borderRadius: 'var(--radius-md)', background: 'var(--surface)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IDownload size={17} /> Скачать PDF</button>
        {!signed && <button style={{ flex: 1, padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', border: 'none', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)' }}>Подписать</button>}
      </div>
    </div>
  );
}

Object.assign(window, { ContractScreen });
