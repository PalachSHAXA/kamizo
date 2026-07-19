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

  // Sprint 87 — pre-start the CHHapticEngine so the first
  // playDismiss() of the session isn't attenuated by a cold engine.
  // Called at splash-mount so that by the time the ramp fires
  // (≥2.6 s later), the engine has settled. No-op if the device
  // doesn't support Core Haptics. See SoftHaptic.swift for details.
  warmup(): Promise<void>;

  // Sprint 87 v3 — Kinopoisk-style dismissal choreography. ONE
  // CHHapticContinuous event with intensity + sharpness parameter
  // curves, NOT a series of transients (v2 experiment reverted —
  // discrete taps read as separate pulses instead of a single wave).
  // Duration 1.9 s at low-to-medium intensity is well under Apple's
  // 30 s CHHapticContinuous cap and clean of attenuation on modern
  // iPhones. See SoftHaptic.swift makeDismissIntensityCurve() and
  // makeDismissSharpnessCurve() for the envelope. Called once per
  // app session from the splash-overlay dismiss effect, on the
  // success path only. Does NOT touch tap() — the BottomBar preset
  // is byte-identical.
  //
  // buildMs — duration of the rising phase. Pass 0 to skip the
  //   build entirely and start at peak (short-runway case).
  // decayMs — duration of the peak+decay phase. Peak = first 20%,
  //   decay = remaining 80%. Coincides with the visual fade+scale
  //   exit (see NativeSplashOverlay.tsx FADE_OUT_MS).
  playDismiss(options: { buildMs: number; decayMs: number }): Promise<void>;
}

export const SoftHaptic = registerPlugin<SoftHapticPlugin>('SoftHaptic', {
  web: () => ({
    tap: async () => { /* no-op on web */ },
    warmup: async () => { /* no-op on web */ },
    playDismiss: async () => { /* no-op on web */ },
  }),
});
