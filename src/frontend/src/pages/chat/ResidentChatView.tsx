/* Resident-side chat with УК — Claude Design §10-chat handoff
 * (see design/handoff/chat-handoff.md + design/handoff/kamizo-chat.jsx).
 *
 * Lives next to ChatView (the admin/manager surface) and is selected by
 * ChatPage when user.role ∈ { resident, tenant, commercial_owner }.
 * Imports chatApi directly and runs its own fetch/poll/send loop so the
 * visual layer matches the handoff verbatim without inheriting any older
 * Tailwind treatments from ChatView.
 *
 * Layout / shell contract — TRULY fixed header + composer
 * --------------------------------------------------------
 *   • The header (back / avatar / title / active-request chip) and the
 *     composer (quick replies + input row) are PORTALED into document.body
 *     and pinned with position:fixed. They cannot move on scroll because
 *     they live outside the page's scroll container — any iOS PWA quirk
 *     with overflow:hidden + sticky / overscroll bounce on flex columns
 *     no longer affects them.
 *   • The kz-screen wrapper is `position:fixed; inset:0; overflow:hidden;
 *     overscroll-behavior:none` — the whole page is locked. The ONE
 *     element that scrolls is the inner messages list, with
 *     `overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:
 *     touch; overscroll-behavior:contain`.
 *   • Messages list padding-top / padding-bottom are sized dynamically
 *     from the measured heights of the portaled header and composer
 *     (ResizeObserver), so the first and last bubble always clear the
 *     fixed bars even when the active-request chip is missing or when
 *     the keyboard rises (iOS dvh adapts and the composer follows).
 *   • Header padding-top folds env(safe-area-inset-top); composer
 *     padding-bottom folds env(safe-area-inset-bottom). On iOS PWA the
 *     fixed elements pin to the visual viewport so the keyboard
 *     correctly pushes the composer above it.
 *   • Theme-color is swapped to the chat surface (#FAFAF9) on mount so
 *     the iOS PWA status-bar zone paints light, then restored on
 *     unmount.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Camera, ChevronRight, MapPin, Plus, Send } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useRequestStore } from '../../stores/dataStore';
import { useLanguageStore } from '../../stores/languageStore';
import { useIsMobile } from '../../hooks/useBreakpoint';
import { MessageContent } from '../../components/common';
import { formatDateSeparator, formatMessageTime, type ChatChannel, type ChatMessage } from './chatUtils';

interface Props {
  channel: ChatChannel;
  onBack?: () => void;
}

type Row =
  | { kind: 'date'; key: string; label: string }
  | { kind: 'msg'; msg: ChatMessage };

// Max bytes per attached file. Above this we warn and skip — large
// data URLs break HTTP POST limits on the API in front of D1.
const MAX_ATTACH_BYTES = 5 * 1024 * 1024; // 5 MB

export function ResidentChatView({ channel, onBack }: Props) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const requests = useRequestStore(s => s.requests);
  // Desktop renders the chat as a normal flex column inside the main-content
  // column (header → scrollable list → composer). Mobile keeps the Claude
  // Design §10-chat shell: portaled fixed header + portaled fixed composer
  // pinned to the visual viewport so the iOS keyboard pushes the composer
  // correctly. Toggling on this single flag is enough — every fixed/inset
  // style that bleeds across the sidebar on desktop is gated through it.
  const isMobile = useIsMobile();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Fixed-bar refs + measured heights drive the scroll-area padding so
  // first/last bubbles always clear the fixed header and composer.
  const headerElRef = useRef<HTMLDivElement | null>(null);
  const composerElRef = useRef<HTMLDivElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState(140);
  const [composerHeight, setComposerHeight] = useState(120);

  // Hidden file inputs — driven by the + (any file) and 📷 (camera) buttons.
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  // Resolve the active-request chip (most recent non-cancelled).
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

  // Defensive theme-color override: the global default (index.html) is
  // already the light app bg, so this is belt-and-braces — sets the chat
  // surface colour explicitly in case any future page mounts before this
  // one and forgets to restore. Restored on unmount.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null;
    if (!meta) return;
    const prev = meta.getAttribute('content') || '#FAFAF9';
    meta.setAttribute('content', '#FAFAF9');
    return () => { meta.setAttribute('content', prev); };
  }, []);

  // Measure fixed bars and re-measure on resize, content change, or the
  // active-request chip showing/hiding. Sized via offsetHeight so
  // env(safe-area-inset-*) paddings are included in the value.
  useLayoutEffect(() => {
    const measure = () => {
      if (headerElRef.current) setHeaderHeight(headerElRef.current.offsetHeight);
      if (composerElRef.current) setComposerHeight(composerElRef.current.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (headerElRef.current) ro.observe(headerElRef.current);
    if (composerElRef.current) ro.observe(composerElRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [activeRequest, draft]);

  // Scroll the message list to the bottom when a new message arrives,
  // unless the user is reading history (>200 px above the bottom).
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
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  }, [channel.id, draft, fetchMessages, sending]);

  // Send a batch of files through the existing chat pipeline. Each file
  // is base64-encoded and sent as a Markdown image reference so the
  // same backend endpoint handles attachments as text — matching the
  // existing pattern visible in the resident's history.
  //
  // Accepts a plain File[] (not FileList) so the caller can snapshot
  // the picked files BEFORE resetting the underlying <input>. See
  // handleFileChange below for the trap.
  const sendFiles = useCallback(async (files: File[]) => {
    if (files.length === 0 || sending) return;
    setSending(true);
    try {
      for (const file of files) {
        if (file.size > MAX_ATTACH_BYTES) {
          // eslint-disable-next-line no-console
          console.warn(`[chat] skipping ${file.name}: ${file.size} > ${MAX_ATTACH_BYTES}`);
          continue;
        }
        try {
          const dataUrl: string = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result as string);
            r.onerror = () => reject(r.error);
            r.readAsDataURL(file);
          });
          const content = `![${file.name}](${dataUrl})`;
          await chatApi.sendMessage(channel.id, content);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[chat] failed to send attachment', e);
        }
      }
      await fetchMessages();
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    } finally {
      setSending(false);
    }
  }, [channel.id, fetchMessages, sending]);

  const handleAttachClick = () => attachInputRef.current?.click();
  const handleCameraClick = () => cameraInputRef.current?.click();
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Snapshot the picked File objects BEFORE resetting the input.
    // HTMLInputElement.files is a *live* FileList tied to the element's
    // state — once we do `e.target.value = ''` the FileList we just
    // captured drops to length 0 (the manager-side ChatComposer
    // dodges this by extracting `e.target.files?.[0]` into a `File`
    // variable first). The async sendFiles below then iterated an
    // empty list, so the resident's chat silently swallowed every
    // attach: no upload, no preview, no error. Capture as a plain
    // File[] up front so the reset can run immediately for re-pick.
    const picked: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    void sendFiles(picked);
  };

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

  // Rendering chat content — both directions — runs through the shared
  // <MessageContent /> in components/common/MessageContent.tsx. The
  // local regex here used to require the WHOLE message to be a single
  // markdown image (^…$), so the manager's "${text}\n\n![file](data:…)"
  // composition fell through to raw text and the resident saw the full
  // base64 string in the bubble. The shared component parses mixed
  // content (text + image + attachment, multi-image) into <img> +
  // lightbox + <p>, with the same data:image/<mime>;base64,… +
  // https:// allowlist (no javascript: URLs).

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

  // -----------------------------------------------------------------
  // Portaled fixed header (back + avatar + title + active-request chip)
  // -----------------------------------------------------------------
  const headerEl = (
    <div
      ref={headerElRef}
      style={{
        // Mobile: portaled & pinned to the visual viewport (iOS PWA keyboard
        // handling). Desktop: a normal flow element at the top of the chat
        // column, so it cannot overlap the global sidebar or Desktop Header.
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        right: isMobile ? 0 : undefined,
        zIndex: isMobile ? 200 : 1,
        background: 'var(--chat-strip-bg, rgba(250,250,249,0.95))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: '1px solid var(--chat-strip-border, rgba(0,0,0,0.06))',
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
        flex: '0 0 auto',
      }}
    >
      <div style={{ padding: '10px 16px 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          type="button"
          onClick={onBack || (() => navigate('/'))}
          aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
          className="icon-only"
          style={{
            width: 36, height: 36, borderRadius: 999,
            background: 'transparent', border: 'none',
            display: 'grid', placeItems: 'center',
            color: 'var(--chat-icon-muted, #6F6A62)', cursor: 'pointer',
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
              background: 'var(--chat-status-online, #22C55E)',
              border: '2px solid var(--chat-online-ring, #FAFAF9)',
            }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em', color: 'var(--chat-header-text, #1C1917)' }}>
            {language === 'ru' ? 'Управляющая компания' : 'Boshqaruv kompaniyasi'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--chat-status-online, #15A06E)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span aria-hidden style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--chat-status-online, #15A06E)' }} />
            {statusText}
          </div>
        </div>
        {/* Call button removed per design follow-up. */}
      </div>

      {activeRequestChip && (
        <button
          type="button"
          onClick={() => navigate('/?tab=requests')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: 'calc(100% - 32px)',
            margin: '0 16px 10px',
            padding: '10px 12px',
            background: 'var(--chat-request-chip-bg, rgba(255,243,234,1))',
            borderRadius: 12,
            border: '1px solid var(--chat-request-chip-border, rgba(254,215,170,1))',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'var(--chat-request-chip-icon-bg, rgba(255,230,210,1))',
              color: 'var(--chat-request-chip-icon-fg, rgba(194,65,12,1))',
              display: 'grid', placeItems: 'center', flex: '0 0 auto',
            }}
          >
            <MapPin style={{ width: 14, height: 14 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, color: 'var(--chat-request-chip-eyebrow, rgba(154,52,18,1))', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              {language === 'ru' ? 'Активная заявка' : 'Faol ariza'}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--chat-request-chip-title, #1C1917)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeRequestChip.id} · {activeRequestChip.title} · {activeRequestChip.status}
            </div>
          </div>
          <ChevronRight style={{ width: 16, height: 16, color: 'var(--chat-request-chip-icon-fg, rgba(194,65,12,1))', flex: '0 0 auto' }} />
        </button>
      )}
    </div>
  );

  // -----------------------------------------------------------------
  // Portaled fixed composer (quick replies + attach + input + camera + send)
  // -----------------------------------------------------------------
  const composerEl = (
    <div
      ref={composerElRef}
      style={{
        // Same desktop ↔ mobile split as the header — the portaled fixed
        // pinning is only useful on the visual-viewport-aware mobile shell.
        position: isMobile ? 'fixed' : 'relative',
        bottom: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        right: isMobile ? 0 : undefined,
        zIndex: isMobile ? 200 : 1,
        background: 'var(--chat-strip-bg, rgba(250,250,249,0.95))',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderTop: '1px solid var(--chat-strip-border, rgba(0,0,0,0.06))',
        paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0,
        flex: '0 0 auto',
      }}
    >
      {/* Hidden file inputs driven by the + and 📷 buttons. */}
      <input
        ref={attachInputRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx,.txt"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Quick replies — horizontal scroll pills */}
      <div
        style={{
          padding: '8px 16px 8px',
          display: 'flex', gap: 7, overflowX: 'auto',
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
              background: 'var(--chat-chip-bg, #FFFFFF)',
              border: '1px solid var(--chat-chip-border, rgba(28,25,23,0.08))',
              fontSize: 12.5, fontWeight: 600,
              color: 'var(--chat-chip-text, #6F6A62)',
              cursor: 'pointer', letterSpacing: '-0.01em',
              minWidth: 0, minHeight: 0,
            }}
          >
            {q}
          </button>
        ))}
      </div>

      {/* Composer row */}
      <div
        style={{
          padding: '4px 12px 10px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={handleAttachClick}
          aria-label={language === 'ru' ? 'Прикрепить файл' : 'Faylni biriktirish'}
          className="icon-only"
          style={{
            width: 38, height: 38, borderRadius: 999,
            background: 'var(--chat-chip-bg, #FFFFFF)',
            border: '1px solid var(--chat-chip-border, rgba(28,25,23,0.08))',
            display: 'grid', placeItems: 'center',
            color: 'var(--chat-icon-muted, #6F6A62)',
            cursor: 'pointer', flex: '0 0 auto',
            minWidth: 0, minHeight: 0,
          }}
        >
          <Plus style={{ width: 18, height: 18 }} />
        </button>

        <div
          style={{
            flex: 1,
            background: 'var(--chat-input-bg, #FFFFFF)',
            border: '1px solid var(--chat-input-border, rgba(28,25,23,0.08))',
            borderRadius: 22,
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            minHeight: 38,
            minWidth: 0,
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
              fontSize: 14,
              color: 'var(--chat-input-text, #1C1917)',
              fontFamily: 'inherit',
              minWidth: 0,
            }}
          />
          <button
            type="button"
            onClick={handleCameraClick}
            aria-label={language === 'ru' ? 'Камера' : 'Kamera'}
            className="icon-only"
            style={{
              background: 'transparent', border: 'none',
              color: 'var(--chat-icon-disabled, #A8A29E)',
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
            background: draft.trim() ? '#EA580C' : 'var(--chat-send-off-bg, #E6DFD2)',
            border: 'none',
            display: 'grid', placeItems: 'center',
            color: draft.trim() ? '#FFFFFF' : 'var(--chat-send-off-text, #6F6A62)',
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

  // -----------------------------------------------------------------
  // Main surface — single scrolling area between the fixed bars.
  // -----------------------------------------------------------------
  return (
    <>
      {/* Mobile only: portal the fixed bars to <body> so they escape any
          ancestor with transform/filter that would downgrade position:fixed.
          On desktop the chat is a normal flex column, so the bars sit
          naturally above/below the message list — no portal, no overlap with
          the global Sidebar / Desktop Header. */}
      {isMobile && typeof document !== 'undefined' && createPortal(headerEl, document.body)}
      {isMobile && typeof document !== 'undefined' && createPortal(composerEl, document.body)}
      <div
        className="kz-screen"
        style={isMobile ? {
          position: 'fixed',
          inset: 0,
          background: 'var(--chat-page-bg, #FAFAF9)',
          overflow: 'hidden',
          overscrollBehavior: 'none',
        } : {
          // Desktop: bounded card inside main-content. Height matches the
          // existing .resident-chat-container CSS (viewport minus mobile-
          // header-h fallback + safe-area) so the composer hugs the bottom
          // without being clipped by the home-indicator zone.
          position: 'relative',
          background: 'var(--chat-page-bg, #FAFAF9)',
          overflow: 'hidden',
          border: '1px solid var(--chat-strip-border, rgba(0,0,0,0.06))',
          borderRadius: 22,
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100dvh - var(--mobile-header-h, 68px) - env(safe-area-inset-bottom, 0px))',
          maxWidth: 960,
          margin: '0 auto',
          width: '100%',
        }}
      >
        {!isMobile && headerEl}
        <div
          ref={listRef}
          style={isMobile ? {
            height: '100%',
            overflowY: 'auto', overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            paddingTop: `${headerHeight}px`,
            paddingBottom: `${composerHeight}px`,
          } : {
            flex: 1, minHeight: 0,
            overflowY: 'auto', overflowX: 'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          <div
            style={{
              padding: '12px 16px 8px',
              display: 'flex', flexDirection: 'column', gap: 8,
              minWidth: 0,
            }}
          >
            {rows.map((row) => {
              if (row.kind === 'date') {
                return (
                  <div key={row.key} style={{ textAlign: 'center', margin: '12px 0 6px' }}>
                    <span
                      style={{
                        fontSize: 11, color: 'var(--chat-date-text, #A8A29E)', fontWeight: 600,
                        letterSpacing: '0.02em',
                        padding: '4px 10px',
                        background: 'var(--chat-date-bg, #EDE7DB)', borderRadius: 999,
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
                      minWidth: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: me ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        background: me
                          ? 'linear-gradient(155deg, #FB923C 0%, #EA580C 100%)'
                          : 'var(--chat-bubble-in-bg, #FFFFFF)',
                        color: me ? '#FFFFFF' : 'var(--chat-bubble-in-text, #1C1917)',
                        border: me ? 'none' : '1px solid var(--chat-bubble-in-border, rgba(28,25,23,0.08))',
                        borderRadius: me ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        padding: '10px 13px',
                        fontSize: 14, lineHeight: 1.4, letterSpacing: '-0.01em',
                        boxShadow: me
                          ? '0 4px 10px -2px rgba(217,119,6,0.3)'
                          : 'var(--chat-bubble-in-shadow, 0 4px 14px rgba(28,25,23,0.06))',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                        maxWidth: '100%',
                      }}
                    >
                      <MessageContent content={m.content} isOwn={me} language={language} />
                    </div>

                    <div
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginTop: 3, padding: '0 4px',
                      }}
                    >
                      <span style={{ fontSize: 10.5, color: 'var(--chat-timestamp, #A8A29E)', fontWeight: 500 }}>
                        {formatMessageTime(m.created_at, language)}
                        {me && m.management_read ? (language === 'ru' ? ' · прочитано' : ' · o\'qildi') : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {!isMobile && composerEl}
      </div>
    </>
  );
}
