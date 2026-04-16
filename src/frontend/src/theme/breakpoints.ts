export const bp = {
  xs: 360,
  sm: 375,
  md: 414,
  lg: 768,
  xl: 1024,
  '2xl': 1440,
} as const;

export type Breakpoint = keyof typeof bp;

export const mq = {
  xs: `(min-width: ${bp.xs}px)`,
  sm: `(min-width: ${bp.sm}px)`,
  md: `(min-width: ${bp.md}px)`,
  lg: `(min-width: ${bp.lg}px)`,
  xl: `(min-width: ${bp.xl}px)`,
  '2xl': `(min-width: ${bp['2xl']}px)`,
  isMobile: `(max-width: ${bp.lg - 1}px)`,
  isDesktop: `(min-width: ${bp.lg}px)`,
} as const;

export function matchesMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(mq.isMobile).matches;
}
