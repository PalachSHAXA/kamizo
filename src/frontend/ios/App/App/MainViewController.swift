// Custom CAPBridgeViewController subclass — explicit control of
// WKWebView's outer scrollView.
//
// WHY EACH CONFIG:
//   • webView.scrollView.bounces = false
//   • webView.scrollView.alwaysBounceVertical = false
//   • webView.scrollView.alwaysBounceHorizontal = false
//       2026-09-25 — checkout-sheet drag bug. Пользователь на iPhone
//       16 Pro Max сообщил: fixed-модалка «Оформление» двигается
//       пальцем в любом месте. Web-слой (touch-action: none,
//       overscroll-behavior: contain, body-scroll-lock) не помог —
//       WKWebView's native UIScrollView всё равно ловит touch и
//       делает rubber-band, двигая всю viewport-плоскость (включая
//       fixed-элементы) вверх/вниз. Единственное надёжное решение —
//       глобально отключить native bounce на outer scrollView.
//       Скролл ленты, PullToRefresh и inner overflow:auto scrollers
//       работают самостоятельно и в native bounce не нуждаются;
//       Android эквивалент — `overScrollMode: 'never'` в
//       capacitor.config.ts (уже включён).
//   • webView.scrollView.bouncesZoom = false
//       Pinch-zoom и так отключён на meta/viewport level; убираем
//       zoom bounce, чтобы никакой gesture не конкурировал с inner-
//       scrollers за touches.
//   • webView.allowsBackForwardNavigationGestures = false
//       Отключает WebKit's edge-swipe back/forward — раньше он
//       конфликтовал с горизонтальными свайпами по чату у левого
//       края.
//   • webView.scrollView.contentInsetAdjustmentBehavior = .never
//       Дублирует `contentInset: 'never'` из capacitor.config.ts.
//       Останавливает iOS auto-inflating page с status-bar /
//       home-indicator padding (safe-area держим в CSS через env()).
//   • panGestureRecognizer.cancelsTouchesInView = false
//       Outer pan-gesture не съедает touches, которые должны дойти
//       до inner DOM scrollers.

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
            // Global bounce OFF — fixes fixed-modal drag bug on
            // iPhone 16 Pro Max (WKWebView rubber-band moved the
            // whole viewport including fixed elements).
            sv.bounces = false
            sv.alwaysBounceVertical = false
            sv.alwaysBounceHorizontal = false
            sv.bouncesZoom = false
            sv.contentInsetAdjustmentBehavior = .never
            sv.panGestureRecognizer.cancelsTouchesInView = false

            webView.allowsBackForwardNavigationGestures = false
        }
    }
}
