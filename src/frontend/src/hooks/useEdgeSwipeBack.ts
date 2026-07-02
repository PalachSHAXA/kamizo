// v118.153 — Reusable iOS-style edge-swipe-back gesture.
//
// Full-bleed pages (chat thread, vehicles, meetings/voting, UK rating,
// announcements, useful-contacts, guest-access, contract) do NOT have a
// BottomBar underneath them and are conceptually "pushed" on top of a
// parent screen. Users on iOS expect to be able to swipe from the left
// edge to go back — the same as native UIKit's interactivePopGesture.
//
// This hook attaches PASSIVE touchstart/touchend listeners on the
// document (no touchmove listener → cannot preventDefault → CANNOT
// conflict with the vertical scroll fixes at Layout.tsx v118.150 or the
// chat listRef scroll). Trigger condition matches the removed v113
// drawer swipe (which we deleted in v118.152 as unwanted UX): touch
// starts within `edgeThreshold` px of the LEFT edge, and by touchend
// the horizontal delta is > `distanceThreshold` px AND greater than the
// vertical delta (mostly horizontal, not a diagonal or vertical drag).
//
// Callers pass their existing back-action fn (usually the same
// `navigate(-1)` / `navigate('/')` / `onBack` they wire into the page's
// visible back button) so keyboard and gesture paths stay consistent.
//
// NOT for BottomBar tab-root pages (Home, Requests dashboard, Profile,
// etc.) — those aren't "pushed" and swiping shouldn't leave them.
//
// Example:
//   const navigate = useNavigate();
//   useEdgeSwipeBack(() => navigate('/'));
import { useEffect, useRef } from 'react';

interface Options {
  // Max distance from the left edge (px) where the gesture can START. 24 px
  // matches Apple's UIKit interactivePopGesture edge zone. Sits inside
  // iOS's own back-swipe hit-zone but we're inside WKWebView, not native
  // UIKit, so no conflict — the native gesture doesn't fire in our app.
  edgeThreshold?: number;
  // Min horizontal travel (px) to qualify as a back gesture. Below this
  // we treat the touch as an accidental tap and do nothing.
  distanceThreshold?: number;
  // If false, the hook attaches nothing. Lets callers gate the gesture
  // conditionally (e.g. only when a modal is closed) without a duplicate
  // hook invocation.
  enabled?: boolean;
}

export function useEdgeSwipeBack(onBack: () => void, options: Options = {}) {
  const {
    edgeThreshold = 24,
    distanceThreshold = 60,
    enabled = true,
  } = options;

  // Keep the latest onBack in a ref so we don't re-register listeners
  // every render when the caller passes an inline arrow fn.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= edgeThreshold) {
        startX = t.clientX;
        startY = t.clientY;
        tracking = true;
      } else {
        tracking = false;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (!t) return;
      const diffX = t.clientX - startX;
      const diffY = Math.abs(t.clientY - startY);
      // Horizontal travel past threshold AND dominant over vertical
      // (protects vertical scrolls that happen to start near the edge).
      if (diffX > distanceThreshold && diffY < diffX) {
        onBackRef.current();
      }
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
    };
  }, [edgeThreshold, distanceThreshold, enabled]);
}
