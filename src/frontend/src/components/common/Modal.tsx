import { useEffect, useRef } from 'react';
import { X, ChevronLeft } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';
import { useModalPresence } from '../../stores/modalStore';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showClose?: boolean;
  // v118.139 — optional back affordance. When provided, the header
  // renders the v118.130 pattern (← Назад on top, title below, no X) —
  // same shape used by executor RequestDetailsModal. Existing Modal
  // consumers that don't pass onBack keep the original title+X header.
  onBack?: () => void;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  onBack,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const { language } = useLanguageStore();
  const closeLabel = language === 'ru' ? 'Закрыть' : 'Yopish';

  // Hide the global BottomBar while this modal is open via the shared
  // modal-presence registry (modalStore counter). One-line opt-in for
  // every consumer of this wrapper.
  useModalPresence(isOpen);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  useEffect(() => {
    if (!isOpen) return;

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    // Prevent body scroll
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Handle escape key
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    // Handle click outside
    const handleClickOutside = (event: MouseEvent) => {
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        (event.target as HTMLElement).closest('[role="dialog"]') === null
      ) {
        onClose();
      }
    };

    // Set focus to modal for accessibility
    setTimeout(() => {
      const closeButton = modalRef.current?.querySelector<HTMLButtonElement>('button[data-modal-close]');
      if (closeButton instanceof HTMLButtonElement) {
        closeButton.focus();
      }
    }, 100);

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = originalOverflow;

      // Restore focus to previously focused element
      if (previousActiveElement.current instanceof HTMLElement) {
        previousActiveElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center" role="presentation" aria-hidden="false">
      {/* Backdrop with glass-morphism */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal content */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`relative z-[111] w-full mx-0 sm:mx-4 bg-white/90 backdrop-blur-xl rounded-t-2xl sm:rounded-2xl shadow-2xl transition-all duration-200 opacity-100 scale-100 max-h-[90dvh] flex flex-col ${sizeClasses[size]}`}
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom, 0px))' }}
      >
        {/* Header */}
        {onBack ? (
          // v118.139 — back-button header (executor RequestDetailsModal v118.130 pattern).
          // ← Назад on top, title below, no X. Theme-aware via var(--text-primary)
          // so it reads on both the white-ish light Modal and the dark
          // (html.dark) surface that the global .bg-white\/90 override flips to.
          <div className="border-b border-gray-200/50 px-6 pt-3 pb-3 flex-shrink-0">
            <button
              onClick={onBack}
              aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
              data-modal-close
              className="inline-flex items-center gap-1 -ml-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-black/5 active:scale-95 touch-manipulation"
              style={{ color: 'var(--text-primary, #111827)' }}
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="text-base font-medium">
                {language === 'ru' ? 'Назад' : 'Orqaga'}
              </span>
            </button>
            <h2
              id="modal-title"
              className="text-xl font-bold mt-1"
              style={{ color: 'var(--text-primary, #111827)' }}
            >
              {title}
            </h2>
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-gray-200/50 px-6 py-4 flex-shrink-0">
            <h2 id="modal-title" className="text-xl font-bold text-gray-900">
              {title}
            </h2>
            {showClose && (
              <button
                onClick={onClose}
                aria-label={closeLabel}
                data-modal-close
                className="p-2 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-[200px] overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}
