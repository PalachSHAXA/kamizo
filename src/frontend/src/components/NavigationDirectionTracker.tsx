/* NavigationDirectionTracker — stamps document.body.dataset.nav with
   'push' or 'pop' on every navigation, so CSS rules in index.css can
   pick the correct page-enter animation (slide-from-right for push,
   slide-from-left for pop, fade-only when prefers-reduced-motion).

   Pure marker — renders null. Must live INSIDE <BrowserRouter> so
   useLocation / useNavigationType work.
*/
import { useEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

export function NavigationDirectionTracker() {
  const location = useLocation();
  const navType = useNavigationType();
  useEffect(() => {
    // React Router v6 navigation types: 'PUSH' | 'POP' | 'REPLACE'.
    // Map POP → 'pop' (back/forward / initial-load); everything else → 'push'.
    document.body.dataset.nav = navType === 'POP' ? 'pop' : 'push';
  }, [location.pathname, navType]);
  return null;
}
