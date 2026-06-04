// kamizo-chat.jsx — Chat with UK (management company)

function ChatScreen({ activeTab = 'home', onTabChange }) {
  const [draft, setDraft] = React.useState('');

  const messages = [
    { kind: 'date', label: 'Вчера' },
    { from: 'uk', name: 'УК', avatar: 'УК', time: '14:02',
      text: 'Здравствуйте, Азиз! Чем можем помочь?',
    },
    { from: 'me', time: '14:05',
      text: 'Привет. У нас в подъезде №2 второй день не горит свет на лестничной клетке. Можно посмотреть?',
    },
    { from: 'uk', name: 'УК', avatar: 'УК', time: '14:08',
      text: 'Записали обращение. Назначим электрика на завтра, окно 09:00–12:00. Подтвердите, удобно ли?',
      attached: { type: 'request', id: '#1842', title: 'Свет в подъезде №2', status: 'Назначено' },
    },
    { from: 'me', time: '14:11',
      text: 'Да, удобно. Спасибо!',
      reactions: ['👍'],
    },
    { kind: 'date', label: 'Сегодня' },
    { from: 'uk', name: 'УК', avatar: 'УК', time: '09:42',
      text: 'Электрик Хасан Т. выехал. Будет в течение 20 минут. Открыть подъезд он сможет по служебному коду.',
    },
    { from: 'me', time: '09:55',
      text: 'Принято',
    },
    { from: 'uk', name: 'УК', avatar: 'УК', time: '10:34',
      text: 'Готово ✓ Заменил две лампы на LED, проверил автомат. Если повторится — дайте знать.',
      attached: { type: 'photo' },
    },
    { from: 'me', time: '10:36',
      text: 'Супер, всё отлично работает 🙌',
    },
    { typing: true, from: 'uk' },
  ];

  return (
    <div className="kz-screen" style={{ minHeight: '100%', background: '#FAFAF9', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        padding: '54px 16px 12px',
        background: 'rgba(250,250,249,0.95)', backdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button style={{
          width: 36, height: 36, borderRadius: 999,
          background: 'transparent', border: 'none',
          display: 'grid', placeItems: 'center', color: 'var(--text-2)', cursor: 'pointer',
        }} aria-label="Назад">
          <IArrowL size={20} />
        </button>
        <div style={{
          width: 40, height: 40, borderRadius: 999,
          background: 'linear-gradient(135deg, #FB923C, #EA580C)',
          color: '#fff', fontWeight: 700, fontSize: 13,
          display: 'grid', placeItems: 'center', flex: '0 0 auto',
          boxShadow: '0 2px 6px rgba(217,119,6,0.25)',
          position: 'relative',
        }}>
          УК
          <span style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 12, height: 12, borderRadius: 999,
            background: '#22C55E', border: '2px solid #FAFAF9',
          }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em' }}>
            Управляющая компания
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--success)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--success)' }} />
            На связи · отвечаем до 15 мин
          </div>
        </div>
        <button style={{
          width: 36, height: 36, borderRadius: 999,
          background: '#fff', border: '1px solid var(--border)',
          display: 'grid', placeItems: 'center', color: 'var(--text-2)', cursor: 'pointer',
        }} aria-label="Позвонить">
          <IPhone size={16} />
        </button>
      </div>

      {/* Pinned context */}
      <div style={{
        margin: '10px 16px 4px',
        padding: '10px 12px',
        background: 'var(--amber-50)', borderRadius: 12,
        border: '1px solid var(--amber-200)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--amber-100)', color: 'var(--amber-700)',
          display: 'grid', placeItems: 'center', flex: '0 0 auto',
        }}>
          <IPin size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, color: 'var(--amber-800)', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
            Активная заявка
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', letterSpacing: '-0.01em' }}>
            #1842 · Свет в подъезде №2 · Завершено
          </div>
        </div>
        <IChevronR size={16} style={{ color: 'var(--amber-700)' }} />
      </div>

      {/* Messages */}
      <div style={{ flex: 1, padding: '12px 16px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m, i) => {
          if (m.kind === 'date') {
            return (
              <div key={i} style={{ textAlign: 'center', margin: '12px 0 6px' }}>
                <span style={{
                  fontSize: 11, color: 'var(--text-3)', fontWeight: 600,
                  letterSpacing: '0.02em', padding: '4px 10px',
                  background: 'var(--stone-150)', borderRadius: 999,
                }}>{m.label}</span>
              </div>
            );
          }
          if (m.typing) {
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 999,
                  background: 'linear-gradient(135deg, #FB923C, #EA580C)',
                  color: '#fff', fontWeight: 700, fontSize: 10,
                  display: 'grid', placeItems: 'center', flex: '0 0 auto',
                }}>УК</div>
                <div style={{
                  background: '#fff', border: '1px solid var(--border)',
                  borderRadius: '16px 16px 16px 4px',
                  padding: '11px 14px', display: 'inline-flex', gap: 4, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(d => (
                    <span key={d} style={{
                      width: 6, height: 6, borderRadius: 999,
                      background: 'var(--stone-400)',
                      animation: `kzPulse 1.2s infinite`, animationDelay: `${d * 0.2}s`,
                    }} />
                  ))}
                </div>
              </div>
            );
          }
          const isMe = m.from === 'me';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-end', gap: 8,
              flexDirection: isMe ? 'row-reverse' : 'row',
            }}>
              {!isMe && (
                <div style={{
                  width: 28, height: 28, borderRadius: 999,
                  background: 'linear-gradient(135deg, #FB923C, #EA580C)',
                  color: '#fff', fontWeight: 700, fontSize: 10,
                  display: 'grid', placeItems: 'center', flex: '0 0 auto',
                }}>{m.avatar}</div>
              )}
              <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  background: isMe
                    ? 'linear-gradient(155deg, #FB923C 0%, #EA580C 100%)'
                    : '#fff',
                  color: isMe ? '#fff' : 'var(--text)',
                  border: isMe ? 'none' : '1px solid var(--border)',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  padding: '10px 13px',
                  fontSize: 14, lineHeight: 1.4, letterSpacing: '-0.01em',
                  boxShadow: isMe ? '0 4px 10px -2px rgba(217,119,6,0.3)' : 'var(--sh-1)',
                  textWrap: 'pretty',
                }}>
                  {m.text}

                  {m.attached?.type === 'request' && (
                    <div style={{
                      marginTop: 8, padding: '8px 10px',
                      background: isMe ? 'rgba(255,255,255,0.18)' : 'var(--amber-50)',
                      borderRadius: 10,
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 7,
                        background: isMe ? 'rgba(255,255,255,0.22)' : '#fff',
                        color: isMe ? '#fff' : 'var(--amber-700)',
                        display: 'grid', placeItems: 'center', flex: '0 0 auto',
                      }}>
                        <IDoc size={14} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.02em', opacity: isMe ? 0.85 : 1, color: isMe ? '#fff' : 'var(--amber-800)' }}>
                          {m.attached.id} · {m.attached.status}
                        </div>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.attached.title}</div>
                      </div>
                    </div>
                  )}

                  {m.attached?.type === 'photo' && (
                    <div style={{
                      marginTop: 8, height: 110, borderRadius: 10,
                      background: 'linear-gradient(135deg, #44403C 0%, #1C1917 60%, #57534E 100%)',
                      position: 'relative', overflow: 'hidden',
                      display: 'grid', placeItems: 'center',
                    }}>
                      <div style={{ position: 'absolute', top: 6, left: 6, right: 6, height: 18, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }} />
                      <div style={{
                        width: 28, height: 28, borderRadius: 999, background: '#FB923C',
                        boxShadow: '0 0 30px 6px rgba(252,211,77,0.6)',
                      }} />
                      <div style={{
                        position: 'absolute', bottom: 6, left: 8, fontSize: 10,
                        color: 'rgba(255,255,255,0.8)', fontWeight: 600,
                      }}>IMG_8472.jpg · 1.2 МБ</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, padding: '0 4px' }}>
                  {m.reactions && m.reactions.map((r, j) => (
                    <span key={j} style={{
                      fontSize: 13, padding: '1px 7px', borderRadius: 999,
                      background: '#fff', border: '1px solid var(--border)',
                    }}>{r}</span>
                  ))}
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 500 }}>
                    {m.time}{isMe ? ' · прочитано' : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick replies */}
      <div style={{
        padding: '0 16px 8px',
        display: 'flex', gap: 7, overflowX: 'auto',
      }}>
        {['Спасибо!', 'Подойдёт', 'Когда?', 'Не получается'].map(q => (
          <button key={q} style={{
            flex: '0 0 auto',
            padding: '7px 12px', borderRadius: 999,
            background: '#fff', border: '1px solid var(--border)',
            fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
            cursor: 'pointer', letterSpacing: '-0.01em',
          }}>{q}</button>
        ))}
      </div>

      {/* Composer */}
      <div style={{
        padding: '8px 12px 28px',
        background: 'rgba(250,250,249,0.95)',
        backdropFilter: 'blur(14px)',
        borderTop: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'flex-end', gap: 8,
      }}>
        <button style={{
          width: 38, height: 38, borderRadius: 999,
          background: '#fff', border: '1px solid var(--border)',
          display: 'grid', placeItems: 'center', color: 'var(--text-2)', cursor: 'pointer',
          flex: '0 0 auto',
        }} aria-label="Прикрепить">
          <IPlus size={18} />
        </button>
        <div style={{
          flex: 1,
          background: '#fff', border: '1px solid var(--border)',
          borderRadius: 22, padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
          minHeight: 38,
        }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Сообщение для УК…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font)',
            }}
          />
          <button style={{
            background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0,
            display: 'grid', placeItems: 'center',
          }} aria-label="Камера">
            <ICamera size={18} />
          </button>
        </div>
        <button style={{
          width: 38, height: 38, borderRadius: 999,
          background: draft ? 'var(--amber-600)' : 'var(--stone-200)',
          border: 'none',
          display: 'grid', placeItems: 'center',
          color: draft ? '#fff' : 'var(--stone-500)',
          cursor: 'pointer', flex: '0 0 auto',
          boxShadow: draft ? 'var(--sh-amber)' : 'none',
          transition: 'all 0.15s',
        }} aria-label="Отправить">
          <ISend size={16} />
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { ChatScreen });
