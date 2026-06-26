// kamizo-admin-chat.jsx — УК operator inbox (Промт B).
// Two-panel on desktop/tablet (list + dialog), two-screen flow on mobile.
// Real interactions: select, search list, branch/house + unread filters,
// in-chat search overlay (↑↓), quick-reply insert (not auto-send),
// internal notes (yellow), multi-operator author labels, system request chips,
// resident-context header + info dropdown, loading/empty/no-result states.
// Depends on: kamizo-icons.jsx, kamizo-admin-data.jsx. FOUNDATION tokens.

// ── ticks (delivery/read) ──
const ATicks = ({ read }) => (
  <svg width="18" height="12" viewBox="0 0 20 14" fill="none"
    stroke={read ? 'var(--brand)' : 'rgba(255,255,255,0.85)'} strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M1 7.5l3.6 3.6L11 4" /><path d="M8.4 11.1L9.2 11.9 15.6 4.6" />
  </svg>
);

// faux photo tile
function AdminPhoto({ scene, onOpen, w = 210 }) {
  const s = (window.ADMIN_PHOTOS[scene]) || window.ADMIN_PHOTOS.leak;
  return (
    <button onClick={onOpen} style={{
      display: 'block', width: w, maxWidth: '100%', border: 'none', padding: 0, cursor: 'pointer',
      borderRadius: 12, overflow: 'hidden', position: 'relative', height: 140, background: s.grad,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 70% 20%, rgba(255,255,255,0.18), transparent 55%)' }} />
      <div style={{ position: 'absolute', left: '18%', bottom: 0, width: '34%', height: '60%', background: 'rgba(0,0,0,0.22)', transform: 'skewX(-6deg)' }} />
      <div style={{ position: 'absolute', left: '52%', bottom: 0, width: '40%', height: '44%', background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', bottom: 7, left: 9, fontSize: 10, color: 'rgba(255,255,255,0.92)', fontWeight: 650, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{s.label}</div>
    </button>
  );
}

// highlight matched substring
function Highlighted({ text, query }) {
  if (!query) return text;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: 'var(--brand-200)', color: 'var(--text-primary)', borderRadius: 3, padding: '0 1px' }}>{text.slice(i, i + query.length)}</mark>
      {text.slice(i + query.length)}
    </>
  );
}

// system request chip (centered, clickable)
function SystemChip({ request }) {
  const closed = request.state === 'closed';
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0' }}>
      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        padding: '7px 12px 7px 9px', borderRadius: 999,
        background: closed ? 'var(--surface-sunken)' : 'var(--brand-tint)',
        border: `1px solid ${closed ? 'var(--border-c)' : 'var(--brand-200)'}`,
      }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, display: 'grid', placeItems: 'center', flex: '0 0 auto',
          background: closed ? 'var(--surface)' : 'var(--brand)', color: closed ? 'var(--text-muted)' : '#fff' }}>
          {closed ? <ICheck size={14} stroke={2.6} /> : <IDoc size={13} />}
        </span>
        <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text-secondary)' }}>
          <b style={{ color: closed ? 'var(--text-secondary)' : 'var(--brand-dark)', fontWeight: 750 }}>{request.id}</b>
          {' · '}{request.title} · {request.status}
        </span>
        <IChevronR size={14} style={{ color: 'var(--text-muted)', flex: '0 0 auto' }} />
      </button>
    </div>
  );
}

// ── conversation card (list row) ──
function ConvCard({ c, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 11,
      padding: '11px 14px', border: 'none', borderLeft: `3px solid ${active ? 'var(--brand)' : 'transparent'}`,
      background: active ? 'var(--brand-tint)' : 'transparent', position: 'relative',
      alignItems: 'flex-start', transition: 'background .12s',
    }}>
      <div style={{ position: 'relative', flex: '0 0 auto', marginTop: 1 }}>
        <Avatar name={c.name} size={46} />
        {c.unread > 0 && <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'grid', placeItems: 'center', border: '2px solid var(--surface)' }}>{c.unread}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: c.unread ? 800 : 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.name}</span>
          <span style={{ fontSize: 11, fontWeight: c.unread ? 750 : 500, color: c.unread ? 'var(--brand-dark)' : 'var(--text-muted)', flex: '0 0 auto' }}>{c.time}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.house} · {c.apt}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 5 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: c.unread ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: c.unread ? 650 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.3 }}>{c.preview}</span>
          {c.tag && <Tag tone={c.tag.tone}>{c.tag.label}</Tag>}
        </div>
      </div>
    </button>
  );
}

// ── list panel ──
function ListPanel({ convos, selectedId, onSelect, mode }) {
  const { useState, useMemo } = React;
  const [q, setQ] = useState('');
  const [branch, setBranch] = useState('all');
  const [house, setHouse] = useState('all');
  const [onlyUnread, setOnlyUnread] = useState(false);

  const houses = useMemo(() => {
    const set = [...new Set(convos.filter(c => branch === 'all' || c.branch === branch).map(c => c.house))];
    return set;
  }, [convos, branch]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = convos.filter(c => {
      if (branch !== 'all' && c.branch !== branch) return false;
      if (house !== 'all' && c.house !== house) return false;
      if (onlyUnread && !c.unread) return false;
      if (qq) {
        const hay = (c.name + ' ' + c.apt + ' ' + c.house + ' ' + c.preview).toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
    return list.sort((a, b) => (b.unread > 0) - (a.unread > 0));
  }, [convos, q, branch, house, onlyUnread]);

  const totalUnread = convos.reduce((s, c) => s + (c.unread || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface)', borderRight: mode === 'desktop' ? '1px solid var(--border-c)' : 'none' }}>
      {/* header */}
      <div style={{ flex: '0 0 auto', padding: mode === 'mobile' ? '54px 16px 10px' : '18px 16px 10px', borderBottom: '1px solid var(--border-c)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Сообщения</h1>
          {totalUnread > 0 && <span style={{ minWidth: 22, height: 22, padding: '0 7px', borderRadius: 999, background: 'var(--brand)', color: '#fff', fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center' }}>{totalUnread}</span>}
          <div style={{ flex: 1 }} />
          <button style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer' }} aria-label="Новое обращение"><IEdit size={18} /></button>
        </div>
        {/* search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40, background: 'var(--surface-2)', border: '1px solid var(--border-c)', borderRadius: 12 }}>
          <ISearch size={17} style={{ color: 'var(--text-muted)', flex: '0 0 auto' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Имя, № квартиры, текст…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: 'var(--text-primary)', fontFamily: 'var(--font)' }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', padding: 0 }} aria-label="Очистить"><IClose size={15} /></button>}
        </div>
      </div>

      {/* filters */}
      <div style={{ flex: '0 0 auto', padding: '10px 14px 8px', borderBottom: '1px solid var(--border-c)', background: 'var(--surface-2)' }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
          {window.BRANCHES.map(b => (
            <button key={b.id} onClick={() => { setBranch(b.id); setHouse('all'); }} style={{ flex: '0 0 auto', padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '-0.01em',
              background: branch === b.id ? 'var(--ink)' : 'var(--surface)', color: branch === b.id ? '#fff' : 'var(--text-secondary)', border: `1px solid ${branch === b.id ? 'var(--ink)' : 'var(--border-c)'}` }}>{b.label}</button>
          ))}
        </div>
        {branch !== 'all' && houses.length > 1 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 }}>
            <button onClick={() => setHouse('all')} style={houseChip(house === 'all')}>Все дома</button>
            {houses.map(h => <button key={h} onClick={() => setHouse(h)} style={houseChip(house === h)}>{h.split(', ')[1] ? 'д. ' + h.split(', ')[1] : h}</button>)}
          </div>
        )}
        {/* Все / Непрочитанные segmented */}
        <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-sunken)', borderRadius: 10, marginTop: 2 }}>
          {[['Все', false], ['Непрочитанные', true]].map(([label, val]) => (
            <button key={label} onClick={() => setOnlyUnread(val)} style={{ flex: 1, padding: '7px 0', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: 'none', letterSpacing: '-0.01em',
              background: onlyUnread === val ? 'var(--surface)' : 'transparent', color: onlyUnread === val ? 'var(--text-primary)' : 'var(--text-secondary)', boxShadow: onlyUnread === val ? 'var(--shadow-sm)' : 'none' }}>
              {label}{val && totalUnread > 0 ? ` · ${totalUnread}` : ''}
            </button>
          ))}
        </div>
      </div>

      {/* list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 28px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ width: 52, height: 52, margin: '0 auto 14px', borderRadius: 16, background: 'var(--surface-2)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>
              {q ? <ISearch size={24} /> : <IChat size={24} />}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>{q ? 'Ничего не найдено' : 'Пока нет обращений'}</div>
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.5 }}>{q ? `По запросу «${q}» совпадений нет.` : 'Новые сообщения жителей появятся здесь.'}</div>
          </div>
        ) : filtered.map(c => (
          <div key={c.id} style={{ borderBottom: '1px solid var(--hairline)' }}>
            <ConvCard c={c} active={c.id === selectedId} onClick={() => onSelect(c.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
function houseChip(on) {
  return { flex: '0 0 auto', padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    background: on ? 'var(--brand-tint)' : 'var(--surface)', color: on ? 'var(--brand-dark)' : 'var(--text-secondary)', border: `1px solid ${on ? 'var(--brand-200)' : 'var(--border-c)'}` };
}

Object.assign(window, { ATicks, AdminPhoto, Highlighted, SystemChip, ConvCard, ListPanel });
