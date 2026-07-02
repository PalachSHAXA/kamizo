// v118.145 — JS bridge to the native SoftHapticPlugin (ios/App/App/SoftHaptic.swift).
// Single transient method backed by CHHapticEngine — Capacitor 8's
// @capacitor/haptics doesn't expose the iOS .soft style or Core Haptics
// parameters, hence this small native bridge.
//
// Registered with the Capacitor bridge from MainViewController.swift
// capacitorDidLoad() — without that call the plugin would be invisible
// from JS even though the Swift class compiles into the binary.
import { registerPlugin } from '@capacitor/core';

export interface SoftHapticTapOptions {
  // 0..1. Default 0.30. How strong the tap is.
  intensity?: number;
  // 0..1. Default 0.00. 0 = mushy/smooth/dull, 1 = crisp/sharp/clicky.
  sharpness?: number;
}

export interface SoftHapticPlugin {
  // Fires a CHHapticTransient event with the given intensity / sharpness.
  // Resolves once the haptic is scheduled. Rejects only if the native
  // plugin failed to register — JS callers should .catch() and fall back.
  tap(options?: SoftHapticTapOptions): Promise<void>;
}

export const SoftHaptic = registerPlugin<SoftHapticPlugin>('SoftHaptic', {
  web: () => ({ tap: async () => { /* no-op on web */ } }),
});
