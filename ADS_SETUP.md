# Getting ads to display in the TABS person-list adbox

## Why AdSense isn't showing anything

Google AdSense is the *least* compatible option for TABS, for three reasons:

1. **Approval gate.** AdSense doesn't serve ads until Google reviews and approves
   your site. Small single-purpose utility apps like TABS are frequently
   rejected for "low-value / insufficient content," and until you're approved
   every `<ins class="adsbygoogle">` renders **blank**.
2. **WebView.** The mobile app is a WebView. AdSense's script often refuses to
   fill inside embedded WebViews (and can violate AdSense policy there).
3. **Ad blockers / dev.** On `localhost` and with a blocker installed, the
   `adsbygoogle.js` request is blocked outright (you saw
   `ERR_BLOCKED_BY_CLIENT` / "source URI is not allowed").

So "AdSense shows nothing" is expected here — it's not a bug in the code.

## The fix: a network that needs no approval — **A-ADS**

The code is now wired to **A-ADS (Anonymous Ads)** by default. A-ADS:

- **No approval, no account review** — you can have a live ad unit in ~2 minutes.
- Serves through a **plain `<iframe>`**, so it renders in normal browsers *and*
  inside the mobile WebView (where AdSense won't).
- No script tag, no personal data, no cookie-consent headache.

Trade-off: CPM (earnings per 1000 views) is lower than AdSense, and you can be
paid in crypto or, on request, other methods. For an app at this stage, "ads
that actually display and earn something" beats "AdSense that shows blanks."

### Step-by-step (A-ADS)

1. Go to **https://a-ads.com** and create a free account (email only).
2. Click **Create ad unit** (a.k.a. "Create advertisement").
3. Pick a **size** that fits the adbox — a responsive/banner unit around
   **320×90** or **300×100** works well in the person list. Give it a name like
   "TABS person list".
4. Save it. Open the unit and find the **Ad code** / **unit id** — it's the
   number in the iframe URL, e.g. `https://acceptable.a-ads.com/`**`2361455`**.
   You only need that **id** (the digits).
5. In **`firebase-setup.js`**, find `AD_CONFIG` (just above `addAdBox`) and set:
   ```js
   const AD_CONFIG = {
     provider: "aads",
     aadsUnitId: "2361455",   // ← your unit id here
     ...
   };
   ```
6. Add your **payout wallet/address** in the A-ADS dashboard so earnings can be
   sent.
7. Deploy the site (your normal web deploy). Reload TABS — a real ad now renders
   in the person list, on web and in the mobile app.

Until you paste a real `aadsUnitId`, the adbox shows a **house ad** (self-promo)
instead of a blank — so the slot is never empty.

## Higher earnings, still easy: **Adsterra** (optional upgrade)

If you outgrow A-ADS and want higher CPMs with still-fast approval, **Adsterra**
is the usual next step:

1. Sign up at **https://adsterra.com** as a **Publisher** (approval is usually
   quick — hours, not the weeks AdSense can take).
2. **Add website** → enter `tabsonfriends.com`.
3. Create a **Banner** ad unit (e.g. 320×50 or 300×250). Adsterra gives you a
   small **`<script>`/iframe snippet**.
4. Wiring Adsterra needs a couple of lines because it's a script, not a bare
   iframe. Easiest path: in `addAdBox()`, add an `else if (AD_CONFIG.provider
   === "adsterra")` branch that injects Adsterra's snippet into `inner`. Ping me
   and I'll add that branch and an `adsterraKey` field to `AD_CONFIG` — it's a
   5-minute change once you have the snippet.

## Keeping / re-enabling AdSense

If your site *does* get AdSense-approved later, just switch the provider — no
other code changes:

```js
const AD_CONFIG = { provider: "adsense", ... }; // client/slot already filled in
```

The existing `pushAdWhenVisible()` logic (waits until the box has layout width
before calling `adsbygoogle.push()`) still applies.

## Switching providers at a glance

Edit the one line in `firebase-setup.js`:

| You want… | Set `provider` to | Also set |
|---|---|---|
| Instant ads, any setup incl. WebView (recommended) | `"aads"` | `aadsUnitId` |
| Google ads (only after approval, web only) | `"adsense"` | already configured |
| No network yet — just self-promo | `"house"` | nothing |

## Where the ad renders

`addAdBox()` (in `firebase-setup.js`) appends one ad row (`.ad-box`) to the
person list after it loads, and again for guests. It's excluded from saved data
and from drag/reorder. To show ads more often (e.g. every N people) instead of a
single row, that's the "Phase 1 — interpolate" item in `ROADMAP.md` (Track 2).
