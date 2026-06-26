// kamizo-approve.jsx — ApproveModal: accept work with star rating + feedback,
// or switch to reject mode with reason. FOUNDATION palette. Base styles visible
// (no animation-gated opacity). Props preserved: onApprove(rating, feedback),
// onReject(reason), onClose.

function ApproveModal({ open, request, onClose, onApprove, onReject }) {
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [feedback, setFeedback] = React.useState('');
  const [mode, setMode] = React.useState('approve'); // approve | reject
  const [reason, setReason] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  if (!open) return null;
  const r = request || { number: '1840', title: 'Замена смесителя', executor: 'Бахтиёр Р.', category: 'plumbing' };
  const labels = ['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'];

  const accept = () => {
    if (rating === 0 || sending) return;
    setSending(true);
    setTimeout(() => { setSending(false); setDone(true); onApprove && onApprove(rating, feedback); }, 800);
  };
  const reject = () => {
    if (reason.trim().length < 4 || sending) return;
    setSending(true);
    setTimeout(() => { setSending(false); onReject && onReject(reason); onClose && onClose(); }, 700);
  };

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 55, background: 'rgba(28,25,23,0.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', background: 'var(--app-bg)',
        borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
        boxShadow: '0 -10px 40px rgba(28,25,23,0.25)', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 38, height: 5, borderRadius: 999, background: 'var(--border-strong)' }} />
        </div>

        {done ? (
          <div style={{ padding: '24px 24px 30px', textAlign: 'center' }}>
            {/* confetti dots */}
            <div style={{ position: 'relative', height: 0 }}>
              {['#F97316', '#15A06E', '#2F77C2', '#FBBF24', '#E2483D', '#7C3AED'].map((c, i) => (
                <span key={i} style={{ position: 'absolute', left: `${15 + i * 13}%`, top: 6, width: 8, height: 8, borderRadius: i % 2 ? 999 : 2, background: c, opacity: 0.9, transform: `rotate(${i * 40}deg)` }} />
              ))}
            </div>
            <div style={{ width: 84, height: 84, borderRadius: 999, background: 'var(--status-active-bg)', color: 'var(--status-active)', display: 'grid', placeItems: 'center', margin: '14px auto 16px' }}>
              <ICheck size={44} stroke={2.6} />
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>Спасибо за оценку!</div>
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.45 }}>Заявка #{r.number} закрыта. Ваш отзыв помогает УК&nbsp;становиться лучше.</div>
            <button onClick={onClose} style={{ width: '100%', marginTop: 22, padding: '14px', borderRadius: 'var(--radius-md)', background: 'var(--brand)', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: 'var(--sh-brand)' }}>Готово</button>
          </div>
        ) : mode === 'approve' ? (
          <div style={{ padding: '8px 20px 28px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 6 }}>Как прошла работа?</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 6 }}>{r.title} · #{r.number} · {r.executor}</div>

            {/* stars */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 22 }}>
              {[1, 2, 3, 4, 5].map(n => {
                const filled = n <= (hover || rating);
                return (
                  <button key={n} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} onClick={() => setRating(n)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: 4,
                    color: filled ? '#F59E0B' : 'var(--border-strong)',
                    transform: filled ? 'scale(1.08)' : 'scale(1)',
                    transition: 'transform 0.18s var(--ease-spring), color 0.15s',
                  }} aria-label={`${n} звёзд`}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                      <path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" />
                    </svg>
                  </button>
                );
              })}
            </div>
            <div style={{ height: 20, marginTop: 6, fontSize: 14, fontWeight: 700, color: 'var(--brand-dark)' }}>{labels[hover || rating]}</div>

            {/* feedback */}
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Комментарий (по желанию)" style={{
              width: '100%', minHeight: 72, marginTop: 14, padding: '12px 14px', boxSizing: 'border-box',
              background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font)', fontSize: 14, color: 'var(--text-primary)', resize: 'none', outline: 'none', textAlign: 'left', lineHeight: 1.4,
            }} />

            <button onClick={accept} disabled={rating === 0 || sending} style={{
              width: '100%', marginTop: 14, padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
              background: rating === 0 ? 'var(--surface-sunken)' : 'var(--brand)',
              color: rating === 0 ? 'var(--text-muted)' : '#fff', cursor: rating === 0 ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 700, boxShadow: rating === 0 ? 'none' : 'var(--sh-brand)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              {sending ? <><span style={{ width: 16, height: 16, border: '2.5px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: 999, animation: 'kzSpin 0.7s linear infinite' }} /> Отправляем…</> : 'Принять работу'}
            </button>
            <button onClick={() => setMode('reject')} style={{ width: '100%', marginTop: 8, padding: '12px', borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 650, cursor: 'pointer' }}>Что-то не так?</button>
          </div>
        ) : (
          <div style={{ padding: '8px 20px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
              <button onClick={() => setMode('approve')} style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--surface-sunken)', border: 'none', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', cursor: 'pointer' }} aria-label="Назад"><IArrowL size={17} /></button>
              <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Что не так?</div>
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4 }}>Опишите, что не устроило — заявка вернётся мастеру в&nbsp;работу.</div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: протечка осталась, нужно доделать" style={{
              width: '100%', minHeight: 96, marginTop: 14, padding: '12px 14px', boxSizing: 'border-box',
              background: 'var(--surface)', border: '1px solid var(--border-c)', borderRadius: 'var(--radius-sm)',
              fontFamily: 'var(--font)', fontSize: 14, color: 'var(--text-primary)', resize: 'none', outline: 'none', lineHeight: 1.4,
            }} />
            <button onClick={reject} disabled={reason.trim().length < 4 || sending} style={{
              width: '100%', marginTop: 14, padding: '14px', borderRadius: 'var(--radius-md)', border: 'none',
              background: reason.trim().length < 4 ? 'var(--surface-sunken)' : 'var(--status-critical)',
              color: reason.trim().length < 4 ? 'var(--text-muted)' : '#fff', cursor: reason.trim().length < 4 ? 'default' : 'pointer',
              fontSize: 15, fontWeight: 700,
            }}>{sending ? 'Отправляем…' : 'Вернуть в работу'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ApproveModal });
