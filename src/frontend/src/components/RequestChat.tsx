import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Send, Loader2, Lock, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useLanguageStore } from '../stores/languageStore';
import { useToastStore } from '../stores/toastStore';
import { useModalPresence } from '../stores/modalStore';
import { requestMessagesApi, type RequestMessageRecord } from '../services/api/requests';

interface RequestChatProps {
  requestId: string;
  requestNumber?: string | number;
  title: string; // "Чат с мастером" / "Чат с жителем"
  onClose: () => void;
}

function parseUtc(ts: string): number {
  const hasZone = ts.endsWith('Z') || /[+-]\d\d:?\d\d$/.test(ts);
  return new Date(hasZone ? ts : ts.replace(' ', 'T') + 'Z').getTime();
}

function formatTime(ts: string, locale: string): string {
  const t = parseUtc(ts);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

/**
 * Per-request chat between the resident and the assigned executor. Writable only
 * while the request is accepted/in_progress (the backend enforces this and
 * returns `writable`); otherwise the history stays visible but the input locks.
 */
export function RequestChat({ requestId, requestNumber, title, onClose }: RequestChatProps) {
  useModalPresence();
  const { user } = useAuthStore();
  const { language } = useLanguageStore();
  const locale = language === 'ru' ? 'ru-RU' : 'uz-UZ';
  const t = (ru: string, uz: string) => (language === 'ru' ? ru : uz);
  const addToast = useToastStore((s) => s.addToast);

  const [messages, setMessages] = useState<RequestMessageRecord[]>([]);
  const [writable, setWritable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fetching = useRef(false);

  const load = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await requestMessagesApi.list(requestId);
      setMessages(res.messages || []);
      setWritable(!!res.writable);
    } catch {
      /* keep last state; polling will retry */
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    load();
    const id = setInterval(load, 6000);
    return () => clearInterval(id);
  }, [load]);

  // Auto-scroll to newest.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !writable) return;
    setSending(true);
    try {
      const res = await requestMessagesApi.send(requestId, text);
      setMessages((prev) => [...prev, res.message]);
      setDraft('');
    } catch (e) {
      addToast('error', (e as Error).message || t('Не удалось отправить', 'Yuborib bo\'lmadi'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 10300 }} onClick={onClose}>
      <div
        className="modal-content w-full max-w-lg mx-4 flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ height: 'min(88dvh, 640px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/70 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <MessageCircle className="w-5 h-5 text-primary-500 flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-bold truncate">{title}</div>
              {requestNumber !== undefined && (
                <div className="text-xs text-gray-400">{t('Заявка', 'Ariza')} #{requestNumber}</div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={t('Закрыть', 'Yopish')}
            className="p-2 min-h-[40px] min-w-[40px] flex items-center justify-center hover:bg-gray-100 rounded-lg touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-gray-50">
          {loading ? (
            <div className="h-full flex items-center justify-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 gap-2 px-6">
              <MessageCircle className="w-8 h-8" />
              <span className="text-sm">{t('Сообщений пока нет. Напишите первым.', 'Hozircha xabar yo\'q. Birinchi bo\'lib yozing.')}</span>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm break-words ${
                      mine ? 'bg-primary-500 text-white rounded-br-md' : 'bg-white text-gray-900 border border-gray-200 rounded-bl-md'
                    }`}
                  >
                    {!mine && m.sender_name && (
                      <div className="text-[11px] font-semibold opacity-70 mb-0.5">{m.sender_name}</div>
                    )}
                    <div className="whitespace-pre-wrap">{m.body}</div>
                    <div className={`text-[10px] mt-0.5 text-right ${mine ? 'text-white/70' : 'text-gray-400'}`}>
                      {formatTime(m.created_at, locale)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Composer / locked notice */}
        {writable ? (
          <div
            className="flex items-end gap-2 px-3 py-3 border-t border-gray-200/70 bg-white"
            style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={1}
              maxLength={2000}
              placeholder={t('Сообщение…', 'Xabar…')}
              className="flex-1 resize-none max-h-28 px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 text-sm"
            />
            <button
              onClick={send}
              disabled={sending || !draft.trim()}
              aria-label={t('Отправить', 'Yuborish')}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-primary-500 text-white disabled:opacity-40 active:scale-95 touch-manipulation"
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        ) : (
          <div
            className="flex items-center justify-center gap-2 px-4 py-3.5 border-t border-gray-200/70 bg-gray-50 text-gray-500 text-sm"
            style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
          >
            <Lock className="w-4 h-4" />
            {t('Чат закрыт — работа по заявке завершена', 'Chat yopiq — ariza bo\'yicha ish tugagan')}
          </div>
        )}
      </div>
    </div>
  );
}
