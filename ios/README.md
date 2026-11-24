# TABS iOS App (WebView Wrapper)

A native Swift iOS app that wraps **https://tabsonfriends.com** in a
full-screen `WKWebView`, so the site looks and feels identical to a native
App Store app.

## What it does

- **Full-screen, edge-to-edge web view.** The web view is pinned to the
  window edges (not the safe area), `viewport-fit=cover` is injected, and
  the launch screen is solid black — the site's dark gradient fills the
  entire display, including behind the status bar and home indicator, with
  no white flash on launch.
- **Zero browser chrome.** No toolbars, no address bar, no link previews,
  no edge-swipe back/forward gestures, no scroll indicators, no
  rubber-band bounce, no pinch-to-zoom. There is nothing on screen except
  the site.
- **Native dialogs.** JavaScript `alert()` / `confirm()` render as native
  iOS alerts.
- **External links stay functional.** Venmo / PayPal / Cash App links,
  `mailto:`, and `sms:` open in the appropriate system app. Only
  tabsonfriends.com (exact host or a real subdomain, so lookalikes such as
  `eviltabsonfriends.com` don't count) and this project's Firebase auth domain
  (`tabs-4a0eb.firebaseapp.com`) load in the app's main frame. Every other
  page, including the Google/Firebase policy pages linked from `/privacy`,
  opens in Safari. The app view has no back button, so this is how users
  always get back to TABS. Sub-frames such as the ad iframe still load in
  place.
- **Ad privacy choices (UMP).** Google's consent form is shown on first
  launch where required (EEA/UK). For those users the page can show an
  "Ad privacy choices" menu item that reopens the form at any time. Native
  side: native sets `window.__nativeAdPrivacyRequired` (true/false) after every
  page load and calls `window.__onNativeAdPrivacy({required})` if the page
  defined it. The page can also ask with `{type:"adPrivacyStatus"}`. Posting
  `{type:"adPrivacyOptions"}` opens the form. When the form closes, the banner
  reloads if ads are allowed, or is removed if they no longer are.
- **Export Data via the share sheet.** WKWebView can't save the website's
  blob download, so in the app the page posts
  `{type:"exportData", filename, json}`. Native writes the JSON (max ~10 MB)
  to a temp file, opens the iOS share sheet so the user can save it to Files
  or send it, and deletes the temp file when the sheet closes.
- **Native Google Sign-In.** Google blocks OAuth inside embedded web views
  (`disallowed_useragent`), so the app signs in with the GoogleSignIn SDK
  through a system browser and hands the credential to the page to finish the
  Firebase login. See *Google Sign-In setup* below.
- **Native Sign in with Apple.** Required by App Review Guideline 4.8 because
  Google login is offered. Runs through AuthenticationServices and hands the
  Apple ID token to the page. See *Sign in with Apple setup* below.
- **Offline screen.** If the site can't load (no connection, DNS failure,
  timeout) the app shows a native "Can't reach TABS" screen with a **Retry**
  button instead of a blank screen. It covers the ad banner and hides again
  as soon as a page finishes loading.
- **Locked-down bridge.** Native bridge messages (sign-in, purchases, push
  registration) are only accepted from the tabsonfriends.com main frame, never
  from the ad iframe, and identity tokens are only injected while the web view
  is showing tabsonfriends.com.
- **Notification toggle re-prompts every time.** The app watches the site's
  "Enable notifications" switch (`#notifEnabledToggle`). Every single flip
  triggers a native prompt:
  - First flip ever → the real iOS system permission dialog.
  - Flipped **on** while permission is denied → an alert (every time) with
    an **Open Settings** button, since iOS notifications are actually off.
  - Flipped **on** while permission is granted → a confirmation alert that
    notifications are being sent.
  - Flipped **off** → an alert confirming the change, with an option to
    also disable notifications at the iOS level in Settings.

  > iOS platform limitation: Apple only ever shows the *system* permission
  > dialog once per install. After that, apps cannot trigger it again — the
  > native alerts + Settings deep link above are the standard (and only)
  > way to "re-prompt", and it's what every major app does.

## Building & running

1. Open `ios/TABS.xcodeproj` in Xcode (15 or newer) on a Mac.
2. **Add the Swift packages** (see below). The committed project has **no
   Swift package references**, so it will not compile until you do this.
3. Select the **TABS** scheme and a simulator or your device.
4. In *Signing & Capabilities*, pick your **paid** Apple Developer team (bundle
   id is `com.tabsonfriends.app`). The target now signs with
   `TABS/TABS.entitlements` (Push Notifications + Sign in with Apple), which
   free / personal teams cannot sign.
5. Run (⌘R).

### Swift packages (one-time, then commit)

The project file intentionally ships without package references (hand-edited
`.pbxproj` package links break with *"Missing package product"*). Add them in
Xcode with **File → Add Package Dependencies…**, adding each product to the
**TABS** target:

| Package URL | Products |
| --- | --- |
| `https://github.com/firebase/firebase-ios-sdk.git` | **FirebaseCore**, **FirebaseMessaging** |
| `https://github.com/google/GoogleSignIn-iOS` | **GoogleSignIn** |
| `https://github.com/googleads/swift-package-manager-google-mobile-ads.git` | **GoogleMobileAds** (v12+; the code uses the `BannerView` / `MobileAds.shared` names) |
| `https://github.com/googleads/swift-package-manager-google-user-messaging-platform.git` | **UserMessagingPlatform** (v3+; add it explicitly if Google Mobile Ads didn't pull it in) |

AuthenticationServices, CryptoKit, StoreKit, WebKit and AppTrackingTransparency
are system frameworks and need nothing extra.

**Then commit** the updated `ios/TABS.xcodeproj/project.pbxproj` and
`ios/TABS.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved`
so the next checkout (and any CI or Xcode Cloud build) resolves the same
versions instead of starting from a project that can't compile.

## Google Sign-In setup

Google refuses OAuth inside embedded web views, so Google login is handled
natively. Wire it up once:

1. **Add the GoogleSignIn SDK** (same way you added Firebase):
   *File → Add Package Dependencies…* →
   `https://github.com/google/GoogleSignIn-iOS` → add the **GoogleSignIn**
   product to the **TABS** target.
2. **Add `GoogleService-Info.plist`** to the TABS target if you haven't
   already (it carries the OAuth client ID the sign-in uses). Adding the iOS
   app in the Firebase Console is free and doesn't need a paid Apple account.
3. **Add the URL scheme.** Open `GoogleService-Info.plist`, copy the
   **`REVERSED_CLIENT_ID`** value (looks like
   `com.googleusercontent.apps.1234567890-abcdef`), and paste it into
   `Info.plist` under *URL Types → URL Schemes* (it is already filled in for
   the current Firebase project; update it if you switch projects). This is
   the callback the system browser returns to after sign-in.

How it flows: the site (running as `TABSApp`) posts a `googleSignIn` message →
`WebViewController` runs `GIDSignIn` in a system browser → the Google ID token
is injected back via `window.__onNativeGoogleCredential` → the page finishes
with `signInWithCredential`. On the web (not the app) nothing changes — it
still uses `signInWithPopup`.

> The site-side half of this lives in `firebase-setup.js`, so those changes
> must be deployed to `tabsonfriends.com` (merge the PR) for in-app Google
> login to work — the app loads the live site, not local files.

## Sign in with Apple setup

Apple requires Sign in with Apple in any app that offers a third-party login
such as Google (Guideline 4.8), and requires that deleting an account also
revokes the Apple token (Guideline 5.1.1(v)). The native half is done in
code; finish the setup once:

1. **Xcode capability.** The entitlement
   (`com.apple.developer.applesignin = [Default]`) is already in
   `TABS/TABS.entitlements`, and `CODE_SIGN_ENTITLEMENTS = TABS/TABS.entitlements`
   is set for Debug and Release. Open *Signing & Capabilities* once with your
   paid team selected; **Sign in with Apple** should be listed (if not, click
   **+ Capability → Sign in with Apple**). With automatic signing Xcode enables
   the capability on the `com.tabsonfriends.app` App ID for you; otherwise
   enable it under *Certificates, Identifiers & Profiles → Identifiers*.
2. **Enable the Apple provider in Firebase.** Firebase Console →
   *Authentication → Sign-in method → Add new provider → Apple → Enable*.
   The iOS app `com.tabsonfriends.app` must be registered in the same Firebase
   project (it is, if you downloaded `GoogleService-Info.plist` for it):
   Firebase accepts native ID tokens whose audience is that bundle id.
3. **Fill in the provider's "OAuth code flow configuration"** (Apple Team ID,
   Key ID and the private key of a key created in the Apple Developer portal
   under *Keys* with **Sign in with Apple** enabled, plus a **Services ID**).
   This is required for:
   - the **website's** popup sign-in (the Services ID is the web client; add
     the return URL `https://<your-project>.firebaseapp.com/__/auth/handler`
     to it in the Apple portal), and
   - **revoking the Apple token on account deletion**, which Firebase does by
     exchanging the authorization code with Apple using that key.
4. Make sure `tabsonfriends.com` is listed under *Authentication → Settings →
   Authorized domains* (already true for Google sign-in).

How it flows: the page posts `{type:"appleSignIn", purpose:"signIn"|"reauth"}`
→ `WebViewController` creates a random nonce, asks Apple for
`fullName` + `email` with the SHA-256 of that nonce, and on success calls
`window.__onNativeAppleCredential({idToken, rawNonce, authorizationCode,
givenName, familyName, email, purpose})`; on failure it calls
`window.__onNativeAppleError({purpose, cancelled, message})` (no native alert;
the page shows the toast). The page then finishes with Firebase
`signInWithCredential` (or `reauthenticateWithCredential` + token revocation
for `purpose: "reauth"` during account deletion).

Testing notes: Apple only returns the user's name and email the **first**
time an Apple ID authorizes the app; to see them again, remove TABS under
*Settings → [your name] → Sign-In & Security → Sign in with Apple*. The
authorization code is single-use and expires after about five minutes.

## Push notifications (FCM / APNs)

Push is **wired up** in code and routes through your existing Firebase Cloud
Messaging setup — the same one the website uses, so no backend changes are
needed. Here's how it fits together:

- `AppDelegate` calls `FirebaseApp.configure()` (only once
  `GoogleService-Info.plist` is present), registers for remote notifications,
  and receives the device's **FCM registration token** via `MessagingDelegate`.
- `PushTokenStore` holds that token; `WebViewController` injects it into the
  page through the site's existing native bridge
  (`window.ReactNativeWebView` → `window.__onNativePushToken`). The site
  stores it under `users/{uid}/pushTokens/{token}` with `platform: "ios"`.
- Your Cloud Function already treats any non-Expo token as an FCM token and
  delivers via `admin.messaging().sendEachForMulticast`, so an iOS token
  Just Works with the current reminder flow.

### The one manual step: `GoogleService-Info.plist`

Everything above is inert until you add your Firebase iOS config file:

1. Firebase Console → **Project Settings → Your apps → Add app → iOS**,
   bundle id `com.tabsonfriends.app`.
2. Download **`GoogleService-Info.plist`** and drag it into the `TABS` group
   in Xcode (check *Copy items if needed*, target = TABS). It's
   `.gitignore`d so your keys don't get committed.
3. Under **Project Settings → Cloud Messaging → APNs Authentication Key**,
   upload the `.p8` APNs key with its Key ID + your Team ID (this is what
   lets FCM talk to APNs).

### Xcode capabilities

- **Push Notifications — ON.** `CODE_SIGN_ENTITLEMENTS = TABS/TABS.entitlements`
  is now set for Debug and Release, so the `aps-environment` entitlement (and
  Sign in with Apple) are signed into the app. This needs a **paid** Apple
  Developer team; personal teams fail with "Personal development teams … do
  not support the Push Notifications capability". The file says
  `development`; when you archive and distribute to App Store Connect, Xcode
  signs it with the distribution profile's `production` value automatically.
  If Xcode doesn't list **Push Notifications** under *Signing & Capabilities*,
  add it with **+ Capability**.
- **Background Modes → Remote notifications** — via `UIBackgroundModes` in
  `Info.plist`. Allowed on free teams, so it's left on.
- **Firebase SDK — add it via Xcode's UI** together with the other packages;
  see *Swift packages* above.

### Testing notes

- Push only works on a **real device**, never the simulator.
- iOS shows the *system* permission dialog only once per install; after that,
  the toggle shows a native alert + Settings deep link (as close to
  "re-prompt every time" as the platform allows).

## Before submitting to the App Store

- **Export compliance:** `ITSAppUsesNonExemptEncryption = NO` is set in
  `Info.plist` (the app only uses standard HTTPS), so App Store Connect won't
  ask the encryption question on every upload.
- **Sign in with Apple** must be enabled in Firebase and on the App ID (see
  *Sign in with Apple setup*), and the website changes that add the Apple
  button and the account-deletion token revocation must be live on
  tabsonfriends.com before review: the app loads the live site.
- **Offline screen:** test once in Airplane Mode. Reviewers often test on
  flaky networks, and a blank screen is a common rejection.
- **Report alert created and tested** (Terms and Support promise 24-hour
  review; Guideline 1.2): the Cloud Logging `USER_REPORT` email alert from
  `SETUP.md` must exist, and one test report must actually reach your inbox.
- **Export Data:** in the app, Profile → Export Data opens the iOS share
  sheet (the page posts `{type:"exportData"}`; native writes the JSON to a
  temp file) so the user can save it to Files or send it. Test once on an
  iPhone and once on an iPad (the share sheet is a popover there).

- **App icon:** drop a 1024×1024 PNG into
  `TABS/Assets.xcassets/AppIcon.appiconset` (Xcode will slot it in).
- **Signing:** in *Signing & Capabilities* pick your team; the bundle id is
  `com.tabsonfriends.app` (change it if it's taken).
- **Review guideline 4.2:** Apple sometimes rejects apps that are "just a
  website". Native touches like the notification handling here help, but
  be ready to point out app-specific functionality during review.
