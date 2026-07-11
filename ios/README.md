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
  `mailto:`, and `sms:` open in the appropriate system app; Google/Firebase
  sign-in flows stay inside the web view so login keeps working.
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
2. Select the **TABS** scheme and a simulator or your device.
3. In *Signing & Capabilities*, pick your team (bundle id is
   `com.tabsonfriends.app` — change it if it's taken).
4. Run (⌘R).

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

- **Push Notifications — currently OFF.** The `aps-environment` entitlement is
  intentionally *not* wired into the build settings, because free / personal
  Apple teams can't sign it ("Personal development teams … do not support the
  Push Notifications capability"). The entitlements file
  (`TABS/TABS.entitlements`) is kept in the project, ready to re-enable.
  **To turn push on once you have a paid Developer account:** select the TABS
  target → *Signing & Capabilities* → **+ Capability** → **Push Notifications**
  (Xcode re-adds `CODE_SIGN_ENTITLEMENTS = TABS/TABS.entitlements`
  automatically). Without this, the app builds and runs fine but won't receive
  a device token.
- **Background Modes → Remote notifications** — via `UIBackgroundModes` in
  `Info.plist`. Allowed on free teams, so it's left on.
- **Firebase SDK** — added as a Swift Package
  (`firebase-ios-sdk`, products `FirebaseCore` + `FirebaseMessaging`). If Xcode
  shows *"Missing package product 'FirebaseCore'"*, it hasn't resolved yet:
  *File → Packages → Resolve Package Versions* (or *Reset Package Caches* if
  that stalls). Requires a network connection the first time.

### Testing notes

- Push only works on a **real device**, never the simulator.
- iOS shows the *system* permission dialog only once per install; after that,
  the toggle shows a native alert + Settings deep link (as close to
  "re-prompt every time" as the platform allows).

## Before submitting to the App Store

- **App icon:** drop a 1024×1024 PNG into
  `TABS/Assets.xcassets/AppIcon.appiconset` (Xcode will slot it in).
- **Signing:** in *Signing & Capabilities* pick your team; the bundle id is
  `com.tabsonfriends.app` (change it if it's taken).
- **Review guideline 4.2:** Apple sometimes rejects apps that are "just a
  website". Native touches like the notification handling here help, but
  be ready to point out app-specific functionality during review.
