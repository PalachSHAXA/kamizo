// Android keyboard spacer — v11 pattern lifted verbatim from
// MarketplacePage.tsx Sprint 87 v11 fix. Reused here as a hook so
// every rentals surface that has an input can opt in with one call.
//
// Root cause (repeated for the record): capacitor.config.ts sets
// `Keyboard.resize:'native'`, which USED to shrink the Android
// WebView so `100dvh` shrunk with the keyboard. Chromium ≥ 118
// changed the edge-to-edge WindowInsets behavior: the WebView
// keeps its size, keyboard draws over it, `100dvh`/`100vh`/`100svh`
// all keep reporting pre-keyboard height. Result: `max-h-[90dvh]
// overflow-y-auto` on any sheet has nothing to overflow and the
// browser's auto-scroll-focused-input heuristic is unreliable.
//
// Fix: read Keyboard.keyboardDidShow's `keyboardHeight`, write it to
// `--kz-kb-h` on <html>, and let consumers reserve that padding on
// their scroll container. Then scroll focused inputs into view.
// Guarded by isNativePlatform() && Android — iOS/web are no-ops.

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Enable the keyboard spacer while `active` is true. The consuming
 * scroll container should read `paddingBottom: 'var(--kz-kb-h, 0px)'`
 * to consume the reserved space.
 */
export function useAndroidKbSpacer(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const isAndroidNative =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

    // Focus-scroll runs on all platforms (iOS/web/dev) — behavior:'auto'
    // rather than 'smooth' so a mid-flight animation can't be cancelled
    // by the WebView's own scroll adjustments and leave the caret adrift.
    const onFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;
      // 300ms: keyboardDidShow can fire up to ~250ms after focusin on
      // Android (native keyboard animation) — we want --kz-kb-h in
      // place before we scroll.
      setTimeout(() => {
        try {
          target.scrollIntoView({ block: 'center', behavior: 'auto' });
        } catch {
          try { target.scrollIntoView(); } catch { /* give up */ }
        }
      }, 300);
    };
    window.addEventListener('focusin', onFocus);

    // Subscription race: Keyboard.addListener() returns a Promise
    // resolving to a PluginListenerHandle. If cleanup fires BEFORE
    // that promise resolves, the listener still gets registered but
    // cleanup already saw null and cleaned nothing. Effect re-runs
    // on every sheet open/close accumulate stray listeners. The
    // `cancelled` flag guards this: post-cleanup resolution removes
    // the just-registered handle.
    let cancelled = false;
    let showSub: { remove: () => Promise<void> } | null = null;
    let hideSub: { remove: () => Promise<void> } | null = null;

    if (isAndroidNative) {
      const setKbHeight = (px: number) => {
        document.documentElement.style.setProperty('--kz-kb-h', `${px}px`);
      };
      setKbHeight(0);

      Keyboard.addListener('keyboardDidShow', (info) => {
        setKbHeight(info.keyboardHeight || 0);
      })
        .then((sub) => {
          if (cancelled) sub.remove().catch(() => {});
          else showSub = sub;
        })
        .catch(() => { /* plugin unavailable — no-op */ });

      Keyboard.addListener('keyboardDidHide', () => {
        setKbHeight(0);
      })
        .then((sub) => {
          if (cancelled) sub.remove().catch(() => {});
          else hideSub = sub;
        })
        .catch(() => { /* no-op */ });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('focusin', onFocus);
      if (isAndroidNative) {
        document.documentElement.style.removeProperty('--kz-kb-h');
        showSub?.remove().catch(() => {});
        hideSub?.remove().catch(() => {});
      }
    };
  }, [active]);
}
