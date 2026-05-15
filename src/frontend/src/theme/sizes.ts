// Shared sizing constants. Single source for the modal/sheet surface
// components so the two don't drift apart.

export type ModalSize = 'sm' | 'md' | 'lg' | 'full';
export type SheetSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Tailwind max-widths used by `Modal` above the `sm` breakpoint (640px).
 * Below that the modal becomes a bottom-sheet and spans full width.
 */
export const MODAL_SIZES: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-2xl',
  full: 'sm:max-w-5xl',
};

/**
 * Tailwind max-widths used by `Sheet`. Slightly narrower at the large end
 * than `MODAL_SIZES` because Sheet is used for inline content panels and
 * forms rather than wide list/table modals.
 */
export const SHEET_SIZES: Record<SheetSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
  full: 'sm:max-w-4xl',
};
