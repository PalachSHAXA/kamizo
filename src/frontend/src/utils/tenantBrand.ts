// Per-tenant brand theming.
//
// The UI chrome reads brand colors from CSS custom properties (--brand,
// --brand-rgb, --brand-light, …) declared statically in index.css as Kamizo
// orange. Tenants pick their own primary colour in the super-admin editor
// (tenants.color), but it used to be stored-only and never painted — so
// every УК looked orange regardless. This applies the tenant's colour to the
// brand tokens at runtime so the picked colour actually themes the site.
//
// Called with the tenant colour on config load; called with null on the main
// (no-tenant) domain to fall back to the static orange defaults.

// Every brand token we override. Must include the full --brand-50..900 scale
// because tailwind.config maps `primary-{50..900}` → `var(--brand-{50..900})`,
// and the vast majority of components colour themselves via `bg-primary-*` /
// `text-primary-*`. Anything we leave unset falls back to the orange default.
const BRAND_VARS = [
  '--brand', '--brand-light', '--brand-dark', '--brand-rgb', '--brand-bg',
  '--brand-tint', '--sh-brand',
  '--brand-50', '--brand-100', '--brand-200', '--brand-300', '--brand-400',
  '--brand-500', '--brand-600', '--brand-700', '--brand-800', '--brand-900',
] as const;

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB | null {
  const m = hex.trim().replace(/^#/, '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Linear blend: t=0 → a, t=1 → b.
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const toHex = ([r, g, b]: RGB) =>
  '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

/**
 * Apply a tenant's primary colour to the brand CSS tokens. Pass null/undefined
 * (or an invalid colour) to clear the overrides and fall back to the static
 * orange defaults from index.css.
 */
export function applyTenantBrand(color?: string | null): void {
  const root = document.documentElement;
  const rgb = color ? hexToRgb(color) : null;

  if (!rgb) {
    // No tenant colour → remove inline overrides so the orange defaults win.
    BRAND_VARS.forEach((v) => root.style.removeProperty(v));
    return;
  }

  const rgbStr = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;
  const set = (name: string, value: string) => root.style.setProperty(name, value);

  // Tailwind-like 50..900 scale generated from the picked colour (treated as
  // ~500): lighter shades blend toward white, darker toward black.
  const scale: Record<number, RGB> = {
    50: mix(rgb, WHITE, 0.95),
    100: mix(rgb, WHITE, 0.88),
    200: mix(rgb, WHITE, 0.74),
    300: mix(rgb, WHITE, 0.55),
    400: mix(rgb, WHITE, 0.30),
    500: rgb,
    600: mix(rgb, BLACK, 0.12),
    700: mix(rgb, BLACK, 0.26),
    800: mix(rgb, BLACK, 0.40),
    900: mix(rgb, BLACK, 0.55),
  };
  for (const [step, value] of Object.entries(scale)) {
    set(`--brand-${step}`, toHex(value));
  }

  set('--brand', toHex(rgb));
  set('--brand-rgb', rgbStr);
  set('--brand-light', toHex(scale[400]));
  set('--brand-dark', toHex(scale[700]));
  set('--brand-bg', toHex(scale[50]));
  set('--brand-tint', `rgba(${rgbStr}, 0.12)`);
  set('--sh-brand', `0 8px 22px rgba(${rgbStr}, 0.35)`);
}
