# TABS Mobile

A thin **WebView shell** around the TABS web app, built with Expo + React
Native. Instead of re-implementing every screen natively, the app loads the
live website (`https://tabsonfriends.com`) in a full-screen WebView, so the
mobile app looks and behaves **identically** to the web version and there is
only one UI to maintain. It talks to the same Firebase project because it *is*
the same web app.

## What the native shell adds

The only thing the shell layers on top of the website is what a browser can't
do:

- **Native push notifications.** On login the web app posts a
  `requestPushToken` message to the shell; the shell requests notification
  permission, mints this device's **Expo push token**, and injects it back into
  the page, which stores it under `users/{uid}/pushTokens`. The
  `sendReminderPush` Cloud Function then delivers reminders to the phone through
  the Expo push service. (Web browsers register FCM tokens instead; the function
  handles both.)
- **Android hardware back button** navigates the site's history.
- **Pull-to-refresh** and a dark loading screen that matches the site so there's
  no white flash.

Everything else — the people list, friends, profile, interest, ads, the
reminder buttons — is the web app itself, unchanged.

> **Google sign-in:** Google blocks its OAuth popup inside embedded WebViews, so
> use email/password in the app. Adding native Google auth would need
> `expo-auth-session` and a per-platform OAuth client.

The previous fully-native screens (`src/screens`, `src/navigation`, etc.) are
kept in the repo for reference but are no longer wired into `App.js`.

## Requirements

- Node.js 18+
- For iOS builds: a Mac with Xcode
- For Android builds: Android Studio (SDK + an emulator, or a physical device)
- [Expo Go](https://expo.dev/go) app on your phone, for the fastest way to try it without any native build

## Running it

```bash
cd mobile
npm install
npm start
```

This starts the Metro bundler and prints a QR code — scan it with the
Expo Go app (Android: in-app scanner; iOS: Camera app) to run the app on
your phone with no native build step.

To target a simulator/emulator directly:

```bash
npm run ios       # requires Xcode, macOS only
npm run android   # requires Android Studio + an emulator or connected device
```

## Building a real installable app

Expo Go is fine for development, but to produce an actual `.ipa`/`.apk` (or
to publish to the App Store / Play Store) use [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform android   # or ios, or --platform all
```

That's a hosted build service — it doesn't require a local Xcode/Android
Studio install, but you will need Apple Developer / Google Play developer
accounts to sign and submit the result to the respective stores.

## Push setup (required for reminders to reach the phone)

1. `npx expo install` — pins `react-native-webview`, `expo-notifications`,
   `expo-constants` to the versions matching Expo SDK 54.
2. `npx eas init` — creates the EAS project and writes `extra.eas.projectId`
   into `app.json`. Expo needs this to mint push tokens.
3. `eas credentials` — for iOS, upload an **APNs key** so Expo can deliver to
   Apple devices.
4. `eas build` — remote push does **not** work in Expo Go; build a dev or
   production build to test tokens and delivery. (The WebView itself runs fine
   in Expo Go for quick UI checks.)

## Project layout

```
mobile/
  App.js                     WebView shell + native push bridge (the whole app)
  app.json                   Expo config (expo-notifications plugin, EAS projectId)
  src/                       legacy fully-native screens — kept for reference,
                             no longer imported by App.js
```

## Notes

- The Firebase config (`src/firebaseConfig.js`) is the same public web API
  key already committed in the web app's `firebase-setup.js` — Firebase web
  API keys aren't secret, access is controlled by Realtime Database rules,
  not the key itself.
- Both `npx expo export --platform android` and `--platform ios` were run
  during development to confirm the app bundles cleanly through Metro on
  both platforms before this was committed.
- Pinned to **Expo SDK 54** on purpose, rather than whatever `expo@latest`
  resolves to at scaffold time — Expo Go only runs projects matching the
  exact SDK version it ships with, so if `npx expo start` ever reports a
  version mismatch against your installed Expo Go, that's what to check
  first (see your Expo Go app's home screen for the SDK it supports, and
  align this project's `expo`/`react`/`react-native`/etc. versions in
  `package.json` to match, e.g. via the versions listed in
  `node_modules/expo/bundledNativeModules.json` for that SDK).
