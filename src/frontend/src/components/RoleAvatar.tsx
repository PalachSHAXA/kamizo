import { type CSSProperties } from 'react';
import { getRoleIcon, initialsOf } from '../utils/roleIcon';

// v118.19 — central avatar circle for USER identity. Brand-orange
// gradient by default (the most common visual in the app); the
// `background` prop lets per-site customisations pass through (e.g.
// the inactive-grey state in ResidentRateEmployeesPage's chip
// picker, or the pale BRAND_TINT in RequestDetailsModal's executor
// card) without each call-site reinventing the wheel.
//
// Inside the circle:
//   • If the user's role maps to an icon (see utils/roleIcon.tsx)
//     → render the icon, sized at iconRatio × size, in iconColor.
//   • Otherwise (super_admin, unknown role, no role)
//     → render initialsOf(name) at ~0.36 × size, in textColor.
//
// THE COMPONENT DOES NOT REPRESENT GROUP / CHANNEL / УК
// AVATARS — only individual user identity. UK logo/photo render
// sites (ResidentProfilePage's УК card, Sidebar's tenant logo,
// LoginPage's brand logo, group-channel emoji in chat) are out of
// scope and must NOT be replaced with this.

const BRAND_ORANGE = 'linear-gradient(135deg, #FB923C, #EA580C)';

export interface RoleAvatarProps {
  /** UserRole value (or null if unknown) — drives the icon pick. */
  role?: string | null;
  /** Display name — used for the initials fallback only. */
  name: string;
  /** Outer diameter in px. Icon scales with this; default 44. */
  size?: number;
  /** CSS color for the icon stroke / fill (default white). */
  iconColor?: string;
  /** CSS color for the initials fallback (default white). */
  textColor?: string;
  /** CSS background (gradient or solid). Default = brand orange. */
  background?: string;
  /** Optional extra className passed through to the outer <div>. */
  className?: string;
  /** Optional extra inline style — merged after the base styles. */
  style?: CSSProperties;
  /** Click handler — if set, cursor:pointer is applied. */
  onClick?: () => void;
  /** Icon size as a fraction of `size`. Default 0.5 (icon takes
   *  half the circle's diameter, leaving a visual ring of bg). */
  iconRatio?: number;
  /** Box shadow override — defaults to none. */
  boxShadow?: string;
}

export function RoleAvatar({
  role,
  name,
  size = 44,
  iconColor = '#FFFFFF',
  textColor = '#FFFFFF',
  background = BRAND_ORANGE,
  className,
  style,
  onClick,
  iconRatio = 0.5,
  boxShadow,
}: RoleAvatarProps) {
  const Icon = getRoleIcon(role);
  const iconPx = Math.round(size * iconRatio);
  const textPx = Math.round(size * 0.36);

  return (
    <div
      onClick={onClick}
      className={className}
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background,
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
        cursor: onClick ? 'pointer' : 'default',
        boxShadow,
        ...style,
      }}
    >
      {Icon ? (
        <Icon
          width={iconPx}
          height={iconPx}
          color={iconColor}
          strokeWidth={1.9}
        />
      ) : (
        <span
          style={{
            color: textColor,
            fontSize: textPx,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {initialsOf(name)}
        </span>
      )}
    </div>
  );
}
