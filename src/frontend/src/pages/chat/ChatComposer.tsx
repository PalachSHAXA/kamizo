import { type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { Paperclip, Smile, Send, Loader2, X } from 'lucide-react';

// Sprint 12: extracted from ChatPage.tsx. Renders the sticky bottom
// composer (text input + emoji button + attachment button + send),
// the optional attached-file chip, and the optional emoji picker.
//
// State stays at ChatPage — this is a "dumb" render component. It is
// not memoised because the value prop changes on every keystroke and
// useless re-renders here are cheap compared to the message list.

const QUICK_EMOJIS = ['😊','😂','❤️','👍','👎','🙏','😍','😭','🎉','🔥','✅','⚠️','😮','🤔','💪','👋','🏠','🔧','📋','📞'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export interface AttachedFile {
  name: string;
  size: number;
  dataUrl?: string;
  isImage: boolean;
}

interface ChatComposerProps {
  language: 'ru' | 'uz' | string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  isSending: boolean;

  // Composition (IME) — flips on/off so Enter doesn't submit during
  // multi-stroke kana / hangul / cyrillic composition.
  isComposing: boolean;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;

  // Attached file (preview chip).
  attachedFile: AttachedFile | null;
  onRemoveAttachment: () => void;

  // Emoji picker.
  showEmojiPicker: boolean;
  onToggleEmoji: () => void;
  onInsertEmoji: (emoji: string) => void;

  // File picker.
  fileInputRef: RefObject<HTMLInputElement>;
  onFilePick: (file: File) => void;

  // visualViewport-driven keyboard offset; when >0 we drop the
  // env(safe-area-inset-bottom) padding because the keyboard is
  // already pushing the composer up.
  keyboardOffset: number;
}

export function ChatComposer({
  language,
  value,
  onChange,
  onSend,
  isSending,
  isComposing,
  onCompositionStart,
  onCompositionEnd,
  attachedFile,
  onRemoveAttachment,
  showEmojiPicker,
  onToggleEmoji,
  onInsertEmoji,
  fileInputRef,
  onFilePick,
  keyboardOffset,
}: ChatComposerProps) {
  const isRu = language === 'ru';
  const canSend = (value.trim().length > 0 || !!attachedFile) && !isSending;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFilePick(file);
    e.target.value = '';
  };

  return (
    <div
      className="bg-white flex-shrink-0"
      style={{
        paddingBottom: keyboardOffset > 0 ? '0px' : 'max(12px, env(safe-area-inset-bottom, 12px))',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.04), 0 -1px 0 rgba(0,0,0,0.04)',
      }}
    >
      {/* Attached file preview */}
      {attachedFile && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-2.5 p-2 bg-orange-50 border border-orange-100 rounded-[14px]">
            {attachedFile.dataUrl ? (
              <img
                src={attachedFile.dataUrl}
                alt={attachedFile.name}
                className="w-10 h-10 rounded-[10px] object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-[10px] bg-white flex items-center justify-center flex-shrink-0 border border-orange-100">
                <Paperclip className="w-4 h-4 text-orange-500" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-gray-900 truncate">{attachedFile.name}</div>
              <div className="text-[11px] text-gray-500">{formatFileSize(attachedFile.size)}</div>
            </div>
            <button
              onClick={onRemoveAttachment}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-white rounded-lg transition-colors touch-manipulation"
              aria-label={isRu ? 'Убрать файл' : 'Faylni olib tashlash'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Emoji picker */}
      {showEmojiPicker && (
        <div className="px-3 pt-2 pb-1">
          <div className="flex flex-wrap gap-1 p-2 bg-gray-50 rounded-xl border border-gray-200 max-h-48 overflow-y-auto">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => onInsertEmoji(emoji)}
                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-gray-200 rounded-lg transition-colors active:scale-95"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-end gap-2 px-3 py-2">
        <button
          onClick={onToggleEmoji}
          className={`w-10 h-10 flex items-center justify-center rounded-[13px] transition-colors flex-shrink-0 touch-manipulation ${
            showEmojiPicker ? 'bg-orange-100 text-orange-500' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          }`}
          aria-label={isRu ? 'Эмодзи' : 'Emoji'}
          aria-pressed={showEmojiPicker}
        >
          <Smile className="w-5 h-5" />
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 flex items-center justify-center rounded-[13px] text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0 touch-manipulation"
          aria-label={isRu ? 'Прикрепить файл' : 'Fayl biriktirish'}
        >
          <Paperclip className="w-5 h-5" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf,.doc,.docx"
          className="hidden"
          aria-label={isRu ? 'Прикрепить файл' : 'Fayl biriktirish'}
          onChange={handleFileChange}
        />
        <div className="flex-1 relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onKeyDown={handleKeyDown}
            placeholder={isRu ? 'Сообщение...' : 'Xabar...'}
            // Sprint 1: 14px would trigger iOS Safari zoom on viewports
            // >640px. The global guard now covers up to 767px but we
            // keep the inline 16px as a belt-and-braces.
            style={{ fontSize: '16px' }}
            className="w-full px-4 py-2.5 bg-gray-100 rounded-[20px] border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/60 focus:border-orange-400/60 focus:bg-white transition-all placeholder:text-gray-400"
            disabled={isSending}
            aria-label={isRu ? 'Написать сообщение' : 'Xabar yozing'}
          />
        </div>

        <button
          onClick={onSend}
          disabled={!canSend}
          className="w-10 h-10 flex items-center justify-center rounded-[13px] transition-all touch-manipulation flex-shrink-0 active:scale-95 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none"
          style={
            canSend
              ? {
                  background: 'linear-gradient(135deg, #E8621A 0%, #F59E0B 100%)',
                  color: 'white',
                  boxShadow: '0 4px 12px rgba(232, 98, 26, 0.3)',
                }
              : undefined
          }
          aria-label={isRu ? 'Отправить сообщение' : 'Xabar yuborish'}
        >
          {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </div>
    </div>
  );
}
