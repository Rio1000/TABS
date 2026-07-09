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
