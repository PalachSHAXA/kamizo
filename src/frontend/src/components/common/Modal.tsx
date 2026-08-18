import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';

import { useLanguageStore } from '../../stores/languageStore';
import { Modal as UiModal, type ModalSize } from '../ui/Modal';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showClose?: boolean;
  onBack?: () => void;
}

const SIZE_MAP: Record<NonNullable<ModalProps['size']>, { size: ModalSize; className?: string }> = {
  sm: { size: 'sm' },
  md: { size: 'md' },
  lg: { size: 'md', className: 'sm:!max-w-lg' },
  xl: { size: 'md', className: 'sm:!max-w-xl' },
  '2xl': { size: 'lg' },
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
  onBack,
}: ModalProps) {
  const language = useLanguageStore((state) => state.language);
  const mappedSize = SIZE_MAP[size];
  const headerSpacing = onBack
    ? ''
    : '[&>div:first-child]:!px-6 [&>div:first-child]:!py-4';

  return (
    <UiModal
      open={isOpen}
      onClose={onClose}
      title={onBack ? undefined : <span className="text-xl font-bold">{title}</span>}
      ariaLabel={onBack ? title : undefined}
      size={mappedSize.size}
      hideCloseButton={Boolean(onBack) || !showClose}
      closeLabel={language === 'ru' ? 'Закрыть' : 'Yopish'}
      panelClassName={`flex flex-col !overflow-hidden !bg-white/90 backdrop-blur-xl shadow-2xl ${headerSpacing} ${mappedSize.className ?? ''}`}
    >
      {onBack && (
        <div className="border-b border-gray-200/50 px-6 pt-3 pb-3 flex-shrink-0">
          <button
            type="button"
            onClick={onBack}
            aria-label={language === 'ru' ? 'Назад' : 'Orqaga'}
            className="inline-flex items-center gap-1 -ml-2 px-2 py-2 min-h-[44px] rounded-lg hover:bg-black/5 active:scale-95 touch-manipulation"
            style={{ color: 'var(--text-primary, #111827)' }}
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-base font-medium">
              {language === 'ru' ? 'Назад' : 'Orqaga'}
            </span>
          </button>
          <h2
            className="text-xl font-bold mt-1"
            style={{ color: 'var(--text-primary, #111827)' }}
          >
            {title}
          </h2>
        </div>
      )}

      <div
        className="flex-1 min-h-[200px] overflow-y-auto px-6 py-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
      >
        {children}
      </div>
    </UiModal>
  );
}
