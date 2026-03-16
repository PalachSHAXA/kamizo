import { useEffect } from 'react';

export function useBackGuard(isActive: boolean, onBack: () => void) {
  useEffect(() => {
    if (!isActive) return;

    window.history.pushState(null, '', window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
      onBack();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isActive, onBack]);
}
