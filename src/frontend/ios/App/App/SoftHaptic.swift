import Foundation
import Capacitor
import UIKit
import CoreHaptics

// v118.145 — Production-trimmed haptic bridge.
//
// Single method: tap({intensity: 0..1, sharpness: 0..1}) → plays a
// CHHapticTransient event via Core Haptics. BottomBar (the only caller)
// passes intensity 0.30 / sharpness 0.00 — the P6 preset the user picked
// from the temporary tester (delivered the softest perceptible tap).
//
// Plugin registration: this class is registered with the Capacitor bridge
// from MainViewController.swift → capacitorDidLoad() →
// bridge?.registerPluginInstance(SoftHapticPlugin()). Capacitor 8 does NOT
// auto-discover plugins in the App target — that registration step is what
// makes JS calls to "SoftHaptic" route here instead of rejecting with
// "plugin not implemented on ios".
//
// Fallback chain on engine error:
//   1. UIImpactFeedbackGenerator(.soft)  (iOS 13+)
//   2. UIImpactFeedbackGenerator(.light) (older)
@objc(SoftHapticPlugin)
public class SoftHapticPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SoftHapticPlugin"
    public let jsName = "SoftHaptic"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "tap", returnType: CAPPluginReturnPromise),
        // Sprint 87 — additive-only: splash-dismiss haptic (Kinopoisk-
        // style ramp). See playDismiss() body below. `tap` above is
        // NOT touched — the v118.145 P6 preset (0.30 / 0.00) called
        // from BottomBar stays byte-identical.
        CAPPluginMethod(name: "warmup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playDismiss", returnType: CAPPluginReturnPromise),
    ]

    private var engine: CHHapticEngine?
    private var engineLock = NSLock()

    private var supportsHaptics: Bool {
        CHHapticEngine.capabilitiesForHardware().supportsHaptics
    }

    private func ensureEngine() throws {
        engineLock.lock()
        defer { engineLock.unlock() }
        if engine == nil {
            let e = try CHHapticEngine()
            // Sprint 87 — explicit. Apple's current default IS false
            // (iOS 13+), but we're now deliberately relying on the
            // engine staying alive across the ~2.6 s gap between
            // warmup() at splash-mount and playDismiss() at fadeTimer.
            // Explicit set-to-false so a future Apple default flip
            // (or a subclass override elsewhere) cannot silently
            // reintroduce the "engine idle-shutdown before playDismiss"
            // failure mode. NOTE: this does NOT protect against
            // .applicationSuspended, .audioSessionInterrupt, or
            // system-pressure shutdowns — the stoppedHandler below
            // still catches those and nils the engine so the next
            // ensureEngine() call recreates it.
            e.isAutoShutdownEnabled = false
            e.stoppedHandler = { [weak self] _ in
                self?.engineLock.lock()
                self?.engine = nil
                self?.engineLock.unlock()
            }
            e.resetHandler = { [weak self] in
                do { try self?.engine?.start() } catch {
                    self?.engineLock.lock()
                    self?.engine = nil
                    self?.engineLock.unlock()
                }
            }
            engine = e
        }
        try engine?.start()
    }

    private func clampF(_ x: Double, _ lo: Double = 0.0, _ hi: Double = 1.0) -> Float {
        Float(max(lo, min(hi, x)))
    }

    private func playSoftFallback() {
        if #available(iOS 13.0, *) {
            UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        } else {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    @objc func tap(_ call: CAPPluginCall) {
        let intensity = clampF(call.getDouble("intensity") ?? 0.30)
        let sharpness = clampF(call.getDouble("sharpness") ?? 0.00)

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            if self.supportsHaptics {
                do {
                    try self.ensureEngine()
                    let intensityParam = CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity)
                    let sharpnessParam = CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
                    let event = CHHapticEvent(eventType: .hapticTransient,
                                              parameters: [intensityParam, sharpnessParam],
                                              relativeTime: 0)
                    let pattern = try CHHapticPattern(events: [event], parameters: [])
                    let player = try self.engine!.makePlayer(with: pattern)
                    try player.start(atTime: 0)
                    call.resolve()
                    return
                } catch { /* fall through */ }
            }
            self.playSoftFallback()
            call.resolve()
        }
    }

    // Sprint 87 — pre-start the CHHapticEngine so the FIRST haptic of
    // the session (splash-dismiss) doesn't lose energy to hardware
    // settling. CHHapticEngine.start() is synchronous per Apple docs
    // (blocks until the engine is running or throws), but Apple's
    // playback-timing guidance still recommends warming ahead of any
    // time-sensitive pattern — the LRA/Taptic hardware takes ~a few ms
    // to reach steady state after a cold start, and the first pattern
    // can be visibly (haptically) attenuated. splash-dismiss is
    // FIRST-of-session (BottomBar hasn't been tapped yet), so the
    // OverlayView calls warmup() at mount; by the time playDismiss()
    // fires ≥2.6 s later, the engine has fully settled and the ramp
    // plays at full amplitude.
    //
    // No-op if the device doesn't support Core Haptics. Never throws
    // to JS — failure is silent (a warmup that failed just means the
    // real playDismiss will play cold, which is still audible, just
    // slightly softer for that one first tap).
    @objc func warmup(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            guard self.supportsHaptics else { call.resolve(); return }
            do { try self.ensureEngine() } catch { /* silent */ }
            call.resolve()
        }
    }

    // Sprint 87 v3 — Kinopoisk-style dismissal choreography for the
    // splash overlay. ONE CHHapticContinuous event with parameter
    // curves, NOT a series of transients (v2 experiment reverted —
    // discrete taps read as separate pulses instead of one wave).
    //
    // Why continuous is safe at this duration + intensity envelope:
    //   • CHHapticContinuous max duration is 30 s (Apple API cap) —
    //     we're well under at 1.9 s.
    //   • No documented attenuation for reasonable durations at
    //     varying low-to-medium intensity. Real thermal throttling on
    //     the Taptic Engine only surfaces on many-second sustained
    //     MAX-intensity haptics; our average is ~0.25 and peak is
    //     0.55 for only ~140 ms.
    //   • LRA activation threshold is ~0.05-0.10 on some devices —
    //     the very first ~100 ms at 0.05 may read as silent on old
    //     Taptic gen 1 hardware (iPhone 7/8). That's the DESIRED
    //     "barely perceptible" start — the crescendo is what carries
    //     the effect. Modern iPhones (Taptic gen 2+, iPhone X/SE 2/
    //     newer) sustain the whole curve cleanly.
    //
    // Choreography (buildMs / decayMs from JS):
    //   • Build (buildMs, default 1200): intensity slowly rises
    //     0.05 → 0.55 with concave-up shape (slow start, accelerates
    //     into peak). Sharpness rises 0.20 → 0.55 linearly.
    //   • Peak (~140 ms of 700 ms = decayMs × 0.20): sustained 0.55/
    //     0.55 — coincides with visual fade+scale kickoff.
    //   • Decay (remaining ~80% of decayMs): intensity falls to 0
    //     with a concave-down shape; sharpness drifts 0.55 → 0.35.
    //
    // buildMs=0 skips the build entirely (short-runway case from JS —
    // see NativeSplashOverlay.tsx HAPTIC_MIN_BUILD_MS). The curve
    // starts already at peak, then decays.
    //
    // ADDITIVE — does not touch tap(). BottomBar's SoftHaptic.tap({
    // intensity: 0.30, sharpness: 0.00 }) call site is unchanged and
    // routes through the tap() @objc method above, which is byte-
    // identical to the v118.145 P6 preset.
    //
    // Fallback: on engine failure OR non-haptic devices, falls back to
    // UIImpactFeedbackGenerator(.soft) — degraded but audible; better
    // than silent hand-off.
    @objc func playDismiss(_ call: CAPPluginCall) {
        let buildMs = call.getDouble("buildMs") ?? 1200
        let decayMs = call.getDouble("decayMs") ?? 700
        let buildSec = max(0.0, buildMs / 1000.0)
        let decaySec = max(0.1, decayMs / 1000.0)
        let totalSec = buildSec + decaySec

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { call.resolve(); return }
            if self.supportsHaptics {
                do {
                    try self.ensureEngine()
                    // Base parameters set the event's anchor value;
                    // the parameter curves below actually modulate
                    // intensity/sharpness over the event's lifespan.
                    // Anchor at peak so curves never have to push
                    // BEYOND the base value.
                    let baseIntensity = CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.55)
                    let baseSharpness = CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.35)
                    let event = CHHapticEvent(
                        eventType: .hapticContinuous,
                        parameters: [baseIntensity, baseSharpness],
                        relativeTime: 0,
                        duration: totalSec
                    )
                    let intensityCurve = self.makeDismissIntensityCurve(buildSec: buildSec, decaySec: decaySec)
                    let sharpnessCurve = self.makeDismissSharpnessCurve(buildSec: buildSec, decaySec: decaySec)
                    let pattern = try CHHapticPattern(
                        events: [event],
                        parameterCurves: [intensityCurve, sharpnessCurve]
                    )
                    let player = try self.engine!.makePlayer(with: pattern)
                    try player.start(atTime: 0)
                    call.resolve()
                    return
                } catch { /* fall through */ }
            }
            self.playSoftFallback()
            call.resolve()
        }
    }

    // Sprint 87 v3 — intensity control-point envelope for playDismiss.
    // Build phase: concave-up rise (slow start, fast into peak) —
    // matches the "something is coming" feel. Decay phase: brief peak
    // sustain, then concave-down fall to 0.
    private func makeDismissIntensityCurve(buildSec: Double, decaySec: Double) -> CHHapticParameterCurve {
        var points: [CHHapticParameterCurve.ControlPoint] = []
        let totalSec = buildSec + decaySec
        if buildSec > 0 {
            // Concave-up build. Four points give a smooth quadratic-
            // ish rise across CHHapticParameterCurve's linear
            // interpolation between control points.
            points.append(.init(relativeTime: 0.0,             value: 0.05))
            points.append(.init(relativeTime: buildSec * 0.50, value: 0.15))
            points.append(.init(relativeTime: buildSec * 0.85, value: 0.35))
            points.append(.init(relativeTime: buildSec,        value: 0.55))
        } else {
            // Short-runway: start already at peak.
            points.append(.init(relativeTime: 0.0, value: 0.55))
        }
        // Peak sustain — 20 % of decayMs — the "arrival" moment.
        let peakSustainSec = decaySec * 0.20
        let sustainEnd = buildSec + peakSustainSec
        points.append(.init(relativeTime: sustainEnd, value: 0.55))
        // Concave-down decay to zero.
        let decayLen = totalSec - sustainEnd
        points.append(.init(relativeTime: sustainEnd + decayLen * 0.50, value: 0.25))
        points.append(.init(relativeTime: totalSec, value: 0.0))
        return CHHapticParameterCurve(
            parameterID: .hapticIntensityControl,
            controlPoints: points,
            relativeTime: 0
        )
    }

    // Sharpness envelope: warm/soft at the start (0.20), clarifies at
    // peak (0.55), settles slightly warmer toward the end (0.35).
    private func makeDismissSharpnessCurve(buildSec: Double, decaySec: Double) -> CHHapticParameterCurve {
        let totalSec = buildSec + decaySec
        var points: [CHHapticParameterCurve.ControlPoint] = []
        points.append(.init(relativeTime: 0.0, value: 0.20))
        if buildSec > 0 {
            points.append(.init(relativeTime: buildSec, value: 0.55))
        }
        points.append(.init(relativeTime: totalSec, value: 0.35))
        return CHHapticParameterCurve(
            parameterID: .hapticSharpnessControl,
            controlPoints: points,
            relativeTime: 0
        )
    }
}
