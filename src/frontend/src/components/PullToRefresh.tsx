// Touch-driven pull-to-refresh wrapper. Shared across marketplace +
// rentals feeds (and any future feed that wants the gesture).
//
// Behaviour:
//   • Only arms when the document is already at scrollTop = 0 at
//     touchstart — never fights normal scrolling mid-list.
//   • Damped pull (dy × 0.55, capped at 130 px) so it feels natural
//     and doesn't over-extend.
//   • Threshold 70 px separates a real pull from a small drag.
//   • preventDefault fires ONLY once we've decided this is a pull
//     (dy > 5 while already in 'pulling' state) — otherwise touch
//     events pass through normally so horizontal chip strips /
//     bottom-sheet swipes / nested scrollers keep working.
//   • Snaps back with a slight overshoot ease if released below
//     threshold; parks the indicator at threshold while `onRefresh`
//     is in flight, then snaps back on resolve.
//
// Uses the shared BottomBar-hider modal-signal pattern: caller passes
// `disabled={anyModalOpen}` to arm-off the gesture while a sheet /
// overlay covers the page.
//
// Deliberately no Capacitor plugin dependency — plain touch events.
// Works on both iOS and Android WebView with identical code.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  /** The page's existing fetch. MUST return a promise so we know when
   *  to hide the indicator. Called at most once per pull. */
  onRefresh: () => Promise<unknown>;
  /** Turn the gesture off while a modal / sheet is on top. */
  disabled?: boolean;
  /** Distance in pixels the user must drag to trigger a refresh.
   *  Default 70. */
  threshold?: number;
  children: ReactNode;
}

type State = 'idle' | 'pulling' | 'refreshing';

export function PullToRefresh({ onRefresh, disabled = false, threshold = 70, children }: PullToRefreshProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const pullDistRef = useRef(0);                    // mirrors state, read from touch handlers
  const stateRef = useRef<State>('idle');
  const onRefreshRef = useRef(onRefresh);
  const [state, setState] = useState<State>('idle');
  const [pullDist, setPullDist] = useState(0);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || disabled) return;

    const reset = () => {
      startYRef.current = null;
      pullDistRef.current = 0;
      stateRef.current = 'idle';
      setPullDist(0);
      setState('idle');
    };

    const onStart = (e: TouchEvent) => {
      if (stateRef.current !== 'idle') return;
      // scrollingElement is html on quirks / body on strict; falls back
      // to window scroll for edge cases.
      const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY;
      if (scrollTop > 0) return;
      startYRef.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (startYRef.current === null) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {                                // user reversed / cancelled
        reset();
        return;
      }
      // Damped pull with soft cap. Feels like the iOS Photos app.
      const eased = Math.min(dy * 0.55, 130);
      pullDistRef.current = eased;
      setPullDist(eased);
      if (stateRef.current !== 'pulling') {
        stateRef.current = 'pulling';
        setState('pulling');
      }
      // preventDefault only for real pulls — leaves horizontal drags,
      // tap-scrolls, and nested-container gestures alone. Requires
      // non-passive listener registration (see below).
      if (dy > 5) e.preventDefault();
    };

    const onEndOrCancel = () => {
      if (stateRef.current !== 'pulling') { startYRef.current = null; return; }
      const hit = pullDistRef.current >= threshold;
      startYRef.current = null;
      if (hit) {
        // Park at threshold while refetch runs; snap back on resolve.
        stateRef.current = 'refreshing';
        pullDistRef.current = threshold;
        setPullDist(threshold);
        setState('refreshing');
        Promise.resolve(onRefreshRef.current()).catch(() => {}).finally(() => {
          reset();
        });
      } else {
        reset();
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEndOrCancel, { passive: true });
    el.addEventListener('touchcancel', onEndOrCancel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEndOrCancel);
      el.removeEventListener('touchcancel', onEndOrCancel);
    };
  }, [disabled, threshold]);

  const progress = Math.min(pullDist / threshold, 1);
  const isActive = state !== 'idle';
  const idleTransition = state === 'idle' ? 'transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease-out' : 'none';

  return (
    <div ref={hostRef} style={{ position: 'relative', overscrollBehaviorY: 'contain' }}>
      {/* Indicator — a pill with a refresh icon. Rides on top of the
          content wrapper's transform, so as the content pulls down the
          indicator follows and the pill face sits centered inside the
          revealed strip. Idle → invisible & parked above the top edge. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 60,
          transform: `translateY(${pullDist - 60}px)`,
          opacity: isActive ? 1 : 0,
          pointerEvents: 'none',
          zIndex: 5,
          transition: idleTransition,
        }}
      >
        <div
          className={state === 'refreshing' ? 'ptr-spin' : ''}
          style={{
            width: 34, height: 34,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.94)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            boxShadow: '0 6px 16px -4px rgba(28,25,23,0.20), 0 2px 4px rgba(28,25,23,0.06)',
            display: 'grid', placeItems: 'center',
            // Pulling: rotate proportionally so the icon "turns" as you pull.
            // Refreshing: CSS animation below drives continuous spin.
            transform: state === 'pulling' ? `rotate(${progress * 180}deg)` : undefined,
            transition: state === 'pulling' ? 'transform 60ms linear' : 'none',
          }}
        >
          <RefreshCw
            style={{
              width: 16, height: 16,
              color: '#EA580C',
              // Fade the icon in as the pull grows so it feels alive.
              opacity: state === 'refreshing' ? 1 : Math.max(0.35, progress),
            }}
            strokeWidth={2.4}
          />
        </div>
      </div>

      {/* Content — translated by the pull distance. Sticky headers /
          overlays inside CHILDREN transform with the content, matching
          iOS native pull-to-refresh (whole scroll surface shifts). */}
      <div
        style={{
          transform: `translateY(${pullDist}px)`,
          transition: idleTransition,
          willChange: isActive ? 'transform' : 'auto',
        }}
      >
        {children}
      </div>

      <style>{`
        @keyframes ptr-spin-kf { to { transform: rotate(360deg); } }
        .ptr-spin { animation: ptr-spin-kf 750ms linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .ptr-spin { animation: none; }
        }
      `}</style>
    </div>
  );
}
