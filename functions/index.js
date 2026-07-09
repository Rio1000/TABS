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
  const title = String(request.data?.title || "TABS reminder").slice(0, 100);
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

  const tokensSnap = await db.ref(`users/${friendUid}/pushTokens`).get();
  const tokens = tokensSnap.exists() ? Object.keys(tokensSnap.val()) : [];
  if (tokens.length === 0) {
    // Not an error — the friend just hasn't enabled notifications on any
    // device. The client uses this to show a helpful message.
    return { delivered: false, reason: "no-devices", successCount: 0 };
  }

  const linkUrl = "https://tabsonfriends.com";
  const message = {
    tokens,
    notification: { title, body },
    data: { type: "sms-reminder", fromUid: callerUid },
    webpush: {
      notification: { title, body, icon: "/logo.png" },
      fcmOptions: { link: linkUrl },
    },
  };

  try {
    const resp = await admin.messaging().sendEachForMulticast(message);

    // Prune tokens FCM reports as dead so we don't keep retrying them.
    const stale = [];
    resp.responses.forEach((r, i) => {
      const code = r.error?.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        stale.push(tokens[i]);
      }
    });
    await Promise.all(
      stale.map((t) =>
        db.ref(`users/${friendUid}/pushTokens/${t}`).remove().catch(() => {})
      )
    );

    logger.info(
      `Push by ${callerUid} to ${friendUid}: ${resp.successCount}/${tokens.length} delivered`
    );
    return {
      delivered: resp.successCount > 0,
      successCount: resp.successCount,
      reason: resp.successCount > 0 ? null : "all-failed",
    };
  } catch (err) {
    logger.error("FCM send failed:", err);
    throw new HttpsError(
      "internal",
      "Could not send the notification right now. Please try again later."
    );
  }
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
