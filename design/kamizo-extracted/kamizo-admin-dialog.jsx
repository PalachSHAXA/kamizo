// kamizo-admin-dialog.jsx — dialog panel, info dropdown, in-chat search,
// quick replies, composer (+internal note), templates editor, and the
// AdminInbox orchestrator. Depends on kamizo-admin-chat.jsx + data + icons.

// ── message bubble ──
function MsgBubble({ m, query, hit, refCb }) {
  const isOp = m.from === 'operator';
  const note = m.kind === 'note';
  const op = isOp ? window.OPERATORS[m.op] : null;

  if (note) {
    return (
      <div ref={refCb} style={{ alignSelf: 'flex-end', maxWidth: '88%', background: '#FEF6D8', border: '1px solid #F2DD92', borderRadius: '14px 14px 4px 14px', padding: '9px 12px', boxShadow: hit ? '0 0 0 3px var(--brand-200)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <ILock size={12} style={{ color: '#A9821B' }} />
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: '#A9821B' }}>Внутренняя заметка · {op?.name}</span>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.45, color: '#6B5410', textWrap: 'pretty' }}><Highlighted text={m.text} query={query} /></div>
        <div style={{ fontSize: 10, color: '#B59B52', fontWeight: 600, marginTop: 4, textAlign: 'right' }}>{m.time} · видно только сотрудникам</div>
      </div>
    );
  }

  return (
    <div ref={refCb} style={{ display: 'flex', flexDirection: 'column', alignItems: isOp ? 'flex-end' : 'flex-start', maxWidth: '82%', alignSelf: isOp ? 'flex-end' : 'flex-start' }}>
      {isOp && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 4px 3px' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: op?.color || 'var(--brand-dark)' }}>{op?.name}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--surface-sunken)', padding: '1px 6px', borderRadius: 999 }}>{op?.role}</span>
        </div>
      )}
      <div style={{
        background: isOp ? 'linear-gradient(158deg,#FB923C,#EA580C)' : 'var(--surface)',
        color: isOp ? '#fff' : 'var(--text-primary)',
        border: isOp ? 'none' : '1px solid var(--border-c)',
        borderRadius: isOp ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        padding: m.photo && !m.text ? 5 : '9px 13px', fontSize: 14, lineHeight: 1.42, letterSpacing: '-0.01em',
        boxShadow: hit ? '0 0 0 3px var(--brand-300)' : (isOp ? '0 4px 12px -4px rgba(217,119,6,0.4)' : 'var(--shadow-sm)'),
        textWrap: 'pretty', maxWidth: '100%',
      }}>
        {m.text && <div style={{ marginBottom: m.photo ? 7 : 0 }}><Highlighted text={m.text} query={query} /></div>}
        {m.photo && <AdminPhoto scene={m.photo} onOpen={() => {}} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '3px 4px 0', color: 'var(--text-muted)' }}>
        <span style={{ fontSize: 10.5, fontWeight: 500 }}>{m.time}</span>
        {isOp && (m.read === false ? <ICheck size={13} stroke={2.4} /> : <ATicks read />)}
      </div>
    </div>
  );
}

// ── info dropdown (resident context + actions) ──
function InfoDropdown({ c, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 40 }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', top: 8, right: 12, width: 280, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'kzPop .16s var(--ease-spring)' }}>
        <div style={{ padding: '14px 14px 12px', display: 'flex', gap: 11, alignItems: 'center', borderBottom: '1px solid var(--border-c)' }}>
          <Avatar name={c.name} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-primary)' }}>{c.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 1 }}>{c.house} · {c.apt}</div>
            <div style={{ marginTop: 6 }}><RoleBadge role={c.role} /></div>
          </div>
        </div>
        <a href={`tel:${c.phone.replace(/\s/g, '')}`} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: '1px solid var(--hairline)', textDecoration: 'none' }}>
          <IPhone size={17} style={{ color: 'var(--status-active)' }} />
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{c.phone}</span>
        </a>
        {c.requests.length > 0 && (
          <div style={{ padding: '10px 14px 6px', borderBottom: '1px solid var(--hairline)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 7 }}>Заявки жителя</div>
            {c.requests.map(r => (
              <button key={r.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '7px 8px', marginBottom: 4, background: 'var(--surface-2)', border: '1px solid var(--border-c)', borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 26, height: 26, borderRadius: 7, flex: '0 0 auto', display: 'grid', placeItems: 'center', background: r.state === 'closed' ? 'var(--surface-sunken)' : 'var(--brand-tint)', color: r.state === 'closed' ? 'var(--text-muted)' : 'var(--brand-dark)' }}>{r.state === 'closed' ? <ICheck size={14} stroke={2.4} /> : <IDoc size={13} />}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{r.id} · {r.status}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ padding: 6 }}>
          {[
            { icon: <IUser size={17} />, label: 'Профиль жителя', tone: 'var(--text-secondary)' },
            { icon: <IUsers size={17} />, label: 'Назначить сотрудника', tone: 'var(--status-info)' },
            { icon: <ICheck size={17} stroke={2.3} />, label: 'Пометить решённым', tone: 'var(--status-active)' },
            { icon: <IClose size={17} />, label: 'Закрыть обращение', tone: 'var(--status-critical)' },
          ].map((a, i) => (
            <button key={i} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', background: 'transparent', border: 'none', borderRadius: 9, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ color: a.tone, display: 'grid', placeItems: 'center' }}>{a.icon}</span>
              <span style={{ fontSize: 13.5, fontWeight: 650, color: a.tone === 'var(--status-critical)' ? 'var(--status-critical)' : 'var(--text-primary)' }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── templates editor (quick replies are editable in settings) ──
function TemplatesModal({ templates, onClose }) {
  const { useState } = React;
  const [items, setItems] = useState(templates);
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(28,25,23,0.42)', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(440px, 100%)', maxHeight: '86%', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: 20, border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'kzPop .18s var(--ease-spring)' }}>
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border-c)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ISpark size={18} style={{ color: 'var(--brand)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)' }}>Шаблоны ответов</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 550 }}>Доступны всем операторам УК</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--surface-sunken)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer' }} aria-label="Закрыть"><IClose size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
          {items.map((t, i) => (
            <div key={t.id} style={{ marginBottom: 12, padding: 12, background: 'var(--surface-2)', border: '1px solid var(--border-c)', borderRadius: 14 }}>
              <input value={t.label} onChange={e => setItems(s => s.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font)', marginBottom: 6 }} />
              <textarea value={t.text} onChange={e => setItems(s => s.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} rows={2} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid var(--border-c)', borderRadius: 9, padding: '8px 10px', outline: 'none', background: 'var(--surface)', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'var(--font)', resize: 'none', lineHeight: 1.45 }} />
            </div>
          ))}
          <button style={{ width: '100%', padding: '11px', borderRadius: 12, border: '1.5px dashed var(--border-strong)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'var(--font)' }}><IPlus size={16} /> Добавить шаблон</button>
        </div>
        <div style={{ padding: 14, borderTop: '1px solid var(--border-c)' }}>
          <button onClick={onClose} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 14, fontWeight: 750, cursor: 'pointer', boxShadow: 'var(--sh-brand)', fontFamily: 'var(--font)' }}>Сохранить</button>
        </div>
      </div>
    </div>
  );
}

// ── dialog panel ──
function DialogPanel({ c, mode, onBack }) {
  const { useState, useRef, useEffect, useCallback } = React;
  const [messages, setMessages] = useState(c.msgs);
  const [draft, setDraft] = useState('');
  const [internal, setInternal] = useState(false);
  const [info, setInfo] = useState(false);
  const [searchOn, setSearchOn] = useState(false);
  const [sq, setSq] = useState('');
  const [hitIdx, setHitIdx] = useState(0);
  const [tplOpen, setTplOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const msgRefs = useRef({});

  useEffect(() => { setMessages(c.msgs); setDraft(''); setInternal(false); setInfo(false); setSearchOn(false); setSq(''); }, [c.id]);

  const scrollEnd = useCallback((smooth = true) => {
    const el = scrollRef.current; if (el) requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
  }, []);
  useEffect(() => { if (!searchOn) scrollEnd(false); }, [c.id]);
  useEffect(() => { scrollEnd(); }, [messages.length]);

  // search hits
  const hits = sq.trim() ? messages.filter(m => m.text && m.text.toLowerCase().includes(sq.trim().toLowerCase())) : [];
  useEffect(() => { setHitIdx(0); }, [sq]);
  useEffect(() => {
    if (hits.length && msgRefs.current[hits[hitIdx]?.id]) {
      const el = msgRefs.current[hits[hitIdx].id]; const sc = scrollRef.current;
      if (el && sc) sc.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
    }
  }, [hitIdx, sq]);

  let MID = useRef(900);
  const send = () => {
    const text = draft.trim(); if (!text) return;
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const msg = internal
      ? { id: ++MID.current, from: 'operator', op: 'you', kind: 'note', time, text }
      : { id: ++MID.current, from: 'operator', op: 'you', time, text, read: false };
    setMessages(m => [...m, msg]);
    setDraft(''); setInternal(false);
    if (taRef.current) taRef.current.style.height = 'auto';
  };
  const useTemplate = (t) => { setDraft(d => (d ? d + ' ' : '') + t.text); setInternal(false); taRef.current?.focus(); };

  const canSend = draft.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--surface-2)', position: 'relative', minWidth: 0 }}>
      {/* header */}
      <div style={{ flex: '0 0 auto', padding: mode === 'mobile' ? '54px 12px 11px' : '12px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border-c)', display: 'flex', alignItems: 'center', gap: 11, zIndex: 6 }}>
        {mode === 'mobile' && <button onClick={onBack} style={iconBtn(true)} aria-label="Назад"><IArrowL size={21} /></button>}
        <Avatar name={c.name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
            <RoleBadge role={c.role} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 1 }}>{c.house} · {c.apt}</div>
        </div>
        <button onClick={() => { setSearchOn(s => !s); setSq(''); }} style={iconBtn(searchOn)} aria-label="Поиск по переписке"><ISearch size={18} /></button>
        <button onClick={() => setInfo(true)} style={iconBtn(false)} aria-label="Информация"><IInfo size={18} /></button>
      </div>

      {/* in-chat search overlay */}
      {searchOn && (
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--ink)', color: '#fff' }}>
          <ISearch size={16} style={{ color: 'rgba(255,255,255,0.6)', flex: '0 0 auto' }} />
          <input autoFocus value={sq} onChange={e => setSq(e.target.value)} placeholder="Поиск в переписке…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5, color: '#fff', fontFamily: 'var(--font)' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{hits.length ? `${hitIdx + 1} из ${hits.length}` : (sq ? '0' : '')}</span>
          <button disabled={!hits.length} onClick={() => setHitIdx(i => (i - 1 + hits.length) % hits.length)} style={navBtn(!hits.length)} aria-label="Предыдущее"><IChevronD size={16} style={{ transform: 'rotate(180deg)' }} /></button>
          <button disabled={!hits.length} onClick={() => setHitIdx(i => (i + 1) % hits.length)} style={navBtn(!hits.length)} aria-label="Следующее"><IChevronD size={16} /></button>
          <button onClick={() => { setSearchOn(false); setSq(''); }} style={navBtn(false)} aria-label="Закрыть"><IClose size={16} /></button>
        </div>
      )}

      {/* messages */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px 8px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {messages.map(m => {
          if (m.kind === 'date') return (
            <div key={m.id} style={{ textAlign: 'center', margin: '6px 0 2px' }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, padding: '4px 11px', background: 'var(--surface-sunken)', borderRadius: 999 }}>{m.label}</span>
            </div>
          );
          const isHit = hits.length && hits[hitIdx]?.id === m.id;
          return (
            <React.Fragment key={m.id}>
              <MsgBubble m={m} query={searchOn ? sq.trim() : ''} hit={isHit} refCb={el => { if (el) msgRefs.current[m.id] = el; }} />
              {m.request && <SystemChip request={m.request} />}
            </React.Fragment>
          );
        })}
      </div>

      {/* quick replies */}
      <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px 6px', overflowX: 'auto' }}>
        <button onClick={() => setTplOpen(true)} style={{ flex: '0 0 auto', width: 34, height: 34, borderRadius: 999, background: 'var(--brand-tint)', border: '1px solid var(--brand-200)', display: 'grid', placeItems: 'center', color: 'var(--brand-dark)', cursor: 'pointer' }} aria-label="Шаблоны ответов"><ISpark size={17} /></button>
        {window.QUICK_TEMPLATES.map(t => (
          <button key={t.id} onClick={() => useTemplate(t)} style={{ flex: '0 0 auto', padding: '7px 13px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border-c)', fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)', cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: 'var(--shadow-sm)' }}>{t.label}</button>
        ))}
      </div>

      {/* composer */}
      <div style={{ flex: '0 0 auto', padding: mode === 'mobile' ? '6px 12px 26px' : '6px 14px 14px', background: 'var(--surface)', borderTop: '1px solid var(--border-c)' }}>
        {/* internal toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <button onClick={() => setInternal(v => !v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 11px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 750, fontFamily: 'var(--font)',
            background: internal ? '#FEF6D8' : 'var(--surface-2)', border: `1px solid ${internal ? '#F2DD92' : 'var(--border-c)'}`, color: internal ? '#A9821B' : 'var(--text-secondary)' }}>
            <ILock size={13} /> {internal ? 'Внутренняя заметка' : 'Ответ жителю'}
          </button>
          {internal && <span style={{ fontSize: 11.5, color: '#A9821B', fontWeight: 600 }}>Видно только сотрудникам УК</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <button onClick={() => setAttachOpen(v => !v)} style={{ width: 40, height: 40, borderRadius: 999, background: attachOpen ? 'var(--brand)' : 'var(--surface-2)', border: attachOpen ? 'none' : '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: attachOpen ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto', transform: attachOpen ? 'rotate(45deg)' : 'none', transition: 'transform .18s var(--ease-spring), background .15s' }} aria-label="Прикрепить"><IPlus size={19} /></button>
          <div style={{ flex: 1, background: internal ? '#FEF6D8' : 'var(--surface-2)', border: `1px solid ${internal ? '#F2DD92' : 'var(--border-c)'}`, borderRadius: 22, padding: '7px 14px', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 40, boxSizing: 'border-box', transition: 'background .15s' }}>
            <textarea ref={taRef} value={draft} rows={1}
              onChange={e => { setDraft(e.target.value); const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 110) + 'px'; }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={internal ? 'Заметка для коллег…' : `Ответить ${c.name.split(' ')[0]}…`}
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font)', resize: 'none', lineHeight: 1.4, padding: '4px 0', maxHeight: 110 }} />
          </div>
          <button onClick={send} disabled={!canSend} style={{ width: 40, height: 40, borderRadius: 999, background: canSend ? (internal ? '#D8A521' : 'var(--brand)') : 'var(--surface-sunken)', border: 'none', display: 'grid', placeItems: 'center', color: canSend ? '#fff' : 'var(--text-muted)', cursor: canSend ? 'pointer' : 'default', flex: '0 0 auto', boxShadow: canSend ? 'var(--sh-brand)' : 'none', transition: 'background .15s' }} aria-label="Отправить"><ISend size={17} /></button>
        </div>
      </div>

      {attachOpen && (
        <div onClick={() => setAttachOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', left: 12, bottom: 92, width: 220, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'kzPop .16s var(--ease-spring)' }}>
            {[{ icon: <ICamera size={18} />, label: 'Фото', tone: 'var(--status-info)' }, { icon: <IFile size={18} />, label: 'Файл или документ', tone: 'var(--text-secondary)' }].map((it, i) => (
              <button key={i} onClick={() => setAttachOpen(false)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: 'transparent', border: 'none', borderTop: i ? '1px solid var(--border-c)' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ color: it.tone, display: 'grid', placeItems: 'center' }}>{it.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {info && <InfoDropdown c={c} onClose={() => setInfo(false)} />}
      {tplOpen && <TemplatesModal templates={window.QUICK_TEMPLATES} onClose={() => setTplOpen(false)} />}
    </div>
  );
}
function iconBtn(on) { return { width: 38, height: 38, borderRadius: 999, background: on ? 'var(--brand)' : 'var(--surface-2)', border: on ? 'none' : '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: on ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto' }; }
function navBtn(dis) { return { width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.12)', border: 'none', display: 'grid', placeItems: 'center', color: '#fff', cursor: dis ? 'default' : 'pointer', flex: '0 0 auto', opacity: dis ? 0.4 : 1 }; }

// ── desktop empty right panel ──
function EmptyDesktop() {
  return (
    <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', minWidth: 0 }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ width: 76, height: 76, margin: '0 auto 18px', borderRadius: 22, background: 'var(--surface)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--brand)', boxShadow: 'var(--shadow-md)' }}><IChat size={34} /></div>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-secondary)' }}>Выберите диалог из списка</div>
        <div style={{ fontSize: 13, marginTop: 6, maxWidth: 280, lineHeight: 1.5 }}>Слева — обращения жителей. Непрочитанные подняты наверх.</div>
      </div>
    </div>
  );
}

// ── orchestrator ──
function AdminInbox({ mode = 'desktop', initialView = 'list', initialId, loading: forceLoad, startEmpty }) {
  const { useState, useEffect } = React;
  const [loading, setLoading] = useState(forceLoad ?? true);
  const [convos] = useState(window.CONVERSATIONS);
  const firstSel = startEmpty ? null : (initialId || window.CONVERSATIONS[0].id);
  const [selId, setSelId] = useState(mode === 'desktop' ? firstSel : (initialView === 'dialog' ? (initialId || window.CONVERSATIONS[0].id) : null));

  useEffect(() => { if (forceLoad) return; const t = setTimeout(() => setLoading(false), 850); return () => clearTimeout(t); }, [forceLoad]);

  const selected = convos.find(c => c.id === selId);

  if (loading) return <InboxSkeleton mode={mode} />;

  if (mode === 'mobile') {
    return (
      <div className="kz-screen" style={{ height: '100%', background: 'var(--surface)' }}>
        {selected
          ? <DialogPanel c={selected} mode="mobile" onBack={() => setSelId(null)} />
          : <ListPanel convos={convos} selectedId={selId} onSelect={setSelId} mode="mobile" />}
      </div>
    );
  }

  return (
    <div className="kz-screen" style={{ height: '100%', display: 'flex', background: 'var(--surface-2)' }}>
      <div style={{ width: 332, flex: '0 0 auto', height: '100%' }}>
        <ListPanel convos={convos} selectedId={selId} onSelect={setSelId} mode="desktop" />
      </div>
      {selected ? <DialogPanel c={selected} mode="desktop" /> : <EmptyDesktop />}
    </div>
  );
}

// ── loading skeleton ──
function InboxSkeleton({ mode }) {
  const Row = () => (
    <div style={{ display: 'flex', gap: 11, padding: '12px 14px', borderBottom: '1px solid var(--hairline)' }}>
      <div style={{ width: 46, height: 46, borderRadius: 999, background: 'var(--surface-sunken)', flex: '0 0 auto', animation: 'kzPulse 1.4s infinite' }} />
      <div style={{ flex: 1 }}>
        <div style={{ width: '55%', height: 12, borderRadius: 6, background: 'var(--surface-sunken)', animation: 'kzPulse 1.4s infinite' }} />
        <div style={{ width: '38%', height: 9, borderRadius: 6, background: 'var(--surface-sunken)', margin: '8px 0', animation: 'kzPulse 1.4s infinite' }} />
        <div style={{ width: '80%', height: 10, borderRadius: 6, background: 'var(--surface-sunken)', animation: 'kzPulse 1.4s infinite' }} />
      </div>
    </div>
  );
  const list = (
    <div style={{ height: '100%', background: 'var(--surface)', borderRight: mode === 'desktop' ? '1px solid var(--border-c)' : 'none' }}>
      <div style={{ padding: mode === 'mobile' ? '54px 16px 14px' : '18px 16px 14px', borderBottom: '1px solid var(--border-c)' }}>
        <div style={{ width: 130, height: 20, borderRadius: 7, background: 'var(--surface-sunken)', animation: 'kzPulse 1.4s infinite' }} />
        <div style={{ height: 40, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--border-c)', marginTop: 12 }} />
      </div>
      {[0, 1, 2, 3, 4].map(i => <Row key={i} />)}
    </div>
  );
  if (mode === 'mobile') return <div className="kz-screen" style={{ height: '100%' }}>{list}</div>;
  return (
    <div className="kz-screen" style={{ height: '100%', display: 'flex', background: 'var(--surface-2)' }}>
      <div style={{ width: 332, flex: '0 0 auto' }}>{list}</div>
      <EmptyDesktop />
    </div>
  );
}

Object.assign(window, { MsgBubble, InfoDropdown, TemplatesModal, DialogPanel, EmptyDesktop, AdminInbox, InboxSkeleton });
