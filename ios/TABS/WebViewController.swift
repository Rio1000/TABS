import UIKit
import WebKit
import UserNotifications
import FirebaseCore
import GoogleSignIn
import StoreKit
import GoogleMobileAds
import UserMessagingPlatform
import AppTrackingTransparency
import AuthenticationServices
import CryptoKit
import Security

/// Full-screen wrapper around tabsonfriends.com.
///
/// The web view is pinned to the window edges (not the safe area), all
/// browser chrome is disabled, and the page's dark gradient is allowed to
/// paint under the status bar and home indicator so the app is
/// indistinguishable from a native App Store app.
final class WebViewController: UIViewController {

    private static let siteURL = URL(string: "https://tabsonfriends.com")!
    private static let siteHost = "tabsonfriends.com"
    /// This Firebase project's auth handler domain (`authDomain` in
    /// firebase-setup.js). The only non-TABS host allowed in the main frame.
    private static let firebaseAuthDomain = "tabs-4a0eb.firebaseapp.com"

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

    /// In-flight Sign in with Apple request. Only one runs at a time; the
    /// raw nonce must survive until Apple answers so the page can hand it to
    /// Firebase (which checks it against the hashed nonce in the ID token).
    private var appleAuthController: ASAuthorizationController?
    private var appleSignInPurpose = "signIn"
    private var appleRawNonce: String?

    /// Native "Can't reach TABS" screen shown when the main frame fails to
    /// load (created lazily the first time it's needed).
    private var offlineView: OfflineView?
    /// What the offline screen's Retry button loads: the URL that failed if it
    /// was on tabsonfriends.com, otherwise the home page.
    private var retryURL: URL?

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

    /// Handles messages the page posts through `window.ReactNativeWebView`:
    /// - `{type:"requestPushToken"}` — sent when a user logs in: ensure
    ///   permission, register with APNs, and forward the FCM token back.
    /// - `{type:"googleSignIn"}` — native Google sign-in.
    /// - `{type:"appleSignIn", purpose:"signIn"|"reauth"}` — native Sign in
    ///   with Apple (also used to re-authenticate before account deletion).
    /// - `{type:"purchaseCoffee"}` — StoreKit tip.
    /// - `{type:"adPrivacyStatus"}` — native answers with
    ///   `window.__onNativeAdPrivacy({required})` (see `publishAdPrivacyStatus`).
    /// - `{type:"adPrivacyOptions"}` — re-open Google's UMP consent form so
    ///   EEA/UK users can change or withdraw their ad consent.
    /// - `{type:"exportData", filename, json}` — Export Data: WKWebView can't
    ///   save blob downloads, so native writes the JSON to a temp file and opens
    ///   the share sheet (see `presentExportShareSheet`).
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
        case "appleSignIn":
            startAppleSignIn(purpose: dict["purpose"] as? String)
        case "purchaseCoffee":
            startCoffeePurchase()
        case "adPrivacyStatus":
            publishAdPrivacyStatus()
        case "adPrivacyOptions":
            presentAdPrivacyOptions()
        case "exportData":
            presentExportShareSheet(filename: dict["filename"] as? String,
                                    json: dict["json"] as? String)
        default:
            break
        }
    }

    /// True for https URLs on tabsonfriends.com (or a subdomain of it).
    private static func isOurSite(_ url: URL?) -> Bool {
        guard let url, url.scheme == "https" else { return false }
        return isOurHost(url.host)
    }

    private static func isOurHost(_ host: String?) -> Bool {
        guard let host = host?.lowercased() else { return false }
        return host == siteHost || host.hasSuffix("." + siteHost)
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

    // MARK: - Export Data (share sheet)

    /// Largest export we'll write to disk. A real account's export is a few
    /// hundred KB at most; anything bigger is ignored rather than buffered.
    private static let maxExportBytes = 10 * 1024 * 1024

    /// The browser's blob download doesn't work in WKWebView, so the page
    /// posts the export JSON here. Write it to a temp file and let the user
    /// save it to Files, AirDrop it, mail it, etc. The temp file is removed
    /// once the share sheet closes.
    private func presentExportShareSheet(filename rawFilename: String?, json: String?) {
        guard let json, let data = json.data(using: .utf8) else { return }
        guard data.count <= Self.maxExportBytes else {
            DispatchQueue.main.async {
                self.presentAlert(title: "Export Too Large",
                                  message: "Your TABS export is too large to save from the app. Please export from tabsonfriends.com in a browser instead.")
            }
            return
        }

        let filename = Self.sanitizedExportFilename(rawFilename)
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            DispatchQueue.main.async {
                self.presentAlert(title: "Export Failed",
                                  message: "TABS couldn't prepare your export file. Please try again.")
            }
            return
        }

        DispatchQueue.main.async {
            let activity = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
            activity.completionWithItemsHandler = { _, _, _, _ in
                try? FileManager.default.removeItem(at: fileURL)
            }
            // iPad presents the share sheet as a popover, which crashes
            // without an anchor. Center it on the screen.
            if let popover = activity.popoverPresentationController {
                popover.sourceView = self.view
                popover.sourceRect = CGRect(x: self.view.bounds.midX, y: self.view.bounds.midY,
                                            width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            // Don't stack on top of another alert/sheet; present from the
            // top-most presented controller.
            var presenter: UIViewController = self
            while let next = presenter.presentedViewController { presenter = next }
            presenter.present(activity, animated: true)
        }
    }

    /// Page-supplied filename reduced to a safe single path component that
    /// ends in `.json`. Falls back to `tabs-export.json`.
    private static func sanitizedExportFilename(_ raw: String?) -> String {
        let fallback = "tabs-export.json"
        guard let raw else { return fallback }
        var name = raw
            .components(separatedBy: CharacterSet(charactersIn: "/\\:"))
            .joined(separator: "-")
            .components(separatedBy: .controlCharacters)
            .joined()
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // No hidden files or ".." components.
        while name.hasPrefix(".") { name.removeFirst() }
        if name.count > 100 { name = String(name.suffix(100)) }
        guard !name.isEmpty else { return fallback }
        if !name.lowercased().hasSuffix(".json") { name += ".json" }
        return name
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
                self.publishAdPrivacyStatus()
                self.proceedPastConsent()
                return
            }

            ConsentForm.loadAndPresentIfRequired(from: self) { [weak self] formError in
                if let formError {
                    print("UMP consent form failed: \(formError.localizedDescription)")
                }
                self?.publishAdPrivacyStatus()
                self?.proceedPastConsent()
            }
        }
    }

    // MARK: - Ad privacy options (UMP)

    /// True when Google's UMP SDK says this user (EEA/UK under the GDPR
    /// message) must be offered an in-app way to change their consent.
    private var isAdPrivacyOptionsRequired: Bool {
        ConsentInformation.shared.privacyOptionsRequirementStatus == .required
    }

    /// Tells the page whether to show its "Ad privacy choices" menu item.
    /// Sets `window.__nativeAdPrivacyRequired` (so a page that loads later, or
    /// defines its callback later, can read it) and calls
    /// `window.__onNativeAdPrivacy({required})` if the page defined it.
    /// Called after the consent update, after the form closes, on every
    /// main-frame load, and when the page asks with `{type:"adPrivacyStatus"}`.
    private func publishAdPrivacyStatus() {
        let required = isAdPrivacyOptionsRequired
        let js = "window.__nativeAdPrivacyRequired = \(required);"
            + " window.__onNativeAdPrivacy && window.__onNativeAdPrivacy({required: \(required)});"
        DispatchQueue.main.async { [weak self] in
            guard let self, WebViewController.isOurSite(self.webView.url) else { return }
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    /// Re-presents Google's consent form (the "privacy options" form) so the
    /// user can change or withdraw ad consent as easily as they gave it.
    private func presentAdPrivacyOptions() {
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            ConsentForm.presentPrivacyOptionsForm(from: self) { [weak self] error in
                if let error {
                    print("UMP privacy options form failed: \(error.localizedDescription)")
                }
                DispatchQueue.main.async {
                    self?.reloadAdsAfterConsentChange()
                }
            }
        }
    }

    /// Applies a consent change made through the privacy options form:
    /// - consent now allows ads -> (re)load the banner so the new choice
    ///   (personalized or not) applies, including when no banner had ever
    ///   loaded because consent was previously denied;
    /// - consent no longer allows ads -> remove the banner immediately.
    private func reloadAdsAfterConsentChange() {
        publishAdPrivacyStatus()
        if ConsentInformation.shared.canRequestAds {
            proceedPastConsent()
        } else {
            bannerView?.isHidden = true
            bannerHeight = 0
            view.setNeedsLayout()
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

    // MARK: - Native Sign in with Apple

    /// Apple requires Sign in with Apple wherever another third-party login
    /// (Google) is offered (Guideline 4.8). We run it natively with
    /// AuthenticationServices and hand the ID token + raw nonce back to the
    /// page, which finishes with Firebase `signInWithCredential` (or
    /// `reauthenticateWithCredential` when `purpose` is "reauth", before
    /// revoking the Apple token during account deletion).
    ///
    /// Unlike Google, failures never show a native alert: they're reported to
    /// `window.__onNativeAppleError` so the page can toast and, for a reauth,
    /// abort the deletion.
    private func startAppleSignIn(purpose requestedPurpose: String?) {
        let purpose = requestedPurpose == "reauth" ? "reauth" : "signIn"

        // A request is already on screen; its result (delivered through the
        // same window callbacks) answers this one too. Starting a second one
        // would orphan the first request's nonce.
        guard appleAuthController == nil else { return }

        guard let rawNonce = Self.randomNonceString() else {
            forwardAppleErrorToWeb(purpose: purpose,
                                   cancelled: false,
                                   message: "Couldn't start Sign in with Apple. Please try again.")
            return
        }

        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256Hex(rawNonce)

        let controller = ASAuthorizationController(authorizationRequests: [request])
        controller.delegate = self
        controller.presentationContextProvider = self

        appleSignInPurpose = purpose
        appleRawNonce = rawNonce
        appleAuthController = controller
        controller.performRequests()
    }

    /// Clears the in-flight Apple request and returns what it was started with.
    private func finishAppleSignIn() -> (purpose: String, rawNonce: String?) {
        let state = (purpose: appleSignInPurpose, rawNonce: appleRawNonce)
        appleAuthController = nil
        appleRawNonce = nil
        appleSignInPurpose = "signIn"
        return state
    }

    /// Cryptographically random nonce from a 64-character URL-safe alphabet.
    /// 256 is a multiple of 64, so `byte % 64` has no modulo bias.
    private static func randomNonceString(length: Int = 32) -> String? {
        let charset = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_")
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { return nil }
        return String(bytes.map { charset[Int($0) % charset.count] })
    }

    /// Lowercase hex SHA-256 — the form Apple embeds in the ID token's
    /// `nonce` claim and Firebase recomputes from the raw nonce.
    private static func sha256Hex(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private func forwardAppleCredentialToWeb(_ payload: [String: Any]) {
        callWebCallback("__onNativeAppleCredential", payload: payload)
    }

    private func forwardAppleErrorToWeb(purpose: String, cancelled: Bool, message: String) {
        callWebCallback("__onNativeAppleError", payload: [
            "purpose": purpose,
            "cancelled": cancelled,
            "message": message,
        ])
    }

    /// Calls `window.<name>(payload)` on the main thread. The payload is
    /// JSON-encoded (so every value is safely escaped) and is only delivered
    /// while the web view is showing tabsonfriends.com — it can carry
    /// identity tokens that must never reach another site.
    private func callWebCallback(_ name: String, payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.\(name) && window.\(name)(\(json));"
        DispatchQueue.main.async { [weak self] in
            guard let self, WebViewController.isOurSite(self.webView.url) else { return }
            self.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    // MARK: - Offline screen

    /// Shown when the main frame can't load (no connection, DNS failure,
    /// timeout…), instead of leaving the user on a blank black screen.
    private func showOfflineScreen(failedURL: URL?) {
        retryURL = Self.isOurSite(failedURL) ? failedURL : Self.siteURL

        let overlay: OfflineView
        if let existing = offlineView {
            overlay = existing
        } else {
            overlay = OfflineView(frame: view.bounds)
            overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            overlay.onRetry = { [weak self] in self?.retryAfterOffline() }
            view.addSubview(overlay)
            offlineView = overlay
        }
        overlay.setRetrying(false)
        overlay.isHidden = false
        // Above the web view AND the AdMob banner.
        view.bringSubviewToFront(overlay)
        UIAccessibility.post(notification: .screenChanged, argument: overlay)
    }

    private func hideOfflineScreen() {
        guard let overlay = offlineView, !overlay.isHidden else { return }
        overlay.isHidden = true
        overlay.setRetrying(false)
        UIAccessibility.post(notification: .screenChanged, argument: webView)
    }

    private func retryAfterOffline() {
        offlineView?.setRetrying(true)
        webView.load(URLRequest(url: retryURL ?? Self.siteURL))
    }

    /// Main-frame load failure (provisional or after commit). Cancellations
    /// aren't real failures: -999 fires when a new load replaces the current
    /// one, and WebKit's 102 ("frame load interrupted") fires whenever
    /// `decidePolicyFor` cancels a navigation to hand a link to another app.
    private func handleMainFrameLoadFailure(_ error: Error) {
        let nsError = error as NSError
        let isCancelled = nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled
        let isWebKitInterruption = (nsError.domain == "WebKitErrorDomain" || nsError.domain == WKError.errorDomain)
            && (nsError.code == 102 || nsError.code == 204) // 204: media handled by a plug-in
        if isCancelled || isWebKitInterruption {
            // If a Retry was in flight, let the user tap it again.
            offlineView?.setRetrying(false)
            return
        }

        let failedURL = (nsError.userInfo[NSURLErrorFailingURLErrorKey] as? URL)
            ?? (nsError.userInfo[NSURLErrorFailingURLStringErrorKey] as? String).flatMap { URL(string: $0) }
        print("Main-frame load failed (\(nsError.domain) \(nsError.code)): \(nsError.localizedDescription)")
        showOfflineScreen(failedURL: failedURL ?? webView.url)
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
            // Message handlers are reachable from every frame, including the
            // third-party ad iframe. Only the tabsonfriends.com page itself
            // may start sign-in, purchases or push registration.
            guard message.frameInfo.isMainFrame,
                  Self.isOurHost(message.frameInfo.securityOrigin.host) else { return }
            handleBridgeMessage(message.body)
        default:
            break
        }
    }
}

// MARK: - WKNavigationDelegate

extension WebViewController: WKNavigationDelegate {

    /// Keep tabsonfriends.com inside the app; hand every other top-level
    /// page (Venmo, PayPal, Cash App, mail, SMS, the Google/Firebase policy
    /// pages linked from /privacy…) to the system so payment links keep
    /// working like the website AND the user can always get back to TABS.
    /// The web view has no back gesture or toolbar, so a foreign page loaded
    /// in the main frame would be a dead end.
    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        let host = url.host?.lowercased() ?? ""
        let isHTTP = url.scheme == "https" || url.scheme == "http"
        // Dot-boundary match: "eviltabsonfriends.com" is NOT our site.
        let isOurSite = Self.isOurHost(host)
        // Google and Apple sign-in both run natively (GoogleSignIn SDK /
        // AuthenticationServices), so no third-party OAuth page ever needs
        // the main frame. The only exception is this project's own Firebase
        // auth handler domain (exact match — not every *.firebaseapp.com
        // project). Firebase's hidden auth iframe is a sub-frame and is
        // covered by the !isMainFrame rule below.
        let isAuthDomain = host == Self.firebaseAuthDomain
        // Sub-frame loads (the embedded ad iframe, tracking pixels, etc.) must
        // render inside their frame. Only top-level navigations should ever be
        // handed off to Safari — otherwise the ad iframe's own load gets kicked
        // out to the system browser and "opens an ad" every time the app opens.
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

        if isHTTP && (isOurSite || isAuthDomain || !isMainFrame) {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
            UIApplication.shared.open(url)
        }
    }

    // WKNavigationDelegate only reports MAIN-frame navigations here (sub-frame
    // failures such as the ad iframe are not delivered), so any real error
    // means the app itself can't load.

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        handleMainFrameLoadFailure(error)
    }

    func webView(_ webView: WKWebView,
                 didFail navigation: WKNavigation!,
                 withError error: Error) {
        handleMainFrameLoadFailure(error)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        hideOfflineScreen()
        // A reload wipes window.__nativeAdPrivacyRequired; set it again.
        publishAdPrivacyStatus()
    }

    /// If iOS kills the web content process (memory pressure while in the
    /// background), the page goes blank; reload instead of showing nothing.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if webView.url == nil {
            webView.load(URLRequest(url: Self.siteURL))
        } else {
            webView.reload()
        }
    }
}

// MARK: - Sign in with Apple delegates

extension WebViewController: ASAuthorizationControllerDelegate {

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithAuthorization authorization: ASAuthorization) {
        let state = finishAppleSignIn()

        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let rawNonce = state.rawNonce,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            forwardAppleErrorToWeb(purpose: state.purpose,
                                   cancelled: false,
                                   message: "Apple didn't return an identity token. Please try again.")
            return
        }

        let authorizationCode = credential.authorizationCode
            .flatMap { String(data: $0, encoding: .utf8) } ?? ""

        // Apple only sends the name and email on the very first authorization
        // for this Apple ID + app; afterwards they're nil and we send "".
        let payload: [String: Any] = [
            "idToken": idToken,
            "rawNonce": rawNonce,
            "authorizationCode": authorizationCode,
            "givenName": credential.fullName?.givenName ?? "",
            "familyName": credential.fullName?.familyName ?? "",
            "email": credential.email ?? "",
            "purpose": state.purpose,
        ]
        forwardAppleCredentialToWeb(payload)
    }

    func authorizationController(controller: ASAuthorizationController,
                                 didCompleteWithError error: Error) {
        let state = finishAppleSignIn()
        let cancelled = (error as? ASAuthorizationError)?.code == .canceled
        forwardAppleErrorToWeb(purpose: state.purpose,
                               cancelled: cancelled,
                               message: cancelled
                                   ? "Sign in with Apple was cancelled."
                                   : error.localizedDescription)
    }
}

extension WebViewController: ASAuthorizationControllerPresentationContextProviding {

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        return view.window ?? ASPresentationAnchor()
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
            if Self.isOurSite(url) {
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

// MARK: - Offline screen view

/// Full-screen "Can't reach TABS" view. It covers the whole window (so the
/// AdMob banner never sits on top of it) and paints the site's dark gradient;
/// its content is laid out inside the safe area.
private final class OfflineView: UIView {

    override class var layerClass: AnyClass { CAGradientLayer.self }

    /// Called when the user taps Retry.
    var onRetry: (() -> Void)?

    private let retryButton = UIButton(type: .system)

    /// TABS brand green (#50c444).
    private static let brandGreen = UIColor(red: 0x50 / 255.0, green: 0xC4 / 255.0, blue: 0x44 / 255.0, alpha: 1)

    override init(frame: CGRect) {
        super.init(frame: frame)
        configure()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        configure()
    }

    private func configure() {
        backgroundColor = .black
        accessibilityViewIsModal = true

        // Same look as the site's body: linear-gradient(319deg, #000 0%, #3a7486 55%),
        // i.e. black at the bottom-right fading to teal toward the top-left.
        if let gradient = layer as? CAGradientLayer {
            gradient.colors = [
                UIColor.black.cgColor,
                UIColor(red: 58 / 255.0, green: 116 / 255.0, blue: 134 / 255.0, alpha: 1).cgColor,
            ]
            gradient.locations = [0, 0.55]
            gradient.startPoint = CGPoint(x: 1, y: 1)
            gradient.endPoint = CGPoint(x: 0, y: 0)
        }

        let icon = UIImageView(image: UIImage(systemName: "wifi.slash"))
        icon.tintColor = Self.brandGreen
        icon.preferredSymbolConfiguration = UIImage.SymbolConfiguration(pointSize: 44, weight: .semibold)
        icon.contentMode = .scaleAspectFit
        icon.isAccessibilityElement = false

        let titleLabel = UILabel()
        titleLabel.text = "Can't reach TABS"
        titleLabel.textColor = UIColor(white: 0.945, alpha: 1) // rgb(241,241,241), the site's text color
        titleLabel.font = UIFontMetrics(forTextStyle: .title2)
            .scaledFont(for: .systemFont(ofSize: 24, weight: .bold))
        titleLabel.adjustsFontForContentSizeCategory = true
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        titleLabel.accessibilityTraits = .header

        let messageLabel = UILabel()
        messageLabel.text = "Check your connection and try again."
        messageLabel.textColor = UIColor(white: 0.945, alpha: 0.75)
        messageLabel.font = UIFont.preferredFont(forTextStyle: .body)
        messageLabel.adjustsFontForContentSizeCategory = true
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        retryButton.addAction(UIAction { [weak self] _ in self?.onRetry?() }, for: .touchUpInside)
        setRetrying(false)

        let stack = UIStackView(arrangedSubviews: [icon, titleLabel, messageLabel, retryButton])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 12
        stack.setCustomSpacing(20, after: icon)
        stack.setCustomSpacing(28, after: messageLabel)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)

        let guide = safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: guide.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: guide.centerYAnchor),
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: guide.leadingAnchor, constant: 32),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: guide.trailingAnchor, constant: -32),
            stack.topAnchor.constraint(greaterThanOrEqualTo: guide.topAnchor, constant: 16),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: guide.bottomAnchor, constant: -16),
            retryButton.widthAnchor.constraint(greaterThanOrEqualToConstant: 180),
            retryButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 48),
        ])
    }

    /// Swap the button between "Retry" and a disabled "Retrying…" spinner.
    func setRetrying(_ retrying: Bool) {
        var config = UIButton.Configuration.filled()
        config.cornerStyle = .capsule
        config.baseBackgroundColor = Self.brandGreen
        config.baseForegroundColor = .black
        config.title = retrying ? "Retrying…" : "Retry"
        config.showsActivityIndicator = retrying
        config.imagePadding = 8
        config.contentInsets = NSDirectionalEdgeInsets(top: 12, leading: 28, bottom: 12, trailing: 28)
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var outgoing = incoming
            outgoing.font = UIFontMetrics(forTextStyle: .headline)
                .scaledFont(for: .systemFont(ofSize: 17, weight: .semibold))
            return outgoing
        }
        retryButton.configuration = config
        retryButton.isEnabled = !retrying
    }
}
