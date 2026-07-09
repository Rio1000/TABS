# TABS — setup for push reminders & the password-reset email

## 1. Push-notification reminders (Cloud Function + FCM)

The **"Send SMS Now"** button and the auto-reminder **"Remind now"** shortcut
now deliver a **real push notification** to the friend's device via **Firebase
Cloud Messaging (FCM)** — handled by the `sendReminderPush` Cloud Function in
`functions/`. This is **free**, involves **no carrier and no phone number**, so
there is nothing a carrier can flag as spam, and it never opens the device's
SMS app. It replaces the old Twilio SMS path (still in `functions/index.js` as
`sendReminderSms` if you ever want it, but the app no longer calls it).

How it works: when a friend signs in and grants notification permission, the
app registers that device's FCM token at `users/{uid}/pushTokens`. Sending a
reminder calls `sendReminderPush`, which verifies the two are confirmed friends
(same check the SMS path used), reads the recipient's tokens server-side, and
pushes the notification. Dead tokens are pruned automatically.

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
   (`https://tabsonfriends.com/firebase-messaging-sw.js`). It already lives at
   the repo root, so Firebase Hosting serves it there automatically.

**B. Create the Firebase service-account key** (for the Actions deploy) — same
as before: Firebase Console → ⚙ **Project settings** → **Service accounts** →
**Generate new private key**, then add its full JSON as the GitHub secret
**`FIREBASE_SERVICE_ACCOUNT`**.

**C. (Optional) Mobile app push.** The Expo app in `mobile/` doesn't register
for push yet. To have reminders reach mobile users, add `expo-notifications`,
call `getDevicePushTokenAsync()` after sign-in, and write the native token to
the same `users/{uid}/pushTokens` node. Android tokens work with the existing
Function as-is; iOS additionally needs an **APNs auth key** uploaded in Firebase
Console → Cloud Messaging → Apple app configuration.

### Deploy
Deployment is automated by `.github/workflows/deploy-functions.yml` — it runs
on any push under `functions/`, or on demand from the **Actions** tab. No
Twilio secrets are needed anymore; the Function uses the Firebase Admin SDK's
built-in messaging, so there's nothing else to configure for sending.

---

## 1b. (Legacy) Twilio SMS reminders

The original Twilio path (`sendReminderSms`) is left in `functions/index.js`
but is **no longer used by the app**. If you ever want automated real SMS
instead of push, note the honest trade-offs in `ROADMAP.md` (Track 1): any
compliant SMS provider requires US **A2P 10DLC registration** and carrier fees.
The details below are kept for reference.

### Prerequisites
- **Firebase Blaze (pay-as-you-go) plan.** Cloud Functions that reach the
  internet (Twilio) require Blaze. The free Spark plan won't deploy them.
  Upgrade in the Firebase Console (⚙ → Usage and billing → Modify plan).
- A **Twilio account**, an **SMS-capable phone number**, your **Account SID**
  and **Auth Token** (Twilio Console → Account Info).
- For texting **US** numbers, Twilio requires **A2P 10DLC registration** of
  your number/brand before delivery works reliably. Budget a few days for this.
- Only text people who've agreed to receive messages — this is a legal
  requirement (TCPA in the US), not just a Twilio rule.

### Deploy — via GitHub Actions (no local tools needed)
Deployment is automated by `.github/workflows/deploy-functions.yml`. It runs
whenever you push a change under `functions/`, or on demand from the repo's
**Actions** tab → **Deploy Firebase Functions** → **Run workflow**. You only
have to add secrets once:

**A. Create a Firebase service-account key**
1. Firebase Console → ⚙ **Project settings** → **Service accounts**.
2. **Generate new private key** → downloads a JSON file.
3. In GitHub: repo **Settings → Secrets and variables → Actions → New
   repository secret**, name it **`FIREBASE_SERVICE_ACCOUNT`**, and paste the
   *entire contents* of that JSON file as the value.

**B. Add the Twilio secrets** (same GitHub Secrets screen), from the Twilio
Console:
- **`TWILIO_ACCOUNT_SID`**
- **`TWILIO_AUTH_TOKEN`**
- **`TWILIO_FROM_NUMBER`** — your Twilio number in E.164, e.g. `+15551234567`

**C. Trigger a deploy** — either push a small change to `functions/`, or use
Actions → Run workflow. Watch the run; a green check means the function is
live.

> If the deploy fails with a permissions error, the service account needs a
> couple of IAM roles the Firebase Admin SDK key sometimes lacks. In the
> **Google Cloud Console → IAM**, grant that service account **Cloud Functions
> Admin**, **Cloud Run Admin**, **Service Account User**, and **Artifact
> Registry Administrator**, then re-run. (Editor covers all of these if you'd
> rather grant one role.)

### Database rules
The workflow deploys only the function. Keep publishing your `database.rules.json`
the way you already do (Firebase Console → Realtime Database → Rules → paste →
Publish), or add `,database` to the deploy command in the workflow if you'd
like Actions to push rules too.

### How it stays secure
The function only texts a **confirmed friend**: it checks that the recipient
has the caller in their `friendUids` index (a value only the recipient can
write), then reads the recipient's phone number server-side. A user can't make
it text an arbitrary number.

### Notes
- If the function isn't deployed yet, the button gracefully falls back to
  opening the phone's SMS app (the old behaviour), so nothing breaks meanwhile.
- The phone number is normalised to E.164 assuming **US (+1)** for bare
  10-digit numbers — change `toE164()` in `functions/index.js` for other
  regions.
- Auto-reminders currently surface an in-app notification with a "Text now"
  button (which sends via Twilio). Fully hands-off scheduled sending would need
  a scheduled Cloud Function that iterates `autoReminders` — easy to add on top
  of this once the manual path is verified.

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
