// kamizo-chat.jsx — Resident ↔ Управляющая компания chat.
// Interactive: real send, message statuses, photo attach + fullscreen viewer,
// "УК печатает…" typing indicator, instant quick-replies, request-context header
// (active + closed treatments). FOUNDATION tokens, light theme.

// ── small inline glyphs not in the icon set ──
const ChatTicks = ({ read, size = 16 }) => (
  <svg width={size + 4} height={size - 2} viewBox="0 0 20 14" fill="none"
    stroke={read ? 'var(--brand)' : 'currentColor'} strokeWidth="2.2"
    strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M1 7.5l3.6 3.6L11 4" />
    <path d="M8.4 11.1L9.2 11.9 15.6 4.6" />
  </svg>
);
const ChatTick = ({ size = 16 }) => (
  <svg width={size} height={size - 2} viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M2 7.5l3.6 3.6L12 4" />
  </svg>
);
const ChatWarn = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" />
  </svg>
);

// ── decorative "photo" tile (no real asset; reads as an attachment) ──
const PHOTO_SCENES = {
  leak:   { grad: 'linear-gradient(150deg,#5B7B8C 0%,#2E3F49 60%,#46627A 100%)', label: 'IMG_2231.jpg · 1.8 МБ' },
  done:   { grad: 'linear-gradient(150deg,#6B7250 0%,#2F3622 55%,#566044 100%)', label: 'IMG_2240.jpg · 2.1 МБ' },
};

function ChatPhoto({ scene = 'leak', onOpen, small }) {
  const s = PHOTO_SCENES[scene] || PHOTO_SCENES.leak;
  return (
    <button onClick={onOpen} style={{
      display: 'block', width: '100%', border: 'none', padding: 0, cursor: 'pointer',
      marginTop: small ? 0 : 4, borderRadius: 13, overflow: 'hidden', position: 'relative',
      height: 150, background: s.grad,
    }}>
      {/* faux scene geometry */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 70% 20%, rgba(255,255,255,0.18), transparent 55%)' }} />
      <div style={{ position: 'absolute', left: '18%', bottom: 0, width: '34%', height: '62%', background: 'rgba(0,0,0,0.22)', transform: 'skewX(-6deg)' }} />
      <div style={{ position: 'absolute', left: '52%', bottom: 0, width: '40%', height: '46%', background: 'rgba(255,255,255,0.08)' }} />
      <div style={{ position: 'absolute', top: 9, right: 9, width: 26, height: 26, borderRadius: 999, background: 'rgba(28,25,23,0.4)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', color: '#fff' }}>
        <ISearch size={13} />
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 10, fontSize: 10.5, color: 'rgba(255,255,255,0.9)', fontWeight: 600, letterSpacing: '0.01em', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}>{s.label}</div>
    </button>
  );
}

// ── outgoing status row ──
function StatusRow({ status, time, onRetry }) {
  if (status === 'error') {
    return (
      <button onClick={onRetry} style={{
        display: 'flex', alignItems: 'center', gap: 5, marginTop: 3, padding: '0 4px',
        background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-critical)',
        fontSize: 10.5, fontWeight: 650,
      }}>
        <ChatWarn /> Не отправлено · Повторить
      </button>
    );
  }
  const read = status === 'read';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, padding: '0 4px', color: 'var(--text-muted)' }}>
      <span style={{ fontSize: 10.5, fontWeight: 500 }}>{time}</span>
      {status === 'sending' && <IClock size={12} style={{ opacity: 0.7 }} />}
      {status === 'sent' && <ChatTick size={14} />}
      {(status === 'delivered' || read) && <ChatTicks read={read} size={15} />}
      {read && <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--brand-dark)' }}>прочитано</span>}
    </div>
  );
}

const QUICK = ['Спасибо!', 'Подойдёт', 'Когда?', 'Не получается', 'Принято'];

const UK_REPLIES = [
  'Записали обращение, передаём мастеру. Сообщим время визита в течение часа.',
  'Мастер подтвердил выезд. Будет у вас сегодня в окне 14:00–16:00.',
  'Спасибо, что сообщили! Уточняем детали у диспетчера и вернёмся к вам.',
];

let MSG_ID = 100;
const nextId = () => ++MSG_ID;

function ChatScreen({ activeTab = 'home', onTabChange }) {
  const { useState, useRef, useEffect, useCallback } = React;
  const [draft, setDraft] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingPhoto, setPendingPhoto] = useState(null); // scene key staged in composer
  const [viewer, setViewer] = useState(null); // scene key for fullscreen
  const [ukTyping, setUkTyping] = useState(false);
  const replyIdx = useRef(0);
  const scrollRef = useRef(null);
  const taRef = useRef(null);

  const [messages, setMessages] = useState([
    { id: 1, kind: 'date', label: 'Вчера' },
    { id: 2, from: 'uk', time: '17:48', text: 'Здравствуйте, Азиз! На связи диспетчерская Kamizo. Чем поможем?' },
    { id: 3, from: 'me', time: '17:51', status: 'read',
      text: 'Добрый вечер. Под кухонной раковиной течёт — уже натекла лужа. Прикладываю фото.' },
    { id: 4, from: 'me', time: '17:51', status: 'read', photo: 'leak' },
    { id: 5, from: 'uk', time: '17:55', text: 'Приняли. Это аварийная ситуация — перекройте, пожалуйста, кран под мойкой, если есть доступ. Назначаем сантехника на завтра.',
      request: { id: '#UK-S-1042', title: 'Протечка под раковиной', status: 'В работе', state: 'active' } },
    { id: 6, from: 'me', time: '18:02', status: 'read', text: 'Кран перекрыл, спасибо. Жду мастера.' },
    { id: 7, kind: 'date', label: 'Сегодня' },
    { id: 8, from: 'uk', time: '09:30', text: 'Доброе утро! Сантехник Рустам выезжает, будет в окне 10:00–12:00. Откроет подъезд по служебному коду.' },
    { id: 9, from: 'me', time: '09:34', status: 'delivered', text: 'Понял, буду дома.' },
    { id: 10, from: 'me', time: '09:35', status: 'error', text: 'И ещё — счётчик воды тоже посмотрите, пожалуйста.' },
    { id: 11, from: 'uk', time: '11:20', text: 'Готово ✓ Заменили гибкую подводку и кран-буксу, проверили счётчик — течи нет. По прошлой заявке по свету тоже всё закрыто.',
      photo: 'done',
      request: { id: '#1842', title: 'Свет в подъезде №2', status: 'Завершено', state: 'closed' } },
  ]);

  const scrollToEnd = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); });
  }, []);

  useEffect(() => { scrollToEnd(false); }, []);
  useEffect(() => { scrollToEnd(); }, [messages, ukTyping]);

  const pushUkReply = useCallback(() => {
    setUkTyping(true);
    const t1 = setTimeout(() => {
      setUkTyping(false);
      const text = UK_REPLIES[replyIdx.current % UK_REPLIES.length];
      replyIdx.current += 1;
      const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
      setMessages(m => [...m, { id: nextId(), from: 'uk', time, text }]);
    }, 1900);
    return () => clearTimeout(t1);
  }, []);

  const sendMessage = useCallback(({ text, photo }) => {
    if (!text && !photo) return;
    const id = nextId();
    const time = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    setMessages(m => [...m, { id, from: 'me', time, text: text || undefined, photo: photo || undefined, status: 'sending' }]);
    // optimistic status progression
    setTimeout(() => setMessages(m => m.map(x => x.id === id ? { ...x, status: 'sent' } : x)), 500);
    setTimeout(() => setMessages(m => m.map(x => x.id === id ? { ...x, status: 'delivered' } : x)), 1100);
    setTimeout(() => setMessages(m => m.map(x => x.id === id ? { ...x, status: 'read' } : x)), 2600);
    pushUkReply();
  }, [pushUkReply]);

  const onSend = () => {
    const text = draft.trim();
    if (!text && !pendingPhoto) return;
    sendMessage({ text, photo: pendingPhoto });
    setDraft(''); setPendingPhoto(null);
    if (taRef.current) taRef.current.style.height = 'auto';
  };

  const onQuick = (q) => sendMessage({ text: q });

  const retry = (id) => {
    setMessages(m => m.map(x => x.id === id ? { ...x, status: 'sending' } : x));
    setTimeout(() => setMessages(m => m.map(x => x.id === id ? { ...x, status: 'sent' } : x)), 500);
    setTimeout(() => setMessages(m => m.map(x => x.id === id ? { ...x, status: 'delivered' } : x)), 1100);
    setTimeout(() => setMessages(m => m.map(x => x.id === id ? { ...x, status: 'read' } : x)), 2600);
  };

  const stagePhoto = (scene) => { setPendingPhoto(scene); setAttachOpen(false); };

  const canSend = draft.trim() || pendingPhoto;

  return (
    <div className="kz-screen" style={{ height: '100%', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* ── Header ── */}
      <div style={{
        flex: '0 0 auto', padding: '54px 14px 11px',
        background: 'rgba(251,248,242,0.9)', backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-c)',
        display: 'flex', alignItems: 'center', gap: 11, zIndex: 6,
      }}>
        <button style={{ width: 34, height: 34, borderRadius: 999, background: 'transparent', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto' }} aria-label="Назад">
          <IArrowL size={21} />
        </button>
        <div style={{ width: 42, height: 42, borderRadius: 999, background: 'linear-gradient(135deg,#FB923C,#EA580C)', color: '#fff', fontWeight: 800, fontSize: 13, display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: '0 3px 8px rgba(217,119,6,0.28)', position: 'relative' }}>
          УК
          <span style={{ position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 999, background: 'var(--status-active)', border: '2px solid var(--surface-2)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15.5, fontWeight: 750, letterSpacing: '-0.015em', color: 'var(--text-primary)' }}>Управляющая компания</div>
          <div style={{ fontSize: 11.5, color: 'var(--status-active)', fontWeight: 650, display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--status-active)', boxShadow: '0 0 0 3px rgba(21,160,110,0.18)' }} />
            На связи · отвечаем до 15 мин
          </div>
        </div>
        <button style={{ width: 38, height: 38, borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto', boxShadow: 'var(--shadow-sm)' }} aria-label="Позвонить">
          <IPhone size={17} />
        </button>
      </div>

      {/* ── Active request context (pinned) ── */}
      <button style={{
        flex: '0 0 auto', textAlign: 'left', cursor: 'pointer',
        margin: '10px 14px 2px', padding: '11px 12px',
        background: 'var(--brand-tint)', borderRadius: 14, border: '1px solid var(--brand-200)',
        display: 'flex', alignItems: 'center', gap: 11, width: 'calc(100% - 28px)',
      }} aria-label="Открыть заявку">
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--brand)', color: '#fff', display: 'grid', placeItems: 'center', flex: '0 0 auto', boxShadow: 'var(--sh-brand)' }}>
          <IDrop size={17} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: 'var(--brand-dark)', fontWeight: 750, letterSpacing: '0.04em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            Активная заявка
            <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--brand)', animation: 'kzPulse 1.6s infinite' }} />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            #UK-S-1042 · Протечка под раковиной · <span style={{ color: 'var(--brand-dark)' }}>В работе</span>
          </div>
        </div>
        <IChevronR size={17} style={{ color: 'var(--brand-dark)', flex: '0 0 auto' }} />
      </button>

      {/* ── Messages ── */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 14px 6px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {messages.map((m) => {
          if (m.kind === 'date') {
            return (
              <div key={m.id} style={{ textAlign: 'center', margin: '10px 0 4px' }}>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 650, letterSpacing: '0.02em', padding: '4px 11px', background: 'var(--surface-sunken)', borderRadius: 999 }}>{m.label}</span>
              </div>
            );
          }
          const isMe = m.from === 'me';
          return (
            <div key={m.id} style={{ display: 'flex', alignItems: 'flex-end', gap: 7, flexDirection: isMe ? 'row-reverse' : 'row' }}>
              {!isMe && (
                <div style={{ width: 26, height: 26, borderRadius: 999, background: 'linear-gradient(135deg,#FB923C,#EA580C)', color: '#fff', fontWeight: 800, fontSize: 9.5, display: 'grid', placeItems: 'center', flex: '0 0 auto', marginBottom: 18 }}>УК</div>
              )}
              <div style={{ maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', minWidth: 0 }}>
                <div style={{
                  background: isMe ? 'linear-gradient(158deg,#FB923C 0%,#EA580C 100%)' : 'var(--surface)',
                  color: isMe ? '#fff' : 'var(--text-primary)',
                  border: isMe ? 'none' : '1px solid var(--border-c)',
                  borderRadius: isMe ? '18px 18px 5px 18px' : '18px 18px 18px 5px',
                  padding: m.photo && !m.text ? 5 : '10px 13px',
                  fontSize: 14, lineHeight: 1.42, letterSpacing: '-0.01em',
                  boxShadow: isMe ? '0 5px 14px -4px rgba(217,119,6,0.4)' : 'var(--shadow-sm)',
                  textWrap: 'pretty', width: m.photo ? 230 : 'auto', maxWidth: '100%',
                }}>
                  {m.text && <div style={{ padding: m.photo ? '5px 8px 8px' : 0 }}>{m.text}</div>}
                  {m.photo && <ChatPhoto scene={m.photo} small={!m.text} onOpen={() => setViewer(m.photo)} />}

                  {m.request && (
                    <div onClick={(e) => e.stopPropagation()} style={{
                      marginTop: m.photo ? 8 : 9, padding: '9px 10px', borderRadius: 11,
                      background: m.request.state === 'closed'
                        ? (isMe ? 'rgba(255,255,255,0.16)' : 'var(--surface-sunken)')
                        : (isMe ? 'rgba(255,255,255,0.18)' : 'var(--brand-tint)'),
                      border: m.request.state === 'closed' && !isMe ? '1px solid var(--border-c)' : (m.request.state === 'active' && !isMe ? '1px solid var(--brand-200)' : 'none'),
                      display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer',
                      opacity: m.request.state === 'closed' && !isMe ? 0.92 : 1,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flex: '0 0 auto', display: 'grid', placeItems: 'center',
                        background: isMe ? 'rgba(255,255,255,0.22)' : (m.request.state === 'closed' ? 'var(--surface)' : '#fff'),
                        color: isMe ? '#fff' : (m.request.state === 'closed' ? 'var(--text-muted)' : 'var(--brand-dark)'),
                      }}>
                        {m.request.state === 'closed' ? <ICheck size={15} stroke={2.4} /> : <IDoc size={14} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 750, letterSpacing: '0.03em', textTransform: 'uppercase', color: isMe ? 'rgba(255,255,255,0.85)' : (m.request.state === 'closed' ? 'var(--text-muted)' : 'var(--brand-dark)') }}>
                          {m.request.id} · {m.request.status}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 650, marginTop: 1, color: isMe ? '#fff' : 'var(--text-primary)', textDecoration: m.request.state === 'closed' ? 'none' : 'none' }}>{m.request.title}</div>
                      </div>
                      <IChevronR size={15} style={{ color: isMe ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)', flex: '0 0 auto' }} />
                    </div>
                  )}
                </div>

                {isMe
                  ? <StatusRow status={m.status} time={m.time} onRetry={() => retry(m.id)} />
                  : <span style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500, marginTop: 3, padding: '0 4px' }}>{m.time}</span>}
              </div>
            </div>
          );
        })}

        {/* typing */}
        {ukTyping && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 7 }}>
            <div style={{ width: 26, height: 26, borderRadius: 999, background: 'linear-gradient(135deg,#FB923C,#EA580C)', color: '#fff', fontWeight: 800, fontSize: 9.5, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>УК</div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: '16px 16px 16px 5px', padding: '12px 15px', display: 'inline-flex', gap: 4, alignItems: 'center', boxShadow: 'var(--shadow-sm)' }}>
              {[0, 1, 2].map(d => (
                <span key={d} style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--text-muted)', animation: 'kzPulse 1.2s infinite', animationDelay: `${d * 0.18}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Quick replies ── */}
      <div style={{ flex: '0 0 auto', padding: '6px 14px 7px', display: 'flex', gap: 7, overflowX: 'auto' }}>
        {QUICK.map(q => (
          <button key={q} onClick={() => onQuick(q)} style={{ flex: '0 0 auto', padding: '7px 13px', borderRadius: 999, background: 'var(--surface)', border: '1px solid var(--border-c)', fontSize: 12.5, fontWeight: 650, color: 'var(--text-secondary)', cursor: 'pointer', letterSpacing: '-0.01em', boxShadow: 'var(--shadow-sm)' }}>{q}</button>
        ))}
      </div>

      {/* ── Composer ── */}
      <div style={{ flex: '0 0 auto', padding: '8px 12px 26px', background: 'rgba(251,248,242,0.92)', backdropFilter: 'blur(16px)', borderTop: '1px solid var(--border-c)' }}>
        {/* staged photo preview */}
        {pendingPhoto && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '7px 8px', background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: PHOTO_SCENES[pendingPhoto].grad, flex: '0 0 auto' }} />
            <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>Фото готово к отправке<div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)' }}>{PHOTO_SCENES[pendingPhoto].label}</div></div>
            <button onClick={() => setPendingPhoto(null)} style={{ width: 28, height: 28, borderRadius: 999, background: 'var(--surface-sunken)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto' }} aria-label="Убрать фото"><IClose size={14} /></button>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
          <button onClick={() => setAttachOpen(v => !v)} style={{ width: 40, height: 40, borderRadius: 999, background: attachOpen ? 'var(--brand)' : 'var(--surface)', border: attachOpen ? 'none' : '1px solid var(--border-c)', display: 'grid', placeItems: 'center', color: attachOpen ? '#fff' : 'var(--text-secondary)', cursor: 'pointer', flex: '0 0 auto', boxShadow: 'var(--shadow-sm)', transform: attachOpen ? 'rotate(45deg)' : 'none', transition: 'transform .18s var(--ease-spring), background .15s' }} aria-label="Прикрепить">
            <IPlus size={19} />
          </button>
          <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 22, padding: '7px 12px', display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 40, boxSizing: 'border-box' }}>
            <textarea
              ref={taRef}
              value={draft}
              rows={1}
              onChange={(e) => { setDraft(e.target.value); const t = e.target; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 96) + 'px'; }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Сообщение для УК…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: 'var(--text-primary)', fontFamily: 'var(--font)', resize: 'none', lineHeight: 1.4, padding: '4px 0', maxHeight: 96 }}
            />
            <button onClick={() => stagePhoto('leak')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'grid', placeItems: 'center', marginBottom: 4 }} aria-label="Камера">
              <ICamera size={19} />
            </button>
          </div>
          <button onClick={onSend} disabled={!canSend} style={{ width: 40, height: 40, borderRadius: 999, background: canSend ? 'var(--brand)' : 'var(--surface-sunken)', border: 'none', display: 'grid', placeItems: 'center', color: canSend ? '#fff' : 'var(--text-muted)', cursor: canSend ? 'pointer' : 'default', flex: '0 0 auto', boxShadow: canSend ? 'var(--sh-brand)' : 'none', transition: 'background .15s' }} aria-label="Отправить">
            <ISend size={17} />
          </button>
        </div>
      </div>

      {/* ── Attach menu ── */}
      {attachOpen && (
        <div onClick={() => setAttachOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', left: 12, bottom: 92, width: 220, background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-c)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'kzPop .18s var(--ease-spring)' }}>
            {[
              { icon: <ICamera size={18} />, label: 'Сделать фото', tone: 'var(--status-info)', go: () => stagePhoto('leak') },
              { icon: <IGrid size={18} />, label: 'Фото из галереи', tone: 'var(--brand-dark)', go: () => stagePhoto('done') },
              { icon: <IFile size={18} />, label: 'Файл или документ', tone: 'var(--text-secondary)', go: () => setAttachOpen(false) },
            ].map((it, i) => (
              <button key={i} onClick={it.go} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', background: 'transparent', border: 'none', borderTop: i ? '1px solid var(--border-c)' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ color: it.tone, display: 'grid', placeItems: 'center' }}>{it.icon}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{it.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Fullscreen photo viewer ── */}
      {viewer && (
        <div onClick={() => setViewer(null)} style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(17,15,14,0.94)', display: 'flex', flexDirection: 'column', animation: 'kzScreenIn .2s ease' }}>
          <div style={{ padding: '54px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: 600 }}>{PHOTO_SCENES[viewer].label}</span>
            <button onClick={() => setViewer(null)} style={{ width: 36, height: 36, borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: 'none', display: 'grid', placeItems: 'center', color: '#fff', cursor: 'pointer' }} aria-label="Закрыть"><IClose size={18} /></button>
          </div>
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 16 }}>
            <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 16, background: PHOTO_SCENES[viewer].grad, position: 'relative', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 70% 20%, rgba(255,255,255,0.16), transparent 55%)' }} />
              <div style={{ position: 'absolute', left: '18%', bottom: 0, width: '34%', height: '62%', background: 'rgba(0,0,0,0.22)', transform: 'skewX(-6deg)' }} />
              <div style={{ position: 'absolute', left: '52%', bottom: 0, width: '40%', height: '46%', background: 'rgba(255,255,255,0.08)' }} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 10, padding: '8px 16px 30px' }}>
            <button onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'var(--font)' }}><IDownload size={17} /> Сохранить</button>
            <button onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', borderRadius: 999, background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 13.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'var(--font)' }}><IShare size={17} /> Поделиться</button>
          </div>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ChatScreen });
