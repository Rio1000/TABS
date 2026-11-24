// Cloud Functions for TABS
//
// Callable functions for the things the browser must not be trusted to do on
// its own: delivering push notifications to OTHER users' devices (with
// server-chosen text), account deletion/disabling (Admin-only Auth calls), and
// user reports for moderation.
//
// Deploy: handled by GitHub Actions (.github/workflows/deploy-functions.yml),
// from main only. firebase.json's functions "predeploy" hook copies the root
// reminder-messages.json into this folder first (see
// scripts/copy-reminder-messages.js), so the website and these functions share
// one list of reminder templates.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// The deployed copy lives next to this file (written by the predeploy hook and
// gitignored). The fallback lets the code load straight from a checkout (local
// tests / emulator) before the hook has ever run.
let reminderMessagesFile;
try {
  reminderMessagesFile = require("./reminder-messages.json");
} catch (err) {
  reminderMessagesFile = require("../reminder-messages.json");
}
const REMINDER_TEMPLATES = (Array.isArray(reminderMessagesFile?.messages)
  ? reminderMessagesFile.messages
  : []
).filter((t) => typeof t === "string" && t.length > 0);

admin.initializeApp();

// Firebase Auth uids are <= 128 chars; RTDB keys can't contain . # $ [ ] /.
// Checking the shape stops a crafted id from walking into another path
// (e.g. "victim/notifications") when it's interpolated into a ref.
function isValidUid(uid) {
  return typeof uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

// Display text that ends up on someone's lock screen: drop control/format
// characters (incl. bidi overrides), collapse whitespace, cap the length by
// code point so an emoji isn't split in half.
function cleanDisplayText(raw, maxLen) {
  if (typeof raw !== "string") return "";
  const s = raw
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(s).slice(0, maxLen).join("").trim();
}

function profileDisplayName(profile, fallback) {
  const p = profile || {};
  const first = cleanDisplayText(p.firstName, 40);
  const last = cleanDisplayText(p.lastName, 40);
  return [first, last].filter(Boolean).join(" ") || fallback;
}

// Currency symbols the client can put in front of (or after) an amount — the
// symbols from currency.js's CURRENCIES list — plus the ISO 4217 codes the
// client's rate API (open.er-api.com) returns, which currency.js getSymbol()
// falls back to for a currency without a listed symbol. A single Unicode
// currency-symbol character is accepted too. An allowlist (rather than "any
// three capital letters") keeps words like "NOW" or "PAY" out.
const KNOWN_CURRENCY_SYMBOLS = new Set([
  "$", "€", "£", "¥", "A$", "C$", "CHF", "HK$", "NZ$", "kr", "₹", "S$", "₩",
  "Mex$", "R$", "R", "AED", "SAR", "₺", "zł", "฿", "Rp", "₱", "RM", "₫", "₪",
  "E£", "₦", "₨", "Kč", "Ft", "lei", "CLP$", "COL$", "AR$", "NT$",
]);
const ISO_CURRENCY_CODES = new Set([
  "USD", "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN",
  "BHD", "BIF", "BMD", "BND", "BOB", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLF",
  "CLP", "CNH", "CNY", "COP", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB",
  "EUR", "FJD", "FKP", "FOK", "GBP", "GEL", "GGP", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL",
  "HRK", "HTG", "HUF", "IDR", "ILS", "IMP", "INR", "IQD", "IRR", "ISK", "JEP", "JMD", "JOD", "JPY", "KES",
  "KGS", "KHR", "KID", "KMF", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD",
  "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN",
  "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD",
  "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN",
  "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TVD", "TWD", "TZS", "UAH", "UGX", "UYU",
  "UZS", "VES", "VND", "VUV", "WST", "XAF", "XCD", "XCG", "XDR", "XOF", "XPF", "YER", "ZAR", "ZMW", "ZWG",
  "ZWL",
]);

function isCurrencyToken(token) {
  return (
    KNOWN_CURRENCY_SYMBOLS.has(token) ||
    ISO_CURRENCY_CODES.has(token) ||
    /^\p{Sc}$/u.test(token)
  );
}

// The phrase the client substitutes when a tab has no numeric amount (e.g.
// auto-reminders without a saved balance).
const AMOUNT_FALLBACK_PHRASE = "what you owe";

// Validate the pre-formatted amount the client fills into {amount}. Accepts
// what the client actually produces — `${symbol}${n.toFixed(2)}` such as
// "$12.50", "Mex$1234.00", "$-5.00", "kr12.00", "CHF3.50" — plus common
// locale variants ("1,234.56 €", "1.234,56", "-$5", "USD 20"). Rejects letters
// beyond a short currency code, markup, URLs, and anything over 24 chars.
// Returns the normalized string, or null when invalid.
function normalizeReminderAmount(raw) {
  if (raw === undefined || raw === null || raw === "") return AMOUNT_FALLBACK_PHRASE;
  if (typeof raw !== "string") return null;
  const s = raw
    .normalize("NFC")
    .replace(/[  ]/g, " ")
    .trim();
  if (!s || s.length > 24) return null;
  if (s === AMOUNT_FALLBACK_PHRASE) return s;

  const NUMBER = "(?:\\d{1,3}(?:[,.' ]\\d{3})+(?:[.,]\\d{1,2})?|\\d{1,12}(?:[.,]\\d{1,2})?)";
  const re = new RegExp(
    `^([\\-\\u2212])?(?:([^\\s\\d\\-\\u2212]{1,4}) ?)?([\\-\\u2212])?(${NUMBER})(?: ?([^\\s\\d]{1,4}))?$`,
    "u"
  );
  const m = s.match(re);
  if (!m) return null;
  const [, sign1, prefix, sign2, , suffix] = m;
  if (sign1 && sign2) return null;
  if (prefix && suffix) return null;
  if (prefix && !isCurrencyToken(prefix)) return null;
  if (suffix && !isCurrencyToken(suffix)) return null;
  if (sign2 && !prefix) return null; // "--5" style double sign
  return s;
}

// Fill a reminder template in ONE pass, so a name that happens to contain
// "{amount}" (or vice versa) is never expanded a second time.
function fillReminderTemplate(template, name, amount) {
  return template.replace(/\{name\}|\{amount\}/g, (token) =>
    token === "{name}" ? name : amount
  );
}

// Has `ownerUid` blocked `otherUid`? (users/{owner}/blocked/{other})
async function hasBlocked(db, ownerUid, otherUid) {
  const snap = await db.ref(`users/${ownerUid}/blocked/${otherUid}`).get();
  return snap.exists();
}

// The recipient's Manage Notifications settings (users/{uid}/settings/
// notifications = { enabled, friends, reminders }). Missing node or key means
// "on", matching the client's defaults.
async function notificationPrefs(db, uid) {
  const snap = await db.ref(`users/${uid}/settings/notifications`).get();
  return snap.val() || {};
}

// Cross-user in-app notifications are written ONLY here, server-side: the
// database rules no longer let one user write into another user's inbox, so
// no sender-written text can land there. Their bodies are server templates
// whose only free text is the sender's own display name (a reminder also
// carries a strictly validated amount). Each one is also appended to
// deliveryLog/{fromUid}/{toUid} (no client can read or write it), which is
// what reportUser uses as tamper-proof evidence. Best-effort: a failure here
// never blocks the push itself.
//
// Options:
//   key   - write the inbox copy at users/{toUid}/notifications/{key} with
//           set() instead of push(), so a repeated event (e.g. a re-sent
//           friend request) replaces its earlier copy rather than piling up.
//   inbox - false records the message in deliveryLog only (used for accepts,
//           whose inbox copy the recipient's own client writes).
const DELIVERY_LOG_KEEP = 20; // most recent entries kept per sender/recipient pair

async function writeServerNotification(
  db,
  { toUid, fromUid, type, message, extra = {}, key = null, inbox = true }
) {
  const text = String(message).slice(0, 500); // same cap the rules apply
  if (inbox) {
    try {
      const inboxRef = db.ref(`users/${toUid}/notifications`);
      const entry = {
        ...extra,
        type,
        message: text,
        fromUid,
        read: false,
        timestamp: admin.database.ServerValue.TIMESTAMP,
      };
      if (key) {
        await inboxRef.child(key).set(entry);
      } else {
        await inboxRef.push(entry);
      }
    } catch (err) {
      logger.warn(`In-app notification ${fromUid} -> ${toUid} failed:`, err);
    }
  }
  try {
    const pairRef = db.ref(`deliveryLog/${fromUid}/${toUid}`);
    // A replay of the exact same message (same type and text as the newest
    // entry) isn't logged again, so repeating an event that has no cooldown
    // in front of its inbox write can't push older evidence out of the log.
    const newestSnap = await pairRef.orderByKey().limitToLast(1).get();
    let duplicate = false;
    newestSnap.forEach((child) => {
      const n = child.val() || {};
      if (n.type === type && n.message === text) duplicate = true;
    });
    if (duplicate) return;
    await pairRef.push({ type, message: text, sentAt: admin.database.ServerValue.TIMESTAMP });
    // Push keys sort chronologically; drop all but the newest few.
    const keys = Object.keys((await pairRef.get()).val() || {}).sort();
    const excess = keys.slice(0, Math.max(0, keys.length - DELIVERY_LOG_KEEP));
    if (excess.length) {
      await pairRef.update(Object.fromEntries(excess.map((k) => [k, null])));
    }
  } catch (err) {
    logger.warn(`Delivery log ${fromUid} -> ${toUid} failed:`, err);
  }
}

// Deliver a push notification to every device a user has registered, across
// both transports we support: web browsers and the native iOS app register raw
// FCM tokens; the legacy Expo (Android) app registers Expo push tokens
// ("ExponentPushToken[...]"). Dead tokens both services report are pruned.
// Shared by the reminder and friend-event callables below. Never throws —
// returns a delivery summary.
async function deliverPushToUser(db, targetUid, { title, body, data }) {
  const tokensSnap = await db.ref(`users/${targetUid}/pushTokens`).get();
  const tokens = tokensSnap.exists() ? Object.keys(tokensSnap.val()) : [];
  if (tokens.length === 0) {
    return { delivered: false, reason: "no-devices", successCount: 0, totalTokens: 0, fcmCount: 0, expoCount: 0 };
  }

  const isExpo = (t) =>
    t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[");
  const expoTokens = tokens.filter(isExpo);
  const fcmTokens = tokens.filter((t) => !isExpo(t));

  const linkUrl = "https://tabsonfriends.com";
  const payloadData = data || {};
  let successCount = 0;
  const stale = [];

  // --- Web / FCM ---
  if (fcmTokens.length > 0) {
    try {
      const resp = await admin.messaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: { title, body },
        data: payloadData,
        webpush: {
          notification: { title, body, icon: "/logo.png" },
          fcmOptions: { link: linkUrl },
        },
      });
      successCount += resp.successCount;
      resp.responses.forEach((r, i) => {
        const code = r.error?.code;
        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token" ||
          code === "messaging/invalid-argument"
        ) {
          stale.push(fcmTokens[i]);
        }
      });
    } catch (err) {
      logger.error("FCM send failed:", err);
    }
  }

  // --- Mobile / Expo ---
  if (expoTokens.length > 0) {
    try {
      const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          expoTokens.map((to) => ({
            to,
            title,
            body,
            sound: "default",
            data: payloadData,
          }))
        ),
      });
      const json = await expoRes.json();
      const receipts = Array.isArray(json?.data) ? json.data : [];
      receipts.forEach((receipt, i) => {
        if (receipt?.status === "ok") {
          successCount += 1;
        } else if (receipt?.details?.error === "DeviceNotRegistered") {
          stale.push(expoTokens[i]);
        }
      });
    } catch (err) {
      logger.error("Expo push send failed:", err);
    }
  }

  // Prune tokens both services reported as dead.
  await Promise.all(
    stale.map((t) =>
      db.ref(`users/${targetUid}/pushTokens/${t}`).remove().catch(() => {})
    )
  );

  return {
    delivered: successCount > 0,
    successCount,
    totalTokens: tokens.length,
    fcmCount: fcmTokens.length,
    expoCount: expoTokens.length,
    reason: successCount > 0 ? null : "all-failed",
  };
}

// Simple per-action cooldown, stored under a rules-inaccessible path (no
// client rule grants /rateLimits, so only the Admin SDK can touch it). Returns
// true when the action is allowed and stamps the new timestamp; false while
// the cooldown is still running. Keeps a caller from spamming a friend's lock
// screen with unlimited pushes.
async function passesCooldown(db, key, cooldownMs) {
  const limitRef = db.ref(`rateLimits/${key}`);
  const snap = await limitRef.get();
  const last = snap.val() || 0;
  const now = Date.now();
  if (now - last < cooldownMs) return false;
  await limitRef.set(now);
  return true;
}

// Send a reminder as a real PUSH notification to the friend's device(s), via
// Firebase Cloud Messaging / Expo. The recipient just needs to have granted
// notification permission on the web app or mobile app, which registers a
// token under users/{uid}/pushTokens.
//
// The TEXT is chosen here, never by the client: the request names one of the
// templates in reminder-messages.json by index plus the already-formatted
// amount, {name} is filled from the recipient's own profile, and the amount is
// strictly validated. Older clients that still send free-text `message` get a
// failed-precondition asking them to refresh.
//
// Request: { friendUid: string, templateIndex: integer, amount: string }
exports.sendReminderPush = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerUid = request.auth.uid;
  const data = request.data || {};
  const friendUid = typeof data.friendUid === "string" ? data.friendUid.trim() : "";

  if (!friendUid) {
    throw new HttpsError("invalid-argument", "Missing friendUid.");
  }
  if (!isValidUid(friendUid) || friendUid === callerUid) {
    throw new HttpsError("invalid-argument", "Invalid friendUid.");
  }
  if (data.templateIndex === undefined || data.templateIndex === null) {
    // A cached pre-launch client sending { message }.
    throw new HttpsError("failed-precondition", "Please refresh TABS to send reminders.");
  }
  if (!Number.isInteger(data.templateIndex) || data.templateIndex < 0) {
    throw new HttpsError("invalid-argument", "Invalid reminder template.");
  }
  if (REMINDER_TEMPLATES.length === 0) {
    logger.error("No reminder templates loaded (reminder-messages.json).");
    throw new HttpsError("internal", "Reminders are unavailable right now.");
  }
  // A cached client may hold a longer template list than the one deployed
  // here; wrap instead of failing so its reminder still goes out. Templates
  // are only ever appended (never reordered or removed — see SETUP.md), so
  // every in-range index keeps meaning the same text.
  const templateIndex = data.templateIndex % REMINDER_TEMPLATES.length;
  const amount = normalizeReminderAmount(data.amount);
  if (amount === null) {
    throw new HttpsError("invalid-argument", "Invalid amount.");
  }

  const db = admin.database();

  // Only a CONFIRMED friend (verified from the recipient's own friendUids
  // index, which only they can write) can be notified — you can't push to an
  // arbitrary UID you happen to know.
  const friendshipSnap = await db
    .ref(`users/${friendUid}/friendUids/${callerUid}`)
    .get();
  if (!friendshipSnap.exists()) {
    throw new HttpsError(
      "permission-denied",
      "You can only remind a confirmed friend."
    );
  }

  // One reminder per friend per minute — enough for every legitimate flow,
  // but stops a "friend" hammering someone's lock screen.
  if (!(await passesCooldown(db, `reminder/${callerUid}/${friendUid}`, 60_000))) {
    throw new HttpsError(
      "resource-exhausted",
      "You just reminded them — give it a minute before sending another."
    );
  }

  // The recipient blocked the caller: answer exactly like "they have no
  // devices" so the block isn't revealed. Checked after the cooldown so the
  // rate-limit behaviour is identical too.
  if (await hasBlocked(db, friendUid, callerUid)) {
    return { delivered: false, reason: "no-devices", successCount: 0 };
  }

  const [recipientNameSnap, callerProfileSnap] = await Promise.all([
    db.ref(`users/${friendUid}/profile/firstName`).get(),
    db.ref(`users/${callerUid}/profile`).get(),
  ]);
  const recipientName = cleanDisplayText(recipientNameSnap.val(), 40) || "friend";
  const body = fillReminderTemplate(
    REMINDER_TEMPLATES[templateIndex],
    recipientName,
    amount
  );

  // Put the requester's name on the notification so the recipient knows who's
  // asking (the message body says "you owe me…" — this makes "me" concrete).
  const callerName = profileDisplayName(callerProfileSnap.val(), "");
  const title = callerName ? `Reminder from ${callerName}` : "TABS reminder";

  // The in-app inbox copy, written here (not by the sender's client) so it
  // carries exactly the server-built text. It is stored even when the
  // recipient muted reminders; their own client hides muted types in the
  // inbox (and its unread badge), and the mute below only skips the push.
  await writeServerNotification(db, {
    toUid: friendUid,
    fromUid: callerUid,
    type: "reminder-received",
    message: `${callerName || "A friend"} sent you a reminder: ${body}`,
  });

  // Respect the recipient's Manage Notifications settings (master switch +
  // "Payment reminders"). Answer like "no devices" so the sender's client
  // shows its usual "reminded in-app" message and the mute isn't revealed.
  const prefs = await notificationPrefs(db, friendUid);
  if (prefs.enabled === false || prefs.reminders === false) {
    return { delivered: false, reason: "no-devices", successCount: 0 };
  }

  const result = await deliverPushToUser(db, friendUid, {
    title,
    body,
    data: { type: "sms-reminder", fromUid: callerUid },
  });

  if (result.reason === "no-devices") {
    // Not an error — the friend just hasn't enabled notifications on any
    // device. The client uses this to show a helpful message.
    return { delivered: false, reason: "no-devices", successCount: 0 };
  }

  logger.info(
    `Push by ${callerUid} to ${friendUid} (template ${templateIndex}): ` +
      `${result.successCount}/${result.totalTokens} delivered ` +
      `(${result.fcmCount} web, ${result.expoCount} mobile)`
  );
  return {
    delivered: result.delivered,
    successCount: result.successCount,
    reason: result.reason,
  };
});

// Delete the caller's own account — both their database data AND their Firebase
// Auth record — server-side. Doing it here with the Admin SDK avoids the
// client-side `auth/requires-recent-login` error that used to leave the Auth
// user behind (visible in the Firebase Auth console) after the data was already
// gone. A user can only ever delete themselves: the uid comes from their auth
// token, never from client input.
exports.deleteAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  const db = admin.database();
  try {
    // Gather everything that references this user BEFORE deleting their node:
    // their friend code, plus every uid they have any relationship with
    // (friends, and both directions of pending requests). Without this pass,
    // deletion used to leave a permanently unclaimable friendCodes entry and
    // ghost friends/requests in other users' lists.
    const [codeSnap, friendsSnap, sentSnap, pendingSnap] = await Promise.all([
      db.ref(`users/${uid}/profile/friendCode`).get(),
      db.ref(`users/${uid}/friendsList`).get(),
      db.ref(`users/${uid}/sentRequests`).get(),
      db.ref(`users/${uid}/pendingRequests`).get(),
    ]);

    const relatedUids = new Set();
    if (friendsSnap.exists()) {
      friendsSnap.forEach((child) => {
        const friendUid = child.val()?.userId;
        if (friendUid) relatedUids.add(friendUid);
      });
    }
    if (sentSnap.exists()) Object.keys(sentSnap.val()).forEach((k) => relatedUids.add(k));
    if (pendingSnap.exists()) Object.keys(pendingSnap.val()).forEach((k) => relatedUids.add(k));

    const cleanups = [];
    const code = codeSnap.val();
    if (code) cleanups.push(db.ref(`friendCodes/${code}`).remove());

    for (const otherUid of relatedUids) {
      cleanups.push(db.ref(`users/${otherUid}/friendUids/${uid}`).remove());
      cleanups.push(db.ref(`users/${otherUid}/pendingRequests/${uid}`).remove());
      cleanups.push(db.ref(`users/${otherUid}/sentRequests/${uid}`).remove());
      cleanups.push(db.ref(`users/${otherUid}/autoReminders/${uid}`).remove());
      // Server delivery log of what this user received from them.
      cleanups.push(db.ref(`deliveryLog/${otherUid}/${uid}`).remove());
      // friendsList entries are push-keyed, so find the one(s) pointing at us.
      cleanups.push(
        db
          .ref(`users/${otherUid}/friendsList`)
          .get()
          .then((snap) => {
            const removals = [];
            snap.forEach((child) => {
              if (child.val()?.userId === uid) removals.push(child.ref.remove());
            });
            return Promise.all(removals);
          })
      );
    }
    // Best-effort: a failed cross-user cleanup shouldn't block the deletion.
    await Promise.allSettled(cleanups);

    // Removes everything under users/{uid} — profile, lists, notifications,
    // pushTokens, and the user's own blocked list (users/{uid}/blocked).
    // Other people's blocked entries naming this uid are left alone: they
    // belong to those users and keep protecting them.
    await db.ref(`users/${uid}`).remove();
    // Everything the server delivered on this user's behalf (reminder and
    // friend-request texts kept as report evidence) goes with them.
    await db.ref(`deliveryLog/${uid}`).remove();
    // Their rate-limit stamps are pure bookkeeping; drop the top-level ones
    // keyed by this caller (best-effort).
    await Promise.allSettled(
      ["reminder", "friendEvent", "report"].map((k) =>
        db.ref(`rateLimits/${k}/${uid}`).remove()
      )
    );
    await admin.auth().deleteUser(uid);
    logger.info(`Account deleted: ${uid} (cleaned ${relatedUids.size} related users)`);
    return { success: true };
  } catch (err) {
    logger.error("Account delete failed:", err);
    throw new HttpsError("internal", "Could not delete the account.");
  }
});

// Disable the caller's own account. Disabling a Firebase Auth user is an
// Admin-only operation — the browser SDK can't do it, which is why the old
// client-side "disable" only set a database flag and never showed up on the
// Firebase Auth page. This flips the real `disabled` flag so the account can no
// longer sign in, and mirrors it into the profile for the app's own checks.
exports.disableAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const uid = request.auth.uid;
  try {
    await admin.auth().updateUser(uid, { disabled: true });
    await admin
      .database()
      .ref(`users/${uid}/profile/accountDisabled`)
      .set(true);
    logger.info(`Account disabled: ${uid}`);
    return { success: true };
  } catch (err) {
    logger.error("Account disable failed:", err);
    throw new HttpsError("internal", "Could not disable the account.");
  }
});

// Push notifications for friend requests — both directions. Implemented as a
// callable the client invokes right after it writes the request / acceptance,
// rather than a database trigger: a trigger would be this project's first
// event-driven function and needs Eventarc/Pub-Sub/Run IAM bindings the CI
// deploy service account can't grant, whereas callables need none of that.
//
// The person taking the action (sending or accepting) is by definition online,
// so they can make this call — and it reaches the OTHER user's devices even
// when that user is offline. No client can write into another user's inbox,
// so the in-app copy of a friend request is written here too (server
// template; the only free text is the sender's own display name). The
// "accepted" inbox copy is written by the original sender's own client when it
// reconciles the acceptance marker; for accepts this function only logs the
// message as report evidence and pushes it.
//
// kind:
//   "request" -> caller sent a friend request; notify the recipient (toUid).
//   "accept"  -> caller accepted toUid's request; notify the original sender.
// Each is verified against the DB, so a caller can't push to an arbitrary uid
// they happen to know. For "accept" the client calls this BEFORE writing the
// acceptance marker, while toUid's sentRequests entry still exists.
exports.sendFriendEventPush = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const callerUid = request.auth.uid;
  const toUid = String(request.data?.toUid || "").trim();
  const kind = String(request.data?.kind || "").trim();
  if (!toUid) {
    throw new HttpsError("invalid-argument", "Missing toUid.");
  }
  if (!isValidUid(toUid) || toUid === callerUid) {
    throw new HttpsError("invalid-argument", "Invalid toUid.");
  }
  if (kind !== "request" && kind !== "accept") {
    throw new HttpsError("invalid-argument", "Invalid kind.");
  }

  const db = admin.database();

  // Verify the caller actually performed the action they're notifying about.
  if (kind === "request") {
    // The request the caller sent lives in the recipient's pendingRequests.
    const snap = await db
      .ref(`users/${toUid}/pendingRequests/${callerUid}`)
      .get();
    if (!snap.exists() || snap.val()?.type === "accepted") {
      throw new HttpsError("permission-denied", "No matching friend request.");
    }
  } else {
    // The caller accepted toUid's request: they're now friends on the
    // caller's own side (an index only the caller can write), AND toUid
    // really did send the caller a request (toUid's own sentRequests entry,
    // which only toUid can create). Without the second check anyone could
    // "accept" a request that was never sent.
    const [friendSnap, sentSnap] = await Promise.all([
      db.ref(`users/${callerUid}/friendUids/${toUid}`).get(),
      db.ref(`users/${toUid}/sentRequests/${callerUid}`).get(),
    ]);
    if (!friendSnap.exists()) {
      throw new HttpsError("permission-denied", "Not friends with that user.");
    }
    if (!sentSnap.exists()) {
      throw new HttpsError("permission-denied", "No matching friend request.");
    }
  }

  // The recipient blocked the caller. (Rules already stop a blocked user
  // writing a new pendingRequests entry, so this mostly covers the accept
  // path.) Nothing is written for a blocked caller, and the answer below
  // looks exactly like "no devices" so the block isn't revealed.
  const blocked = await hasBlocked(db, toUid, callerUid);

  const cpSnap = await db.ref(`users/${callerUid}/profile`).get();
  const name = profileDisplayName(cpSnap.val(), "Someone");
  const body =
    kind === "request"
      ? `${name} sent you a friend request`
      : `${name} accepted your friend request!`;

  // In-app inbox copy of a friend REQUEST, server-written at a deterministic
  // key (req_{callerUid}) so re-sending replaces the earlier copy instead of
  // stacking duplicates. fromUserId lets the recipient accept/decline
  // straight from the notification. Written before the cooldown — the
  // cooldown only gates the device push — and stored even when the recipient
  // muted friend activity (their own client hides muted types in the inbox).
  if (kind === "request" && !blocked) {
    await writeServerNotification(db, {
      toUid,
      fromUid: callerUid,
      type: "friend-request",
      message: body,
      extra: { fromUserId: callerUid },
      key: `req_${callerUid}`,
    });
  }

  // A request/accept pair only ever needs one push each — a short cooldown
  // stops a caller replaying the callable to spam the other user's devices.
  // Applied to blocked callers too, so the rate-limit behaviour is identical.
  if (!(await passesCooldown(db, `friendEvent/${callerUid}/${toUid}`, 30_000))) {
    return { delivered: false, reason: "rate-limited", successCount: 0 };
  }

  if (blocked) {
    return { delivered: false, reason: "no-devices", successCount: 0 };
  }

  // The acceptance goes into deliveryLog as report evidence only: its inbox
  // copy is written by the original sender's own client when it reconciles
  // the acceptance marker (reconcileAcceptedRequests).
  if (kind === "accept") {
    await writeServerNotification(db, {
      toUid,
      fromUid: callerUid,
      type: "friend-accept",
      message: body,
      inbox: false,
    });
  }

  // Respect the recipient's notification preferences (Manage Notifications →
  // master switch + "Friend activity"). Defaults match the client: on.
  const prefs = await notificationPrefs(db, toUid);
  if (prefs.enabled === false || prefs.friends === false) {
    return { delivered: false, reason: "muted", successCount: 0 };
  }

  const title =
    kind === "request" ? "New friend request" : "Friend request accepted";

  const result = await deliverPushToUser(db, toUid, {
    title,
    body,
    data: {
      type: kind === "request" ? "friend-request" : "friend-accept",
      fromUid: callerUid,
    },
  });

  logger.info(
    `Friend push (${kind}) ${callerUid} -> ${toUid}: ` +
      `${result.successCount}/${result.totalTokens} delivered`
  );
  return {
    delivered: result.delivered,
    successCount: result.successCount,
    reason: result.reason,
  };
});

// Report another user for moderation (App Store guideline 1.2). Writes the
// report to /reports — a node no client rule can read or write — together with
// a little evidence: the most recent messages the server delivered from the
// reported user to the reporter (deliveryLog, server-only).
// logger.warn("USER_REPORT") is what the Cloud Logging alert policy matches to
// email the owner.
//
// Request: { reportedUid: string, reason: "spam" | "harassment" |
//            "inappropriate" | "other", details?: string (<= 1000 chars) }
const REPORT_REASONS = new Set(["spam", "harassment", "inappropriate", "other"]);

exports.reportUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  const reporterUid = request.auth.uid;
  const data = request.data || {};
  const reportedUid = typeof data.reportedUid === "string" ? data.reportedUid.trim() : "";
  const reason = typeof data.reason === "string" ? data.reason.trim() : "";

  if (!isValidUid(reportedUid)) {
    throw new HttpsError("invalid-argument", "Missing or invalid reportedUid.");
  }
  if (reportedUid === reporterUid) {
    throw new HttpsError("invalid-argument", "You can't report yourself.");
  }
  if (!REPORT_REASONS.has(reason)) {
    throw new HttpsError("invalid-argument", "Invalid reason.");
  }
  let details = "";
  if (data.details !== undefined && data.details !== null) {
    if (typeof data.details !== "string") {
      throw new HttpsError("invalid-argument", "Invalid details.");
    }
    details = data.details.trim();
    if (details.length > 1000) {
      throw new HttpsError("invalid-argument", "Details must be 1000 characters or fewer.");
    }
  }

  const db = admin.database();

  const [reportedProfileSnap, reporterProfileSnap] = await Promise.all([
    db.ref(`users/${reportedUid}/profile`).get(),
    db.ref(`users/${reporterUid}/profile`).get(),
  ]);
  if (!reportedProfileSnap.exists()) {
    throw new HttpsError("not-found", "That user doesn't exist.");
  }

  if (!(await passesCooldown(db, `report/${reporterUid}/${reportedUid}`, 60_000))) {
    throw new HttpsError(
      "resource-exhausted",
      "You just reported this person — we've got it."
    );
  }

  // Evidence: up to the 10 most recent messages the server itself delivered
  // from the reported user to the reporter (reminders, friend requests), read
  // from deliveryLog — a server-only path written by writeServerNotification.
  // Deliberately NOT the reporter's inbox: the inbox owner can write any
  // entry there (including a forged fromUid), so it isn't evidence.
  const logSnap = await db.ref(`deliveryLog/${reportedUid}/${reporterUid}`).get();
  const evidence = [];
  if (logSnap.exists()) {
    logSnap.forEach((child) => {
      const n = child.val() || {};
      evidence.push({
        message: typeof n.message === "string" ? n.message.slice(0, 500) : "",
        timestamp: typeof n.sentAt === "number" ? n.sentAt : 0,
      });
    });
  }
  evidence.sort((a, b) => b.timestamp - a.timestamp);
  evidence.splice(10);

  const reportRef = db.ref("reports").push();
  await reportRef.set({
    reporterUid,
    reportedUid,
    reason,
    details,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    reporterName: profileDisplayName(reporterProfileSnap.val(), ""),
    reportedName: profileDisplayName(reportedProfileSnap.val(), ""),
    evidence,
    evidenceSource: "server-delivery-log",
  });

  logger.warn("USER_REPORT", {
    reportId: reportRef.key,
    reporterUid,
    reportedUid,
    reason,
  });
  return { ok: true };
});
