// v118.114 — Custom CAPBridgeViewController subclass that takes
// explicit control of the WKWebView's scrollView. Previously this
// file was referenced by a v118.20 code comment in
// pages/chat/ResidentChatView.tsx as the "primary fix" for the back-
// swipe bug, but the file never actually existed — only the CSS
// belt-and-suspenders were in place. The recurring resident-chat
// "scroll-up dead at the bottom edge" bug (v254 → v257 attempts)
// turns out to be a WKWebView-level issue, so we finally need this
// file.
//
// WHY EACH CONFIG:
//   • webView.scrollView.bounces = true
//       Should be the default, but Apple has changed it across iOS
//       versions and Capacitor doesn't expose a config flag for it.
//       Forcing it ON guarantees the rubber-band slack at scroll
//       edges that keeps the gesture recogniser alive — without it,
//       a settled scroller at scrollTop=max stops accepting the
//       next opposite-direction touch (the exact symptom users
//       reported on resident chat).
//   • webView.scrollView.alwaysBounceVertical = true
//       Stronger guarantee — bounces both ways even when content
//       fits in the viewport. Belt-and-suspenders for the dead-
//       edge.
//   • webView.scrollView.bouncesZoom = false
//       Pinch-zoom is already disabled at the meta/viewport level;
//       killing the zoom bounce too removes the only other gesture
//       that could compete with the inner scrollers for touches.
//   • webView.allowsBackForwardNavigationGestures = false
//       Disables WebKit's edge-swipe back/forward gesture, which
//       on the chat screen was hijacking horizontal swipes near
//       the left edge and occasionally interfering with vertical
//       pan recognition near edges. CSS rules in ResidentChatView
//       (touchAction pan-y, overscroll-behavior-x none) were
//       belt-and-suspenders for this — this is the actual fix.
//   • webView.scrollView.contentInsetAdjustmentBehavior = .never
//       Mirrors `contentInset: 'never'` in capacitor.config.ts.
//       Stops iOS from auto-inflating the page with status-bar /
//       home-indicator padding (we handle safe-area in CSS via
//       env() everywhere). Keeping it explicit at the Swift layer
//       avoids any future Capacitor default change.
//   • Inner-scroller hint via panGestureRecognizer.cancelsTouchesInView:
//       Capacitor doesn't expose this either — we set it false on
//       the outer scrollView so that the outer scrollView's gesture
//       NEVER eats touches that should reach the inner DOM
//       scrollers. Combined with the page's overflow:hidden body,
//       the outer scrollView has nothing to scroll, but it still
//       hosts the pan gesture recogniser — letting touches pass
//       through preserves the inner scrollers' momentum.

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {

    // v118.144 — REGISTER in-app Capacitor plugins here.
    // Capacitor 8 only auto-discovers plugins that come from SwiftPM /
    // CocoaPods packages. For a plugin class defined directly in the App
    // target (like SoftHaptic), the metadata on CAPBridgedPlugin is NOT
    // enough — the bridge never scans the App target's classes, so JS
    // calls to it would reject with "plugin not implemented on ios".
    // capacitorDidLoad() is the documented hook for manually registering
    // in-app plugin instances, fired after the bridge is up but before
    // the webview loads.
    // Docs: https://capacitorjs.com/docs/main/plugins/ios#register-the-plugin-with-capacitor
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SoftHapticPlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        // Defensive scrollView config — see file header for the
        // reasoning behind each line.
        if let webView = self.webView {
            let sv = webView.scrollView
            sv.bounces = true
            sv.alwaysBounceVertical = true
            sv.bouncesZoom = false
            sv.contentInsetAdjustmentBehavior = .never
            sv.panGestureRecognizer.cancelsTouchesInView = false

            webView.allowsBackForwardNavigationGestures = false
        }
    }
}
