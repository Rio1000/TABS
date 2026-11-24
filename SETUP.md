# TABS — setup for push reminders & the password-reset email

## 1. Push-notification reminders (Cloud Function + FCM)

The **"Send Reminder"** button and the auto-reminder **"Remind now"** shortcut
now deliver a **real push notification** to the friend's device via **Firebase
Cloud Messaging (FCM)** — handled by the `sendReminderPush` Cloud Function in
`functions/`. This is **free**, involves **no carrier and no phone number**, so
there is nothing a carrier can flag as spam, and it never opens the device's
SMS app. It replaced the old Twilio SMS path, which has since been removed
(see 1b).

How it works: when a friend signs in and grants notification permission, the
app registers that device's FCM token at `users/{uid}/pushTokens`. Sending a
reminder calls `sendReminderPush` with `{ friendUid, templateIndex, amount }`.
The function verifies the two are confirmed friends, rate-limits (one per
friend per minute), and skips senders the recipient has blocked. It builds the
text itself from `reminder-messages.json` (the client only picks a template
index and sends the formatted amount, which is strictly validated). It writes
the in-app inbox copy server-side, then pushes to the recipient's devices
unless they turned off **Enable notifications** or **Payment reminders** in
Manage Notifications. Dead tokens are pruned automatically.

### Prerequisites
- **Firebase Blaze (pay-as-you-go) plan** — Cloud Functions require it. FCM
  itself is free; only the Function needs Blaze.
- A **Web Push (VAPID) key pair** — the single manual step to make web push
  work (see below).

### One-time setup

**A. Generate the Web Push key** (for browser/web-app users)
1. Firebase Console → ⚙ **Project settings** → **Cloud Messaging** → **Web
   configuration** → **Web Push certificates** → **Generate key pair**.
2. Copy the **public key** and paste it into `FCM_VAPID_KEY` near the top of
   `firebase-setup.js` (replace `REPLACE_WITH_YOUR_WEB_PUSH_PUBLIC_KEY`).
   Until you do this, the app skips push registration and reminders report
   "hasn't turned on notifications."
3. Make sure `firebase-messaging-sw.js` is served at your site **root**
   (`https://tabsonfriends.com/firebase-messaging-sw.js`). The site is served
   by **GitHub Pages** from this repo (custom domain set by the `CNAME` file),
   not Firebase Hosting; the worker already lives at the repo root, so Pages
   serves it there automatically.

**B. Create the Firebase service-account key** (for the Actions deploy) — same
as before: Firebase Console → ⚙ **Project settings** → **Service accounts** →
**Generate new private key**, then add its full JSON as the GitHub secret
**`FIREBASE_SERVICE_ACCOUNT`**.

**C. Mobile app push.**

- **iOS:** the App Store app is the native Swift project in `ios/`. It
  registers a plain **FCM token** (APNs key uploaded to Firebase), which the
  Cloud Function delivers like any web token. Its push setup lives in
  **`ios/README.md`** — follow that, not the Expo steps below.
- **Android / legacy Expo app:** the rest of this step applies only to the
  Expo app in `mobile/`.

The Expo app in `mobile/` (Android / legacy) is a WebView shell around
the website (so mobile looks identical to web) that adds native push. On login
the web app asks the shell for the device's **Expo push token**; the shell
requests notification permission, mints the token, and injects it back, and the
web app stores it under `users/{uid}/pushTokens`. The Cloud Function recognises
Expo-format tokens and delivers them through the **Expo push service** (which
handles APNs/FCM for both platforms), while web tokens still go via FCM.

To make Expo (Android) push work you must:
0. Install the EAS CLI: `npm install -g eas-cli`. (The CLI ships in the
   `eas-cli` package and its command is `eas`; running `npx eas` grabs an
   unrelated `eas` package and fails with "could not determine executable to
   run" — use `eas` after installing, or `npx eas-cli …`.)
1. `cd mobile && npx expo install` (pins `react-native-webview`,
   `expo-notifications`, `expo-constants` to versions matching Expo SDK 54).
2. `eas init` to create the project and write `extra.eas.projectId` into
   `app.json` — Expo needs it to mint push tokens.
3. Build a **dev or production build** with EAS
   (`eas build --platform android`). Remote push does
   **not** work in Expo Go — the WebView does, but tokens/delivery need a real
   build.

> Note: Google sign-in via popup is blocked inside embedded WebViews by Google.
> Email/password sign-in works in the Expo app; if you want Google there, use a
> native auth flow or a system browser redirect. (The iOS app handles Google
> and Apple sign-in natively — see `ios/README.md`.)

**D. User-report email alert — REQUIRED.** The Terms and Support pages promise
that reports are reviewed within 24 hours (App Store Guideline 1.2), so you
must be told when one arrives. `reportUser` stores each report under
`reports/` (no client access) and logs `USER_REPORT` at warning level; a
Cloud Logging alert turns that log entry into an email:

1. **Google Cloud Console** (same project) → **Logging** → **Logs Explorer**.
2. Run this query:
   ```
   resource.type="cloud_run_revision" AND severity=WARNING AND (jsonPayload.message="USER_REPORT" OR textPayload:"USER_REPORT")
   ```
3. Send **one test report** (report a test account from the app or website)
   and confirm it shows up. Expand the entry and check which field carries
   `USER_REPORT` (normally `jsonPayload.message`); if it's neither of the two
   in the query, adjust the query to match the field you see.
4. **Actions → Create log alert**: name it e.g. "TABS user report", keep the
   query, pick the shortest notification interval (5 min), and add an
   **Email** notification channel for the address you actually read.
5. Send a second test report and confirm the **email arrives**. Then delete
   both test reports from `reports/` in the Firebase Console.

Several reports inside one notification interval produce a single email, so
always check `reports/` for the full list.

### Deploy — via GitHub Actions (no local tools needed)
Deployment is automated by `.github/workflows/deploy-functions.yml`. It deploys
the Cloud Functions **and** the Realtime Database rules
(`firebase deploy --only functions,database --force`) from **`main` only**. It
runs when a push to `main` changes anything under `functions/`,
`firebase.json`, `database.rules.json`, `reminder-messages.json` or the
workflow file itself, or on demand from the **Actions** tab → **Deploy
Firebase Functions** → **Run workflow**. The only secret it needs is
**`FIREBASE_SERVICE_ACCOUNT`** (step B above); the functions use the Firebase
Admin SDK's built-in messaging, so there's nothing else to configure.

- **Reminder templates:** `reminder-messages.json` at the repo root is the
  single source of truth (the website fetches it too). `firebase.json`'s
  functions **predeploy** hook (`functions/scripts/copy-reminder-messages.js`)
  copies it into `functions/` before the source is packaged; that copy is
  gitignored, so edit the root file only. **Only ever append templates —
  never reorder or remove one.** Clients send a template *index*, and the
  website and functions deploy separately (and browsers cache the old list),
  so reordering or removing would make a cached index pick different text. An
  index past the end of the deployed list wraps around (`index % length`).
- **Database rules:** `database.rules.json` is published by the same deploy,
  so there's no need to paste rules into the Firebase Console any more (a
  manual paste would be overwritten by the next deploy).
- **Removed functions:** `--force` deletes from the project any function that
  is no longer exported from `functions/index.js`.

> If the deploy fails with a permissions error, the service account needs a
> couple of IAM roles the Firebase Admin SDK key sometimes lacks. In the
> **Google Cloud Console → IAM**, grant that service account **Cloud Functions
> Admin**, **Cloud Run Admin**, **Service Account User**, and **Artifact
> Registry Administrator**, then re-run. (Editor covers all of these if you'd
> rather grant one role.) Deploying rules also needs **Firebase Realtime
> Database Admin** (also covered by Editor).

### How it stays secure
- A reminder push only goes to a **confirmed friend**: the function checks that
  the recipient has the caller in their `friendUids` index (a value only the
  recipient can write). A user can't push to an arbitrary uid.
- The **text is chosen server-side** from the fixed templates; the client can't
  put its own words on someone's lock screen. Old cached clients that still
  send free text get "Please refresh TABS to send reminders."
- **No client can write into another user's inbox**
  (`users/{uid}/notifications` is owner-only). Friend-request and reminder
  notifications are written by the Cloud Functions. Their bodies are **server
  templates that include only the sender's own display name** (reminders also
  carry the strictly validated amount); display names are capped at 60
  characters by the database rules. What the functions deliver (including
  friend-request acceptances) is also kept in `deliveryLog/` (server-only,
  last 20 per sender/recipient pair) as evidence for `reportUser`.
- A friend-request **acceptance** can't be forged: the rules only allow an
  "accepted" marker in someone's `pendingRequests` when that person's own
  `sentRequests` has an entry for the writer, and the accept push is
  likewise checked against it.
- Muted notification types (Manage Notifications) still get their inbox copy
  stored; only the device push is skipped, and the user's own client hides
  muted types in the inbox.
- Blocked senders (`users/{uid}/blocked`) get no pushes or notifications
  through, and the response looks like "no devices" so the block isn't
  revealed.

### Notes
- Auto-reminders surface an in-app notification with a **"Remind now"** button,
  which sends a push through `sendReminderPush`. Fully hands-off scheduled
  sending would need a scheduled Cloud Function that iterates `autoReminders`.
- User reports (`reportUser`) are stored under `reports/` (no client access)
  and logged as `USER_REPORT` at warning level. The email alert on that log
  entry is **required** — see step D above.

---

## 1b. Twilio SMS reminders (removed)

The old Twilio path (`sendReminderSms`, `toE164()` and the `twilio`
dependency) has been removed from `functions/`. The next deploy (which runs
with `--force`) also deletes the live `sendReminderSms` function. You can
delete the GitHub secrets **`TWILIO_ACCOUNT_SID`**, **`TWILIO_AUTH_TOKEN`** and
**`TWILIO_FROM_NUMBER`**; nothing reads them any more. If you ever want real
SMS again, note the trade-offs in `ROADMAP.md` (Track 1): any compliant SMS
provider requires US **A2P 10DLC registration** and carrier fees.

## 2. Password-reset email

The reset email (`Follow this link to reset your project-295362517303
password…`) is generated by **Firebase Auth's server template**, not by any
code in this repo, so it's changed in the Firebase Console — not here.

### Fix the ugly project name
The `project-295362517303` text is your project's missing display name.
**Firebase Console → Project settings → General → Public-facing name** → set it
to `TABS`. This alone changes every auth email to say "TABS".

### Make the message professional
**Firebase Console → Authentication → Templates → Password reset** → edit:

- **Sender name:** `TABS`
- **From:** `noreply@tabsonfriends.com` (needs domain verification) or leave the
  default `noreply@tabs-4a0eb.firebaseapp.com`.
- **Subject:** `Reset your TABS password`
- **Message:**
  ```
  Hi,

  We got a request to reset the password for your TABS account (%EMAIL%).

  Click below to choose a new password. For your security, this link expires in
  one hour.

  %LINK%

  Didn't request this? You can safely ignore this email — your password won't
  change.

  — The TABS Team
  ```
  (`%LINK%` and `%EMAIL%` are Firebase placeholders it fills in automatically.)

### Want a fully branded HTML email?
Firebase's built-in template is plain text with limited styling. For a
fully designed HTML email you'd generate the reset link server-side with
`admin.auth().generatePasswordResetLink()` in a Cloud Function and send it
through an email provider (e.g. Twilio SendGrid). That's a larger change and
needs an email-provider account — ask if you want it wired up.
