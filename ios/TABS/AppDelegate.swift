import UIKit
import UserNotifications
import FirebaseCore
import FirebaseMessaging
import GoogleMobileAds

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Only configure Firebase once GoogleService-Info.plist has been added
        // to the app bundle. Until then the app still runs (web push bridge is
        // simply inert), so the project builds before you drop the file in.
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            Messaging.messaging().delegate = self
        } else {
            print("GoogleService-Info.plist not found — Firebase push disabled. " +
                  "Add it to the TABS target to enable notifications.")
        }

        UNUserNotificationCenter.current().delegate = self

        // Start the Google Mobile Ads (AdMob) SDK. Safe to call before the ATT
        // prompt — ads simply stay non-personalized until the user allows
        // tracking. Requires GADApplicationIdentifier in Info.plist.
        MobileAds.shared.start(completionHandler: nil)

        return true
    }

    // MARK: UISceneSession Lifecycle

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        return UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
    }

    // MARK: Remote notification registration

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Hand the raw APNs token to FCM; it exchanges it for a registration
        // token and delivers that via the messaging delegate below.
        Messaging.messaging().apnsToken = deviceToken
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error.localizedDescription)")
    }
}

// MARK: - MessagingDelegate

extension AppDelegate: MessagingDelegate {

    // Fires whenever FCM issues (or refreshes) this device's registration
    // token. We stash it so the web bridge can store it under the signed-in
    // user; the Cloud Function delivers to it just like a web FCM token.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        PushTokenStore.shared.update(token: fcmToken)
    }
}

// MARK: - UNUserNotificationCenterDelegate

extension AppDelegate: UNUserNotificationCenterDelegate {

    // Show notifications as banners even while the app is in the foreground,
    // so the experience matches a native App Store app.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .badge, .sound])
    }
}
