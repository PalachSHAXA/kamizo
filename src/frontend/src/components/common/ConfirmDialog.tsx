import { AlertTriangle, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '../ui/Modal';

type Tone = 'danger' | 'warning' | 'primary';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  tone?: Tone;
  icon?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
  confirmDisabled?: boolean;
  // Optional body slot for extra content between the description and the
  // button row — useful when the confirm requires a reason textarea.
  children?: ReactNode;
}

const TONE_CONFIG: Record<Tone, { iconBg: string; iconFg: string; confirmBg: string; defaultIcon: ReactNode }> = {
  danger: {
    iconBg: 'bg-red-100',
    iconFg: 'text-red-500',
    confirmBg: 'bg-red-500 hover:bg-red-600 active:bg-red-700 text-white',
    defaultIcon: <AlertTriangle className="w-6 h-6" />,
  },
  warning: {
    iconBg: 'bg-amber-100',
    iconFg: 'text-amber-600',
    confirmBg: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white',
    defaultIcon: <AlertTriangle className="w-6 h-6" />,
  },
  primary: {
    iconBg: 'bg-primary-50',
    iconFg: 'text-primary-500',
    confirmBg: 'bg-primary-500 hover:bg-primary-600 active:bg-primary-700 text-gray-900',
    defaultIcon: <LogOut className="w-6 h-6" />,
  },
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  icon,
  onConfirm,
  onClose,
  confirmDisabled,
  children,
}: ConfirmDialogProps) {
  const cfg = TONE_CONFIG[tone];
  const iconNode = icon ?? cfg.defaultIcon;
  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      ariaLabel={title}
      size="sm"
      hideCloseButton
      backdropClassName="!items-center !p-4"
      panelClassName="!max-w-sm !rounded-2xl p-6 anim-modal-in"
    >
      <div className={`flex items-center justify-center w-12 h-12 rounded-full mx-auto mb-4 ${cfg.iconBg} ${cfg.iconFg}`}>
        {iconNode}
      </div>
      <h3 className="text-lg font-bold text-center mb-2">{title}</h3>
      {description && <div className="text-gray-500 text-center text-sm mb-4">{description}</div>}
      {children && <div className="mb-4">{children}</div>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 px-4 min-h-[44px] rounded-xl font-medium bg-gray-100 hover:bg-gray-200 active:bg-gray-300 transition-colors touch-manipulation"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmDisabled}
          className={`flex-1 py-3 px-4 min-h-[44px] rounded-xl font-semibold transition-colors touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed ${cfg.confirmBg}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
