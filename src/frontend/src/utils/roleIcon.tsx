import { type ComponentType, type SVGProps } from 'react';
import { Home, Key, Building2 } from 'lucide-react';

// Sprint XX (v118.19) — single source of truth for the
// avatar-circle ROLE → ICON mapping used everywhere a user identity
// is rendered in a colored circle (profile header, staff/employee
// lists, request executor chip). Per product spec:
//
//   resident, tenant, commercial_owner          → Home (HOUSE)
//   executor                                    → Key
//   security                                    → BarrierIcon
//   director, admin, manager, department_head,
//   dispatcher, marketplace_manager, advertiser → Building2
//   super_admin / unknown role / no role        → null → caller
//                                                 falls back to initials
//
// 13 of 13 roles in src/types/common.ts UserRole covered (only
// super_admin is intentionally a null → initials fallback, per spec).
// New roles added to UserRole later will fall through to initials
// until they're added here — safe-by-default.

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  className?: string;
};
export type RoleIconComponent = ComponentType<IconProps>;

// Custom 24×24 boom-barrier (шлагбаум — checkpoint arm) for the
// `security` role. lucide-react has no clean barrier glyph and the
// next-closest options (Shield, Construction) misread as
// "shield" or "road sign" rather than "checkpoint/gate". Hand-built
// here as a stand + pivot + closed-position horizontal arm. All
// shapes are filled with `currentColor` so the icon respects the
// `color` prop the same way lucide icons do, and it scales cleanly
// down to the smallest avatar sizes (~16 px) the app uses.
export function BarrierIcon({ size = 24, className, color, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color || 'currentColor'}
      className={className}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {/* base block at foot of stand */}
      <rect x="2.2" y="18" width="5.6" height="3" rx="0.5" />
      {/* vertical stand */}
      <rect x="3.8" y="13" width="2.4" height="6" />
      {/* pivot ball */}
      <circle cx="5" cy="12.5" r="1.8" />
      {/* horizontal arm — closed barrier (universal "stop" symbol) */}
      <rect x="6.4" y="11" width="14.4" height="3" rx="1" />
      {/* arm end cap (small vertical tab at the right tip) */}
      <rect x="19.6" y="9.5" width="1.6" height="6" rx="0.5" />
    </svg>
  );
}

const ROLE_ICONS: Record<string, RoleIconComponent> = {
  // residents — any "lives here" role
  resident: Home,
  tenant: Home,
  commercial_owner: Home,
  // field staff
  executor: Key,
  // gate / KPP
  security: BarrierIcon,
  // УК / management / office roles
  director: Building2,
  admin: Building2,
  manager: Building2,
  department_head: Building2,
  dispatcher: Building2,
  marketplace_manager: Building2,
  advertiser: Building2,
};

export function getRoleIcon(role?: string | null): RoleIconComponent | null {
  if (!role) return null;
  return ROLE_ICONS[role] ?? null;
}

// Standard initials of a person's name — used as the fallback when
// getRoleIcon returns null (super_admin, unknown role, missing
// role). Kept here so every site that renders an avatar circle gets
// identical initials behavior without copy-pasting yet another
// 5-line helper.
export function initialsOf(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
