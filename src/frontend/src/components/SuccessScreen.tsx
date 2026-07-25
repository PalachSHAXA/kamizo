// Full-screen submit-success confirmation. Two visual variants:
//
//   • variant='brand'        — Kamizo brand orange, light `#F8F8FA`
//     background, orange full-stop after the title, optional info card,
//     primary + optional secondary CTA. This is the original inline
//     rentals success (extracted here so it lives in one place). Kept
//     as-is because the publish-listing flow legitimately needs the
//     info card (14-day reminder note) and a two-way action row.
//
//   • variant='confirmation' — DARK ink background (`#0F0F14`), green
//     check inside a green ring where BOTH the ring AND the tick
//     stroke-draw (ring 0→320ms, then tick 320→680ms), then title +
//     subtitle fade up, then a single centered dismiss button.
//     Used by marketplace on-demand + checkout — the design that
//     replaces the toast confirmation.
//
// No haptic here. @capacitor/haptics is in package.json but the native
// bridges (Android gradle, iOS Podfile) aren't wired — cap sync adds
// them into files we treat as v118 drift and revert after each build,
// so the plugin would silently no-op on device. Rather than ship code
// that pretends to do something, wire this up ONLY when the native
// project is actually configured. Visual-only for now.

import type { LucideIcon } from 'lucide-react';

type Variant = 'brand' | 'confirmation';

interface SuccessScreenProps {
  /** Visual preset. Defaults to 'brand' to keep the rentals publish
   *  screen's look unchanged for existing callers. */
  variant?: Variant;
  /** Big bold headline. 'brand' appends an orange full-stop visually. */
  title: string;
  /** Short body text under the title. */
  subtitle: string;
  /** Optional info card (icon + short note) — 'brand' variant only.
   *  Ignored on 'confirmation' by design (single-focus screen). */
  info?: { Icon: LucideIcon; text: string };
  /** Primary CTA — orange gradient in 'brand', white pill on dark in
   *  'confirmation'. On 'confirmation' this is the sole dismiss action. */
  primary: { label: string; onClick: () => void };
  /** Optional secondary CTA — 'brand' variant only. Ignored on
   *  'confirmation' (design has one dismiss button). */
  secondary?: { label: string; onClick: () => void };
}

export function SuccessScreen(props: SuccessScreenProps) {
  const { variant = 'brand', title, subtitle, info, primary, secondary } = props;

  if (variant === 'confirmation') return <ConfirmationSuccess title={title} subtitle={subtitle} primary={primary} />;

  // ── 'brand' — original rentals look ────────────────────────────
  return (
    <div className="marketplace-page -mx-4 -mt-4 md:mx-0 md:mt-0 min-h-screen bg-[#F8F8FA] flex items-center justify-center px-6">
      <div className="text-center max-w-[340px] mx-auto pb-16">
        <div className="ssc-brand-badge w-24 h-24 rounded-full bg-primary-50 grid place-items-center mx-auto mb-5">
          <svg
            viewBox="0 0 40 40"
            className="w-10 h-10"
            fill="none"
            stroke="currentColor"
            strokeWidth={3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M10 20.5 L17 27 L30 13" className="ssc-brand-check text-primary-500" />
          </svg>
        </div>

        <div className="ssc-brand-content">
          <h2
            className="text-[24px] font-extrabold text-gray-900 leading-tight"
            style={{ letterSpacing: '-0.02em' }}
          >
            {title}
            <span className="text-primary-500">.</span>
          </h2>

          <p className="text-[13.5px] text-gray-600 leading-relaxed mt-3 mb-5">
            {subtitle}
          </p>

          {info && (
            <div className="p-3 rounded-[14px] bg-primary-50 border border-primary-200 flex gap-2 text-left mb-5">
              <info.Icon className="w-4 h-4 text-primary-500 flex-shrink-0 mt-0.5" strokeWidth={2.2} />
              <div className="text-[11.5px] text-primary-700 font-semibold leading-relaxed">
                {info.text}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={primary.onClick}
              className="w-full py-3.5 rounded-[14px] text-white font-semibold text-[14px] active:scale-[0.98]"
              style={{ background: 'linear-gradient(150deg, #FB923C, #EA580C)', boxShadow: '0 10px 24px -10px rgba(249,115,22,0.7)' }}
            >
              {primary.label}
            </button>
            {secondary && (
              <button
                onClick={secondary.onClick}
                className="w-full py-3.5 rounded-[14px] border border-gray-200 text-gray-900 font-semibold text-[14px]"
              >
                {secondary.label}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .ssc-brand-badge   { animation: ssc-brand-badge 220ms cubic-bezier(0.34, 1.56, 0.64, 1) both; transform-origin: center; }
        .ssc-brand-check   { stroke-dasharray: 40; stroke-dashoffset: 40; animation: ssc-brand-draw 380ms 200ms ease-out forwards; }
        .ssc-brand-content { animation: ssc-brand-content 260ms 380ms ease-out both; }
        @keyframes ssc-brand-badge   { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes ssc-brand-draw    { to { stroke-dashoffset: 0; } }
        @keyframes ssc-brand-content { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .ssc-brand-badge, .ssc-brand-check, .ssc-brand-content { animation: none !important; }
          .ssc-brand-check { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
}

// ── 'confirmation' — dark editorial success ─────────────────────
// Approved design:
//   • Dark ink #0F0F14 background — reads as a distinct confirmation
//     mode, not a card floating over the marketplace.
//   • Green ring stroke-draws (110-perimeter dash, 0→320 ms), then
//     the tick strokes over the ring (320→680 ms). Both same green
//     (#22C55E) — no fill on the ring, tick sits on top.
//   • Heading + subtitle fade UP from 6 px after the check completes
//     (680 ms delay). White heading, muted white subtitle.
//   • Single centered dismiss pill button below — white on dark. No
//     secondary action; the design is one screen, one exit.
//   • Fixed portal-like layer at inset-0 handled by the caller (via
//     `<div className="fixed inset-0 z-…">` wrapper). This component
//     itself is min-h-screen so it fills that layer.
function ConfirmationSuccess({
  title, subtitle, primary,
}: {
  title: string;
  subtitle: string;
  primary: { label: string; onClick: () => void };
}) {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-6"
      style={{ background: '#0F0F14' }}
    >
      <div className="w-full max-w-[360px] flex flex-col items-center text-center pb-16">
        <svg
          viewBox="0 0 96 96"
          className="w-28 h-28 mb-6"
          fill="none"
          stroke="#22C55E"
          strokeWidth={4}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* Ring — perimeter ≈ 288 (2πr, r=46). Rotated -90° so the
              draw starts from the top. */}
          <circle cx="48" cy="48" r="46" className="ssc-conf-ring" />
          {/* Tick — 3-point polyline scaled to the same viewBox. */}
          <path d="M32 50 L44 62 L66 38" className="ssc-conf-tick" />
        </svg>

        <div className="ssc-conf-content w-full">
          <h2
            className="text-[26px] font-extrabold leading-tight text-white"
            style={{ letterSpacing: '-0.02em' }}
          >
            {title}
          </h2>
          <p
            className="text-[14px] leading-relaxed mt-3 mb-8"
            style={{ color: 'rgba(255,255,255,0.62)' }}
          >
            {subtitle}
          </p>
          <button
            onClick={primary.onClick}
            className="w-full py-3.5 rounded-[14px] font-semibold text-[14.5px] active:scale-[0.98] transition-transform"
            style={{ background: '#FFFFFF', color: '#0F0F14' }}
          >
            {primary.label}
          </button>
        </div>
      </div>

      <style>{`
        .ssc-conf-ring { transform-origin: 48px 48px; transform: rotate(-90deg); stroke-dasharray: 289; stroke-dashoffset: 289; animation: ssc-conf-ring 320ms ease-out forwards; }
        .ssc-conf-tick { stroke-dasharray: 60; stroke-dashoffset: 60; animation: ssc-conf-tick 360ms 320ms ease-out forwards; }
        .ssc-conf-content { opacity: 0; transform: translateY(6px); animation: ssc-conf-content 300ms 680ms ease-out forwards; }
        @keyframes ssc-conf-ring    { to { stroke-dashoffset: 0; } }
        @keyframes ssc-conf-tick    { to { stroke-dashoffset: 0; } }
        @keyframes ssc-conf-content { to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) {
          .ssc-conf-ring, .ssc-conf-tick, .ssc-conf-content { animation: none !important; }
          .ssc-conf-ring    { stroke-dashoffset: 0; }
          .ssc-conf-tick    { stroke-dashoffset: 0; }
          .ssc-conf-content { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
