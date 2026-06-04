/* Resident-side chat with УК — Claude Design §10-chat handoff
 * (see design/handoff/chat-handoff.md + design/handoff/kamizo-chat.jsx).
 *
 * Lives next to ChatView (the admin/manager surface) and is selected by
 * ChatPage when user.role ∈ { resident, tenant, commercial_owner }.
 * Imports chatApi directly and runs its own fetch/poll/send loop so the
 * visual layer matches the handoff verbatim without inheriting any older
 * Tailwind treatments from ChatView.
 *
 * Layout / shell contract
 * -----------------------
 *   • The screen is full-bleed inside the global Layout's main area on
 *     /chat. The global floating-pill BottomBar (src/components/BottomBar)
 *     stays VISIBLE — the chat is the same app shell as Home / Vehicles.
 *   • The composer reserves bottom padding equal to the BottomBar height +
 *     env(safe-area-inset-bottom) so the input rail sits above the pill
 *     and above the iOS home indicator.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, ChevronRight, FileText, MapPin, Phone, Plus, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useRequestStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import { formatDateSeparator, formatMessageTime, type ChatChannel, type ChatMessage } from './chatUtils';

interface Props {
  channel: ChatChannel;
  onBack?: () => void;
}

// Map raw chat messages into the renderer's row schema. Each row is either
// a date separator or a real message. The handoff also has typing/photo/
// attached-request rows; we keep the renderer prepared for them so that
// when backend ships structured payloads we only update the parser, not
// the JSX.
type Row =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'msg'; msg: ChatMessage };

export function ResidentChatView({ channel, onBack }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const requests = useRequestStore(s => s.requests);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Resolve the active-request chip (most recent non-cancelled). The chip
  // is the resident's quick handle on the request they're discussing.
  const activeRequest = useMemo(() => {
    return requests
      .filter(r => r.residentId === user?.id && r.status !== 'cancelled')
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] || null;
  }, [requests, user?.id]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await chatApi.getMessages(channel.id, 100) as { messages?: Record<string, unknown>[] };
      const list = (res.messages || []) as unknown as ChatMessage[];
      setMessages(list);
      try { await chatApi.markRead(channel.id); } catch { /* ignore */ }
    } catch { /* silent, retry on next poll */ }
  }, [channel.id]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => {
    const t = setInterval(fetchMessages, 15000);
    return () => clearInterval(t);
  }, [fetchMessages]);

  // Scroll the message list to the bottom when a new message arrives or
  // when the user sends one. Skip the scroll if the user has scrolled up
  // > 200 px (they're reading history) so we don't yank them around.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
    if (fromBottom < 200) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await chatApi.sendMessage(channel.id, text);
      await fetchMessages();
      // Force-scroll to bottom after we sent — guarantees the new bubble
      // is visible regardless of where the user was reading.
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    } catch {
      setDraft(text); // restore so the user can retry
    } finally {
      setSending(false);
    }
  }, [channel.id, draft, fetchMessages, sending]);

  // Group messages by day, inserting separator rows.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    let lastKey = '';
    for (const m of messages) {
      const ts = m.created_at || '';
      const k = ts.slice(0, 10);
      if (k && k !== lastKey) {
        out.push({ kind: 'date', key: `d-${k}`, label: formatDateSeparator(ts, language) });
        lastKey = k;
      }
      out.push({ kind: 'msg', msg: m });
    }
    return out;
  }, [messages, language]);

  const isMe = (m: ChatMessage) => m.sender_id === user?.id;

  // Status text the design shows beneath "Управляющая компания". The
  // handoff hardcodes "На связи · отвечаем до 15 мин"; the resident-side
  // expectation in production is the same.
  const statusText = language === 'ru' ? 'На связи · отвечаем до 15 мин' : 'Aloqada · 15 daq ichida javob';

  const activeRequestChip = activeRequest ? {
    id: `#${activeRequest.number}`,
    title: activeRequest.title,
    status: (() => {
      const s = activeRequest.status;
      if (language === 'ru') {
        if (s === 'new') return 'Новая';
        if (s === 'assigned') return 'Назначено';
        if (s === 'accepted') return 'Принято';
        if (s === 'in_progress') return 'В работе';
        if (s === 'pending_approval') return 'Ожидает оценки';
        if (s === 'completed') return 'Завершено';
        return s;
      }
      if (s === 'new') return 'Yangi';
      if (s === 'assigned') return 'Tayinlangan';
      if (s === 'in_progress') return 'Bajarilmoqda';
      if (s === 'completed') return 'Tugatilgan';
      return s;
    })(),
  } : null;

  const quickReplies = language === 'ru'
    ? ['Спасибо!', 'Подойдёт', 'Когда?', 'Не получается']
    : ['Rahmat!', 'Bo\'ladi', 'Qachon?', 'Bo\'lmadi'];

  return (
    <div
      className="kz-screen"
      style={{
        // 100dvh + flex column so header sticks, messages scroll, composer
        // pins to the bottom of the chat surface, not the viewport. The
        // outer ChatPage wrapper already removed Layout's page padding.
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        background: '#FAFAF9',
        overflow: 'hidden',
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 10px)',
          padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 16px 12px',
          background: 'rgba(250,250,249,0.95)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={onBack || (() => navigate('/'))}
          aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
          className="icon-only"
          style={{
            width: 36, height: 36, borderRadius: 999, background: 'transparent', border: 'none',
            display: 'grid', placeItems: 'center', color: '#6F6A62', cursor: 'pointer',
            minWidth: 0, minHeight: 0,
          }}
        >
          <ArrowLeft style={{ width: 20, height: 20 }} />
        </button>

        <div
          style={{
            position: 'relative',
            width: 40, height: 40, borderRadius: 999,
            background: 'linear-gradient(135deg, #FB923C, #EA580C)',
            color: '#fff', fontWeight: 700, fontSize: 13,
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            boxShadow: '0 2px 6px rgba(217,119,6,0.25)',
          }}
        >
          УК
          <span
            aria-hidden
            style={{
              position: 'absolute', bottom: -1, right: -1,
              width: 12, height: 12, borderRadius: 999,
              background: '#22C55E', border: '2px solid #FAFAF9',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em', color: '#1C1917' }}>
            {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}
          </div>
          <div
            style={{
              fontSize: 11.5, color: '#15A06E', fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: '#15A06E' }} />
            {statusText}
          </div>
        </div>

        <button
          type="button"
          aria-label={language === 'ru' ? 'Позвонить' : 'Qo\'ng\'iroq'}
          className="icon-only"
          style={{
            width: 36, height: 36, borderRadius: 999,
            background: '#FFFFFF', border: '1px solid rgba(28,25,23,0.08)',
            display: 'grid', placeItems: 'center', color: '#6F6A62', cursor: 'pointer',
            minWidth: 0, minHeight: 0,
          }}
        >
          <Phone style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* ── Pinned active-request chip ────────────────────────────────── */}
      {activeRequestChip && (
        <button
          type="button"
          onClick={() => navigate('/?tab=requests')}
          style={{
            margin: '10px 16px 4px',
            padding: '10px 12px',
            background: 'rgba(255,243,234,1)', // --amber-50
            borderRadius: 12,
            border: '1px solid rgba(254,215,170,1)', // --amber-200
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(255,230,210,1)', // --amber-100
              color: 'rgba(194,65,12,1)', // --amber-700
              display: 'grid', placeItems: 'center', flex: '0 0 auto',
            }}
          >
            <MapPin style={{ width: 14, height: 14 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 11.5,
                color: 'rgba(154,52,18,1)', // --amber-800
                fontWeight: 600,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              {language === 'ru' ? 'Активная заявка' : 'Faol ariza'}
            </div>
            <div
              style={{
                fontSize: 13, fontWeight: 600, color: '#1C1917', letterSpacing: '-0.01em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {activeRequestChip.id} · {activeRequestChip.title} · {activeRequestChip.status}
            </div>
          </div>
          <ChevronRight style={{ width: 16, height: 16, color: 'rgba(194,65,12,1)', flex: '0 0 auto' }} />
        </button>
      )}

      {/* ── Messages list ─────────────────────────────────────────────── */}
      <div
        ref={listRef}
        style={{
          flex: 1, overflowY: 'auto',
          padding: '12px 16px 8px',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}
      >
        {rows.map((row) => {
          if (row.kind === 'date') {
            return (
              <div key={row.key} style={{ textAlign: 'center', margin: '12px 0 6px' }}>
                <span
                  style={{
                    fontSize: 11, color: '#A8A29E', fontWeight: 600,
                    letterSpacing: '0.02em',
                    padding: '4px 10px',
                    background: '#EDE7DB', borderRadius: 999,
                  }}
                >
                  {row.label}
                </span>
              </div>
            );
          }
          const m = row.msg;
          const me = isMe(m);
          return (
            <div
              key={m.id}
              style={{
                display: 'flex', alignItems: 'flex-end', gap: 8,
                flexDirection: me ? 'row-reverse' : 'row',
              }}
            >
              {!me && (
                <div
                  style={{
                    width: 28, height: 28, borderRadius: 999,
                    background: 'linear-gradient(135deg, #FB923C, #EA580C)',
                    color: '#fff', fontWeight: 700, fontSize: 10,
                    display: 'grid', placeItems: 'center', flex: '0 0 auto',
                  }}
                >
                  УК
                </div>
              )}
              <div
                style={{
                  maxWidth: '78%',
                  display: 'flex', flexDirection: 'column',
                  alignItems: me ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    background: me
                      ? 'linear-gradient(155deg, #FB923C 0%, #EA580C 100%)'
                      : '#FFFFFF',
                    color: me ? '#FFFFFF' : '#1C1917',
                    border: me ? 'none' : '1px solid rgba(28,25,23,0.08)',
                    borderRadius: me ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    padding: '10px 13px',
                    fontSize: 14, lineHeight: 1.4, letterSpacing: '-0.01em',
                    boxShadow: me
                      ? '0 4px 10px -2px rgba(217,119,6,0.3)'
                      : '0 4px 14px rgba(28,25,23,0.06)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>

                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginTop: 3, padding: '0 4px',
                  }}
                >
                  <span style={{ fontSize: 10.5, color: '#A8A29E', fontWeight: 500 }}>
                    {formatMessageTime(m.created_at, language)}
                    {me && m.management_read ? (language === 'ru' ? ' · прочитано' : ' · o\'qildi') : ''}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Quick replies (horizontal scroll pills) ───────────────────── */}
      <div
        style={{
          padding: '0 16px 8px',
          display: 'flex', gap: 7, overflowX: 'auto',
          flex: '0 0 auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {quickReplies.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => {
              setDraft((d) => (d ? `${d} ${q}` : q));
              inputRef.current?.focus();
            }}
            className="icon-only"
            style={{
              flex: '0 0 auto',
              padding: '7px 12px', borderRadius: 999,
              background: '#FFFFFF', border: '1px solid rgba(28,25,23,0.08)',
              fontSize: 12.5, fontWeight: 600, color: '#6F6A62',
              cursor: 'pointer', letterSpacing: '-0.01em',
              minWidth: 0, minHeight: 0,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* ── Composer ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: '0 0 auto',
          // Handoff uses padding-bottom: 28 here. We replace 28 with the
          // safe-area + global BottomBar clearance so the input sits ABOVE
          // the floating pill and clears the iOS home indicator.
          padding: '8px 12px calc(env(safe-area-inset-bottom, 0px) + 88px)',
          background: 'rgba(250,250,249,0.95)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          borderTop: '1px solid rgba(0,0,0,0.06)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          aria-label={language === 'ru' ? 'Прикрепить' : 'Biriktirish'}
          className="icon-only"
          style={{
            width: 38, height: 38, borderRadius: 999,
            background: '#FFFFFF', border: '1px solid rgba(28,25,23,0.08)',
            display: 'grid', placeItems: 'center', color: '#6F6A62',
            cursor: 'pointer', flex: '0 0 auto',
            minWidth: 0, minHeight: 0,
          }}
        >
          <Plus style={{ width: 18, height: 18 }} />
        </button>

        <div
          style={{
            flex: 1,
            background: '#FFFFFF',
            border: '1px solid rgba(28,25,23,0.08)',
            borderRadius: 22,
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            minHeight: 38,
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={language === 'ru' ? 'Сообщение для УК…' : 'УКga xabar…'}
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 14, color: '#1C1917',
              fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
          <button
            type="button"
            aria-label={language === 'ru' ? 'Камера' : 'Kamera'}
            className="icon-only"
            style={{
              background: 'transparent', border: 'none', color: '#A8A29E',
              cursor: 'pointer', padding: 0,
              display: 'grid', placeItems: 'center',
              minWidth: 0, minHeight: 0,
            }}
          >
            <Camera style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <button
          type="button"
          onClick={send}
          disabled={sending || !draft.trim()}
          aria-label={language === 'ru' ? 'Отправить' : 'Yuborish'}
          className="icon-only"
          style={{
            width: 38, height: 38, borderRadius: 999,
            background: draft.trim() ? '#EA580C' : '#E6DFD2',
            border: 'none',
            display: 'grid', placeItems: 'center',
            color: draft.trim() ? '#FFFFFF' : '#6F6A62',
            cursor: draft.trim() ? 'pointer' : 'not-allowed',
            flex: '0 0 auto',
            boxShadow: draft.trim() ? '0 8px 22px rgba(249,115,22,0.35)' : 'none',
            transition: 'all 0.15s',
            minWidth: 0, minHeight: 0,
          }}
        >
          <Send style={{ width: 16, height: 16 }} />
        </button>
      </div>
    </div>
  );
}

// FileText is referenced in the handoff for the attached-request mini-card.
// We re-export it via a no-op so future structured-attachment work can use
// the same icon without an extra import.
export const __ChatAttachmentIcon = FileText;
