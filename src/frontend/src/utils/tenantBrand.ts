// Per-tenant brand theming — v118.126 PLATFORM-SPLIT:
//
// Native (iOS/Android Capacitor build): ALWAYS use the Kamizo system
// orange declared statically in index.css :root. One brand in the App
// Store / Play Store; residents see the same chrome no matter which
// УК they belong to.
//
// Web (tenant subdomain like my-humo.kamizo.uz): paint the tenant's
// own primary/secondary colours that the super-admin saved in
// "Основной цвет" / "Вторичный цвет". The white-label cabinet should
// look like the УК, not like Kamizo.
//
// Platform detection uses Capacitor.isNativePlatform() — true inside
// the native shell (origin capacitor://localhost), false in any
// browser. The brand override is a no-op on native; on web it
// generates a 50..900 Tailwind-like scale from the picked colour and
// sets every --brand-* CSS custom property (the same tokens
// index.css declares as orange defaults).
//
// Tenant NAME and LOGO are read straight from useTenantStore.config
// .tenant in both platforms — unchanged.

import { Capacitor } from '@capacitor/core';

// Every brand token we override. Must include the full --brand-50..900
// scale because tailwind.config maps `primary-{50..900}` →
// `var(--brand-{50..900})`, and most components colour themselves via
// `bg-primary-*` / `text-primary-*`. Anything left unset falls back to
// the index.css orange default.
const BRAND_VARS = [
  '--brand', '--brand-light', '--brand-dark', '--brand-rgb', '--brand-bg',
  '--brand-tint', '--sh-brand',
  '--brand-secondary', '--brand-secondary-rgb',
  '--brand-50', '--brand-100', '--brand-200', '--brand-300', '--brand-400',
  '--brand-500', '--brand-600', '--brand-700', '--brand-800', '--brand-900',
] as const;

type RGB = [number, number, number];

function hexToRgb(hex: string | null | undefined): RGB | null {
  if (!hex) return null;
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

function clearOverrides(): void {
  const root = document.documentElement;
  BRAND_VARS.forEach((v) => root.style.removeProperty(v));
}

/**
 * Apply a tenant's primary (+optional secondary) colour to the brand
 * CSS tokens.
 *
 * Behaviour:
 *  - Native (Capacitor): no-op (always clears) → static Kamizo orange
 *    from index.css wins, regardless of what the tenant has saved.
 *  - Web with no valid primary: clears → fallback to index.css orange.
 *  - Web with a valid hex: generates the 50..900 scale and paints
 *    every --brand-* token. Secondary, if provided, drives
 *    --brand-secondary / --brand-secondary-rgb (rest of the chrome
 *    keeps using --brand for the dominant accent).
 *
 * Signature is permissive (string | null | undefined) so callers don't
 * need to gate their own argument when the store hasn't hydrated.
 */
export function applyTenantBrand(
  primary?: string | null,
  secondary?: string | null
): void {
  // Native shell → always Kamizo orange, ignore tenant colours.
  if (Capacitor.isNativePlatform()) {
    clearOverrides();
    return;
  }

  const rgb = hexToRgb(primary);
  if (!rgb) {
    // No tenant primary on web either → fall back to index.css orange.
    clearOverrides();
    return;
  }

  const root = document.documentElement;
  const set = (name: string, value: string) => root.style.setProperty(name, value);
  const rgbStr = `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`;

  // Tailwind-like 50..900 scale generated from the picked colour
  // (treated as ~500): lighter shades blend toward white, darker
  // toward black.
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

  // Secondary — optional, used by chrome that wants a contrast accent
  // (e.g. status pills, hero gradients) without overriding the primary.
  const sec = hexToRgb(secondary);
  if (sec) {
    const secStr = `${sec[0]}, ${sec[1]}, ${sec[2]}`;
    set('--brand-secondary', toHex(sec));
    set('--brand-secondary-rgb', secStr);
  } else {
    root.style.removeProperty('--brand-secondary');
    root.style.removeProperty('--brand-secondary-rgb');
  }
}
