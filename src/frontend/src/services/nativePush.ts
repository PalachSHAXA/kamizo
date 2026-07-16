// Native push-notification registration (Sprint 86).
//
// iOS APNs (and, for completeness, Android FCM) lifecycle hook
// invoked from authStore.login() on a successful login, with a
// matching unregister from logout().
//
// This file is the NATIVE-only counterpart to services/pushNotifications.ts
// (which is the PWA Web Push / VAPID flow). They share nothing — the
// transport is fundamentally different, and so are the backend
// endpoints (/api/devices/* vs /api/push/subscribe). Every entry
// point here hard-guards Capacitor.isNativePlatform() so the web
// build never even loads the plugin chunk.
//
// On Android the @capacitor/push-notifications plugin still works,
// but the server-side FCM send is out of scope for this sprint;
// registration still happens so the token row gets seeded, only the
// test-push fan-out skips it (see cloudflare/src/routes/devices.ts).
//
// Error handling: every failure is swallowed and logged. A failed
// permission grant, a denied prompt, or a flaky network must NEVER
// break the login flow. The user can still use the app without push
// — it'll just silently miss event notifications until the next
// login retries registration.

import { Capacitor } from '@capacitor/core';
import { apiRequest, API_URL } from './api/client';

// ── Phase-gate flag ─────────────────────────────────────────────────
// FCM_ENABLED controls whether initializeNativePush() runs the Android
// FCM path. Kept FALSE until Sprint 87 Phase 1 provisions Firebase
// Console + drops google-services.json into src/frontend/android/app/
// and applies the com.google.gms.google-services gradle plugin.
//
// Why: @capacitor/push-notifications' Android register() calls
// FirebaseMessaging.getInstance() unguarded (PushNotificationsPlugin.
// java:103). With no google-services.json, no default FirebaseApp
// exists → the SDK throws java.lang.IllegalStateException at the JVM
// layer, ABOVE the Capacitor bridge's promise-reject handler → the
// process crashes (AndroidRuntime FATAL EXCEPTION). Our JS-side
// try/catch in initializeNativePush() cannot catch a native crash.
//
// FLIP TO TRUE when Phase 1 lands — Android will then register
// normally. iOS is unaffected by this flag either way (APNs, no
// Firebase dependency). No other code change is required at Phase 1.
const FCM_ENABLED = false as boolean;

// Lazy-imported so the chunk only loads on native builds. The
// dynamic import lets the bundler split it out of the main bundle
// (the static guard isNative() doesn't actually allow tree-shaking).
type PushPluginModule = typeof import('@capacitor/push-notifications');

let pushPluginPromise: Promise<PushPluginModule | null> | null = null;
function getPushPlugin(): Promise<PushPluginModule | null> {
  if (!pushPluginPromise) {
    pushPluginPromise = import('@capacitor/push-notifications').catch(() => null);
  }
  return pushPluginPromise;
}

// Tracks the last token we sent to the backend, so logout can
// deactivate the exact (token, user_id) pair without re-asking the
// plugin. Module-scope is fine: on a fresh launch the plugin's
// register() will hand us the token again.
let currentDeviceToken: string | null = null;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function platform(): 'ios' | 'android' | null {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'ios' || p === 'android') return p;
    return null;
  } catch {
    return null;
  }
}

interface PushInitOptions {
  // If the OS-level permission is already 'denied', skip the prompt
  // entirely instead of re-asking. iOS hard-denies in microseconds
  // anyway and the UX is worse for the wasted prompt animation.
  silentIfPreviouslyDenied?: boolean;
}

/**
 * Ask the OS for permission, register with APNs/FCM, and POST the
 * resulting token to /api/devices/register. Safe to call on web
 * (no-op). Safe to call repeatedly.
 */
export async function initializeNativePush(opts: PushInitOptions = {}): Promise<void> {
  if (!isNative()) return;
  const plat = platform();
  if (!plat) return;

  // Phase-gate: on Android, skip the ENTIRE init when FCM is not
  // provisioned yet. We don't even ask for the POST_NOTIFICATIONS
  // permission — asking for a permission whose only consumer would
  // crash the process is a worse UX than not asking. iOS (APNs) is
  // never gated by this flag; see FCM_ENABLED comment at top of file.
  // When Phase 1 flips FCM_ENABLED to true, this branch becomes a
  // no-op and Android takes the same path as iOS below.
  if (plat === 'android' && !FCM_ENABLED) {
    console.log('[push] Android FCM disabled until Phase 1, skipping register');
    return;
  }

  const plugin = await getPushPlugin();
  if (!plugin) return;

  const { PushNotifications } = plugin;

  try {
    const current = await PushNotifications.checkPermissions();
    if (current.receive === 'denied' && opts.silentIfPreviouslyDenied) {
      return;
    }

    let granted = current.receive === 'granted';
    if (!granted) {
      const req = await PushNotifications.requestPermissions();
      granted = req.receive === 'granted';
    }
    if (!granted) return;

    // Listeners MUST be wired before register() — Capacitor doesn't
    // queue events emitted between register() and the first
    // addListener call.
    await PushNotifications.removeAllListeners();

    await PushNotifications.addListener('registration', async (raw: { value?: string }) => {
      const token = raw?.value;
      if (!token) return;
      currentDeviceToken = token;
      await sendTokenToBackend(token, plat).catch(() => {
        // Network blip — token stays cached in module scope; the
        // next successful API call (e.g. a re-login) re-sends it.
      });
    });

    await PushNotifications.addListener('registrationError', (err: { error?: string }) => {
      console.warn('[push] registrationError', err?.error);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notif: any) => {
      // Foreground push received while app is in foreground.
      // We deliberately do not surface it as a toast yet — that's
      // the next sprint when we route based on payload.data.type.
      console.log('[push] foreground notification', {
        title: notif?.title,
        body: notif?.body,
      });
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action: any) => {
      // User tapped the notification. The data object carries the
      // server-attached metadata (request_id, chat_id, etc.).
      // Routing-on-tap lives in a follow-up sprint once we have
      // business-event push live.
      console.log('[push] tapped', {
        actionId: action?.actionId,
        data: action?.notification?.data,
      });
    });

    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] initialize failed', (e as Error).message);
  }
}

async function sendTokenToBackend(token: string, plat: 'ios' | 'android'): Promise<void> {
  // Optional metadata: backend columns are nullable so we send the
  // bare minimum here and let the next sprint enrich it with a
  // proper @capacitor/device + @capacitor/app integration when those
  // plugins are added. Sending an extra "kamizo-web/<UA>" approximation
  // would just add noise — better to leave the column NULL until we
  // can populate it accurately.
  await apiRequest('/api/devices/register', {
    method: 'POST',
    body: JSON.stringify({
      token,
      platform: plat,
    }),
  });
}

/**
 * Tell the backend to stop pushing to this device. Called from
 * authStore.logout() — the caller MUST pass the still-valid JWT
 * captured synchronously, because by the time this async function
 * runs the store may have cleared localStorage's auth_token, and
 * apiRequest() reads its bearer token from there.
 *
 * Safe on web (no-op).
 *
 * We INTENTIONALLY do not call PushNotifications.unregister() — that
 * surrenders the APNs registration for the whole app on this device,
 * which would force a new permission prompt on the next login by any
 * account. Soft-deactivating the (token, user_id) row server-side is
 * the right scope.
 */
export async function unregisterNativePush(explicitJwt?: string | null): Promise<void> {
  if (!isNative()) return;
  if (!currentDeviceToken) return;
  const token = currentDeviceToken;
  currentDeviceToken = null;

  // Capture the JWT now (callers from logout() should pre-pass it,
  // because the store is about to wipe localStorage). Fall back to
  // localStorage for any other caller that might want to deactivate
  // a token mid-session (rare).
  let jwt: string | null = explicitJwt ?? null;
  if (!jwt) {
    try { jwt = localStorage.getItem('auth_token'); } catch { /* private mode */ }
  }
  if (!jwt) return;

  // Use raw fetch (not apiRequest) because apiRequest re-reads the
  // bearer from localStorage at call time — that may be cleared
  // already by authStore.logout's authApi.logout() side effect.
  try {
    await fetch(`${API_URL}/api/devices/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token }),
    });
  } catch {
    // Logout must NEVER fail because of a push-cleanup blip. The
    // backend GCs dead tokens lazily anyway (APNs returns
    // BadDeviceToken / Unregistered on send → row flipped inactive
    // by /api/devices/test-push and the future event-push fan-out).
  }
}
