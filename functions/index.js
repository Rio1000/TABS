// Cloud Functions for TABS
//
// Twilio credentials must never live in the browser (anyone could read them
// and send SMS on your account), and Twilio's REST API can't be called from
// a browser anyway (no CORS). So the web app calls this callable function,
// which holds the credentials as secrets and sends the SMS server-side.
//
// Deploy prerequisites (one-time):
//   1. Firebase Blaze (pay-as-you-go) plan — required for outbound network.
//   2. A Twilio account, an SMS-capable phone number, and (for US numbers)
//      A2P 10DLC registration.
//   3. Store the three secrets:
//        firebase functions:secrets:set TWILIO_ACCOUNT_SID
//        firebase functions:secrets:set TWILIO_AUTH_TOKEN
//        firebase functions:secrets:set TWILIO_FROM_NUMBER   (e.g. +15551234567)
//   4. firebase deploy --only functions

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = defineSecret("TWILIO_FROM_NUMBER");

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

exports.sendReminderSms = onCall(
  { secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
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
      const client = twilio(
        TWILIO_ACCOUNT_SID.value(),
        TWILIO_AUTH_TOKEN.value()
      );
      const result = await client.messages.create({
        to,
        from: TWILIO_FROM_NUMBER.value(),
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
  }
);
