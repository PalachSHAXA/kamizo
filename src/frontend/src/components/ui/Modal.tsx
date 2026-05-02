import { useEffect, useRef, useId, type ReactNode, type MouseEvent } from 'react';
import { X } from 'lucide-react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';

export interface ModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user requests to close (ESC, backdrop click, close button). */
  onClose: () => void;
  /** Optional title — rendered in the header and used for `aria-labelledby`. */
  title?: ReactNode;
  /** Modal body. */
  children: ReactNode;
  /** Width preset. Defaults to `md`. */
  size?: ModalSize;
  /** Hide the default close (X) button in the header. */
  hideCloseButton?: boolean;
  /** Disable closing by clicking on the backdrop. */
  disableBackdropClose?: boolean;
  /** Optional extra classes appended to the panel. */
  panelClassName?: string;
}

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  full: 'sm:max-w-5xl',
};

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Accessible modal primitive.
 *
 * - ESC key closes (when `open` is true).
 * - Focus is trapped inside the dialog while open.
 * - Body scroll is locked while open.
 * - Backdrop click closes (unless `disableBackdropClose`).
 * - ARIA: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` when `title` is set.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  size = 'md',
  hideCloseButton = false,
  disableBackdropClose = false,
  panelClassName = '',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // ESC handler + focus trap
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
      );
      if (focusable.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKey);

    // Focus first focusable element on open
    requestAnimationFrame(() => {
      const root = panelRef.current;
      if (!root) return;
      const first = root.querySelector<HTMLElement>(FOCUSABLE);
      (first || root).focus();
    });

    return () => {
      document.removeEventListener('keydown', handleKey);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (disableBackdropClose) return;
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4"
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`bg-white w-full ${SIZE_CLASS[size]} rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto outline-none ${panelClassName}`}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between gap-3 p-4 sm:p-6 border-b border-gray-100">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id={titleId} className="text-base sm:text-lg md:text-xl font-bold truncate">
                  {title}
                </h2>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="tap-target p-2 hover:bg-gray-100 rounded-xl transition-colors flex items-center justify-center shrink-0"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export default Modal;
