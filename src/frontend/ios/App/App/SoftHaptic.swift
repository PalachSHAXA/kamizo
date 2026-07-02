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
}
