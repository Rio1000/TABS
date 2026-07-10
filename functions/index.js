// Cloud Functions for TABS
//
// Twilio credentials must never live in the browser (anyone could read them
// and send SMS on your account), and Twilio's REST API can't be called from
// a browser anyway (no CORS). So the web app calls this callable function,
// which holds the credentials as secrets and sends the SMS server-side.
//
// Deploy: handled by GitHub Actions (.github/workflows/deploy-functions.yml).
// The Twilio credentials are provided as environment variables, written into
// functions/.env by the workflow from GitHub repo Secrets at deploy time — so
// nothing secret is ever committed and no Firebase CLI is needed locally.
// Prerequisites: Firebase Blaze plan; a Twilio account + SMS number; and (for
// US numbers) A2P 10DLC registration. See SETUP.md.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

// Deliver a push notification to every device a user has registered, across
// both transports we support: web browsers register raw FCM tokens; the Expo
// mobile app registers Expo push tokens ("ExponentPushToken[...]"). Dead
// tokens both services report are pruned. Shared by the reminder callable and
// the friend-request trigger below. Never throws — returns a delivery summary.
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

// Turn whatever a user typed into their profile into an E.164 number Twilio
// accepts. Defaults to US (+1) when a bare 10-digit number is given — change
// the default country code if your users are elsewhere.
function toE164(rawPhone) {
  const digits = String(rawPhone || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

exports.sendReminderSms = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
      logger.error("Twilio env vars are not configured on this function.");
      throw new HttpsError("failed-precondition", "SMS isn't configured yet.");
    }

    const callerUid = request.auth.uid;
    const friendUid = String(request.data?.friendUid || "").trim();
    const message = String(request.data?.message || "").slice(0, 320);

    if (!friendUid) {
      throw new HttpsError("invalid-argument", "Missing friendUid.");
    }
    if (!message) {
      throw new HttpsError("invalid-argument", "Missing message.");
    }

    const db = admin.database();

    // Only allow texting a CONFIRMED friend, verified on the recipient's side
    // (their friendUids index lists the caller). That entry can only be
    // written by the recipient, so a caller can't text an arbitrary person
    // whose UID they happen to know.
    const friendshipSnap = await db
      .ref(`users/${friendUid}/friendUids/${callerUid}`)
      .get();
    if (!friendshipSnap.exists()) {
      throw new HttpsError(
        "permission-denied",
        "You can only text a confirmed friend."
      );
    }

    const phoneSnap = await db
      .ref(`users/${friendUid}/profile/phoneNumber`)
      .get();
    const to = toE164(phoneSnap.val());
    if (!to) {
      throw new HttpsError(
        "failed-precondition",
        "That friend hasn't added a phone number."
      );
    }

    try {
      const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
      const result = await client.messages.create({
        to,
        from: TWILIO_FROM_NUMBER,
        body: message,
      });
      logger.info(`SMS sent by ${callerUid} to ${friendUid}: ${result.sid}`);
      return { success: true, sid: result.sid };
    } catch (err) {
      logger.error("Twilio send failed:", err);
      throw new HttpsError(
        "internal",
        "Could not send the text right now. Please try again later."
      );
    }
  });

// Send a reminder as a real PUSH notification to the friend's device(s), via
// Firebase Cloud Messaging. This is the free, carrier-free replacement for the
// Twilio SMS path: no phone number, no 10DLC, nothing a carrier can flag. The
// recipient just needs to have granted notification permission on the web app
// or mobile app, which registers a token under users/{uid}/pushTokens.
exports.sendReminderPush = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const callerUid = request.auth.uid;
  const friendUid = String(request.data?.friendUid || "").trim();
  const body = String(request.data?.message || "").slice(0, 320);

  if (!friendUid) {
    throw new HttpsError("invalid-argument", "Missing friendUid.");
  }
  if (!body) {
    throw new HttpsError("invalid-argument", "Missing message.");
  }

  const db = admin.database();

  // Same guard as the SMS path: only a CONFIRMED friend (verified from the
  // recipient's own friendUids index, which only they can write) can be
  // notified — you can't push to an arbitrary UID you happen to know.
  const friendshipSnap = await db
    .ref(`users/${friendUid}/friendUids/${callerUid}`)
    .get();
  if (!friendshipSnap.exists()) {
    throw new HttpsError(
      "permission-denied",
      "You can only remind a confirmed friend."
    );
  }

  // Put the requester's name on the notification so the recipient knows who's
  // asking (the message body says "you owe me…" — this makes "me" concrete).
  const callerProfileSnap = await db.ref(`users/${callerUid}/profile`).get();
  const cp = callerProfileSnap.val() || {};
  const callerName = [cp.firstName, cp.lastName].filter(Boolean).join(" ").trim();
  const title = (
    callerName ? `Reminder from ${callerName}` : String(request.data?.title || "TABS reminder")
  ).slice(0, 100);

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
    `Push by ${callerUid} to ${friendUid}: ${result.successCount}/${result.totalTokens} delivered ` +
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
  try {
    await admin.database().ref(`users/${uid}`).remove();
    await admin.auth().deleteUser(uid);
    logger.info(`Account deleted: ${uid}`);
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
// when that user is offline. The in-app notification is still written
// client-side (addNotification); this only adds the device push on top.
//
// kind:
//   "request" -> caller sent a friend request; notify the recipient (toUid).
//   "accept"  -> caller accepted toUid's request; notify the original sender.
// Each is verified against the DB the caller just wrote, so a caller can't push
// to an arbitrary uid they happen to know.
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
    // The caller accepted toUid's request, so they're now friends on the
    // caller's own side (an index only the caller can write).
    const snap = await db
      .ref(`users/${callerUid}/friendUids/${toUid}`)
      .get();
    if (!snap.exists()) {
      throw new HttpsError("permission-denied", "Not friends with that user.");
    }
  }

  // Respect the recipient's notification preferences (Manage Notifications →
  // master switch + "Friend activity"). Defaults match the client: on.
  const prefsSnap = await db.ref(`users/${toUid}/settings/notifications`).get();
  const prefs = prefsSnap.val() || {};
  if (prefs.enabled === false || prefs.friends === false) {
    return { delivered: false, reason: "muted", successCount: 0 };
  }

  const cpSnap = await db.ref(`users/${callerUid}/profile`).get();
  const cp = cpSnap.val() || {};
  const name =
    [cp.firstName, cp.lastName].filter(Boolean).join(" ").trim() || "Someone";

  const title =
    kind === "request" ? "New friend request" : "Friend request accepted";
  const body =
    kind === "request"
      ? `${name} sent you a friend request`
      : `${name} accepted your friend request!`;

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
