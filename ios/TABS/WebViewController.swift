import UIKit
import WebKit
import UserNotifications

/// Full-screen wrapper around tabsonfriends.com.
///
/// The web view is pinned to the window edges (not the safe area), all
/// browser chrome is disabled, and the page's dark gradient is allowed to
/// paint under the status bar and home indicator so the app is
/// indistinguishable from a native App Store app.
final class WebViewController: UIViewController {

    private static let siteURL = URL(string: "https://tabsonfriends.com")!
    private static let siteHost = "tabsonfriends.com"

    /// Name of the script message handler the injected JS posts to.
    private static let notificationHandler = "notificationToggle"

    private var webView: WKWebView!

    // MARK: - Status bar

    // The web page draws behind the status bar; keep the bar's icons light
    // so they stay legible on the site's dark gradient.
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    // MARK: - Lifecycle

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        webView = makeWebView()
        view.addSubview(webView)

        webView.load(URLRequest(url: Self.siteURL))
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        // Fill the entire screen, ignoring the safe area, so the site's
        // background reaches the very edges of the display.
        webView.frame = view.bounds
    }

    // MARK: - Web view construction

    private func makeWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        // Appends to the default user-agent so the site can detect the native
        // app and switch Google sign-in from popup to redirect (popups are
        // blocked inside a WKWebView).
        configuration.applicationNameForUserAgent = "TABSApp/1.0"

        let contentController = WKUserContentController()
        contentController.add(self, name: Self.notificationHandler)

        // Injected before anything on the page runs.
        let script = WKUserScript(source: Self.bridgeScript,
                                  injectionTime: .atDocumentStart,
                                  forMainFrameOnly: true)
        contentController.addUserScript(script)
        configuration.userContentController = contentController

        let webView = WKWebView(frame: view.bounds, configuration: configuration)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.navigationDelegate = self
        webView.uiDelegate = self

        // --- Kill every piece of browser chrome ---------------------------
        webView.allowsLinkPreview = false               // no long-press link preview sheet
        webView.allowsBackForwardNavigationGestures = false // no edge-swipe browser navigation
        webView.scrollView.contentInsetAdjustmentBehavior = .never // no automatic safe-area insets
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        webView.scrollView.bounces = false              // no rubber-banding; feels native
        webView.isOpaque = false
        webView.backgroundColor = .black                // no white flash while loading
        webView.scrollView.backgroundColor = .black

        if #available(iOS 16.4, *) {
            webView.isInspectable = true // Safari Web Inspector during development
        }

        return webView
    }

    // MARK: - Injected JavaScript

    /// 1. Rewrites the viewport meta tag with `viewport-fit=cover` so the
    ///    page background extends into the notch / home-indicator areas.
    /// 2. Routes the site's `Notification.requestPermission()` calls to the
    ///    native prompt instead of the (unsupported) web prompt.
    /// 3. Watches the "Enable notifications" switch (`#notifEnabledToggle`)
    ///    and notifies native code EVERY time it is flipped on or off, so
    ///    the user is re-prompted each time.
    private static let bridgeScript = """
    (function () {
        function post(state) {
            try { window.webkit.messageHandlers.\(notificationHandler).postMessage(state); } catch (e) {}
        }

        // 1. Full-bleed viewport.
        function coverViewport() {
            var meta = document.querySelector('meta[name="viewport"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.name = 'viewport';
                (document.head || document.documentElement).appendChild(meta);
            }
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
        }

        // 2. Route web notification permission requests to native.
        if (window.Notification) {
            Notification.requestPermission = function (callback) {
                post('request');
                var result = Promise.resolve('granted');
                if (typeof callback === 'function') { result.then(callback); }
                return result;
            };
        }

        // 3. Re-prompt on every flip of the enable-notifications switch.
        function hookToggle() {
            var toggle = document.getElementById('notifEnabledToggle');
            if (!toggle || toggle.dataset.nativeHooked) { return; }
            toggle.dataset.nativeHooked = '1';
            toggle.addEventListener('change', function () {
                post(toggle.checked ? 'on' : 'off');
            });
        }

        function init() {
            coverViewport();
            hookToggle();
        }

        new MutationObserver(hookToggle)
            .observe(document.documentElement, { childList: true, subtree: true });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    })();
    """

    // MARK: - Notification prompting

    /// Called every time the user flips the switch (or the site itself asks
    /// for permission). iOS only ever shows the system permission dialog
    /// once per install, so after that first time we show our own alert on
    /// every flip — confirming state and deep-linking to Settings — which is
    /// as close to "re-prompt every time" as the platform allows.
    private func handleToggle(state: String) {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { return }
                switch state {
                case "off":
                    self.confirmDisabled(settings: settings)
                default: // "on" or "request"
                    self.promptForNotifications(settings: settings)
                }
            }
        }
    }

    private func promptForNotifications(settings: UNNotificationSettings) {
        switch settings.authorizationStatus {
        case .notDetermined:
            // First time ever: the real iOS system prompt.
            UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                    DispatchQueue.main.async {
                        if granted {
                            UIApplication.shared.registerForRemoteNotifications()
                            self.presentAlert(title: "Notifications On",
                                              message: "You're all set — TABS will send you notifications.")
                        } else {
                            self.presentSettingsAlert(
                                title: "Notifications Are Off",
                                message: "You declined notifications, so TABS can't send them. You can turn them on any time in Settings.")
                        }
                    }
                }

        case .denied:
            // System prompt can't be shown again; re-prompt with our own
            // alert every single time the switch is flipped on.
            presentSettingsAlert(
                title: "Turn On Notifications",
                message: "Notifications for TABS are currently turned off in iOS Settings, so none are being sent. Open Settings to allow them.")

        case .authorized, .provisional, .ephemeral:
            UIApplication.shared.registerForRemoteNotifications()
            presentAlert(title: "Notifications On",
                         message: "Notifications are enabled — TABS will keep sending them.")

        @unknown default:
            break
        }
    }

    private func confirmDisabled(settings: UNNotificationSettings) {
        if settings.authorizationStatus == .authorized {
            presentSettingsAlert(
                title: "Notifications Turned Off",
                message: "You've turned off TABS notifications in the app. iOS may still allow them — open Settings if you also want to turn them off at the system level.")
        } else {
            presentAlert(title: "Notifications Off",
                         message: "TABS won't send you notifications.")
        }
    }

    // MARK: - Alert helpers

    private func presentAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }

    private func presentSettingsAlert(title: String, message: String) {
        let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Open Settings", style: .default) { _ in
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
        })
        alert.addAction(UIAlertAction(title: "Not Now", style: .cancel))
        present(alert, animated: true)
    }
}

// MARK: - WKScriptMessageHandler

extension WebViewController: WKScriptMessageHandler {

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.notificationHandler,
              let state = message.body as? String else { return }
        handleToggle(state: state)
    }
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    /// Keep tabsonfriends.com inside the app; hand everything else
    /// (Venmo, PayPal, Cash App, mail, SMS, OAuth pop-outs…) to the system
    /// so payment links and reminders keep working exactly like the website.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let host = url.host ?? ""
        let isHTTP = url.scheme == "https" || url.scheme == "http"
        let isOurSite = host.hasSuffix(Self.siteHost)
        // Google/Firebase auth flows must stay in the web view to complete.
        let isAuthFlow = host.contains("google") || host.contains("firebaseapp.com") || host.contains("gstatic")

        if isHTTP && (isOurSite || isAuthFlow) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - WKUIDelegate

extension WebViewController: WKUIDelegate {

    /// The site opens some links with target="_blank"; without tabs, load
    /// them in the same web view (or externally) instead of dropping them.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            if url.host?.hasSuffix(Self.siteHost) ?? false {
                webView.load(navigationAction.request)
            } else {
                UIApplication.shared.open(url)
            }
        }
        return nil
    }

    /// Native alert() support so site dialogs look like app dialogs.
    func webView(_ webView: WKWebView,
                 runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    /// Native confirm() support.
    func webView(_ webView: WKWebView,
                 runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
}
