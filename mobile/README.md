# TABS Mobile

A native iOS/Android port of the TABS web app, built with Expo + React
Native. It talks to the **same Firebase project** as the web app (same
Realtime Database, same user accounts), so a person you add or a friend
request you send in the app shows up on the web app too, and vice versa.

## What's implemented

- Email/password login, signup, and password reset
- "Continue as Guest" (local-only, nothing persisted — same promise as the web app)
- Home tab: add/remove a person, I Owe / They Owe status, add/remove money,
  edit name/item, extra info notes, interest (rate + compounding period),
  currency display (USD/EUR/GBP/JPY), clear list
- Friends tab: add by friend code, accept/reject/cancel requests, remove a
  friend, live pending-request badge
- Profile tab: profile info, spending/earning stats, friend code (copy to
  clipboard), logout, reset password, view/clear account history, export
  data (via native share sheet), delete account

The friends system here was written with the same-class bugs already fixed
(see the web app's fix history): removing a friend always targets the
friend that was actually tapped (tracked in React state per selection,
never a single reused handler), and canceling/rejecting a request cleans
up both sides so nobody sees a stale pending request.

**Not included in this pass:** Google Sign-In (the web app uses a browser
popup flow that doesn't translate directly to native — would need
`expo-auth-session` or `@react-native-google-signin/google-signin` and a
Google Cloud OAuth client set up per-platform), and ads.

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

## Project layout

```
mobile/
  App.js                     entry point: providers + navigator
  src/
    firebaseConfig.js        same Firebase project as the web app
    theme.js                 shared colors/spacing (matches the web app's dark theme)
    context/
      AuthContext.js         current user + profile
      ToastContext.js        lightweight toast notifications
    lib/
      usePeopleList.js       Realtime DB-backed people list state
      friends.js             friend requests/list (bug-fixed cleanup logic)
      account.js             stats, history, export, delete account
      interest.js            compound interest calculation
    components/               reusable Button/TextField/Modal/PersonRow/etc.
    screens/                  AuthScreen, HomeScreen, FriendsScreen, ProfileScreen
    navigation/
      RootNavigator.js        auth gate + bottom tab navigator
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
