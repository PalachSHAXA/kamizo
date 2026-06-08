// Capacitor / web platform detection.
//
// The app ships in two skins: the existing PWA (web) and the upcoming
// native iOS / Android wrappers (Capacitor). Most code does NOT need
// to care — `https://api.kamizo.uz` is the API base in both. But a
// handful of features behave differently:
//   • Push notifications: web uses Service Worker + VAPID; native uses
//     APNs / FCM via @capacitor/push-notifications.
//   • Camera / QR scanner: web uses `navigator.mediaDevices.getUserMedia`
//     which works in WKWebView but requires Info.plist usage strings on
//     iOS; native can opt to use @capacitor/camera for OS-native UI.
//   • Storage: localStorage works in WKWebView but is purged on user
//     "Clear Website Data" on iOS; @capacitor/preferences survives that.
//   • Deep links: handled by @capacitor/app on native.
//
// All branches stay opt-in. Existing PWA users see no change.

// Single import — Capacitor.isNativePlatform() is the cheapest, most
// reliable detector and works at module-init time (no DOM, no async).
import { Capacitor } from '@capacitor/core';

/** True when running inside a Capacitor native shell (iOS or Android). */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** 'ios' | 'android' | 'web' — convenient for switch statements. */
export const getPlatform = (): 'ios' | 'android' | 'web' => {
  const p = Capacitor.getPlatform();
  return (p === 'ios' || p === 'android') ? p : 'web';
};

/** Convenience flags. */
export const isIOS = (): boolean => getPlatform() === 'ios';
export const isAndroid = (): boolean => getPlatform() === 'android';
export const isWeb = (): boolean => getPlatform() === 'web';
