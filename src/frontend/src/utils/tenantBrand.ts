// Per-tenant brand theming — v118.123 PRODUCT DECISION:
//
// The accent colour is now ALWAYS the Kamizo system orange, for EVERY
// tenant (HUMO, choko, any), on web and native. Previously
// applyTenantBrand() painted tenants.color over the --brand-* tokens at
// runtime, so HUMO (#4715f9 stored) rendered the whole UI purple/blue,
// choko (#e5ddd6 stored) bled beige into every accent, etc. That broke
// brand consistency — when a resident moves between tenants the chrome
// shifted colour, making the platform feel different per company.
//
// Tenant identity now lives in NAME and LOGO only (still read straight
// from useTenantStore.config.tenant — unchanged). The super-admin form
// continues to store tenants.color in the DB; we just stop painting it.
// If product reverses this decision, revert this file — every other
// caller passes the colour through unchanged.
//
// applyTenantBrand() is a no-op that ALWAYS clears the inline overrides,
// so the static Kamizo orange declared in index.css :root always wins.

// Brand tokens that the legacy implementation used to override per-tenant.
// We still own the list so any older inline overrides on :root (e.g. from a
// previous build of this app that DID paint per-tenant, persisted in the
// runtime style attribute across an SW upgrade) get cleared on every call.
const BRAND_VARS = [
  '--brand', '--brand-light', '--brand-dark', '--brand-rgb', '--brand-bg',
  '--brand-tint', '--sh-brand',
  '--brand-50', '--brand-100', '--brand-200', '--brand-300', '--brand-400',
  '--brand-500', '--brand-600', '--brand-700', '--brand-800', '--brand-900',
] as const;

/**
 * No-op brand override — always clears any inline --brand-* declarations on
 * :root so the static Kamizo orange in index.css always wins, regardless of
 * which tenant the user is logged into. See file header for product context.
 *
 * Parameter retained so callers don't have to change; it is intentionally
 * ignored.
 */
export function applyTenantBrand(_color?: string | null): void {
  void _color;
  const root = document.documentElement;
  BRAND_VARS.forEach((v) => root.style.removeProperty(v));
}
