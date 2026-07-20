import { useTenantStore } from '../../stores/tenantStore';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xl-login';
  forceDefault?: boolean;
}

// Single-source-of-truth for the tenant-logo chip shape. Matches
// HomeHero's inline `borderRadius: 10` on a 34×34 chip (~29% ratio) —
// a squircle, NOT a full circle. Bug 2026-07-20: AppLogo used
// `rounded-2xl` (16px fixed) which on the small size (32×32) resolves
// to a FULL CIRCLE, and on larger sizes to progressively less-round
// shapes — so the chip visibly changed shape across screens. Using a
// percentage keeps the ratio constant across every AppLogo size and
// matches HomeHero exactly without depending on pixel arithmetic.
// Applies to rung 1 (uploaded tenant image cropped to squircle) and
// rung 2 (letter fallback). Rung 3 (Kamizo forceDefault via .png with
// object-contain) intentionally has NO radius class and is not
// affected — the PNG defines its own bounds.
const LOGO_RADIUS_CLASS = 'rounded-[30%]';

export function AppLogo({ size = 'md', forceDefault = false }: AppLogoProps) {
  const tenant = useTenantStore((s) => s.config?.tenant);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16 md:w-20 md:h-20',
    'xl-login': 'w-20 h-20',
  };

  if (!forceDefault && tenant?.logo) {
    return (
      <img
        src={tenant.logo}
        alt={tenant.name}
        className={`${sizeClasses[size]} ${LOGO_RADIUS_CLASS} flex-shrink-0 object-cover`}
      />
    );
  }

  // Middle rung — tenant exists but hasn't uploaded a logo yet: render
  // a letter-chip from the УК name (first letter, uppercase). Mirrors
  // HomeHero's inline chip (ResidentHomeDesign.tsx:344-355) so a
  // brand-new tenant like "choko" gets a consistent "C" placeholder on
  // EVERY screen (Home, Requests, Sidebar, …) instead of a Kamizo "K"
  // on some and a "C" on others. HomeHero's own comment says it best:
  // "a brand-new tenant without a logo doesn't impersonate the Kamizo
  // brandmark" — that intent was never propagated here; this closes it.
  //
  // Colours mirror HomeHero literally (rgba(249,115,22,…) — Kamizo
  // orange). CSS-var-driven tint would let the chip react to per-tenant
  // brand on web, but HomeHero itself uses literal orange, so matching
  // it keeps both surfaces identical. Broader var-based cleanup is a
  // separate ticket that would need to touch HomeHero too.
  //
  // Guarded by `!forceDefault` so LoginPage (pre-auth Kamizo mark) and
  // ResidentUsefulContactsPage partner block (deliberate Kamizo brand
  // endorsement) keep rendering the Kamizo "K" as before — both pass
  // forceDefault.
  const letterSizeClasses = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-2xl',
    xl: 'text-3xl md:text-4xl',
    'xl-login': 'text-4xl',
  };
  const initial = tenant?.name?.trim()?.charAt(0)?.toUpperCase();
  if (!forceDefault && initial) {
    return (
      <div
        className={`${sizeClasses[size]} ${letterSizeClasses[size]} ${LOGO_RADIUS_CLASS} flex-shrink-0 grid place-items-center font-extrabold tracking-tight`}
        style={{
          background: 'rgba(249,115,22,0.22)',
          border: '1px solid rgba(249,115,22,0.4)',
          color: 'var(--brand-dark, #C2410C)',
        }}
        aria-label={tenant?.name || ''}
      >
        {initial}
      </div>
    );
  }

  // Bottom rung — no tenant name at all OR forceDefault=true: Kamizo
  // brand mark. Unchanged.
  return (
    <img
      src="/icons/favicon-192x192.png"
      alt="Kamizo"
      className={`${sizeClasses[size]} flex-shrink-0 object-contain`}
    />
  );
}
