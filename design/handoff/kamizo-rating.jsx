// kamizo-rate.jsx — Rate employees

function StarRow({ value = 0, onChange, size = 28, gap = 6 }) {
  return (
    <div style={{ display: 'inline-flex', gap }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= value;
        return (
          <button key={n} onClick={() => onChange?.(n)} style={{
            width: size + 4, height: size + 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: filled ? '#F59E0B' : '#D6D3D1',
            padding: 0, display: 'grid', placeItems: 'center',
          }}>
            <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/>
            </svg>
          </button>
        );
      })}
    </div>
  );
}

function RateScreen({ activeTab = 'home', onTabChange }) {
  const [selectedId, setSelectedId] = React.useState('e2');
  const [rating, setRating] = React.useState(0);
  const [feedback, setFeedback] = React.useState('');
  const [tags, setTags] = React.useState(['fast']);

  const employees = [
    { id: 'e1', name: 'Бахтиёр Р.', role: 'Сантехник', stats: '4.9 · 87 оценок', avg: 4.9, rated: true, lastJob: 'Заменил кран · 12 дек' },
    { id: 'e2', name: 'Хасан Т.', role: 'Электрик', stats: '4.7 · 42 оценки', avg: 4.7, rated: false, lastJob: 'Починил розетку · вчера' },
    { id: 'e3', name: 'Хочат-апа', role: 'Уборщица', stats: '5.0 · 124 оценки', avg: 5.0, rated: true, lastJob: 'Уборка подъезда · сегодня' },
    { id: 'e4', name: 'Камилов М. Б.', role: 'Председатель ТСЖ', stats: '4.5 · 38 оценок', avg: 4.5, rated: false, lastJob: 'Помог с документами · 5 дек' },
  ];

  const tagOptions = [
    { id: 'fast', label: 'Быстро' },
    { id: 'polite', label: 'Вежливый' },
    { id: 'pro', label: 'Профессионально' },
    { id: 'clean', label: 'Чисто' },
    { id: 'punctual', label: 'Пунктуально' },
    { id: 'extra', label: 'Помог с лишним' },
  ];

  const toggleTag = (id) => {
    setTags(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id]);
  };

  const selected = employees.find(e => e.id === selectedId);

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: 'var(--bg)', paddingBottom: 110 }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: '54px 20px 12px',
        background: 'rgba(245,245,244,0.92)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--text-3)', textTransform: 'uppercase' }}>
          Оценка сотрудников
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 1 }}>
          Спасибо, что делитесь
        </div>
      </div>

      <div style={{ padding: '14px 16px' }}>
        {/* Employees row (scrollable) */}
        <div style={{
          display: 'flex', gap: 10, overflowX: 'auto',
          padding: '4px 4px 12px', margin: '-4px -4px 0',
        }}>
          {employees.map(e => {
            const isActive = selectedId === e.id;
            const initials = e.name.split(' ').map(s => s[0]).join('').slice(0, 2);
            return (
              <button key={e.id} onClick={() => { setSelectedId(e.id); setRating(0); setFeedback(''); }} style={{
                flex: '0 0 auto', width: 110,
                background: isActive ? '#fff' : 'transparent',
                border: '1.5px solid', borderColor: isActive ? 'var(--amber-500)' : 'var(--border)',
                borderRadius: 14, padding: 12,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                cursor: 'pointer',
                boxShadow: isActive ? 'var(--sh-2)' : 'none',
                position: 'relative',
              }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 999,
                  background: isActive ? 'linear-gradient(135deg, #FB923C, #EA580C)' : 'var(--stone-200)',
                  color: '#fff', fontWeight: 700, fontSize: 16,
                  display: 'grid', placeItems: 'center',
                }}>{initials}</div>
                {e.rated && (
                  <div style={{
                    position: 'absolute', top: 8, right: 8,
                    width: 16, height: 16, borderRadius: 999,
                    background: 'var(--success)', color: '#fff',
                    display: 'grid', placeItems: 'center',
                  }}><ICheck size={10} stroke={3.5} /></div>
                )}
                <div style={{ fontSize: 12, fontWeight: 650, letterSpacing: '-0.01em', textAlign: 'center', lineHeight: 1.2 }}>
                  {e.name}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{e.role}</div>
              </button>
            );
          })}
        </div>

        {/* Selected employee card */}
        {selected && (
          <div style={{
            background: '#fff', borderRadius: 18,
            border: '1px solid var(--border)', boxShadow: 'var(--sh-2)',
            padding: 18, marginTop: 4,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 999,
                background: 'linear-gradient(135deg, #FB923C, #EA580C)',
                color: '#fff', fontWeight: 700, fontSize: 19,
                display: 'grid', placeItems: 'center',
              }}>{selected.name.split(' ').map(s => s[0]).join('').slice(0, 2)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                  {selected.role}
                </div>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4,
                  fontSize: 12, fontWeight: 600, color: 'var(--amber-700)',
                }}>
                  <IStar size={13} /> {selected.avg.toFixed(1)} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>· {selected.stats.split(' · ')[1]}</span>
                </div>
              </div>
            </div>

            <div style={{
              padding: '10px 12px', background: 'var(--stone-100)',
              borderRadius: 10, fontSize: 12.5, color: 'var(--text-2)',
              marginBottom: 16,
            }}>
              <span style={{ color: 'var(--text-3)' }}>Последняя работа: </span>
              {selected.lastJob}
            </div>

            <div style={{ textAlign: 'center', marginBottom: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 650, letterSpacing: '-0.01em', marginBottom: 10 }}>
                Как прошло?
              </div>
              <StarRow value={rating} onChange={setRating} size={36} gap={10} />
              {rating > 0 && (
                <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--amber-700)', fontWeight: 600 }}>
                  {['', 'Очень плохо', 'Плохо', 'Нормально', 'Хорошо', 'Отлично'][rating]}
                </div>
              )}
            </div>

            {rating > 0 && (
              <>
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>
                    Что особенно понравилось?
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {tagOptions.map(t => {
                      const isOn = tags.includes(t.id);
                      return (
                        <button key={t.id} onClick={() => toggleTag(t.id)} style={{
                          padding: '7px 12px', borderRadius: 999,
                          fontSize: 12.5, fontWeight: 600,
                          background: isOn ? 'var(--amber-100)' : '#fff',
                          color: isOn ? 'var(--amber-800)' : 'var(--text-2)',
                          border: '1px solid', borderColor: isOn ? 'var(--amber-400)' : 'var(--border)',
                          cursor: 'pointer', letterSpacing: '-0.01em',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>
                          {isOn && <ICheck size={11} stroke={3} />}
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Комментарий (необязательно)"
                    style={{
                      width: '100%', minHeight: 70,
                      border: '1px solid var(--border)', borderRadius: 12,
                      padding: '10px 12px', fontSize: 13.5,
                      fontFamily: 'var(--font)', color: 'var(--text)',
                      resize: 'none', outline: 'none', background: 'var(--stone-50)',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <button style={{
                  width: '100%', marginTop: 12, padding: '14px',
                  background: 'var(--amber-600)', color: '#fff', border: 'none',
                  borderRadius: 14, fontSize: 14.5, fontWeight: 650, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: 'var(--sh-amber)',
                }}>
                  <ISend size={15} /> Отправить отзыв
                </button>
                <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11.5, color: 'var(--text-3)' }}>
                  Анонимно для сотрудника. Только средний балл публичный.
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <TabBar active={activeTab} onChange={onTabChange} />
    </div>
  );
}

Object.assign(window, { RateScreen, StarRow });
