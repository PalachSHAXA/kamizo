import { useId, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { MODAL_SIZES, type ModalSize } from '../../theme/sizes';
import { useModalLifecycle } from './useModalLifecycle';

export type { ModalSize };

export interface ModalProps {
  /** Whether the modal is currently visible. */
  open: boolean;
  /** Called when the user requests to close (ESC, backdrop click, close button). */
  onClose: () => void;
  /** Optional title — rendered in the header and used for `aria-labelledby`. */
  title?: ReactNode;
  /** Accessible name override when a rich visual title contains extra text. */
  ariaLabel?: string;
  /** Modal body. */
  children: ReactNode;
  /** Width preset. Defaults to `md`. */
  size?: ModalSize;
  /** Hide the default close (X) button in the header. */
  hideCloseButton?: boolean;
  /** Accessible label for the default close button. */
  closeLabel?: string;
  /** Disable closing by clicking on the backdrop. */
  disableBackdropClose?: boolean;
  /** Optional extra classes appended to the panel. */
  panelClassName?: string;
  /** Optional extra classes appended to the backdrop. */
  backdropClassName?: string;
  /** Explicit focus target for flows that open after an async action. */
  returnFocus?: HTMLElement | null;
}

const SIZE_CLASS = MODAL_SIZES;

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
  ariaLabel,
  children,
  size = 'md',
  hideCloseButton = false,
  closeLabel = 'Закрыть',
  disableBackdropClose = false,
  panelClassName = '',
  backdropClassName = '',
  returnFocus,
}: ModalProps) {
  const titleId = useId();
  const { panelRef, layerRef, isTopLayer } = useModalLifecycle({
    active: open,
    onClose,
    returnFocus,
  });

  if (!open) return null;

  const handleBackdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (disableBackdropClose) return;
    if (isTopLayer() && e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      ref={layerRef}
      className={`fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[10100] p-0 sm:p-4 anim-backdrop-in ${backdropClassName}`}
      onClick={handleBackdrop}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={!ariaLabel && title ? titleId : undefined}
        tabIndex={-1}
        className={`bg-white w-full min-h-0 ${SIZE_CLASS[size]} rounded-t-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto outline-none modal-landscape-tight modal-content ${panelClassName}`}
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
                aria-label={closeLabel}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
