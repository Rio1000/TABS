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

## Before submitting to the App Store

- **App icon:** drop a 1024×1024 PNG into
  `TABS/Assets.xcassets/AppIcon.appiconset` (Xcode will slot it in).
- **Push delivery:** the toggle/permission flow above is fully wired, but
  for notifications to actually arrive while the app is closed you need
  server-side push (APNs). The site already uses Firebase Cloud Messaging
  on the web, so the natural next step is adding the Firebase iOS SDK +
  a `GoogleService-Info.plist` and the Push Notifications capability, and
  sending the APNs token to your existing FCM setup. The app already
  registers for remote notifications and logs its APNs device token.
- **Review guideline 4.2:** Apple sometimes rejects apps that are "just a
  website". Native touches like the notification handling here help, but
  be ready to point out app-specific functionality during review.
