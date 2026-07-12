import UIKit
import GoogleSignIn

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene,
               willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)
        window.backgroundColor = .black
        window.rootViewController = WebViewController()
        self.window = window
        window.makeKeyAndVisible()

        // Handle a Google Sign-In callback if the app was launched by one.
        if let url = connectionOptions.urlContexts.first?.url {
            GIDSignIn.sharedInstance.handle(url)
        }
    }

    // Route Google Sign-In's OAuth callback URL back into the SDK.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        GIDSignIn.sharedInstance.handle(url)
    }
}
