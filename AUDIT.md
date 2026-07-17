# TABS Interior App Audit — July 2026

> **Resolution status:** every finding below has been fixed on this branch
> except the three that need decisions/credentials only the owner has:
>
> 1. **AdMob production IDs (§1)** — the iOS app still uses Google's test
>    IDs. Swap in your real app/unit IDs from the AdMob console
>    (`Info.plist` → `GADApplicationIdentifier`, `WebViewController.swift` →
>    `bannerAdUnitID`); until then iOS serves $0 test/house ads.
> 2. **GDPR/UK consent banner (§1.3)** — gating `adsbygoogle.push()` on
>    consent needs a CMP vendor choice (Google's certified CMP list, or
>    Funding Choices). The ad code paths are otherwise unchanged, so a CMP
>    can be added around the single `push()` call in `index.html`.
> 3. **The giant `:not()` selector / `!important` CSS architecture (§4.3)** —
>    duplicates and dead rules were removed, but a full restyle to a
>    class-based button system is a design-level refactor left for a
>    dedicated pass (high regression risk for zero user-visible gain now).
>
> Notes on two fixes that changed behavior slightly:
> - Friend requests no longer carry the sender's phone number (§3.3). For
>   friendships made after this change, reminder SMS prefill falls back to
>   the friend-scoped profile read, which works once the other side has
>   logged in and synced `friendUids` (pushes are unaffected).
> - The web landing ad now swaps to a first-party "Support TABS" card when
>   AdSense is blocked or unfilled (§1), instead of a labeled empty box —
>   verified headless with the ad script blocked.

A full review of the web app (`index.html`, `script.js`, `firebase-setup.js`,
`currency.js`, `styles.css`), the database rules, the Cloud Functions, and the
ads setup. Findings are grouped by severity. File/line references are to the
state of the repo at the time of the audit.

---

## 1. Ads & the ad-blocker behavior (the reported issue)

**There are no house ads anywhere in the web code.** The only web ad is the
single AdSense banner in `#landing-ad` (`index.html:37-45`). What actually
happens today:

- **With an ad blocker (web):** `adsbygoogle.js` is blocked outright
  (`ERR_BLOCKED_BY_CLIENT`). The `<ins>` renders nothing, but the hardcoded
  `ADVERTISEMENT` label (`index.html:38`) **always renders** — so blocked
  users see a labeled empty hole on the landing page. Nothing "falls back";
  the box is just empty.
- **Without a blocker, before AdSense approval:** the `<ins>` is blank too
  (documented in `ADS_SETUP.md`). If Google *is* serving, an unapproved or
  low-fill account can serve **Google's own house/PSA ads** — that is the only
  way "house ads" can appear on web today, and it's Google's fallback, not the
  app's.
- **iOS app:** `bannerAdUnitID` (`WebViewController.swift:28`) and
  `GADApplicationIdentifier` (`Info.plist:76`) are still **Google's public
  TEST IDs** (`ca-app-pub-3940256099942544…`). Test units always fill with
  Google sample/house creatives and **earn $0**. If the app is in production
  like this, every ad shown is a house/test ad regardless of ad blockers.

**Recommended fixes**

1. Swap the AdMob test IDs for real app/unit IDs (see `ADS_SETUP.md` §iOS).
2. On web, detect the blocked/unfilled state and collapse the ad box instead
   of showing the bare `ADVERTISEMENT` label:
   - script blocked → `window.adsbygoogle` never gets a `loaded` processor;
     check `adsbygoogle.loaded !== true` after a timeout, or `onerror` on the
     loader `<script>`;
   - loaded but unfilled → AdSense stamps `data-ad-status="unfilled"` on the
     `<ins>`; hide (or replace with a first-party promo card — donate /
     invite-a-friend) when that appears.
3. `ADS_SETUP.md`/`ROADMAP.md` call for a consent banner (GDPR/UK CMP) before
   `adsbygoogle.push()` — not implemented. EEA traffic is currently served
   personalized ads without consent.
4. Dead leftovers from the retired in-list ad: `.ad-box` CSS rules
   (`styles.css:1825-1831`, `2149-2158`, including invalid `cursor: cursor;`),
   the `addAdBox()` no-op + its `ContinueasGuest` listener
   (`firebase-setup.js:1332-1345`), and the `.ad-box` exclusions in
   `saveListToFirebase`/`updateEmptyState`. Safe to delete.

---

## 2. Critical functional bugs

1. **Rejecting a friend request is broken by security rules.** The reject
   handler (`firebase-setup.js:2350-2360`) and
   `declineFriendRequestFromNotification` (`:2978-2985`) both do
   `remove(users/{sender}/sentRequests/{me})`. The rules only allow the
   *owner* to write `sentRequests` (`database.rules.json:70-76`), so that
   remove is **always denied**. In the Pending list the `Promise.all`
   rejection is unhandled — no toast, the list never refreshes, and the
   sender's "sent" badge is stuck forever. From the notification path it shows
   "Could not decline the request" even though the pending entry *was*
   removed. Fix: either allow the recipient to delete
   (`".write": "$uid === auth.uid || (auth.uid === $receiver_uid && !newData.exists())"`)
   or leave a "declined" marker the sender's client reconciles, like the
   accept flow already does.

2. **Broken Firebase script tags.** `index.html:509-510` load
   `firebasejs/9.6.10/firebase-app.js` / `firebase-auth.js` as classic
   scripts. Those are ESM builds — both throw `Unexpected token 'export'` in
   the console and do nothing. The app actually uses the v10.6.0 modules
   imported by `firebase-setup.js`. Delete both tags.

3. **The Stats chart doesn't exist.** `script.js:335` dispatches
   `renderSpendingChart`, but nothing listens for it, and Chart.js
   (`index.html:512`) is loaded and never used (~200 KB wasted). Either build
   the chart or drop the script + event.

4. **Random empty reminders.** `reminder-messages.json` ends with an empty
   string entry, so ~1 in 27 reminders picks `""` → the Cloud Function rejects
   it with "Missing message" and the user sees a random "Couldn't send"
   failure. Remove the empty entry. (Also: lines like "Don't make me blow you
   up 💣" / "Pay up, or else" read as threats out of context and are exactly
   what carrier spam filters and app reviewers flag.)

5. **Reset-password uses the wrong email.** `resetUserPassword`
   (`firebase-setup.js:834-856`) reads `signupEmail.value || loginEmail.value`.
   From the Profile → "Reset Password" button there's no visible email field —
   it silently uses whatever is left in the hidden signup/login inputs, or
   errors. When logged in it should use `currentUser.email`.

6. **Payment links send the wrong amount for non-USD users.**
   `openPaymentRequestModal` (`firebase-setup.js:3208-3212`) reads the
   *displayed converted* amount (`.textContent`) instead of the canonical USD
   `.value`. With EUR selected, a €9.20 display builds
   `venmo.com/...?amount=9.20` — Venmo/PayPal/Cash App treat that as **$9.20**.
   Use `amountSpan.value` (USD) for the links.

7. **Signup race + collision handling.** The email signup handler
   (`firebase-setup.js:813`) writes `friendCodes/{code}` with
   `currentUser.uid`, which is set asynchronously by `onAuthStateChanged` and
   can still be `null` → TypeError, caught as "Signup failed" *after* the
   account was created. Use the local `user.uid`. Friend-code collisions
   (8-char `Math.random`) are also unhandled — the rules deny overwriting
   someone else's code, which again surfaces as "Signup failed" post-creation.

8. **No live sync / last-writer-wins data loss.** The list renders from a
   one-shot `get()` and every edit rewrites the entire `peopleData` array from
   the DOM (`saveListToFirebase`). Two devices (or web + iOS app) editing the
   same account silently clobber each other's changes, and remote changes
   never appear without a reload (only the totals use `onValue`).

9. **"Error loading friends list." flashes for everyone.**
   `window.onload = populateFriendsList` (`firebase-setup.js:2244`) runs
   before auth resolves; `currentUser` is null, the ref path throws, and the
   catch writes the error `<li>`. Guests see it too instead of a "log in to
   use friends" message.

10. **Copy-friend-code fallback is broken.** `copyText()` (`script.js:412`)
    calls `.select()` on a `<p>` (doesn't exist on paragraphs → throws), and
    its success toast passes `"error"` type, so "Text copied!" renders red.

11. **Loader is never dismissed for logged-out visitors.** `#loader` defaults
    to `display:flex` (`styles.css:2408`) and the logged-out branch of
    `onAuthStateChanged` never hides it — it just spins behind the landing
    modal. Harmless-looking but it's live DOM animating forever.

12. **Dead "input" listener on amounts.** `addPerson` attaches an `input`
    listener to a plain `<span>` (`firebase-setup.js:1219`) — spans never fire
    `input`, so that debounced save never runs.

13. **Stats labels fight the HTML.** `renderTotals` writes "Total Spent" into
    `#total-spending` (HTML label: "Total Money"), and "Amount Earned" into
    `#amount-earned` (HTML label: "Earned Back"). Also "Total Spent" =
    iOwe + owesMe summed together, which isn't "spent" by any definition.

14. **Clear-list empty check is wrong.** `clearListBtn` compares
    `peopleList.innerHTML === ""` (`firebase-setup.js:2011`); the leftover
    `#extra-info-container` div makes a visually empty list count as
    non-empty, so it "clears" nothing and toasts success.

15. **Duplicate IDs (invalid HTML).** `editMoneyInput` ×2, `closeEditMoney`
    ×2, `google-icon` ×2. The JS works around them with
    `querySelector("#editMoneyAdd input")`, but `getElementById` on any of
    these is a coin flip; rename them.

---

## 3. Security & privacy

1. **Any user can read the entire user directory.** `friendCodes` has
   `".read": "auth != null"` at the top level — one `get(friendCodes)` returns
   **every user's friend code, full name, and uid**. (The dead
   `getFriendCodeByUserId` even relied on scanning it.) Scope reads to
   individual codes: move `.read` under `$code`, so lookups by exact code
   still work but enumeration doesn't.

2. **Anyone can write *and delete* notifications in anyone's inbox.**
   `notifications/$notif_id` is writable by any authenticated user
   (`database.rules.json:36-39`); deletion passes validation because
   `!newData.exists()` short-circuits it. So any user can spam unlimited
   toasts to any uid, overwrite existing notifications (e.g. rewrite a
   friend-request notification's `fromUserId` to hijack the notification
   Accept button), or silently delete someone's notifications. At minimum:
   only allow *creation* (`!data.exists()`), validate `type` against a
   whitelist, cap `message.length`, and require `fromUid === auth.uid`.

3. **Friend requests leak your phone number before acceptance.**
   `sendFriendRequest` copies the sender's `phoneNumber` into the recipient's
   `pendingRequests` (`firebase-setup.js:2294`). Anyone who knows your friend
   code gets your phone number just by *receiving* your request — but also,
   anyone you send a request to can read your number **without accepting**.
   Consider only mirroring the number at accept time (the acceptance-marker
   flow already does this direction correctly).

4. **Deleted accounts leave orphans.** `deleteAccount` (functions) removes
   `users/{uid}` and the Auth record, but not the user's `friendCodes/{code}`
   entry (now permanently unclaimable, since the rules require the owner to
   overwrite it), nor their entries in other users' `friendsList`/`friendUids`
   /`pendingRequests`/`sentRequests`. Ghost friends persist forever.

5. **No abuse limits on the callables.** `sendReminderPush` lets a "friend"
   push unlimited, attacker-worded (320-char) notifications to your lock
   screen with no rate limit and no App Check. Same for `sendFriendEventPush`.

6. **CI deploys production from stale feature branches.**
   `.github/workflows/deploy-functions.yml` triggers on pushes to
   `claude/notifications-ui-fixes-8tsm89` and
   `claude/twilio-alternative-ads-medk8f` — old branches that can still ship
   functions + database rules to prod. Restrict to `main`.

7. **SECURITY.md is the untouched GitHub template** — placeholder prose and a
   fictional version table. Replace or delete.

---

## 4. Styling & UX flaws

1. **Invalid CSS:** `cursor: cursor` (`.ad-box`), `font-size: 10x`
   (`#Subscript`), `z-index: 10px` (`#addFriendIcon`), `align-items: left`
   (`.name-amount-container`).
2. **Cascade-order landmine:** `.friend-icon { font-size: 100px }`
   (`styles.css:834`) is only prevented from rendering a giant 100px icon
   because the Material Icons stylesheet happens to load *after* `styles.css`
   and re-set 24px at equal specificity. Reordering the `<link>` tags blows up
   every friend row.
3. **Heavy duplication / specificity war:** `#currency-select` styled three
   separate times with conflicting values; `.hidden` declared twice; the
   `max-height: 450px` sidenav block duplicated verbatim; three stacked
   `min-width: 600px` layers overriding each other; 100+ `!important`s and a
   12-line `:not()` chain selector (`styles.css:3290`) that will break the
   moment any button is added or renamed.
4. **Dead rules:** `#friendslist` (lowercase, `styles.css:2360`) matches
   nothing (real id `friendsList`) — the red full-width overlay it describes
   never applies; `#Special`, `#closeSignup/#closeLogin`, `.dropdown-content`
   / `.dropbtn` (two identical `window.onclick` handlers in `script.js` close
   dropdowns that don't exist in the DOM).
5. **Confirm dialogs show only the destructive option.**
   `.close-btn { display:none !important }` hides every Cancel/No button, so
   "Clear your account history?" renders with only **Yes** (Cancel is the ✕
   in the corner). Same for remove-friend and delete-account. Keep visible
   cancel buttons on destructive confirmations.
6. **Nested scrollbars on desktop:** `.personlist { overflow-y: scroll }` +
   `padding-bottom: 96px` (applied at all widths by the dock layer) wraps the
   already-scrolling `#people-list` (max-height 66vh) in a second scroll
   container.
7. **Landing page details:** `<title>` is literally `"  TABS  "` (stray
   whitespace); `ADVERTISEMENT` label color `#8aa` fails WCAG contrast on the
   card; the phone input's `pattern` (`123-456-7890`) contradicts the JS
   formatter (`(123) 456-7890`) — never enforced since there is no `<form>`,
   which also means no Enter-to-submit anywhere in login/signup.
8. **Accessibility:** modals lack `role="dialog"`/`aria-modal`/focus trapping;
   accept/decline buttons are bare `✔️`/`❌` with no labels; owes/owed state
   is color-only (red/green text); `href="javascript:void(0)"` links; the
   folder "…" open button is a `<span>` with no role, no keyboard access.
9. **Toast inconsistencies:** two divergent `showToast` copies (script.js vs
   firebase-setup.js) with different durations and different greens/reds.
10. Typos user-facing: "Add an Note", "cancel" lowercase on some buttons /
    "Close" on others, `AddOrCancleButtons` class, `editinffo*` ids, "They
    will be upset.." double period.

---

## 5. Dead / vestigial code

- `getFriendCodeByUserId`, `openSignUp` (capital U duplicate of
  `openSignup`), `moreinfo`, the two dropdown `window.onclick` handlers,
  the second `debounce` in `firebase-setup.js` (shares a single global timer
  across all uses), `#extra-info-container` in the HTML (the real containers
  are created per row), `#friendInputBox` CSS, `firebase-setup.js`'s
  `sendReminderSmsViaTwilio` (no call sites — the push path replaced it, but
  the Twilio function + secrets + workflow env plumbing are all still live),
  the `interest-btn` styled as `danger-btn` though it's not destructive.
- `checkEmptyList` adds a "No Friends Added" `<li>` on DOMContentLoaded that
  `populateFriendsList` immediately overwrites.

---

## 6. Quick-win fix list (ordered)

1. Fix reject/decline friend-request rules bug (§2.1) — visible feature break.
2. Delete the two broken Firebase v9 script tags + Chart.js (§2.2, §2.3).
3. Remove the empty string from `reminder-messages.json` (§2.4).
4. Lock down `friendCodes` reads and `notifications` writes (§3.1, §3.2).
5. Use `user.uid` in signup, `currentUser.email` in reset-password (§2.5, §2.7).
6. Use canonical USD `.value` for payment links (§2.6).
7. Swap AdMob test IDs; collapse `#landing-ad` when blocked/unfilled (§1).
8. Restrict the deploy workflow to `main` (§3.6).
