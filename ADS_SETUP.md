# Ads in TABS

TABS shows ads in two different places depending on the platform:

| Platform | Network | Where it renders |
|---|---|---|
| **Web** | Google **AdSense** | One banner on the **login / signup landing page** only (`#landing-ad`) |
| **iOS app** | Google **AdMob** | A native **adaptive banner** anchored to the bottom of the screen |

There are **no in-list ads** and **no ad in the About Us modal** — those were
removed so ads stay minimal and unobtrusive. The old A-ADS integration is gone.

---

## Web — Google AdSense (login/signup only)

The banner lives in `#landing-ad` inside the `loginorsignupmodal` in
`index.html`. That page is intentionally sparse (Login / Signup / Continue as
Guest), so a single banner there is the only web ad placement.

- Ad client/slot are already filled in: client `ca-pub-7825788728707782`,
  slot `8944873686`.
- The AdSense loader (`adsbygoogle.js`) is included once at the top of
  `index.html`; the `<ins class="adsbygoogle">` + `push({})` sit in
  `#landing-ad`.
- Inside the iOS app the landing banner is **hidden** by `firebase-setup.js`
  (it checks `IS_NATIVE_APP`), because AdSense does not fill inside a WebView —
  the app shows the native AdMob banner instead.

### Why it may show nothing

AdSense does not serve until Google **reviews and approves** your site, and
small single-purpose utilities are often rejected for "low-value content."
Until you're approved the `<ins>` renders **blank** — that's expected, not a
bug. On `localhost` or with an ad blocker, `adsbygoogle.js` is also blocked
outright (`ERR_BLOCKED_BY_CLIENT`).

Either way, `script.js`'s `landingAdFallback()` detects the blocked/unfilled
state (an ad-blocker load failure, or AdSense stamping
`data-ad-status="unfilled"` on the `<ins>`) and swaps in the first-party
`#house-ad` card instead of leaving a labeled empty box.

### Changing it

Edit the `<ins>` in `#landing-ad` in `index.html` (client/slot/format). To move
or add a placement, add another `<ins>` + `push({})` on the page you want.

### GDPR / UK consent (EEA traffic)

Set up in the **AdSense console → Privacy & messaging → European regulations
(GDPR)** — create and publish a consent message for the site. Once published,
the *same* `adsbygoogle.js` loader already in `index.html` reads the visitor's
consent choice itself before serving personalized ads; nothing in the repo
needs to change. The message is geo-targeted automatically, so only EEA/UK
visitors see it. If a visitor declines consent, AdSense simply doesn't fill —
which the fallback above already treats as "unfilled" and shows the house-ad
card, so a declined-consent visitor still sees something useful instead of a
blank box.

---

## iOS — Google AdMob (native banner)

AdMob is a **native SDK**, so it cannot render inline inside the scrolling web
list. The app instead shows a native adaptive banner pinned to the bottom safe
area; the web view insets to make room only while an ad is actually showing.

Code lives in `ios/TABS/`:

- `WebViewController.swift` — builds the banner (`setupBannerAd`), gathers GDPR
  consent then requests App Tracking Transparency then loads the first ad
  (`gatherConsentThenLoadAd` → `proceedPastConsent` → `loadBannerAd`), and
  shows/hides it via `BannerViewDelegate`. The ad-unit ID is the
  `bannerAdUnitID` constant near the top of the class.
- `AppDelegate.swift` — starts the Mobile Ads SDK
  (`MobileAds.shared.start(...)`).
- `Info.plist` — `GADApplicationIdentifier`, `NSUserTrackingUsageDescription`,
  and `SKAdNetworkItems`.

### One-time setup (required before it serves real ads)

1. **Add the SDK** in Xcode via Swift Package Manager (same way Firebase /
   GoogleSignIn are added — the Xcode project expects packages to be added
   there):
   `https://github.com/googleads/swift-package-manager-google-mobile-ads`
   When adding it, check **both** products: `GoogleMobileAds` and
   **`UserMessagingPlatform`** — the second one is the GDPR consent SDK
   (`gatherConsentThenLoadAd` in `WebViewController.swift` imports it) and
   ships from the same package, so it's one checkbox, not a second package URL.
   The Swift code targets **v11+** of the SDK (types have no `GAD` prefix:
   `MobileAds`, `BannerView`, `Request`, `currentOrientationAnchoredAdaptiveBanner`,
   `ConsentInformation`, `ConsentForm`).
2. In the **AdMob console**, register the app and create a **banner** ad unit.
3. In the **AdMob console → Privacy & messaging → GDPR**, create and publish a
   consent message for the app (mirrors the AdSense step above, but this is a
   separate message — AdMob and AdSense each need their own). Until a message
   is published, `ConsentInformation.shared.canRequestAds` stays `false` for
   EEA/UK users and the banner never loads for them — this is correct/expected
   *before* you publish, not a bug once you have.
4. Replace the two placeholders — currently Google's **test** IDs, which always
   fill so you can verify layout without a live account:
   - `Info.plist` → `GADApplicationIdentifier` — the `ca-app-pub-…~…` **app** ID
   - `WebViewController.swift` → `bannerAdUnitID` — the `ca-app-pub-…/…` **unit** ID
5. Paste the full **`SKAdNetworkItems`** list from the Google Mobile Ads SDK
   docs into `Info.plist` (Google's own network is already listed; more entries
   improve attribution/fill).

Until you swap in the real IDs, the app shows AdMob **test ads**.

### Testing the GDPR consent form

The consent form only appears for users Google's geo-IP places in the EEA/UK,
so to see it from anywhere else, temporarily uncomment the `DebugSettings`
block in `gatherConsentThenLoadAd()` (`WebViewController.swift`) — it forces
`.EEA` geography for a listed test device. Find your test device ID in the
Xcode console the first time `MobileAds.shared.start` runs (AdMob logs it),
paste it into `testDeviceIdentifiers`, then remove/re-comment the block before
shipping.

---

## Privacy / App Store note

Because the iOS app shows the ATT prompt and uses AdMob, your **App Store
privacy nutrition labels** must declare identifier / usage-data collection by
the ad SDK. Keep the `NSUserTrackingUsageDescription` string accurate, and make
sure the privacy labels in App Store Connect match what AdMob actually collects.
