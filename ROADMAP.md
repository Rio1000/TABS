# TABS — Roadmap: cheaper messaging + ads

Two tracks:

1. **Messaging** — replace Twilio with a free path that reaches friends without
   ever tripping carrier spam filters.
2. **Ads** — web AdSense on the login/signup landing, native AdMob banner in the
   iOS app.

---

## Track 1 — Replace Twilio with a free, non-spammy reminder channel

### The honest constraint (read this first)

There is **no free, legitimate provider that sends *automated* SMS in the US
without triggering carrier spam controls.** The friction Twilio puts you
through — **A2P 10DLC brand/campaign registration** and per-message **carrier
fees** — is imposed by the carriers (T-Mobile, AT&T, Verizon), not by Twilio.
Every compliant competitor inherits the same rules:

| Provider | Cheaper than Twilio? | Still needs 10DLC? | Still risks spam flag? |
|---|---|---|---|
| Telnyx | Yes (lower per-msg) | **Yes** | Same as Twilio |
| Plivo | Yes | **Yes** | Same |
| Amazon SNS / Pinpoint | Yes (pay-per-use) | **Yes** | Same |
| Vonage / Sinch / Bird | Marginally | **Yes** | Same |
| "No-registration / bulk" SMS gateways | Appears cheap | Skips it (grey route) | **Worse** — filtered/blocked first |

So "switch providers to stop being flagged" is a false promise. Anything that
*skips* registration is a grey route, which carriers filter **harder**. The
only ways to genuinely never flag a carrier are to **not send automated A2P
SMS**. Your stack already supports two such paths — both free.

### Recommended: Firebase Cloud Messaging (FCM) push — free, zero carrier

Reminders in TABS only ever go to a **confirmed friend with a linked account**
(see the `friendUids` check in `functions/index.js`). That means the recipient
is, by definition, a TABS user — so a **push notification** delivers the same
"hey, you owe me" nudge with none of the SMS baggage:

- **Free.** FCM has no per-message cost and works on the Firebase Spark plan.
- **No carrier involved at all** → structurally impossible to flag a carrier
  for spam. There is no SMS, no 10DLC, no A2P registration, no phone number.
- **Same capability** the feature actually needs: get a reminder in front of
  the friend, with a deep link back into TABS.

**Trade-off:** the friend must have the app (or web push) installed. Since
reminders are already gated to linked-account friends, that overlap is high —
and the native-SMS fallback below covers everyone else.

#### Migration steps (FCM)

1. **Mobile app (Expo):** add `expo-notifications`, request permission on
   sign-in, and store the Expo/FCM token at
   `users/{uid}/pushTokens/{token}` in Realtime Database.
   - `cd mobile && npx expo install expo-notifications`
   - Register the token inside `mobile/src/context/AuthContext.js` after auth
     resolves.
2. **Web app (optional, for browser users):** add the Firebase JS
   `getMessaging()` + a service worker (`firebase-messaging-sw.js`) and save the
   web token to the same `pushTokens` node.
3. **Cloud Function:** add `sendReminderPush` next to `sendReminderSms` in
   `functions/index.js`. Keep the identical friendship auth check, then read
   the recipient's `pushTokens` and call
   `admin.messaging().sendEachForMulticast({ tokens, notification, data })`.
   Prune tokens that come back `messaging/registration-token-not-registered`.
4. **Frontend switchover:** in `firebase-setup.js`, add
   `sendReminderPushViaFCM(friendUid, message)` mirroring
   `sendReminderSmsViaTwilio` (lines 75–100), and change the two call sites —
   the "Text now" notification button (~line 2333) and the "Send SMS Now"
   button (~line 2578) — to try **push first**, then fall back to the native
   SMS composer.
5. **Decommission Twilio:** once push is verified, drop the `twilio` dependency
   from `functions/package.json`, remove `sendReminderSms`, and delete the
   Twilio secrets from GitHub Actions. **No Blaze plan needed** for FCM (though
   Cloud Functions themselves still require Blaze to reach any external
   network; FCM is internal to Google, so a Spark-only setup can even use the
   client SDK path if you'd rather avoid Functions entirely).

### Fallback / zero-effort option: keep the native SMS composer

`openSmsComposer()` (`firebase-setup.js:2437`) already fires an `sms:` link that
opens the **sender's own** Messages app with the reminder pre-filled. That text
is a normal **person-to-person** message sent from the user's real number on
their own plan — it is **free**, needs **no provider**, and **cannot flag any
carrier for spam** because it isn't A2P traffic. The only cost is one tap to
send. This already runs whenever Twilio is unavailable, so the simplest
"remove Twilio" is to **make the composer the default** and delete the Twilio
path entirely.

### If you truly need hands-off *SMS* (not push)

Then registration is unavoidable, so optimize for **price**, not for dodging
filters. Cheapest compliant route today: **Amazon SNS / Pinpoint**
(pay-per-use, no monthly minimum) or **Telnyx/Plivo**. Budget for a one-time
10DLC brand+campaign registration and ~1–2¢/msg + carrier fees. Swap the
Twilio client in `functions/index.js` for the provider SDK; the rest of the
architecture (callable function, friendship check, E.164 normalization) stays.

### Decision

| Goal | Do this |
|---|---|
| Free **and** never flag a carrier (recommended) | **FCM push** to app users + native-composer fallback |
| Zero engineering, free today | Make **native SMS composer** the default; delete Twilio |
| Must keep automated real SMS | Switch to **AWS SNS/Telnyx**, accept 10DLC + fees |

---

## Track 2 — Ads

Current setup (see `ADS_SETUP.md` for the full reference):

- **Web** — one Google **AdSense** banner on the login/signup landing
  (`#landing-ad` in `index.html`; client `ca-pub-7825788728707782`, slot
  `8944873686`). No in-list ad and no About Us ad — web ads are login/signup
  only. The landing banner is hidden inside the app (`IS_NATIVE_APP` check in
  `firebase-setup.js`).
- **iOS** — a native **AdMob** adaptive banner anchored to the bottom safe area
  (`WebViewController.swift`), since AdMob can't render inline in the WebView.
  SDK started in `AppDelegate.swift`; keys in `Info.plist`.

This roadmap is about making that **reliable, compliant, and higher-yielding**.

### Phase 0 — Get real ads serving (do first)
- **AdSense (web):** confirm the account is **approved** and the site is
  verified for `tabsonfriends.com` (per `CNAME`). Unapproved accounts render
  blank. Confirm slot `8944873686` is a real **responsive display** unit.
- **AdMob (iOS):** add the Google Mobile Ads SDK in Xcode, then replace the
  **test** IDs — `GADApplicationIdentifier` in `Info.plist` and `bannerAdUnitID`
  in `WebViewController.swift` — with your real app / unit IDs, and paste the
  full `SKAdNetworkItems` list.

### Phase 1 — Yield & fill
- **AdSense:** consider **Auto ads** (anchor/vignette) as a floor, and
  lazy-load the landing banner only when visible to lift viewability RPM.
- **AdMob:** experiment with an **adaptive vs. fixed** banner size; optionally
  refresh the banner on a timer (respecting AdMob's refresh policy).

### Phase 2 — Consent & compliance
- Add a **consent banner / CMP** (Google's UMP SDK on iOS, a web CMP on the
  site) for GDPR/UK users, and gate ad requests / `adsbygoogle.push()` on
  consent — required for EEA traffic and protects both accounts.
- Keep **App Tracking Transparency** (already prompted on iOS) and the App
  Store **privacy nutrition labels** accurate for what AdMob collects.
- Respect a **premium / ad-free** flag on the user profile
  (`users/{uid}/profile/adsDisabled`): hide `#landing-ad` and skip the AdMob
  banner load when set — groundwork for a paid "remove ads" upgrade.

### Phase 3 — Alternatives / diversification (optional)
- If AdSense fill or approval is a problem on web, evaluate **Ezoic /
  Media.net** or a direct **affiliate card** (finance/budgeting offers fit the
  audience) in the same `#landing-ad` slot — no third-party SDK, full styling
  control, and no extra consent surface.

### Suggested order
`Phase 0 (get serving) → Phase 2 (consent + ad-free flag) → Phase 1 (yield) →
Phase 3 (only if AdSense underperforms).`

---

## Track 3 — Venmo / PayPal / Cash App "request money" links

**Goal:** when a tab is added, let the creditor kick off a real money request in
Venmo/PayPal/Cash App — but TABS **never touches money**; it only builds a link
and hands off to the payment app, which manages the entire transaction.
Toggleable per user in settings.

### The honest constraint (read first)
- **Venmo has no public API.** You cannot programmatically create a Venmo charge
  from a third-party server. The *only* sanctioned way is Venmo's **deep-link /
  URL scheme**, which opens the Venmo app with a prefilled request the user taps
  to send. That's actually a perfect fit here — it keeps money entirely inside
  Venmo and out of TABS.
- **PayPal** *does* have an Invoicing/Orders API, but it needs OAuth, a business
  account, server credentials, and compliance overhead. For a "TABS never moves
  money" design that's overkill — **PayPal.Me links** achieve the same hand-off
  with zero backend and zero secrets.
- So the whole track is **link-building, not payments integration.** No PCI
  scope, no API keys, no money in TABS. This is exactly the model you want.

### How each provider's link works (note the direction!)
| Provider | Link | Who provides the handle | Direction |
|---|---|---|---|
| **Venmo** (charge/request) | `https://venmo.com/<debtorUser>?txn=charge&amount=<amt>&note=<note>` (app scheme `venmo://paycharge?txn=charge&recipients=…`) | the **debtor** (person who owes) | requests money *from* them |
| **PayPal.Me** | `https://paypal.me/<creditorUser>/<amt>` | the **creditor** (person owed) | debtor opens it and *pays* |
| **Cash App** | `https://cash.app/$<creditorTag>/<amt>` | the **creditor** | debtor opens it and *pays* |

The asymmetry matters: a Venmo *charge* needs the **debtor's** username, while
PayPal.Me / Cash App links carry the **creditor's** handle for the debtor to pay.
So the settings model has to store both a user's own handles *and* respect that
a Venmo request requires the other party to have shared theirs.

### Data model
- `users/{uid}/profile/paymentHandles`: `{ venmo, paypal, cashApp }` (strings,
  optional). Reuse the same friend-scoped read rule already used for
  `phoneNumber` so only confirmed friends can read them.
- `users/{uid}/settings/paymentRequests`: `{ enabled: bool, defaultProvider }`.
  When `enabled` is false, TABS shows no request buttons for that user and
  exposes none of their handles.

### UI
- **Settings/Profile:** a "Payment requests" toggle + fields for Venmo / PayPal.Me
  / Cash App handles (mirrors how `phoneNumber` and `friendCode` are edited today).
- **On a person/tab row:** a "Request" button right next to the existing
  `.sms-remind-btn` (`firebase-setup.js` ~line 927). It's shown only when the
  relevant handle is available and the relevant party has the feature enabled.
  Clicking builds the link with the tab's amount + a note (e.g. "TABS: dinner")
  and does `window.open(link)` / sets `location.href` — same hand-off pattern as
  `openSmsComposer`. On mobile (the WebView shell) the OS deep-links straight
  into the Venmo/PayPal/Cash App app.
- **Guardrail:** a small "opens <provider> — TABS doesn't move money" caption, so
  it's clear the transfer happens entirely in the payment app.

### Nice-to-haves (later)
- Remember which tabs were "requested" (timestamp on the person row) so the UI
  can show "Requested ✓" — still just metadata, no money.
- A combined reminder: the push/SMS reminder could include the payment link.
- PayPal **Invoicing API** as an *optional* upgrade for users who want a real
  emailed invoice with tracking — clearly separate, opt-in, and still never
  routing money through TABS.

### MVP (small, shippable)
1. Add `paymentHandles` + the settings toggle and edit fields.
2. Add the friend-scoped read rule for `paymentHandles`.
3. Add a "Request on Venmo/PayPal/Cash App" button on friend rows that builds
   and opens the link from the tab amount.
That's the entire "request money, TABS never transfers" feature — no API, no
secrets, no Blaze requirement.

---

## Suggested overall sequencing
1. **Track 1, native-composer default** — removes the Twilio dependency/cost
   immediately with near-zero code.
2. **Track 2, Phase 0–1** — verify ads actually fill, then interpolate them
   through the list.
3. **Track 1, FCM push** — the real upgrade: free, reliable, carrier-free
   reminders for app users.
4. **Track 3 MVP** — payment-request links (Venmo/PayPal/Cash App): high user
   value, small surface, no backend or money-handling.
5. **Track 2, Phase 2–4** — squeeze yield and add consent/ad-free controls.
