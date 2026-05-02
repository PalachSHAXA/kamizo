import { useEffect, useRef, useState, Component } from 'react';
import { X } from 'lucide-react';
import { useLanguageStore } from '../../stores/languageStore';

type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface SheetProps {
  /** Visibility — parent-controlled */
  isOpen: boolean;
  /** Called when user dismisses via X, backdrop click, or Escape */
  onClose: () => void;
  /** Title in header (required — improves a11y). Pass empty string to hide text. */
  title: string;
  /** Optional subtitle rendered below title in smaller text */
  subtitle?: string;
  /** Desktop max-width. Ignored on mobile where sheet is full-width. */
  size?: SheetSize;
  /** Children — the sheet body */
  children: React.ReactNode;
  /**
   * Optional sticky footer — rendered at the bottom of the sheet and never scrolls
   * away on mobile. Useful for primary/destructive actions.
   */
  footer?: React.ReactNode;
  /** When true, disables backdrop-click dismissal (forces user to act). */
  forceAction?: boolean;
  /** Override close button visibility */
  showClose?: boolean;
}

const sizeClass: Record<SheetSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  full: 'sm:max-w-4xl',
};

/**
 * <Sheet> — primitive for overlays.
 *
 * Visual behaviour:
 *   - mobile (< sm / < 640px): full-width bottom sheet that slides up from the
 *     bottom edge, rounded top corners, respects safe-area-inset-bottom.
 *   - desktop (≥ sm): centered modal with sizeClass max-width, rounded all corners.
 *
 * One API → both presentations. Replaces the mixed bottom-sheet+center-modal
 * patterns scattered across wizard flows (audit: "Новая заявка step 1 bottom
 * sheet on desktop, step 2 center modal → use Sheet everywhere instead").
 *
 * Wrapped in a class ErrorBoundary locally so a render error inside body
 * doesn't take down the whole parent screen.
 */
export function Sheet({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  forceAction = false,
  showClose = true,
}: SheetProps) {
  const { language } = useLanguageStore();
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const [entered, setEntered] = useState(false);

  // Enter animation flag — flipped on next frame after mount so the sheet
  // slides/fades in instead of popping.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isOpen) { setEntered(false); return; }
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Focus trap-ish: remember where focus was, restore on close.
  useEffect(() => {
    if (!isOpen) return;
    previousActiveElement.current = document.activeElement as HTMLElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !forceAction) {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);

    // Focus the close button if present
    setTimeout(() => {
      const closeBtn = sheetRef.current?.querySelector<HTMLButtonElement>('button[data-sheet-close]');
      closeBtn?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', handleKey);
      previousActiveElement.current?.focus?.();
    };
  }, [isOpen, onClose, forceAction]);

  if (!isOpen) return null;

  const closeLabel = language === 'ru' ? 'Закрыть' : 'Yopish';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
      onClick={() => { if (!forceAction) onClose(); }}
    >
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Sheet body */}
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className={`
          relative w-full ${sizeClass[size]}
          bg-white shadow-2xl
          rounded-t-2xl sm:rounded-2xl
          max-h-[92dvh] sm:max-h-[90dvh] flex flex-col
          transition-transform duration-200 ease-out
          ${entered ? 'translate-y-0 sm:scale-100 sm:opacity-100' : 'translate-y-full sm:translate-y-0 sm:scale-95 sm:opacity-0'}
        `}
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Handle grip on mobile */}
        <div className="flex justify-center pt-2 pb-1 sm:hidden" aria-hidden="true">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        {(title || showClose) && (
          <div className="flex items-start justify-between px-5 pt-3 sm:pt-5 pb-3 border-b border-gray-200/60 flex-shrink-0">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 id="sheet-title" className="text-lg sm:text-xl font-bold text-gray-900 break-words" title={title}>
                  {title}
                </h2>
              )}
              {subtitle && <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{subtitle}</p>}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                data-sheet-close
                aria-label={closeLabel}
                className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation flex-shrink-0 ml-2"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            )}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 overscroll-contain">
          {children}
        </div>

        {/* Sticky footer */}
        {footer && (
          <div className="border-t border-gray-200/60 px-5 py-3 flex-shrink-0 bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * SheetErrorBoundary — optional wrapper for callers who want graceful
 * fallback if sheet body throws.
 */
export class SheetErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) { console.error('[Sheet] body render failed:', err); }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="p-4 text-sm text-red-600">
          Не удалось загрузить содержимое. Закройте и попробуйте снова.
        </div>
      );
    }
    return this.props.children;
  }
}
