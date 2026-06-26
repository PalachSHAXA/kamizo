// v118.111 — Shared scroll container with the iOS-WKWebView-safe combo
// distilled from the v229/v232/v237/v241/v242/v245/v246/v249/v250/v253/
// v254 fix arc. Use this for every page-level inner-scroller instead of
// hand-rolling overflow rules. Prevents the "scroll-stick at bottom"
// dead-edge bug from recurring.
//
// THE VERIFIED COMBO (don't change without retesting all migrated pages):
//   • overflow-y: auto                  — the scroll itself
//   • -webkit-overflow-scrolling: touch — momentum engine. iOS WKWebView's
//                                         non-momentum engine has a
//                                         dead-edge bug at scrollTop=max:
//                                         once content settles at the
//                                         edge, the next touch is dropped
//                                         until something wakes the
//                                         scroller (v254).
//   • overscroll-behavior: contain      — keeps rubber-band LOCAL so it
//                                         doesn't chain to the outer
//                                         document, while still allowing
//                                         a tiny bounce at edges. That
//                                         bounce is what keeps the
//                                         gesture recogniser alive at
//                                         the bottom edge. `none` here
//                                         REPRODUCES the dead-edge bug
//                                         (v249).
//   • min-height: 0 (when flex child)   — so the flex item can shrink
//                                         below its content's intrinsic
//                                         height and overflow:auto
//                                         actually engages.
//
// USAGE:
//   <ScrollArea>{children}</ScrollArea>
//
//   // Inside a flex column where this is the scroll owner:
//   <div className="kz-screen" style={{ height:'100dvh', display:'flex',
//                                       flexDirection:'column',
//                                       overflow:'hidden' }}>
//     <Header />                                  ← flex:0 0 auto
//     <ScrollArea>                                ← flex:1 1 auto, scrolls
//       …form fields / list / cards…
//     </ScrollArea>
//   </div>
//
//   // For absolute positioning inside a fixed parent (chat-style):
//   <div style={{ position:'fixed', inset:0, overflow:'hidden' }}>
//     <ScrollArea absoluteFill>
//       …messages…
//     </ScrollArea>
//   </div>
//
// IF YOU NEED A PINNED HEADER + SCROLLABLE BODY in one shot, use
// <PinnedHeaderPage> below — it composes the flex column + safe-area
// header slot + ScrollArea so future screens don't have to wire it.

import { forwardRef, type CSSProperties, type ReactNode } from 'react';

interface ScrollAreaProps {
  children: ReactNode;
  /** Position-absolute inset:0 inside a positioned parent. Use for
   *  chat-style fixed-parent layouts. Otherwise leave undefined to
   *  flex into the parent flex column. */
  absoluteFill?: boolean;
  /** v118.118 — horizontal mode for chip rows / tab strips. Sets
   *  overflow-x:auto + touch-action:pan-x so the row only handles
   *  horizontal pans; vertical pans on this row will NOT be claimed
   *  by it and will pass through to whatever parent scrolls
   *  vertically. Defaults to false (vertical scroller — the common
   *  case). Use this for the chips/tabs class of scroller that
   *  previously was just `overflow-x-auto` and stalled the parent's
   *  vertical scroll. */
  horizontal?: boolean;
  /** Extra inline style merged on top of the safe defaults. Use for
   *  per-screen paddings / backgrounds — DON'T override the safe
   *  combo. */
  style?: CSSProperties;
  /** Extra className. Use for theme bg via Tailwind etc. — the
   *  scroll properties stay enforced via inline style which wins
   *  the cascade. */
  className?: string;
  /** ARIA + role hooks for chat / log / dialog scrollers. */
  role?: string;
  ariaLabel?: string;
  ariaLive?: 'off' | 'polite' | 'assertive';
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, absoluteFill, horizontal, style, className, role, ariaLabel, ariaLive }: ScrollAreaProps,
  ref,
) {
  // Position branch — absoluteFill for chat-style fixed parents,
  // otherwise flex:1 1 auto + min-height:0 for flex column parents.
  // Horizontal mode skips both — chip rows are inline-block-shaped
  // and sized by their content.
  const positionStyle: CSSProperties = horizontal
    ? {}
    : absoluteFill
      ? { position: 'absolute', inset: 0 }
      : { flex: '1 1 auto', minHeight: 0 };

  // The known-good scroll combo — DO NOT CHANGE without re-verifying
  // every migrated screen on iOS WKWebView. See file header for why.
  //
  // Horizontal mode: x-scrolling only + touch-action:pan-x so the
  // row releases vertical pans up the gesture tree (parent vertical
  // scroller actually gets to handle them). This is the v258
  // chips-bar discipline codified — any chip/tab row migrated to
  // <ScrollArea horizontal> automatically gets it.
  const scrollStyle: CSSProperties = horizontal
    ? {
        overflowX: 'auto',
        overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
        touchAction: 'pan-x',
      }
    : {
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain',
      };

  return (
    <div
      ref={ref}
      className={className}
      role={role}
      aria-label={ariaLabel}
      aria-live={ariaLive}
      style={{ ...positionStyle, ...scrollStyle, ...style }}
    >
      {children}
    </div>
  );
});
