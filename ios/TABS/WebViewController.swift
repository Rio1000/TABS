import UIKit
import WebKit
import UserNotifications
import FirebaseCore
import GoogleSignIn
import StoreKit
import GoogleMobileAds
import UserMessagingPlatform
import AppTrackingTransparency

/// Full-screen wrapper around tabsonfriends.com.
///
/// The web view is pinned to the window edges (not the safe area), all
/// browser chrome is disabled, and the page's dark gradient is allowed to
/// paint under the status bar and home indicator so the app is
/// indistinguishable from a native App Store app.
final class WebViewController: UIViewController {

    private static let siteURL = URL(string: "https://tabsonfriends.com")!
    private static let siteHost = "tabsonfriends.com"

    /// Names of the script message handlers the injected JS posts to.
    private static let notificationHandler = "notificationToggle"
    private static let bridgeHandler = "nativeBridge"

    /// AdMob banner ad unit. This is Google's official **test** unit — it always
    /// fills so you can verify layout without a live account. Replace it with
    /// your real unit ID from the AdMob console before shipping.
    private static let bannerAdUnitID = "ca-app-pub-3940256099942544/2934735716"

    private var webView: WKWebView!

    /// Bottom-anchored AdMob banner (the native replacement for the old A-ADS
    /// in-list box). Created hidden and revealed only once an ad loads, so the
    /// web view uses the full screen whenever there's nothing to show.
    private var bannerView: BannerView!
    /// Height currently reserved for the banner (0 when hidden). Drives the
    /// web view's bottom inset in `viewWillLayoutSubviews`.
    private var bannerHeight: CGFloat = 0
    /// The consent → ATT → load-ad sequence runs once, the first time the app
    /// becomes visible.
    private var didStartAdFlow = false

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

        setupBannerAd()

        // Whenever FCM issues/refreshes a token, push it into the page so it
        // gets stored under the signed-in user (no-op if not logged in yet).
        PushTokenStore.shared.onToken = { [weak self] token in
            self?.forwardPushTokenToWeb(token)
        }

        webView.load(URLRequest(url: Self.siteURL))
    }

    override func viewWillLayoutSubviews() {
        super.viewWillLayoutSubviews()
        // Fill the screen edge-to-edge, but leave room at the bottom for the ad
        // banner (plus the home-indicator inset) whenever one is showing.
        var frame = view.bounds
        if bannerHeight > 0 {
            frame.size.height -= bannerHeight + view.safeAreaInsets.bottom
        }
        webView.frame = frame
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        gatherConsentThenLoadAd()
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
        contentController.add(self, name: Self.bridgeHandler)

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
    /// 4. Defines `window.ReactNativeWebView` so the site's existing native
    ///    push path activates: it posts `{type:"requestPushToken"}`, native
    ///    fetches the FCM token and calls `window.__onNativePushToken`.
    private static let bridgeScript = """
    (function () {
        function post(state) {
            try { window.webkit.messageHandlers.\(notificationHandler).postMessage(state); } catch (e) {}
        }

        // 4. Native push bridge. The site checks for window.ReactNativeWebView
        //    and, if present, asks it for the device push token instead of
        //    doing web push. Route that request to native code.
        if (!window.ReactNativeWebView) {
            window.ReactNativeWebView = {
                postMessage: function (msg) {
                    try { window.webkit.messageHandlers.\(bridgeHandler).postMessage(msg); } catch (e) {}
                }
            };
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

    // MARK: - Native push bridge

    /// Handles messages the page posts through `window.ReactNativeWebView`.
    /// Today the only one is `{ "type": "requestPushToken" }`, sent when a
    /// user logs in: ensure permission, register with APNs, and forward the
    /// FCM token back to the page.
    private func handleBridgeMessage(_ body: Any) {
        guard let json = body as? String,
              let data = json.data(using: .utf8),
              let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = dict["type"] as? String else { return }

        switch type {
        case "requestPushToken":
            requestPushToken()
        case "googleSignIn":
            startGoogleSignIn()
        case "purchaseCoffee":
            startCoffeePurchase()
        default:
            break
        }
    }

    // MARK: - In-App Purchase ("Buy us a coffee" support)

    /// Apple requires digital tips/donations from a for-profit app to go
    /// through In-App Purchase, not an external link (Guideline 3.1.1). On the
    /// web the button still opens Buy Me a Coffee; inside the app the page posts
    /// `{type:"purchaseCoffee"}` and we run the StoreKit flow instead.
    private func startCoffeePurchase() {
        Task {
            let result = await CoffeeStore.shared.buyCoffee()
            guard !result.title.isEmpty else { return } // user cancelled: no alert
            await MainActor.run {
                self.presentAlert(title: result.title, message: result.message)
            }
        }
    }

    // MARK: - AdMob banner

    /// Build the banner and pin it to the bottom safe area. It stays hidden
    /// until an ad actually loads (see the delegate), so the layout only
    /// reserves space when there's something to show.
    private func setupBannerAd() {
        let banner = BannerView()
        banner.adUnitID = Self.bannerAdUnitID
        banner.rootViewController = self
        banner.delegate = self
        banner.isHidden = true
        banner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(banner)
        NSLayoutConstraint.activate([
            banner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            banner.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
        ])
        bannerView = banner
    }

    /// Gates ad loading behind GDPR consent (Google's UMP SDK), THEN App
    /// Tracking Transparency, THEN the actual ad request — in that order,
    /// per Google's guidance. UMP decides whether an EEA/UK user needs to see
    /// a consent form at all (geo-targeted server-side, same message you
    /// configure once in AdMob console → Privacy & messaging → GDPR); users
    /// outside scope sail through with no form. `canRequestAds` is the single
    /// source of truth for whether we're allowed to load anything afterward —
    /// it covers "consent required and given", "consent required and denied
    /// but a non-personalized ad is still allowed under the chosen message",
    /// and "consent not required at all" in one check.
    private func gatherConsentThenLoadAd() {
        guard !didStartAdFlow else { return }
        didStartAdFlow = true

        let parameters = RequestParameters()
        // Uncomment while testing outside the EEA to force the form to appear:
        // let debugSettings = DebugSettings()
        // debugSettings.geography = .EEA
        // debugSettings.testDeviceIdentifiers = ["YOUR_TEST_DEVICE_ID"]
        // parameters.debugSettings = debugSettings

        ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { [weak self] error in
            guard let self else { return }
            if let error {
                // Couldn't refresh consent state (e.g. offline). Fall back to
                // whatever was already stored from a previous session — if
                // nothing was ever stored, canRequestAds is false and no ad
                // loads, which is the safe default.
                print("UMP consent info update failed: \(error.localizedDescription)")
                self.proceedPastConsent()
                return
            }

            ConsentForm.loadAndPresentIfRequired(from: self) { [weak self] formError in
                if let formError {
                    print("UMP consent form failed: \(formError.localizedDescription)")
                }
                self?.proceedPastConsent()
            }
        }
    }

    /// Runs after the UMP consent step has resolved (form shown & answered,
    /// or not required for this user). Requests ATT, then loads the banner
    /// only if consent state actually permits an ad request.
    private func proceedPastConsent() {
        guard ConsentInformation.shared.canRequestAds else { return }

        if #available(iOS 14, *) {
            ATTrackingManager.requestTrackingAuthorization { [weak self] _ in
                DispatchQueue.main.async { self?.loadBannerAd() }
            }
        } else {
            loadBannerAd()
        }
    }

    /// Size the banner to the available width (adaptive) and request an ad.
    private func loadBannerAd() {
        guard let bannerView else { return }
        let safeWidth = view.bounds.inset(by: view.safeAreaInsets).width
        let width = safeWidth > 0 ? safeWidth : view.bounds.width
        bannerView.adSize = currentOrientationAnchoredAdaptiveBanner(width: width)
        bannerView.load(Request())
    }

    // MARK: - Native Google Sign-In

    /// Google blocks OAuth inside embedded web views, so we run sign-in through
    /// the GoogleSignIn SDK (which uses an ASWebAuthenticationSession — a system
    /// browser Google allows), then hand the resulting ID token back to the page
    /// to complete Firebase sign-in via `signInWithCredential`.
    private func startGoogleSignIn() {
        guard let clientID = FirebaseApp.app()?.options.clientID else {
            presentAlert(
                title: "Google Sign-In Unavailable",
                message: "GoogleService-Info.plist is missing, so Google sign-in can't run. Add it to the app to enable it.")
            return
        }

        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        GIDSignIn.sharedInstance.signIn(withPresenting: self) { [weak self] result, error in
            guard let self else { return }

            if let error = error {
                // User-cancelled is not worth an alert; anything else we surface.
                if (error as? GIDSignInError)?.code == .canceled {
                    return
                }
                self.presentAlert(title: "Google Sign-In Failed",
                                  message: error.localizedDescription)
                return
            }

            guard let idToken = result?.user.idToken?.tokenString else {
                self.presentAlert(title: "Google Sign-In Failed",
                                  message: "No identity token was returned. Please try again.")
                return
            }
            let accessToken = result?.user.accessToken.tokenString

            self.forwardGoogleCredentialToWeb(idToken: idToken, accessToken: accessToken)
        }
    }

    /// Inject the Google credential into the page so it can finish the Firebase
    /// sign-in with `signInWithCredential`.
    private func forwardGoogleCredentialToWeb(idToken: String, accessToken: String?) {
        // JSON-encode both values so they're safely escaped inside the JS call.
        let payload: [String: Any] = [
            "idToken": idToken,
            "accessToken": accessToken ?? "",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = """
        (function () {
            var c = \(json);
            if (window.__onNativeGoogleCredential) {
                window.__onNativeGoogleCredential(c.idToken, c.accessToken || null);
            }
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    /// Make sure the app is authorized and registered for remote
    /// notifications, then forward whatever FCM token we have (now or once it
    /// arrives via `PushTokenStore.onToken`).
    private func requestPushToken() {
        UNUserNotificationCenter.current().getNotificationSettings { [weak self] settings in
            DispatchQueue.main.async {
                guard let self else { return }
                switch settings.authorizationStatus {
                case .authorized, .provisional, .ephemeral:
                    UIApplication.shared.registerForRemoteNotifications()
                    if let token = PushTokenStore.shared.token {
                        self.forwardPushTokenToWeb(token)
                    }
                case .notDetermined:
                    UNUserNotificationCenter.current()
                        .requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
                            guard granted else { return }
                            DispatchQueue.main.async {
                                UIApplication.shared.registerForRemoteNotifications()
                            }
                        }
                case .denied:
                    break // Nothing to register; user must enable in Settings.
                @unknown default:
                    break
                }
            }
        }
    }

    /// Inject the FCM token into the page. The site stores it under the
    /// signed-in user (and no-ops if nobody is logged in yet), exactly like
    /// the web and Expo push paths.
    private func forwardPushTokenToWeb(_ token: String) {
        // JSON-encode the token so it's safely escaped inside the JS string.
        guard let encoded = try? JSONSerialization.data(withJSONObject: [token]),
              let jsArray = String(data: encoded, encoding: .utf8) else { return }
        let js = "window.__onNativePushToken && window.__onNativePushToken(\(jsArray)[0], 'ios');"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

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
        switch message.name {
        case Self.notificationHandler:
            if let state = message.body as? String {
                handleToggle(state: state)
            }
        case Self.bridgeHandler:
            handleBridgeMessage(message.body)
        default:
            break
        }
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
        // Sub-frame loads (the embedded ad iframe, tracking pixels, etc.) must
        // render inside their frame. Only top-level navigations should ever be
        // handed off to Safari — otherwise the ad iframe's own load gets kicked
        // out to the system browser and "opens an ad" every time the app opens.
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

        if isHTTP && (isOurSite || isAuthFlow || !isMainFrame) {
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

// MARK: - BannerViewDelegate

extension WebViewController: BannerViewDelegate {

    /// Ad loaded: show the banner and reserve its height so the web view no
    /// longer sits underneath it.
    func bannerViewDidReceiveAd(_ bannerView: BannerView) {
        bannerView.isHidden = false
        bannerHeight = bannerView.adSize.size.height
        view.setNeedsLayout()
    }

    /// No fill (or an error): keep the banner hidden and give the space back to
    /// the web view.
    func bannerView(_ bannerView: BannerView, didFailToReceiveAdWithError error: Error) {
        bannerView.isHidden = true
        bannerHeight = 0
        view.setNeedsLayout()
    }
}

// MARK: - StoreKit tip jar

/// Thin StoreKit 2 wrapper for the "Buy us a coffee" support purchase.
///
/// The coffee is a **consumable** IAP (users can tip more than once). Its
/// product identifier must be created in App Store Connect exactly as
/// `Self.productID` — under In-App Purchases, type "Consumable" — otherwise
/// `Product.products(for:)` returns nothing and the user sees the
/// "not available" alert.
final class CoffeeStore {

    static let shared = CoffeeStore()

    /// Must match the product ID configured in App Store Connect.
    static let productID = "com.tabsonfriends.app.coffee"

    /// Runs the full purchase flow and returns a user-facing alert to show.
    /// An empty `title` means "show nothing" (user cancelled).
    func buyCoffee() async -> (title: String, message: String) {
        do {
            let products = try await Product.products(for: [Self.productID])
            guard let coffee = products.first else {
                return ("Support Unavailable",
                        "The in-app support option isn't ready yet. Please try again later.")
            }

            switch try await coffee.purchase() {
            case .success(let verification):
                switch verification {
                case .verified(let transaction):
                    // Consumable: nothing to unlock, so just finish the txn.
                    await transaction.finish()
                    return ("Thank You! ☕️",
                            "Your support helps keep TABS running and free for everyone.")
                case .unverified:
                    return ("Couldn't Verify Purchase",
                            "We couldn't verify that purchase, so you haven't been charged.")
                }
            case .userCancelled:
                return ("", "")
            case .pending:
                return ("Purchase Pending",
                        "Your purchase needs approval and will complete once it's confirmed.")
            @unknown default:
                return ("", "")
            }
        } catch {
            return ("Purchase Failed", error.localizedDescription)
        }
    }
}
