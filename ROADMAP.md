# TABS — Roadmap: cheaper messaging + ads in the person-list adbox

Two tracks:

1. **Messaging** — replace Twilio with a free path that reaches friends without
   ever tripping carrier spam filters.
2. **Ads** — grow the AdSense adbox that already lives in the person list.

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

## Track 2 — Ads in the person-list adbox

Ads already render in the person list — `addAdBox()` in `firebase-setup.js:957`
injects a `.ad-box .personlist-item` with a Google AdSense unit (client
`ca-pub-7825788728707782`, slot `8944873686`) and pushes it once it has layout
width (`pushAdWhenVisible`). This roadmap is about making it **reliable, denser,
and higher-yielding** — not about adding ads from scratch.

### Phase 0 — Verify what's live (do first)
- Confirm the AdSense account is **approved** and the site is verified for
  `tabsonfriends.com` (per `CNAME`). Unapproved accounts show blank boxes.
- Confirm slot `8944873686` is a real **in-feed / responsive display** unit in
  the AdSense dashboard, matching the `data-ad-format="auto"` markup.
- Watch the console for `availableWidth=0` / "All 'ins' elements already have
  ads" — the current `pushAdWhenVisible` retry loop guards the width case; the
  duplicate-push case is guarded by removing the old `.ad-box` first.

### Phase 1 — Placement & UX
- **Every-N-rows interpolation:** instead of a single ad appended at the bottom
  (`peopleList.appendChild`), insert an ad every ~6 people so it's seen without
  dominating short lists. Skip if the list has fewer than N rows.
- Keep the **"ADVERTISEMENT"** label (already present) — required by AdSense
  policy and good for trust.
- Ensure ad rows are **excluded from data** everywhere: `saveListToFirebase`
  already skips `.ad-box` (line 537) and the drag/reorder logic filters
  `:not(.ad-box)` (`script.js:284`). Re-check any new list operations.

### Phase 2 — Yield & fill
- Turn on **Auto ads** (anchor/vignette) in AdSense as a floor for when the
  in-feed slot doesn't fill.
- Add a **house-ad fallback**: when AdSense returns unfilled
  (`ins[data-ad-status="unfilled"]`), swap in a self-promo card (e.g. "Invite a
  friend", "Rate TABS") so the box is never empty.
- Consider **lazy-loading**: only `push()` the slot when the ad row scrolls near
  the viewport (IntersectionObserver) to improve viewability RPM.

### Phase 3 — Consent & compliance
- Add a **consent banner / CMP** (Google's or a lightweight one) for GDPR/UK
  users, and gate `adsbygoogle.push()` on consent — required for EEA traffic
  and protects the AdSense account.
- Respect a **premium / ad-free** flag on the user profile
  (`users/{uid}/profile/adsDisabled`): `addAdBox()` should early-return when set,
  laying groundwork for a paid "remove ads" upgrade.

### Phase 4 — Alternatives / diversification (optional)
- If AdSense fill or approval is a problem, evaluate **Ezoic / Media.net** or a
  direct **affiliate card** (finance/budgeting offers fit the audience) rendered
  with the same `addAdBox()` slot — no third-party SDK, full styling control,
  and no spam/consent surface.

### Suggested order
`Phase 0 (verify) → Phase 1 (interpolate + label) → Phase 3 (consent + ad-free
flag) → Phase 2 (fill/house ads) → Phase 4 (only if AdSense underperforms).`

---

## Suggested overall sequencing
1. **Track 1, native-composer default** — removes the Twilio dependency/cost
   immediately with near-zero code.
2. **Track 2, Phase 0–1** — verify ads actually fill, then interpolate them
   through the list.
3. **Track 1, FCM push** — the real upgrade: free, reliable, carrier-free
   reminders for app users.
4. **Track 2, Phase 2–4** — squeeze yield and add consent/ad-free controls.
