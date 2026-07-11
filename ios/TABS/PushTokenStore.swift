import Foundation

/// Shared holder for the device's FCM registration token.
///
/// `AppDelegate` (the `MessagingDelegate`) writes the token here whenever FCM
/// issues or refreshes it. `WebViewController` observes it and injects it into
/// the web page via `window.__onNativePushToken`, which stores it under the
/// signed-in user — the same path the Expo shell and web push already use.
final class PushTokenStore {

    static let shared = PushTokenStore()

    private init() {}

    /// The most recent FCM token, if any has been issued yet.
    private(set) var token: String?

    /// Invoked on the main thread whenever a token becomes available or
    /// changes. Set by whoever needs to forward the token to the web page.
    var onToken: ((String) -> Void)?

    func update(token: String?) {
        DispatchQueue.main.async {
            self.token = token
            if let token = token {
                self.onToken?(token)
            }
        }
    }
}
