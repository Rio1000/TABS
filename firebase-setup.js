// Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";

import {
  getDatabase,
  ref,
  set,
  push,
  get,
  remove,
  update,
  child,
  onValue
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-database.js";

import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  // Sign in with Apple + Apple token revocation on account deletion. All of
  // these are exported by the 10.6.0 build (checked against the export list
  // of https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js).
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  revokeAccessToken,
  getAdditionalUserInfo,
  updateProfile,

} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";

import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-functions.js";

import {
  getMessaging,
  getToken,
  onMessage,
  isSupported as isMessagingSupported,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-messaging.js";

import {
  CURRENCIES,
  getSymbol,
  getSelectedCurrency,
  setSelectedCurrency,
  fetchExchangeRates,
  usdToDisplay,
  displayToUsd,
} from "./currency.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA93Cfu5ehpOeZMCBKtiTvw1kJZZU_EvkE",
  authDomain: "tabs-4a0eb.firebaseapp.com",
  databaseURL: "https://tabs-4a0eb-default-rtdb.firebaseio.com",
  projectId: "tabs-4a0eb",
  storageBucket: "tabs-4a0eb.firebasestorage.app",
  messagingSenderId: "295362517303",
  appId: "1:295362517303:web:fbd0037e697eade181a2b2",
  measurementId: "G-Y9CWXD96D9",
};
// `action` adds an icon button inside the toast:
//   { label: "Undo", icon: "undo", ariaLabel: "Undo settling Sam's tab", onClick }
// `icon` is a Material Symbols name; it must also be listed in the font's
// icon_names in index.html, which loads only the icons the app uses. Without
// `icon` the button shows `label` as text. Tapping the button runs onClick and
// dismisses the toast. Toasts with an action stay up as long as errors do, so
// there's time to reach the button; pass { duration: -1 } as `options` to keep
// one up until it is dismissed.
function showToast(message, type = "success", action = null, options = {}) {
  if (typeof Toastify !== "function") {
    console[type === "error" ? "error" : "log"](message);
    return null;
  }
  const toast = Toastify({
    text: `${message}`, // Prepend icon to message
    // Milliseconds. This used to read `2.5`, which Toastify took literally —
    // every toast in this file was removed 2.5ms after it mounted, i.e. it
    // never actually rendered. Errors linger longer than successes since
    // they carry something the user has to read and act on.
    duration: options.duration ?? (type === "error" || action ? 6000 : 4000),
    close: true,
    gravity: "top",
    position: "right",
    // Screen readers get the text from script.js's live regions instead (see
    // announceToast there); keep in step with the showToast in script.js.
    ariaLive: "off",
    className:
      type === "error"
        ? "toastify toastify-error"
        : "toastify toastify-success", // Set class dynamically
    style: {
      // #2e7d32 meets WCAG AA contrast with white text (5.1:1); the old
      // #52bc38 was 2.4:1.
      background: type === "error" ? "#bc3838" : "#2e7d32",
      display: "flex",
      alignItems: "center",
      gap: "8px", // Space between icon & text
    },
  }).showToast();

  if (action) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.setAttribute("aria-label", action.ariaLabel || action.label);
    btn.title = action.label; // tooltip for mouse users
    if (action.icon) {
      btn.classList.add("toast-action-icon");
      const icon = document.createElement("span");
      icon.className = "material-symbols-outlined";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = action.icon;
      btn.appendChild(icon);
    } else {
      btn.textContent = action.label;
    }
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      toast.hideToast();
      action.onClick();
    });
    const closeBtn = toast.toastElement.querySelector(".toast-close");
    toast.toastElement.insertBefore(btn, closeBtn);
  }

  // Screen-reader announcement, keyboard-focus pause and the two-toast limit
  // all live in script.js so both showToast functions behave the same.
  window.enhanceToast?.(toast, message, type, action?.label);
  return toast;
}

// Lets script.js tell "this module never loaded" (CDN blocked/offline, in
// which case nothing on the page is clickable) apart from "it loaded and is
// just slow". See the failsafe in script.js.
window.__tabsFirebaseBooted = true;

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const functionsClient = getFunctions(app);
// Callable that delivers a reminder as a real push notification to the
// friend's device via Firebase Cloud Messaging — free, no carrier, no spam
// flagging. This is what the reminder buttons use now instead of Twilio/SMS.
const sendReminderPushFn = httpsCallable(functionsClient, "sendReminderPush");
// Callable for friend events (see functions/index.js). Cross-user in-app
// notifications are server-written only: for "request" it verifies the
// pending request, writes the recipient's inbox copy and pushes to their
// devices; for "accept" it verifies the friendship + the original sender's
// sentRequest and pushes (the sender's own client writes its "accepted" inbox
// entry when it reconciles the marker). Best-effort: never throws, so a
// failure never blocks the action that triggered it.
const sendFriendEventPushFn = httpsCallable(functionsClient, "sendFriendEventPush");
async function pushFriendEvent(toUid, kind) {
  if (!toUid) return;
  try {
    await sendFriendEventPushFn({ toUid, kind });
  } catch (error) {
    // Not deployed yet, rate-limited, or a transient error — just log and
    // move on.
    console.warn(`Friend-event push (${kind}) skipped:`, error?.code || error);
  }
}
// Server-side account management (Admin SDK) — see functions/index.js. These
// actually remove/disable the Firebase Auth record, which the browser SDK
// can't do reliably (delete needs a recent login; disable is admin-only).
const deleteAccountFn = httpsCallable(functionsClient, "deleteAccount");
const disableAccountFn = httpsCallable(functionsClient, "disableAccount");
// Files a block/abuse report for the owner to review (App Store Review
// Guideline 1.2). Server side validates, rate-limits and attaches evidence.
const reportUserFn = httpsCallable(functionsClient, "reportUser");

// ---------------------------------------------------------------------------
// Push notifications (Firebase Cloud Messaging)
//
// Web Push certificate ("VAPID" key pair). Generate it once in the Firebase
// Console → Project settings → Cloud Messaging → Web configuration → "Web Push
// certificates" → Generate key pair, then paste the public key here. Until you
// do, push registration is skipped (the app still works, reminders just report
// that the friend has no device registered).
// ---------------------------------------------------------------------------
const FCM_VAPID_KEY = "BMMd80ylGR_MFwUAKgjg-BT-bfqJ4AYxxO4iJo9PseMaldJackXFalznsfqk9lM3j7n5UsZaB_ByKwZGIqdt-7k";

let messaging = null;

// Register this browser to receive push, and store its token under the signed-
// in user so friends' reminders can reach it. Safe to call on every login: FCM
// returns a stable token and we just re-write the same key. Never throws.
async function registerPushToken() {
  try {
    if (!currentUser) return;
    if (FCM_VAPID_KEY.startsWith("REPLACE_WITH")) {
      console.warn(
        "Push disabled: set FCM_VAPID_KEY in firebase-setup.js (see SETUP.md)."
      );
      return;
    }
    if (!(await isMessagingSupported())) return; // e.g. iOS Safari < 16.4

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Notification permission not granted; push skipped.");
      return;
    }

    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );
    if (!messaging) messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    await set(ref(database, `users/${currentUser.uid}/pushTokens/${token}`), {
      platform: "web",
      updatedAt: Date.now(),
    });

    // Surface reminders that arrive while the tab is focused (the service
    // worker only fires when the tab is backgrounded/closed).
    onMessage(messaging, (payload) => {
      const body = payload.notification?.body || payload.data?.message || "";
      if (body) showToast(body, "success");
    });
  } catch (error) {
    console.error("Push registration failed:", error);
  }
}

// When push shipped. Accounts created before this never got the chance to
// grant notification permission when they signed up, so we re-prompt them once
// (browsers only fire the native prompt reliably from a user gesture, so we
// nudge them with a tappable banner instead of a silent auto-request).
const PUSH_FEATURE_LAUNCH_MS = Date.parse("2026-07-09T00:00:00Z");

function accountPredatesPush(user) {
  const created = Date.parse(user?.metadata?.creationTime || "");
  return !Number.isNaN(created) && created < PUSH_FEATURE_LAUNCH_MS;
}

// Decide how to handle push for this login:
// - already granted → just (re)register the token silently;
// - permission still undecided on a pre-push account → show a one-time nudge
//   to turn notifications on (request happens on their tap);
// - undecided on a newer account → request now, as before;
// - denied → nothing we can do from JS (they'd have to change it in the browser).
async function initPush(user) {
  try {
    // Running inside the native mobile shell (a WebView)? Ask it for the
    // device's push token instead of doing web push — service workers / web
    // push don't work inside an iOS WKWebView. The shell calls
    // window.__onNativePushToken back with the token.
    if (window.ReactNativeWebView) {
      requestNativePushToken();
      return;
    }

    if (FCM_VAPID_KEY.startsWith("REPLACE_WITH")) return;
    if (typeof Notification === "undefined") return;
    if (!(await isMessagingSupported())) return;

    if (Notification.permission === "granted") {
      registerPushToken();
    } else if (Notification.permission === "default") {
      if (accountPredatesPush(user) &&
          !localStorage.getItem("tabsPushReprompt")) {
        showEnableNotificationsPrompt();
      } else {
        registerPushToken();
      }
    }
  } catch (error) {
    console.error("initPush failed:", error);
  }
}

// One-time tappable banner for legacy users. Tapping it is the user gesture
// that lets registerPushToken() call Notification.requestPermission().
function showEnableNotificationsPrompt() {
  localStorage.setItem("tabsPushReprompt", "1");
  // A real "Enable" button rather than "tap anywhere on the toast": a tappable
  // <div> can't be reached by keyboard or switch users.
  showToast(
    "🔔 Turn on notifications to get payment reminders here.",
    "success",
    { label: "Enable", ariaLabel: "Enable notifications", onClick: registerPushToken },
    { duration: -1 } // stays until enabled or closed
  );
}

// --- Native (mobile WebView) push bridge -----------------------------------
// Ask the native shell to grant permission and hand back this device's push
// token. The shell listens for this message (see mobile/App.js).
function requestNativePushToken() {
  try {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: "requestPushToken" })
    );
  } catch (error) {
    console.error("requestNativePushToken failed:", error);
  }
}

// The native shell injects a call to this with the device's Expo push token.
// We store it under the signed-in user just like a web token; the Cloud
// Function recognises Expo-format tokens and delivers via the Expo push API.
window.__onNativePushToken = async (token, platform) => {
  try {
    if (!currentUser || !token) return;
    await set(ref(database, `users/${currentUser.uid}/pushTokens/${token}`), {
      platform: platform || "mobile",
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error("Storing native push token failed:", error);
  }
};

// Sends a reminder as a push notification via the Cloud Function. Returns
// { delivered, reason }. delivered=false with reason "no-devices" means the
// friend hasn't enabled notifications anywhere.
//
// The client never sends the notification text itself: it picks a template
// (an index into reminder-messages.json, which the server also bundles) and
// sends the already-formatted amount string (e.g. "$12.50"). The server fills
// {name} from the recipient's own profile and validates both values, so no
// arbitrary text can be pushed onto someone else's lock screen.
async function sendReminderPushViaFCM(friendUid, templateIndex, amount) {
  if (!friendUid) return { delivered: false, reason: "no-friend" };
  try {
    const result = await sendReminderPushFn({ friendUid, templateIndex, amount });
    return result.data || { delivered: false, reason: "unknown" };
  } catch (error) {
    console.error("Push reminder failed:", error);
    const notDeployed =
      error?.code === "functions/not-found" ||
      error?.code === "functions/internal";
    showToast(
      notDeployed
        ? "Reminders aren't set up yet — try again once notifications are configured."
        : error?.message || "Couldn't send the reminder.",
      "error"
    );
    return { delivered: false, reason: "error" };
  }
}

// Reference to DOM elements
const peopleList = document.getElementById("people-list");
const addPersonBtn = document.getElementById("add-person-btn");

const loginEmail = document.getElementById("login-email");
const loginPassword = document.getElementById("login-password");

const signupEmail = document.getElementById("signup-email");
const signupPassword = document.getElementById("signup-password");
const signupNameFirst = document.getElementById("first-name");
const signupNameLast = document.getElementById("last-name");
const signupNumber = document.getElementById("phonenumber");

const loginButton = document.getElementById("login-btn");
const signupButton = document.getElementById("signup-btn");
const logoutButton = document.getElementById("logout-btn");
const loginSignup = document.getElementById("Login");
const resetPassword = document.getElementById("reset-password");
const changePassword = document.getElementById("change-password");
const deleteAccount = document.getElementById("delete-account");
const disableAccount = document.getElementById("disable-account");
const editProfile = document.getElementById("edit-profile");
const viewAccountHistory = document.getElementById("view-account-history");
const manageNotifications = document.getElementById("manage-notifications");
const exportData = document.getElementById("export-data");

const addMoreMoneyBtn = document.getElementById("add-more-money-btn");
const addExtraInfoBtn = document.getElementById("add-extra-info-btn");
const closePrompt = document.getElementById("close-prompt");
const removeMoneyBtn = document.getElementById("remove-money-btn");
const RFModal2 = document.getElementById("RFModal");

// Currency handling — amounts are always stored in Firebase in USD (the
// app's base currency); everything below converts that canonical amount to
// whichever currency is selected here for display, using live exchange
// rates (see currency.js). A single delegated listener updates every
// rendered row instead of each person-row registering its own "change"
// listener (which used to leak a new listener per person on every add/reload).
const currencySelectEl = document.getElementById("currency-select");

function populateCurrencySelect() {
  currencySelectEl.innerHTML = "";
  CURRENCIES.forEach(({ code, name }) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} - ${name}`;
    currencySelectEl.appendChild(option);
  });
  currencySelectEl.value = getSelectedCurrency();
}
populateCurrencySelect();

// Re-derives the displayed text of one amount span from its canonical USD
// value (amountSpan.value) in the currently selected currency. Non-numeric
// spans (an "item" description typed in instead of a dollar figure) are
// left untouched — there's nothing to convert.
function renderAmountDisplay(amountSpan) {
  const numeric = parseFloat(amountSpan.value);
  if (isNaN(numeric)) {
    amountSpan.textContent = amountSpan.value;
  } else {
    amountSpan.textContent = usdToDisplay(numeric).toFixed(2);
  }
}

// Latest snapshot of people data, kept up to date by the peopleList
// onValue listener below — re-used here so switching currency can
// recompute the totals without another Firebase read.
let latestPeopleData = [];

function renderTotals() {
  const totalSpendingEl = document.getElementById("total-spending");
  const amountSpentEl = document.getElementById("amount-spent");
  const amountEarnedEl = document.getElementById("amount-earned");
  const symbol = getSymbol(getSelectedCurrency());

  let amountSpent = 0;
  let amountEarned = 0;
  latestPeopleData.forEach((person) => {
    if (person.status === "iOwe" && typeof person.amount === "number") {
      amountSpent += person.amount;
    } else if (person.status === "owesMe" && typeof person.amount === "number") {
      amountEarned += person.amount;
    }
  });

  // Labels match the Stats tab's HTML ("Total Money" / "Amount Spent" /
  // "Earned Back") — the JS used to write different label text over them.
  if (totalSpendingEl) {
    totalSpendingEl.innerText = `Total Money: ${symbol}${usdToDisplay(amountSpent + amountEarned).toFixed(2)}`;
  }
  if (amountSpentEl) {
    amountSpentEl.innerText = `Amount Spent: ${symbol}${usdToDisplay(amountSpent).toFixed(2)}`;
  }
  if (amountEarnedEl) {
    amountEarnedEl.innerText = `Earned Back: ${symbol}${usdToDisplay(amountEarned).toFixed(2)}`;
  }
}

// Called on init (once rates first load) and every time the user picks a
// new currency — updates every symbol/label on screen and actually
// recomputes every displayed amount, instead of just swapping the symbol.
function refreshCurrencyDisplay() {
  const symbol = getSymbol(getSelectedCurrency());
  document.querySelectorAll(".dollar-sign").forEach((el) => {
    el.textContent = symbol;
  });
  addMoreMoneyBtn.innerHTML = `+ ${symbol}`;
  removeMoneyBtn.innerHTML = `- ${symbol}`;
  const moneyInput = document.getElementById("money-input");
  if (moneyInput) moneyInput.placeholder = `Amount (${symbol})`;
  document.querySelectorAll(".amount-input").forEach(renderAmountDisplay);
  renderTotals();
}

currencySelectEl.addEventListener("change", () => {
  setSelectedCurrency(currencySelectEl.value);
  refreshCurrencyDisplay();
  showToast(`Amounts now shown in ${currencySelectEl.value}.`);
});

// Fetch live rates as soon as the page loads (independent of auth) so
// they're ready by the time anything renders; also keeps them fresh if the
// tab is left open across the refresh interval.
fetchExchangeRates().then(() => refreshCurrencyDisplay());

// Function to show the modal

// Auth State Listener
let currentUser = null;
let currentUserName = ""; // "First Last" of the signed-in user, for reminders
let currentListItem = null;
let peopleListUnsub = null;
let friendsListUnsub = null;
let friendPendingRemoval = null;
let notificationsUnsub = null;
let pendingRequestsUnsub = null;
// users/{uid}/blocked, mirrored live: { [blockedUid]: { firstName, lastName, blockedAt } }
let blockedUsers = {};
let blockedUnsub = null;

// Profile → Info tab. Built with text nodes: names/emails are user-provided
// (and an Apple/Google display name could contain markup), so never innerHTML.
function setLabeledValue(elementId, label, value) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.textContent = `${label}: `;
  el.appendChild(document.createElement("br"));
  el.appendChild(document.createTextNode(` ${value ?? ""}`));
}

function renderProfileInfo(profileData) {
  const p = profileData || {};
  currentUserName = `${p.firstName || ""} ${p.lastName || ""}`.trim();
  setLabeledValue("profile-name", "Name", `${p.firstName || ""} ${p.lastName || ""}`.trim());
  setLabeledValue("profile-email", "Email", p.email || "");
  setLabeledValue("profile-phone", "Phone Number", p.phoneNumber || "");
  setLabeledValue("profile-friend-code", "Friend Code", p.friendCode || "N/A");
  // Expose the current user's friend code so the "Invite to TABS" button
  // (and anything else) can read it without another Firebase round-trip.
  window.userFriendCode = p.friendCode || null;
}

onAuthStateChanged(auth, async (user) => {
  const loginPage = document.getElementById("Loginpage");
  const signupPage = document.getElementById("signupPage");
  const friendBox = document.getElementById("friendModal");

  if (user) {
    currentUser = user;
    console.log(`User logged in: ${user.email}`);

    logoutButton.style.display = "block";
    loginSignup.style.display = "none";

    // Make sure live exchange rates are loaded before anything renders —
    // otherwise the first paint would show raw USD amounts under whatever
    // currency symbol is selected, then jump once rates arrive.
    await fetchExchangeRates();

    // Settle accrued interest before rendering the list, so the amounts
    // shown on load already reflect it instead of needing a second refresh.
    await applyInterestToAll();

    // Blocked users (live). Loaded before anything that renders or reconciles
    // requests/notifications so entries from blocked people are filtered from
    // the start (resolves on the first snapshot).
    await subscribeToBlockedUsers();

    // Pick up friend requests that were accepted while we were offline
    // (see approveFriendRequest's cross-user fallback) before rendering.
    await reconcileAcceptedRequests();

    // Backfill the UID-keyed friend index used by the phone-number read
    // rule (see database rules). friendsList is keyed by push-id, which
    // security rules can't look up by member UID, so each user maintains a
    // parallel users/{uid}/friendUids/{friendUid} index on their own node.
    await syncFriendUids();

    // Load data only after authentication
    loadListFromFirebase();
    populateFriendsList();
    loadAddWindow();
    loadNotificationPrefs();
    loadPaymentSettings();
    subscribeToNotifications();
    checkAutoReminders();
    initPush(user); // register push, or re-prompt legacy accounts to allow it

    // Hide login/signup pages
    if (loginPage) loginPage.style.display = "none";
    if (signupPage) signupPage.style.display = "none";
    if (friendBox) friendBox.style.display = "none";

    // Show the list controls (helpers live in script.js — the old code
    // looked these buttons up by IDs that don't exist, so they never
    // actually toggled).
    setListControlsVisible(true);
    document.getElementById("notificationsBtn").style.display = "flex";
    document.getElementById("loginorsignupmodal").style.display = "none";
    document.getElementById("topnav").style.display = "flex";
    document.getElementById("NotLoggedIn").style.display = "none";

    const profileRef = ref(database, `users/${user.uid}/profile`);
    get(profileRef).then((snapshot) => {
      // A brand-new Google/Apple account has no profile yet at this point
      // (provisionOAuthUser writes it right after sign-in and re-renders).
      if (snapshot.exists()) renderProfileInfo(snapshot.val());
    });


    const totalFriendsEl = document.getElementById("total-friends");
    const lastLoginEl = document.getElementById("last-login");
    const createdEl = document.getElementById("account-created");

    const peopleListRef = ref(database, `users/${user.uid}/peopleList`);
    if (peopleListUnsub) peopleListUnsub();
    peopleListUnsub = onValue(peopleListRef, (snapshot) => {
      latestPeopleData = snapshot.exists() ? snapshot.val().peopleData || [] : [];
      renderTotals();

      // Live-sync the list itself: if this snapshot isn't just the echo of
      // our own save (or of the initial load), another device/tab changed the
      // data — re-render so this screen matches. Every save used to rewrite
      // the whole array from the DOM with no listener, so two open sessions
      // silently clobbered each other. Skipped while an editing modal is open
      // (currentListItem points into the DOM a re-render would replace); the
      // next remote change re-syncs after it closes.
      const incoming = canonicalPeopleJson(latestPeopleData);
      if (incoming !== lastKnownPeopleJson) {
        lastKnownPeopleJson = incoming;
        if (!currentListItem) renderPeopleList(latestPeopleData);
      }
    });

    const friendsRef = ref(database, `users/${user.uid}/friendsList`);
    if (friendsListUnsub) friendsListUnsub();
    friendsListUnsub = onValue(friendsRef, (snapshot) => {
      const friends = snapshot.val();
      const totalFriends = friends ? Object.keys(friends).length : 0;
      if (totalFriendsEl) totalFriendsEl.innerText = `Total Friends: ${totalFriends}`;
    });

    // Live accept: when someone accepts our request while we're online, their
    // acceptance marker lands in our pendingRequests — turn it into a real
    // friendship right away instead of waiting for a reload.
    // (reconcileAcceptedRequests guards against overlapping runs.)
    const pendingRequestsRef = ref(database, `users/${user.uid}/pendingRequests`);
    if (pendingRequestsUnsub) pendingRequestsUnsub();
    pendingRequestsUnsub = onValue(pendingRequestsRef, (snapshot) => {
      const pending = snapshot.exists() ? snapshot.val() : {};
      const hasAccepted = Object.values(pending).some(
        (req) => req && req.type === "accepted"
      );
      if (!hasAccepted) return;
      reconcileAcceptedRequests().then(() => {
        populateFriendsList();
        updatePendingCount();
      });
    });

    updatePendingCount();

    user.reload().then(() => {
      const creationTime = new Date(user.metadata.creationTime).toLocaleDateString();
      // Never print "Invalid Date" if the auth record has no sign-in time.
      const lastSignIn = new Date(user.metadata?.lastSignInTime);
      const lastSignInTime = isNaN(lastSignIn) ? "—" : lastSignIn.toLocaleDateString();

      if (lastLoginEl) lastLoginEl.innerText = `Last Login: ${lastSignInTime}`;
      if (createdEl) createdEl.innerText = `Account Created: ${creationTime}`;
    });




  } else {
    currentUser = null;
    console.log("No user logged in");

    if (peopleListUnsub) {
      peopleListUnsub();
      peopleListUnsub = null;
    }
    if (friendsListUnsub) {
      friendsListUnsub();
      friendsListUnsub = null;
    }
    if (notificationsUnsub) {
      notificationsUnsub();
      notificationsUnsub = null;
    }
    if (pendingRequestsUnsub) {
      pendingRequestsUnsub();
      pendingRequestsUnsub = null;
    }
    if (blockedUnsub) {
      blockedUnsub();
      blockedUnsub = null;
    }
    blockedUsers = {};

    logoutButton.style.display = "none";
    loginSignup.style.display = "flex";

    // The loader defaults to visible on page load; nothing else dismisses it
    // on the logged-out path, so it used to keep animating behind the
    // landing modal forever.
    document.getElementById("loader").style.display = "none";

    // Clear UI when logged out
    peopleList.innerHTML = "";

    // Reset UI elements if necessary
    setListControlsVisible(false);
    document.getElementById("notificationsBtn").style.display = "none";
    const folderBadge = document.getElementById("folderNotificationBadge");
    if (folderBadge) folderBadge.style.display = "none";
    document.getElementById("loginorsignupmodal").style.display = "flex";
    document.getElementById("topnav").style.display = "none";
    document.getElementById("ProfileModal").style.display = "none";

  }
});
// Inside the native iOS app the site runs in a WKWebView. Google blocks all
// OAuth from embedded web views ("disallowed_useragent"), so neither popup nor
// redirect works there. Instead the native wrapper performs Google Sign-In in
// a system browser (GoogleSignIn SDK) and hands the resulting credential back
// to this page, which completes the login with signInWithCredential. The
// wrapper tags its user-agent with "TABSApp" so we can detect it here.
const IS_NATIVE_APP =
  typeof navigator !== "undefined" && navigator.userAgent.includes("TABSApp");

// "Buy us a coffee" support. On the web this opens Buy Me a Coffee as before;
// inside the native iOS app Apple requires digital tips/donations to go through
// In-App Purchase (App Store Review Guideline 3.1.1), so we hand off to the
// native StoreKit flow via the same bridge the app already uses.
function triggerCoffeeSupport() {
  if (IS_NATIVE_APP && window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "purchaseCoffee" }));
  } else {
    window.open("https://buymeacoffee.com/TABSonFriends", "_blank", "noopener");
  }
}

// Any element tagged with data-support-coffee routes through the one handler,
// so the web/native branch lives in a single place.
document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-support-coffee]");
  if (!trigger) return;
  e.preventDefault();
  triggerCoffeeSupport();
});

// Ads by platform:
//   • Web  → a single AdSense banner on the login/signup landing (#landing-ad).
//   • iOS  → a native AdMob banner rendered by the app wrapper.
// AdSense must not run inside an app web view (Google policy), so index.html
// never loads it in the app; hide the empty slot too and let the native AdMob
// banner be the only ad there.
if (IS_NATIVE_APP) {
  const landingAd = document.getElementById("landing-ad");
  if (landingAd) landingAd.style.display = "none";
}

// Ad privacy choices (Google UMP). In the EEA/UK the native wrapper reports
// whether a privacy-options entry point is required via
// window.__onNativeAdPrivacy({ required }); when it is, the side menu shows
// "Ad privacy choices", which asks native to re-present the consent form so
// users can change or withdraw ad consent in-app. Hidden on the web and
// whenever native hasn't said it's required. (.sideNavA sets display:flex,
// which would beat the hidden attribute, so this toggles style.display.)
function setAdPrivacyEntryVisible(visible) {
  const item = document.getElementById("adPrivacyChoices");
  if (item) item.style.display = visible ? "" : "none";
}
window.__onNativeAdPrivacy = (rawPayload) => {
  const payload = parseNativePayload(rawPayload);
  const required = payload.required === true || payload.required === "true";
  setAdPrivacyEntryVisible(IS_NATIVE_APP && required);
};
{
  const adPrivacyItem = document.getElementById("adPrivacyChoices");
  if (adPrivacyItem) {
    adPrivacyItem.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof window.closeNav === "function") window.closeNav();
      if (IS_NATIVE_APP && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "adPrivacyOptions" }));
      }
    });
  }
}

// Shared handling for a signed-in Google user (from either a popup result or
// a redirect result): create their profile + friend code on first sign-in,
// then greet them. `verb` is "Signed in" or "Signed up".
async function provisionGoogleUser(user, verb) {
  await provisionOAuthUser(user, verb, "Google");
}

// Shared by Google and Apple: create the profile + friend code the first time
// this account signs in (exactly what the Google path always did), then greet.
// `names` lets Apple pass the given/family name it sends only on the very
// first authorization — Apple never puts the name in the ID token, so
// user.displayName is usually empty for Apple accounts.
async function provisionOAuthUser(user, verb, providerLabel, names = {}) {
  const profileRef = ref(database, `users/${user.uid}/profile`);
  const snapshot = await get(profileRef);
  let greetName = user.displayName || "";

  if (!snapshot.exists()) {
    const given = String(names.givenName || "").trim();
    const family = String(names.familyName || "").trim();
    let firstName;
    let lastName;
    if (given || family) {
      firstName = given || "User";
      lastName = family;
    } else {
      const parts = (user.displayName || "User").split(" ");
      firstName = parts[0] || "User";
      lastName = parts.slice(1).join(" ");
    }

    const friendCode = await allocateFriendCode();

    const profile = {
      firstName: firstName,
      lastName: lastName,
      phoneNumber: user.phoneNumber || "",
      // Apple may hand back a private-relay address; it's still the
      // account's email. Never undefined (RTDB rejects undefined values).
      email: user.email || "",
      friendCode: friendCode,
    };
    await set(profileRef, profile);

    await set(ref(database, `friendCodes/${friendCode}`), {
      userId: user.uid,
      firstName: firstName,
      lastName: lastName,
    });

    // onAuthStateChanged already ran (and found no profile) — show this one.
    renderProfileInfo(profile);
    greetName = `${firstName} ${lastName}`.trim();
  } else if (!greetName) {
    const existing = snapshot.val() || {};
    greetName = `${existing.firstName || ""} ${existing.lastName || ""}`.trim();
  }

  showToast(
    greetName
      ? `${verb} with ${providerLabel} as ${greetName}`
      : `${verb} with ${providerLabel}`,
    "success"
  );
  await logUserAction(`${verb} with ${providerLabel}`);
}

// ---------------------------------------------------------------------------
// Sign in with Apple
//
// Native app: the page posts {type:"appleSignIn", purpose} to the iOS wrapper,
// which runs ASAuthorizationController with a SHA-256-hashed nonce and calls
// back window.__onNativeAppleCredential({ idToken, rawNonce,
// authorizationCode, givenName, familyName, email, purpose }) or
// window.__onNativeAppleError({ purpose, cancelled, message }). The native
// side shows no alert, so all messaging happens here.
// Browser: Firebase's own popup flow (Apple's JS web flow via the
// firebaseapp.com auth handler).
// ---------------------------------------------------------------------------
function appleProvider() {
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return provider;
}

// Waiters for an in-flight native reauth (account deletion), keyed by purpose.
let pendingNativeAppleReauth = null;

// Ask the native wrapper for a fresh Apple credential and resolve with its
// payload. Used for the deletion reauth, which has to wait for the result.
function requestNativeAppleCredential(purpose) {
  return new Promise((resolve, reject) => {
    if (!window.ReactNativeWebView) {
      reject(Object.assign(new Error("Sign in with Apple isn't available here."), { cancelled: false }));
      return;
    }
    // Only one at a time — a second request supersedes the first.
    if (pendingNativeAppleReauth) {
      pendingNativeAppleReauth.reject(Object.assign(new Error("Superseded"), { cancelled: true }));
    }
    const timer = setTimeout(() => {
      if (pendingNativeAppleReauth && pendingNativeAppleReauth.timer === timer) {
        pendingNativeAppleReauth = null;
        reject(Object.assign(new Error("Sign in with Apple timed out."), { cancelled: false }));
      }
    }, 3 * 60 * 1000);
    pendingNativeAppleReauth = {
      timer,
      resolve: (payload) => { clearTimeout(timer); resolve(payload); },
      reject: (err) => { clearTimeout(timer); reject(err); },
    };
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: "appleSignIn", purpose }));
  });
}

// Native may hand us the payload as an object (evaluated JS literal) or, if a
// future build changes, as a JSON string — accept both.
function parseNativePayload(payload) {
  if (typeof payload === "string") {
    try { return JSON.parse(payload) || {}; } catch (e) { return {}; }
  }
  return payload && typeof payload === "object" ? payload : {};
}

async function startAppleAuth(verb) {
  if (IS_NATIVE_APP) {
    try { sessionStorage.setItem("appleAuthVerb", verb); } catch (e) {}
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: "appleSignIn", purpose: "signIn" })
      );
    } else {
      showToast("Sign in with Apple isn't available in this version of the app.", "error");
    }
    return; // completion happens in window.__onNativeAppleCredential
  }

  try {
    const result = await signInWithPopup(auth, appleProvider());
    await provisionOAuthUser(result.user, verb, "Apple", appleNamesFromResult(result));
  } catch (error) {
    if (isPopupCancel(error)) return; // they closed the Apple window
    throw error;
  }
}

// Browser popup: on the very first authorization Apple includes the user's
// name, which Firebase surfaces on the result's user (displayName) and, for
// some SDK versions, in the additional user info profile.
function appleNamesFromResult(result) {
  try {
    const info = getAdditionalUserInfo(result);
    const name = info?.profile?.name;
    if (name && typeof name === "object") {
      return { givenName: name.firstName || "", familyName: name.lastName || "" };
    }
  } catch (e) {}
  return {};
}

function isPopupCancel(error) {
  return (
    error?.code === "auth/popup-closed-by-user" ||
    error?.code === "auth/cancelled-popup-request" ||
    error?.code === "auth/user-cancelled"
  );
}

window.__onNativeAppleCredential = async (rawPayload) => {
  const payload = parseNativePayload(rawPayload);
  const purpose = payload.purpose || "signIn";

  if (purpose === "reauth") {
    const waiter = pendingNativeAppleReauth;
    pendingNativeAppleReauth = null;
    if (waiter) waiter.resolve(payload);
    return;
  }

  try {
    if (!payload.idToken) throw new Error("Apple didn't return an identity token.");
    const credential = appleProvider().credential({
      idToken: payload.idToken,
      rawNonce: payload.rawNonce,
    });
    const result = await signInWithCredential(auth, credential);

    // Apple sends the name only on the first authorization — keep it on the
    // Auth record too, so later sign-ins (and the console) have it.
    const fullName = [payload.givenName, payload.familyName]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(" ");
    if (fullName && !result.user.displayName) {
      updateProfile(result.user, { displayName: fullName }).catch((e) =>
        console.warn("Couldn't store Apple display name:", e?.code || e)
      );
    }

    let verb = "Signed in";
    try { verb = sessionStorage.getItem("appleAuthVerb") || verb; } catch (e) {}
    try { sessionStorage.removeItem("appleAuthVerb"); } catch (e) {}
    await provisionOAuthUser(result.user, verb, "Apple", {
      givenName: payload.givenName,
      familyName: payload.familyName,
    });
  } catch (error) {
    console.error("Native Apple sign-in failed:", error);
    showToast("Apple sign-in failed: " + (error?.message || error), "error");
  }
};

window.__onNativeAppleError = (rawPayload) => {
  const payload = parseNativePayload(rawPayload);
  const purpose = payload.purpose || "signIn";
  const cancelled = payload.cancelled === true || payload.cancelled === "true";

  if (purpose === "reauth") {
    const waiter = pendingNativeAppleReauth;
    pendingNativeAppleReauth = null;
    if (waiter) {
      waiter.reject(
        Object.assign(new Error(payload.message || "Sign in with Apple failed."), { cancelled })
      );
    }
    return; // the deletion flow shows the toast
  }

  try { sessionStorage.removeItem("appleAuthVerb"); } catch (e) {}
  if (cancelled) return; // they dismissed the Apple sheet — nothing to report
  console.error("Native Apple sign-in error:", payload.message);
  showToast(
    "Apple sign-in failed" + (payload.message ? `: ${payload.message}` : "."),
    "error"
  );
};

[
  ["appleSignInBtn", "Signed in"],
  ["appleSignUpBtn", "Signed up"],
].forEach(([id, verb]) => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener("click", async () => {
    try {
      await startAppleAuth(verb);
    } catch (error) {
      console.error("Apple sign-in error:", error);
      showToast("Apple sign-in failed: " + (error?.message || error), "error");
    }
  });
});

// Start Google auth: hand off to the native app's system-browser sign-in when
// running inside the wrapper, otherwise use a popup on the web.
async function startGoogleAuth(verb) {
  if (IS_NATIVE_APP) {
    // Remember which flow we were in so we greet correctly when the native
    // credential comes back via window.__onNativeGoogleCredential.
    try { sessionStorage.setItem("googleAuthVerb", verb); } catch (e) {}
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: "googleSignIn" }));
    }
    return; // native presents the sign-in sheet; completion happens below
  }

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  await provisionGoogleUser(result.user, verb);
}

// Called by the native wrapper after a successful system-browser Google
// Sign-In. It passes the Google ID token (and access token), which we turn
// into a Firebase credential to finish signing in — no embedded-webview OAuth,
// so Google's "secure browser" policy is satisfied.
window.__onNativeGoogleCredential = async (idToken, accessToken) => {
  try {
    if (!idToken) return;
    const credential = GoogleAuthProvider.credential(idToken, accessToken || null);
    const result = await signInWithCredential(auth, credential);

    let verb = "Signed in";
    try { verb = sessionStorage.getItem("googleAuthVerb") || verb; } catch (e) {}
    try { sessionStorage.removeItem("googleAuthVerb"); } catch (e) {}
    await provisionGoogleUser(result.user, verb);
  } catch (error) {
    console.error("Native Google sign-in failed:", error);
    showToast("Google sign-in failed: " + error.message, "error");
  }
};

// Google Sign-In Button Listener
const googleBtn = document.getElementById("googleSignInBtn");

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    try {
      await startGoogleAuth("Signed in");
    } catch (error) {
      console.error("Google Sign-In Error:", error);
      showToast("Google sign-in failed: " + error.message, "error");
    }
  });
}
const googleSignUpBtn = document.getElementById("googleSignUpBtn");
if (googleSignUpBtn) {
  googleSignUpBtn.addEventListener("click", async () => {
    try {
      await startGoogleAuth("Signed up");
    } catch (error) {
      console.error("Google Sign-Up Error:", error);
      showToast("Google sign-up failed: " + error.message, "error");
    }
  });
}

document.getElementById("loginbutton").addEventListener("click", () => {
  document.getElementById("loginorsignupmodal").style.display = "none";
});
const firebaseErrorMap = {
  "auth/invalid-email": "Invalid email or password",
  "auth/wrong-password": "Invalid email or password",
  "auth/user-not-found": "Invalid email or password",
  "auth/invalid-credential": "Invalid email or password",
  "auth/too-many-requests": "Too many failed attempts. Try again later.",
  "auth/network-request-failed": "No internet connection. Please try again.",
  // Thrown when Email/Password sign-in isn't enabled for the Firebase project
  // (Firebase console → Authentication → Sign-in method → Email/Password).
  "auth/operation-not-allowed": "Email sign-in isn't enabled yet. Please try again later.",
  // Add more as needed
};
// Login Event
// Login Event
loginButton.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Get firstName from Firebase Realtime Database
    const profileRef = ref(database, `users/${user.uid}/profile`);
    const snapshot = await get(profileRef);
    const profileData = snapshot.val();

    const firstName = profileData?.firstName || "User";
    showToast(`Welcome back, ${firstName}!`);

    await logUserAction("Logged in");
  } catch (error) {
    // Log the real Firebase code so the underlying cause is visible in the
    // console (the toast is intentionally vague for users).
    console.error("Email/password login failed:", error.code, error.message);
    const cleanMessage = firebaseErrorMap[error.code] || "Something went wrong. Please try again.";
    showToast(cleanMessage, "error");
  }
});



// Helper function to generate a unique friend code
function generateFriendCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase(); // Example: 'A1B2C3D4'
}

// Picks a friend code that isn't already claimed. Collisions are unlikely
// (8 base-36 chars) but used to surface as a bogus "Signup failed" toast
// AFTER the account had been created, because the rules refuse to overwrite
// someone else's code.
async function allocateFriendCode() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateFriendCode();
    try {
      const snap = await get(ref(database, `friendCodes/${candidate}`));
      if (!snap.exists()) return candidate;
    } catch (error) {
      // Read failed (offline blip) — the write itself will still validate.
      return candidate;
    }
  }
  return generateFriendCode();
}
document.getElementById("FriendsTab").addEventListener("click", async () => {
  if (!currentUser) return;
  populateFriendsList();
  updatePendingCount();
});


signupButton.addEventListener("click", async () => {
  const email = signupEmail.value;
  const password = signupPassword.value;
  const nameFirst = signupNameFirst.value;
  const nameLast = signupNameLast.value;
  const number = signupNumber.value;

  if (!email || !password || !nameFirst || !nameLast || !number) {
    showToast("Please fill in all fields before signing up.", "error");
    return;
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );
    const user = userCredential.user;

    // Generate a unique friend code
    const friendCode = await allocateFriendCode();

    // Save additional user info along with friend code to Realtime Database
    await set(ref(database, `users/${user.uid}/profile`), {
      firstName: nameFirst,
      lastName: nameLast,
      phoneNumber: number,
      email: email,
      friendCode: friendCode,
    });

    // Save friend code in the friendCodes node. Uses user.uid from the
    // credential we just got — currentUser is set asynchronously by
    // onAuthStateChanged and could still be null here (it used to be read
    // here, which was a crash-y race).
    await set(ref(database, `friendCodes/${friendCode}`), {
      userId: user.uid,
      firstName: nameFirst,
      lastName: nameLast,
    });


    // Make friend code accessible outside the signup function
    window.userFriendCode = friendCode; // Store in a global variable for external use



    showToast(`Account created for ${user.email}! `);
    await logUserAction("Signed up with email");

  } catch (error) {
    showToast(`Signup failed: ${error.message}`, "error");
  }
});
changePassword.addEventListener("click", resetUserPassword);
resetPassword.addEventListener("click", resetUserPassword);
async function resetUserPassword() {
  // Signed in (Profile → Reset Password): use the account's own email — the
  // login/signup fields aren't even visible there, and reading leftovers out
  // of them used to send the reset link to whatever was last typed.
  // Signed out (login page): prefer the login field over stale signup input.
  const email =
    (currentUser && currentUser.email) ||
    loginEmail.value.trim() ||
    signupEmail.value.trim();

  if (!email) {
    showToast("Please enter your email.", "error");
    return;
  }

  const actionCodeSettings = {
    url: "https://tabsonfriends.com",
    handleCodeInApp: false, // Set to true if you want to handle the reset in your app
  };

  sendPasswordResetEmail(auth, email, actionCodeSettings)
    .then(() => {
      showToast("Password reset link sent! Check your email.", "success");
      logUserAction("Requested password reset");

    })
    .catch((error) => {
      showToast("Password reset failed: " + error.message, "error");
    });
}

// Logout Event
logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Logged out successfully.");
    await logUserAction("Logged out");
    peopleList.innerHTML = ""; // Clear list on logout
  } catch (error) {
    showToast(`Logout failed: ${error.message}`, "error");
  }
  closeNav();
});

// The list is now kept in sync across devices by the peopleList onValue
// listener (see onAuthStateChanged): every save rewrites the whole array, so
// this canonical serialization lets the listener tell "echo of my own save"
// apart from "another device changed the data" — RTDB prunes nulls and empty
// arrays/objects, so a naive JSON compare of what we wrote vs what comes back
// would always look different.
function pruneEmpty(value) {
  if (Array.isArray(value)) {
    const arr = value.map(pruneEmpty).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out = {};
    // Sorted keys: RTDB snapshots come back with alphabetical child order,
    // while the objects we save are built in insertion order — without
    // sorting, every echo would stringify differently and look like a
    // remote change.
    Object.keys(value).sort().forEach((key) => {
      const pruned = pruneEmpty(value[key]);
      if (pruned !== undefined) out[key] = pruned;
    });
    return Object.keys(out).length ? out : undefined;
  }
  return value === null || value === undefined ? undefined : value;
}
const canonicalPeopleJson = (data) => JSON.stringify(pruneEmpty(data) ?? []);
let lastKnownPeopleJson = null;
let lastSaveErrorToastAt = 0;

// Save list to Firebase instead of localStorage
async function saveListToFirebase() {
  if (!currentUser) return;

  const listItems = peopleList.querySelectorAll(".personlist-item");
  const peopleData = [];

  listItems.forEach((item) => {
    if (item.classList.contains("ad-box")) return; // not a person — nothing to save
    const name = item.querySelector(".name-span").textContent;
    // .value (not .textContent) holds the canonical USD amount — .textContent
    // is just its converted display in whatever currency is selected.
    const amountValue = item.querySelector(".amount-input").value;
    const rawAmount = typeof amountValue === "string" ? amountValue.trim() : amountValue;
    const amount = isNaN(rawAmount) || rawAmount === "" ? rawAmount : parseFloat(rawAmount);
    const status = item.getAttribute("data-status") || "neutral"; // Get status
    const interest = JSON.parse(item.dataset.interest);
    const isFriend = item.dataset.isFriend === "true";
    let extraInfoElements = item.querySelectorAll(".extra-info-item");
    let extraInfoArray = [];

    extraInfoElements.forEach((infoElement) => {
      const textSpan = infoElement.querySelector("span");
      const text = textSpan ? textSpan.textContent.trim() : "";
      if (text) {
        extraInfoArray.push({ text, hasRemoveBtn: true });
      }
    });

    peopleData.push({
      name,
      amount,
      extraInfo: extraInfoArray,
      status,
      interest,
      isFriend,
    });
  });

  // Remember what we wrote so the realtime listener can ignore the echo of
  // this save instead of re-rendering the list we just built it from.
  lastKnownPeopleJson = canonicalPeopleJson(peopleData);

  try {
    await set(ref(database, `users/${currentUser.uid}/peopleList`), {
      peopleData,
    });
    console.log("✅ Data saved to Firebase:", { peopleData });
  } catch (error) {
    console.error("❌ Error saving data:", error);
    // Every edit saves the whole list, so a dead connection would fail every
    // click — warn once per burst instead of stacking a toast per edit.
    const now = Date.now();
    if (now - lastSaveErrorToastAt > 15000) {
      lastSaveErrorToastAt = now;
      showToast("Couldn't save your changes. Check your connection and try again.", "error");
    }
  }
}

// Rebuild the on-screen list from a peopleData array. Shared by the initial
// load and the realtime listener that mirrors changes from other devices.
function renderPeopleList(peopleData) {
  if (!peopleList) return;
  peopleList.innerHTML = "";

  (peopleData || []).forEach((person) => {
    const extraInfoArray = person.extraInfo ?? [];
    const listItem = addPerson(
      person.name,
      person.amount,
      extraInfoArray,
      person.interest,
      person.isFriend
    );

    if (listItem) {
      if (person.status === "owesMe") {
        listItem.setAttribute("data-status", "owesMe");
        listItem.querySelector(".amount-input").style.color =
          "rgb(73, 255, 97)"; // Green
      } else if (person.status === "iOwe") {
        listItem.setAttribute("data-status", "iOwe");
        listItem.querySelector(".amount-input").style.color =
          "rgb(255, 73, 73)"; // Red
      }
    }
  });

  addAdBox();
}

// In-list AdSense unit, styled as a normal .personlist-item card (same
// gradient/border/hover as every other row) so it sits in the list without
// looking bolted-on — with a small "Advertisement" label, which AdSense
// policy requires on any ad placed among real content. Reuses the same ad
// unit as the landing page for now; create a dedicated "in-list" ad unit in
// the AdSense console for better reporting once this is live (see
// ADS_SETUP.md). Always pinned to the END of the list: appendChild on an
// existing node moves it rather than duplicating it, so every call after an
// add/reload just re-parks it at the bottom instead of creating a second box.
// Hidden entirely inside the native app — AdSense doesn't fill inside a
// WebView there (the native AdMob banner is the only ad on iOS).
function addAdBox() {
  if (!peopleList || IS_NATIVE_APP) return;

  let adBox = peopleList.querySelector(".ad-box");
  if (!adBox) {
    adBox = document.createElement("div");
    adBox.classList.add("personlist-item", "ad-box");
    adBox.innerHTML = `
      <p class="ad-box-label">Advertisement</p>
      <ins class="adsbygoogle"
        data-ad-client="ca-pub-7825788728707782"
        data-ad-slot="8944873686"></ins>
    `;
    watchInListAdFill(adBox);
  }
  peopleList.appendChild(adBox);

  // Request a fill only once per box (AdSense throws if push() runs twice on
  // the same <ins>); re-parking an existing box on later renders must not
  // re-push.
  if (!adBox.dataset.adsPushed) {
    adBox.dataset.adsPushed = "1";
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.warn("AdSense push failed (likely blocked):", error);
    }
  }
}

// Hides the whole card if the ad never actually renders (ad blocker, or
// AdSense has no fill). Unlike the landing page's #landing-ad (which swaps in
// a "Support TABS" house card — see landingAdFallback in script.js), this box
// sits inside a list of real people's tabs, where a promo card would read as
// clutter mixed into someone's ledger; simply not showing the row is the
// better fallback here. Called once per freshly-created <ins> (re-parking an
// existing box doesn't need a second watcher).
function watchInListAdFill(adBox) {
  const ins = adBox.querySelector(".adsbygoogle");
  if (!ins) return;

  // Collapsed (zero height, full width) until AdSense actually fills the slot.
  // The slot has a fixed 250px height, so showing it while waiting put a large
  // empty box in the list for ~3s and then yanked it out, jumping the rows.
  // Not display:none while waiting: AdSense won't fill a slot it measures as
  // 0px wide.
  adBox.classList.add("ad-pending");

  function checkFill() {
    const filled = ins.dataset.adStatus === "filled" || !!ins.querySelector("iframe");
    if (filled && ins.dataset.adStatus !== "unfilled") {
      adBox.classList.remove("ad-pending");
      adBox.style.display = "";
    }
  }
  function giveUp() {
    const scriptBlocked = !(window.adsbygoogle && window.adsbygoogle.loaded);
    if (scriptBlocked || ins.dataset.adStatus === "unfilled" || adBox.classList.contains("ad-pending")) {
      adBox.style.display = "none";
    }
  }

  new MutationObserver(() => {
    if (ins.dataset.adStatus === "unfilled") giveUp();
    else checkFill();
  }).observe(ins, {
    attributes: true,
    attributeFilter: ["data-ad-status"],
    childList: true,
    subtree: true,
  });
  // Still nothing after a few seconds: blocked or no fill, so drop the box.
  setTimeout(giveUp, 4000);
}

// Guests never run loadListFromFirebase (it bails without a user, since
// there's nothing to load), so give them the ad box too — this listener is
// separate from the one in script.js (which just shows the empty list) since
// addAdBox() lives in this module and script.js is a classic script that
// can't reach it directly.
document.getElementById("ContinueasGuest").addEventListener("click", () => {
  addAdBox();
});

// Load list and interest data from Firebase
async function loadListFromFirebase() {
  if (!currentUser) return;
  document.getElementById("loader").style.display = "flex";
  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/peopleList`)
    );
    if (snapshot.exists()) {
      const peopleData = snapshot.val().peopleData || [];
      lastKnownPeopleJson = canonicalPeopleJson(peopleData);
      renderPeopleList(peopleData);
    }
  } catch (error) {
    console.error("❌ Error loading data:", error);
    showToast("Couldn't load your tabs. Try refreshing the page.", "error");
  } finally {
    document.getElementById("loader").style.display = "none";
  }
}
deleteAccount.addEventListener("click", () => {
  document.getElementById("delete-account-modal").style.display = "flex";
});
document.getElementById("close-delete-account").addEventListener("click", () => {
  document.getElementById("delete-account-modal").style.display = "none";
})
document.getElementById("delete-account-btn").addEventListener("click", () => {
  deleteAccountAndData();
})
// Function to add a person to the list
// ---------------------------------------------------------------------------
// Apple token revocation before account deletion (App Store Review Guideline
// 5.1.1(v)): accounts that use Sign in with Apple must have their Apple
// tokens revoked when the account is deleted.
//
// • Browser: reauthenticateWithPopup returns an OAuth *access token*, which
//   firebase/auth's revokeAccessToken() revokes (in 10.6.0 it POSTs
//   /v2/accounts:revokeToken with tokenType "ACCESS_TOKEN").
// • Native: ASAuthorizationController hands us an *authorization code*, not
//   an access token, so revokeAccessToken() (hard-wired to ACCESS_TOKEN)
//   would be the wrong token type. We call the same Identity Toolkit endpoint
//   directly with tokenType "CODE" — the same request the Firebase iOS SDK's
//   Auth.revokeToken(withAuthorizationCode:) sends (RevokeTokenRequest:
//   providerId "apple.com", tokenType = authorizationCode, token, idToken).
// ---------------------------------------------------------------------------
async function revokeAppleAuthorizationCode(user, authorizationCode) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: "apple.com",
        tokenType: "CODE",
        token: authorizationCode,
        idToken: await user.getIdToken(),
      }),
    }
  );
  if (!response.ok) {
    let detail = "";
    try { detail = (await response.json())?.error?.message || ""; } catch (e) {}
    throw new Error(`revokeToken HTTP ${response.status} ${detail}`.trim());
  }
}

// Returns true when deletion may proceed, false to abort (toast already
// shown). Accounts without an apple.com provider pass straight through.
async function revokeAppleBeforeDeletion() {
  const user = auth.currentUser;
  const usesApple = (user?.providerData || []).some((p) => p?.providerId === "apple.com");
  if (!user || !usesApple) return true;

  const abortToast = (error) => {
    if (error?.cancelled || isPopupCancel(error)) {
      showToast("Account not deleted — confirm with Apple to delete your account.", "error");
    } else if (error?.code === "auth/user-mismatch") {
      showToast("That Apple ID isn't the one on this account. Account not deleted.", "error");
    } else {
      showToast(
        "Couldn't confirm with Apple, so your account wasn't deleted: " +
          (error?.message || error),
        "error"
      );
    }
  };

  if (IS_NATIVE_APP && window.ReactNativeWebView) {
    let payload;
    try {
      payload = await requestNativeAppleCredential("reauth");
      if (!payload?.idToken) throw new Error("Apple didn't return an identity token.");
      await reauthenticateWithCredential(
        user,
        appleProvider().credential({ idToken: payload.idToken, rawNonce: payload.rawNonce })
      );
    } catch (error) {
      console.error("Apple reauth for deletion failed:", error);
      abortToast(error);
      return false;
    }
    try {
      if (!payload.authorizationCode) throw new Error("no authorization code");
      await revokeAppleAuthorizationCode(user, payload.authorizationCode);
    } catch (error) {
      // Deleting the data matters most — carry on.
      console.warn("Apple token revocation failed; deleting anyway:", error);
    }
    return true;
  }

  let result;
  try {
    result = await reauthenticateWithPopup(user, appleProvider());
  } catch (error) {
    console.error("Apple reauth for deletion failed:", error);
    abortToast(error);
    return false;
  }
  try {
    const credential = OAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) throw new Error("no access token on the Apple credential");
    await revokeAccessToken(auth, credential.accessToken);
  } catch (error) {
    console.warn("Apple token revocation failed; deleting anyway:", error);
  }
  return true;
}

let deletionInProgress = false;

async function deleteAccountAndData() {
  if (!currentUser || deletionInProgress) return;
  deletionInProgress = true;
  const deleteBtn = document.getElementById("delete-account-btn");
  if (deleteBtn) deleteBtn.disabled = true;

  try {
    if (!(await revokeAppleBeforeDeletion())) return;

    // Delete both the database data and the Firebase Auth record server-side.
    // Done on the server (Admin SDK) so it doesn't hit auth/requires-recent-
    // login and actually removes the account from the Firebase Auth console.
    await deleteAccountFn();
    showToast("Account deleted successfully.");
    document.getElementById("delete-account-modal").style.display = "none";
    await signOut(auth);
  } catch (error) {
    const notDeployed =
      error?.code === "functions/not-found" ||
      error?.code === "functions/internal";
    showToast(
      notDeployed
        ? "Account deletion isn't set up yet — deploy the Cloud Functions first."
        : "Error deleting account: " + (error?.message || error),
      "error"
    );
  } finally {
    deletionInProgress = false;
    if (deleteBtn) deleteBtn.disabled = false;
  }
}
disableAccount.addEventListener("click", disableUserAccount);
async function disableUserAccount() {
  if (!currentUser) return;

  try {
    // Flips the real `disabled` flag on the Firebase Auth user (admin-only, so
    // it runs server-side) — the old client-only version just set a database
    // flag and never showed up on the Firebase Auth page.
    await disableAccountFn();
    showToast("Account disabled. You'll be signed out.");
    await signOut(auth);
  } catch (error) {
    const notDeployed =
      error?.code === "functions/not-found" ||
      error?.code === "functions/internal";
    showToast(
      notDeployed
        ? "Disabling isn't set up yet — deploy the Cloud Functions first."
        : "Error disabling account: " + (error?.message || error),
      "error"
    );
  }
}
exportData.addEventListener("click", exportUserData);
async function exportUserData() {
  if (!currentUser) return;

  try {
    const snapshot = await get(ref(database, `users/${currentUser.uid}`));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const json = JSON.stringify(data, null, 2);
      // WKWebView ignores <a download> blob links, so inside the iOS app hand
      // the JSON to native, which writes a temp file and opens the share
      // sheet (save to Files, AirDrop, Mail, ...).
      if (IS_NATIVE_APP && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ type: "exportData", filename: "tabs-export.json", json })
        );
        showToast("Choose where to save your TABS export.", "info");
        return;
      }
      const blob = new Blob([json], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exported_user_data.json";
      a.click();
      // Revoking synchronously can cancel the download in some browsers
      // before it has read the blob; give it a moment first.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast("User data exported.");
    } else {
      showToast("No data found to export.", "error");
    }
  } catch (error) {
    showToast("Error exporting data: " + error.message, "error");
  }
}


async function logUserAction(action) {
  if (!currentUser) return;

  const historyRef = ref(database, `users/${currentUser.uid}/history`);
  const newEntry = {
    action,
    timestamp: new Date().toISOString(),
  };

  try {
    await push(historyRef, newEntry);
    console.log(`📘 Logged action: ${action}`);
  } catch (error) {
    console.error("❌ Failed to log user action:", error);
  }
}


viewAccountHistory.addEventListener("click", () => {

  viewUserAccountHistory();
});
async function viewUserAccountHistory() {
  if (!currentUser) return;

  const historyRef = ref(database, `users/${currentUser.uid}/history`);
  const list = document.getElementById("account-history-list");
  list.innerHTML = ""; // Clear previous entries

  try {
    const snapshot = await get(historyRef);
    if (snapshot.exists()) {
      const history = snapshot.val();

      // Sort by newest first
      const sortedEntries = Object.values(history).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      sortedEntries.forEach((entry) => {
        const li = document.createElement("li");
        li.textContent = `${new Date(entry.timestamp).toLocaleString()} — ${entry.action}`;
        list.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "No account history available.";
      list.appendChild(li);
    }

    document.getElementById("AccountHistoryModal").style.display = "flex";
  } catch (error) {
    showToast("Error retrieving history: " + error.message, "error");
  }
}
document.getElementById("clearAccountHistory").addEventListener("click", () => {
  document.getElementById("clearAccountHistoryModal").style.display = "flex";
});

// Clear Account History
const clearButton = document.getElementById("confirmClearHistory");

clearButton.addEventListener("click", async () => {
  if (!currentUser) return;

  const clearTimestampRef = ref(database, `users/${currentUser.uid}/lastCleared`);
  const historyRef = ref(database, `users/${currentUser.uid}/history`);

  try {
    const snapshot = await get(clearTimestampRef);
    const now = Date.now();
    let canClear = true;

    if (snapshot.exists()) {
      const lastCleared = snapshot.val();
      const daysSince = (now - lastCleared) / (1000 * 60 * 60 * 24);
      if (daysSince < 30) {
        showToast(`You can clear your history again in ${Math.ceil(30 - daysSince)} day(s).`, "error");
        canClear = false;
      }
    }

    if (canClear) {
      await set(historyRef, null); // Clears history
      await set(clearTimestampRef, now); // Sets current timestamp

      // Refresh list
      const list = document.getElementById("account-history-list");
      list.innerHTML = "<li>Account history cleared.</li>";
      showToast("Account history cleared successfully.", "success");
    }

  } catch (error) {
    showToast("Error clearing history: " + error.message, "error");
  }
});

async function updatePendingCount() {
  if (!currentUser) return;

  const pendingRef = ref(database, `users/${currentUser.uid}/pendingRequests`);
  const sentRef = ref(database, `users/${currentUser.uid}/sentRequests`);
  try {
    const [pendingSnap, sentSnap] = await Promise.all([
      get(pendingRef),
      get(sentRef),
    ]);
    // Acceptance markers (type: "accepted") live under pendingRequests too,
    // but they're bookkeeping, not requests awaiting a decision.
    const receivedCount = pendingSnap.exists()
      ? Object.entries(pendingSnap.val()).filter(
          ([uid, req]) => req.type !== "accepted" && !isBlocked(uid)
        ).length
      : 0;
    const sentCount = sentSnap.exists() ? Object.keys(sentSnap.val()).length : 0;

    const receivedBadge = document.getElementById("pendingCount");
    receivedBadge.textContent = receivedCount;
    receivedBadge.style.display = receivedCount > 0 ? "inline-flex" : "none";

    const sentBadge = document.getElementById("sentCount");
    sentBadge.textContent = sentCount;
    sentBadge.style.display = sentCount > 0 ? "inline-flex" : "none";

    // The pills are bare numbers; give screen readers the meaning.
    const parts = [];
    if (receivedCount) parts.push(`${receivedCount} received`);
    if (sentCount) parts.push(`${sentCount} sent`);
    document
      .getElementById("pendingRequestsBtn")
      .setAttribute("aria-label", parts.length ? `Pending requests: ${parts.join(", ")}` : "Pending requests");
  } catch (error) {
    console.error("❌ Error updating pending count:", error);
  }
}

function addPerson(
  name,
  amount,
  extraInfoArray = [],
  interest = { enabled: false, rate: 0, period: "monthly" },
  isFriend = false,
  animate = false
) {
  const listItem = document.createElement("div");
  listItem.classList.add("personlist-item");
  listItem.dataset.isFriend = isFriend ? "true" : "false";
  // Defaults to "They Owe" (owesMe, green) — loadListFromFirebase overrides
  // this below for people explicitly saved as "iOwe".
  listItem.setAttribute("data-status", "owesMe");

  const nameAmountContainer = document.createElement("div");
  nameAmountContainer.classList.add("name-amount-container");

  const nameFriendIconContainer = document.createElement("div");
  nameFriendIconContainer.classList.add("name-friend-icon-container");

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name;
  nameSpan.classList.add("name-span");

  const amountContainer = document.createElement("div");
  amountContainer.classList.add("amount-container");

  const dollarSpan = document.createElement("span");
  dollarSpan.textContent = getSymbol(getSelectedCurrency());
  dollarSpan.classList.add("dollar-sign");

  const amountSpan = document.createElement("span");
  amountSpan.classList.add("amount-input");
  amountSpan.style.color = "rgb(73, 255, 97)";
  // amount (and amountSpan.value) is always the canonical USD figure —
  // what's shown in .textContent is that value converted to the currently
  // selected display currency.
  if (!isNaN(amount)) {
    amountSpan.textContent = usdToDisplay(parseFloat(amount)).toFixed(2);
    amountContainer.appendChild(dollarSpan);
  } else {
    amountSpan.textContent = amount;
  }
  amountSpan.classList.add("amount-input");
  amountSpan.value = amount || 0;
  // (No "input" listener here — amounts live in a plain <span>, which never
  // fires input events; edits go through the Add/Remove Money modals, which
  // save explicitly.)
  amountContainer.appendChild(amountSpan);

  const personItem = document.createElement("div");
  personItem.appendChild(nameFriendIconContainer);
  nameFriendIconContainer.appendChild(nameSpan);
  if (isFriend) {
    // Sibling of nameSpan, not a child of it — anything reading
    // nameSpan.textContent as the person's name (save/edit/logging) would
    // otherwise pick up this icon's ligature text too.
    const friendIcon = document.createElement("span");
    friendIcon.className = "material-icons friend-icon";
    friendIcon.textContent = "how_to_reg";
    friendIcon.title = "This person is one of your friends";
    nameFriendIconContainer.appendChild(friendIcon);
  }
  personItem.appendChild(amountContainer);
  personItem.classList.add("person-stuff");

  listItem.appendChild(nameAmountContainer);

  // Extra Info Container
  let extraInfoContainer = document.createElement("div");
  extraInfoContainer.classList.add("extra-info-container");
  listItem.appendChild(extraInfoContainer);

  // Restore extra info if available
  extraInfoArray.forEach((infoObj) => {
    if (infoObj.text) {
      createExtraInfoElement(extraInfoContainer, infoObj.text);
    }
  });

  // Remove Button
  const removeBtn = document.createElement("a");
  removeBtn.innerHTML = "<img src='check_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg' alt=''/>";
  removeBtn.classList.add("remove-btn");
  // An <a> with no href can't be reached by keyboard, so give it button
  // semantics, a tab stop, and Enter/Space activation. (Kept as an <a> so the
  // existing .remove-btn styles still apply.)
  removeBtn.setAttribute("role", "button");
  removeBtn.tabIndex = 0;
  removeBtn.title = "Settle tab";
  removeBtn.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      removeBtn.click();
    }
  });
  removeBtn.addEventListener("click", () => {
    const removedName = nameSpan.textContent;
    // Play the exit animation before actually removing the row — saving
    // has to happen after removal too, otherwise the row being removed is
    // still in the DOM (and gets saved back into peopleData) when
    // saveListToFirebase reads the current list.
    listItem.classList.add("item-leave");
    listItem.addEventListener(
      "animationend",
      () => {
        // Remember where the row was so Undo can put it back in place.
        const parent = listItem.parentNode;
        const nextSibling = listItem.nextSibling;
        listItem.remove();
        saveListToFirebase();
        logUserAction(`Removed ${removedName}'s tab`);
        showToast(`Settled ${removedName}'s Tab.`, "success", {
          label: "Undo",
          icon: "undo",
          ariaLabel: `Undo settling ${removedName}'s tab`,
          onClick: () => {
            // The list may have been rebuilt since (e.g. a change synced from
            // another device), in which case the old row can't be put back.
            if (!parent?.isConnected) {
              showToast(`Couldn't restore ${removedName}'s tab.`, "error");
              return;
            }
            listItem.classList.remove("item-leave");
            listItem.classList.add("item-enter");
            listItem.addEventListener(
              "animationend",
              () => listItem.classList.remove("item-enter"),
              { once: true }
            );
            parent.insertBefore(
              listItem,
              nextSibling && nextSibling.parentNode === parent ? nextSibling : null
            );
            addAdBox(); // keep the ad parked at the bottom
            saveListToFirebase();
            logUserAction(`Restored ${removedName}'s tab`);
            showToast(`Restored ${removedName}'s tab.`);
          },
        });
      },
      { once: true }
    );
  });

  // More Button (Expand/Collapse)
  const addInfoBtn = document.createElement("button");
  addInfoBtn.innerHTML =
    '<span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>';
  addInfoBtn.classList.add("add-info-btn");
  addInfoBtn.title = "More options";
  addInfoBtn.addEventListener("click", () => openModal(listItem)); // Pass the specific listItem

  const extraBox = document.createElement("div");
  extraBox.classList.add("extra-info-box");
  extraBox.appendChild(removeBtn);
  extraBox.appendChild(addInfoBtn);

  if (isFriend) {
    // SMS reminder — only for rows that came from the friends list, since
    // reminding someone over SMS needs a real linked account (and phone
    // number) behind the row.
    const smsBtn = document.createElement("button");
    smsBtn.innerHTML = '<span class="material-icons" aria-hidden="true">sms</span>';
    smsBtn.classList.add("sms-remind-btn");
    smsBtn.title = "Send a payment reminder";
    smsBtn.addEventListener("click", () => openSmsReminderModal(listItem));
    extraBox.appendChild(smsBtn);
  }

  // Payment request (Venmo/PayPal/Cash App) — on every row, not just friends:
  // even for a manually-typed person you can still hand them your own
  // PayPal.Me / Cash App link. (A Venmo *charge* additionally needs a linked
  // friend's handle, which openPaymentRequestModal resolves when available.)
  // Hidden unless payment requests are enabled (body.payments-enabled in CSS).
  const payBtn = document.createElement("button");
  payBtn.innerHTML = '<span class="material-icons" aria-hidden="true">payments</span>';
  payBtn.classList.add("pay-request-btn");
  payBtn.title = "Request payment via Venmo / PayPal / Cash App";
  payBtn.addEventListener("click", () => openPaymentRequestModal(listItem));
  extraBox.appendChild(payBtn);
  nameAmountContainer.appendChild(personItem);
  nameAmountContainer.appendChild(extraBox);
  labelRowButtons(listItem, name);

  peopleList.appendChild(listItem);
  listItem.dataset.interest = JSON.stringify(interest);
  listItem._dollarSpan = dollarSpan;
  listItem._amountContainer = amountContainer;

  if (animate) {
    // Only for interactive adds (the Add button, adding a friend to the
    // list) — not the initial bulk load from Firebase, where animating
    // every row in on every page open would look chaotic instead of smooth.
    listItem.classList.add("item-enter");
    listItem.addEventListener(
      "animationend",
      () => listItem.classList.remove("item-enter"),
      { once: true }
    );
  }

  return listItem;

}

// Screen-reader names for a row's icon buttons. They include the person's
// name, so a list read aloud says "Settle Jordan's tab", not just "Settle".
// Called again on rename.
function labelRowButtons(listItem, name) {
  const label = (selector, text) =>
    listItem.querySelector(selector)?.setAttribute("aria-label", text);
  label(".remove-btn", `Settle ${name}'s tab`);
  label(".add-info-btn", `More options for ${name}`);
  label(".sms-remind-btn", `Send ${name} a payment reminder`);
  label(".pay-request-btn", `Request payment from ${name}`);
}

function checkAmountOrItem() {
  const amountSpan = currentListItem.querySelector(".amount-input");
  const text = amountSpan.textContent.trim();

  const dollarSpan = currentListItem._dollarSpan;
  const amountContainer = currentListItem._amountContainer;

  if (!isNaN(text) && text !== "") {
    console.log("This is a number:", parseFloat(text));
    document.getElementById("add-more-money-btn").style.display = "block";
    document.getElementById("remove-money-btn").style.display = "block";
    document.getElementById("edit-item-btn").style.display = "none";

    if (!amountContainer.contains(dollarSpan)) {
      amountContainer.insertBefore(dollarSpan, amountSpan);
    }
  } else {
    console.log("This is an item/description:", text);
    document.getElementById("add-more-money-btn").style.display = "none";
    document.getElementById("remove-money-btn").style.display = "none";
    document.getElementById("edit-item-btn").style.display = "block";
  }
}

// I Owe / They Owe toggle switch (see #btn-container in index.html). It's
// always in one of these two states — defaults to "They Owe" (owesMe,
// green) since a slider has no third "neutral" position.
const oweToggle = document.getElementById("oweToggle");
oweToggle.addEventListener("change", () => {
  if (!currentListItem) return;
  const amountInput = currentListItem.querySelector(".amount-input");

  const who = currentListItem.querySelector(".name-span").textContent;
  if (oweToggle.checked) {
    currentListItem.setAttribute("data-status", "owesMe");
    amountInput.style.color = "rgb(73, 255, 97)";
    showToast(`${who} owes you.`);
  } else {
    currentListItem.setAttribute("data-status", "iOwe");
    amountInput.style.color = "rgb(255, 73, 73)";
    showToast(`You owe ${who}.`);
  }

  saveListToFirebase();
});

const interestBox = document.getElementById("interestTitle");
if (!interestBox) {
  console.error("Element with ID 'interestTitle' not found.");
}

// Create and append toggle. Built with the same .switch markup the
// notification and payment settings use (div.switch > input + label), so every
// on/off control in the app is the same pill switch — this one used to be a
// bare 24px square checkbox, the only one of its kind.
const interestSwitch = document.createElement("div");
interestSwitch.className = "switch";
const interestToggle = document.createElement("input");
interestToggle.type = "checkbox";
interestToggle.id = "interestToggle";
const interestToggleLabel = document.createElement("label");
interestToggleLabel.setAttribute("for", "interestToggle");
interestSwitch.appendChild(interestToggle);
interestSwitch.appendChild(interestToggleLabel);
interestBox.appendChild(interestSwitch);

// Create interest indicator

const interestContainer = document.getElementById("interest-container");
const interestrangecontainer = document.getElementById(
  "interest-range-container"
);

// Create range slider
const interestRange = document.createElement("input");
interestRange.type = "range";
interestRange.id = "interestRange";
interestRange.name = "interestRange";
interestRange.min = "0";
interestRange.max = "30";
interestRange.value = "0";

// Create rate label
const rateLabel = document.createElement("p");
rateLabel.innerHTML = 'Rate: <span class="rate">0</span>%';
rateLabel.id = "rate";

// Append range slider to its container
const interestRangeContainer = document.getElementById(
  "interest-range-container"
);
if (interestRangeContainer) {
  interestRangeContainer.appendChild(interestRange);
} else {
  console.error("Element with ID 'interest-range-container' not found.");
}

// Append rate label to interestBox
interestBox.appendChild(rateLabel);

// Create dropdown for interest period
const interestDropdown = document.createElement("select");
interestDropdown.id = "interestSelect";

const periods = ["Weekly", "Monthly", "Quarterly", "Yearly"];
periods.forEach((period) => {
  const option = document.createElement("option");
  option.value = period.toLowerCase();
  option.textContent = period;
  interestDropdown.appendChild(option);
});

// Append dropdown to interestBox
interestRangeContainer.appendChild(interestDropdown);

// Shared by openModal (initial render) and updateInterest (live toggle) so
// the box's expand/collapse behavior only has one implementation. Previously
// only openModal ever called this, so clicking the checkbox inside an
// already-open modal changed the stored value but never touched the box's
// height/opacity/display — it only "took effect" the next time you closed
// and reopened the modal.
function setInterestBoxExpanded(enabled) {
  const interestContainer = document.getElementById("interest-container");
  const interestRangeContainer = document.getElementById(
    "interest-range-container"
  );
  interestContainer.style.height = enabled ? "130px" : "34px";
  interestRangeContainer.style.opacity = enabled ? 1 : 0;
  interestRangeContainer.style.display = enabled ? "flex" : "none";
}

function openModal(listItem) {
  currentListItem = listItem;
  const interest = JSON.parse(listItem.dataset.interest);
  const status = listItem.getAttribute("data-status");

  // Defaults to "They Owe" (owesMe, checked/green) for anything other than
  // an explicit "I Owe" — there's no neutral position on a toggle switch.
  document.getElementById("oweToggle").checked = status !== "iOwe";

  // Update interest controls
  document.getElementById("interestToggle").checked = interest.enabled;
  document.getElementById("interestRange").value = interest.rate;
  document.getElementById("interestSelect").value = interest.period;

  // Update UI
  setInterestBoxExpanded(interest.enabled);
  document.getElementById(
    "rate"
  ).innerHTML = `<span class="rate">${interest.rate}</span>%`;

  document.getElementById("customModal").style.display = "flex";
  checkAmountOrItem();
}

document
  .getElementById("interestToggle")
  .addEventListener("change", updateInterest);
// Toast only on the on/off switch — the rate slider fires on every drag step
// and already shows its value live.
document.getElementById("interestToggle").addEventListener("change", (e) => {
  if (!currentListItem) return;
  const who = currentListItem.querySelector(".name-span").textContent;
  showToast(e.target.checked ? `Interest turned on for ${who}.` : `Interest turned off for ${who}.`);
});
document
  .getElementById("interestRange")
  .addEventListener("input", updateInterest);
document
  .getElementById("interestSelect")
  .addEventListener("change", updateInterest);

const COMPOUNDING_FREQUENCY_BY_PERIOD = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
};

// Shared by updateInterest (single person, on settings change) and
// applyInterestToAll (every person, on login) so both apply the exact same
// compound-interest math and both correctly advance lastInterestApplied.
function computeAccruedAmount(amount, interest) {
  const now = Date.now();
  if (!interest?.enabled || typeof amount !== "number") {
    return { amount, lastInterestApplied: interest?.lastInterestApplied ?? now };
  }

  const lastApplied = interest.lastInterestApplied || now;
  const yearsElapsed = (now - lastApplied) / (1000 * 60 * 60 * 24 * 365);
  if (yearsElapsed <= 0) {
    return { amount, lastInterestApplied: lastApplied };
  }

  const rate = interest.rate / 100;
  const n = COMPOUNDING_FREQUENCY_BY_PERIOD[interest.period] || 12;
  const newAmount = amount * Math.pow(1 + rate / n, n * yearsElapsed);
  return { amount: newAmount, lastInterestApplied: now };
}

function updateInterest() {
  if (!currentListItem) return;

  // Settle whatever accrued under the OLD rate/period first — otherwise
  // changing the rate/period (or just re-toggling) resets lastInterestApplied
  // to now and silently discards interest already earned since the last
  // checkpoint.
  const amountSpan = currentListItem.querySelector(".amount-input");
  const oldInterest = JSON.parse(currentListItem.dataset.interest || "{}");
  const currentAmount = parseFloat(amountSpan.value);
  if (!isNaN(currentAmount)) {
    const settled = computeAccruedAmount(currentAmount, oldInterest);
    if (settled.amount !== currentAmount) {
      amountSpan.textContent = usdToDisplay(settled.amount).toFixed(2);
      amountSpan.value = settled.amount;
    }
  }

  const interest = {
    enabled: document.getElementById("interestToggle").checked,
    rate: parseFloat(document.getElementById("interestRange").value),
    period: document.getElementById("interestSelect").value,
    lastInterestApplied: Date.now(), // ✅ Ensure lastInterestApplied is stored
  };

  currentListItem.dataset.interest = JSON.stringify(interest);
  setInterestBoxExpanded(interest.enabled);
  document.getElementById(
    "rate"
  ).innerHTML = `<span class="rate">${interest.rate}</span>%`;
  saveListToFirebase(); // ✅ Ensure data is saved properly in Firebase
}

// Applies accrued interest to everyone in the list. Called once at login
// (see onAuthStateChanged) rather than on DOMContentLoaded — currentUser
// isn't set yet at DOMContentLoaded time (Firebase auth state resolves
// asynchronously afterwards), so gating on it there meant this almost never
// actually ran on page load.
async function applyInterestToAll() {
  if (!currentUser) return;

  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/peopleList/peopleData`)
    );
    if (snapshot.exists()) {
      const peopleData = snapshot.val();

      // Collect and await every write — a bare forEach with .then()/.catch()
      // doesn't block the async function's return, so callers awaiting
      // applyInterestToAll() would otherwise proceed (e.g. render the list)
      // before any of these updates actually landed in the database.
      const updates = Object.entries(peopleData).map(async ([key, person]) => {
        const interest = person.interest;
        if (!interest?.enabled) return;

        const currentAmount = person.amount || 0;
        const settled = computeAccruedAmount(currentAmount, interest);
        if (settled.amount === currentAmount) return;

        try {
          await update(
            ref(
              database,
              `users/${currentUser.uid}/peopleList/peopleData/${key}`
            ),
            {
              amount: settled.amount,
              interest: {
                ...interest,
                lastInterestApplied: settled.lastInterestApplied, // ✅ Update timestamp to prevent double application
              },
            }
          );
          console.log(
            `✅ Interest applied for person at index ${key}: +${(
              settled.amount - currentAmount
            ).toFixed(2)}`
          );
        } catch (error) {
          console.error(`❌ Error updating person at index ${key}:`, error);
        }
      });

      await Promise.all(updates);
    }
  } catch (error) {
    console.error("❌ Error applying interest:", error);
  }
}


// One Cancel per pane (the ids used to be duplicated, which is invalid HTML
// and made getElementById a coin flip) — both run the same full teardown.
["closeEditMoneyAdd", "closeEditMoneyRemove"].forEach((id) => {
  document.getElementById(id).addEventListener("click", closeEditMoneyModal);
});

document
  .getElementById("add-more-money-btn")
  .addEventListener("click", function () {
    document.getElementById("editMoneyModal").style.display = "flex";
    document.getElementById("editMoneyAdd").style.display = "flex";
    document.getElementById("editMoneyRemove").style.display = "none";
  });

document
  .getElementById("remove-money-btn")
  .addEventListener("click", function () {
    document.getElementById("editMoneyModal").style.display = "flex";
    document.getElementById("editMoneyAdd").style.display = "none";
    document.getElementById("editMoneyRemove").style.display = "flex";
  });

document
  .getElementById("editMoneyBtnAdd")
  .addEventListener("click", function () {
    if (!currentListItem) return;

    const addMoneyInput = document.querySelector("#editMoneyAdd input");
    const amountToAdd = parseFloat(addMoneyInput.value);

    if (isNaN(amountToAdd) || amountToAdd <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }

    // amountToAdd was typed in the currently selected display currency —
    // convert it to USD before combining with the canonical amount.
    const amountSpan = currentListItem.querySelector(".amount-input");
    const currentAmount = parseFloat(amountSpan.value) || 0;
    const newAmount = currentAmount + displayToUsd(amountToAdd);
    const symbol = getSymbol(getSelectedCurrency());

    amountSpan.value = newAmount;
    amountSpan.innerHTML = usdToDisplay(newAmount).toFixed(2);
    bumpAmount(amountSpan);
    saveListToFirebase();
    showToast(
      `Added ${symbol}${amountToAdd.toFixed(2)} to ${currentListItem.querySelector(".name-span").textContent
      }.`
    );
    logUserAction(`Added ${symbol}${amountToAdd.toFixed(2)} to ${currentListItem.querySelector(".name-span").textContent}`);

    closeEditMoneyModal();
  });

document
  .getElementById("editMoneyBtnRemove")
  .addEventListener("click", function () {
    if (!currentListItem) return;

    const removeMoneyInput = document.querySelector("#editMoneyRemove input");
    const amountToRemove = parseFloat(removeMoneyInput.value);

    if (isNaN(amountToRemove) || amountToRemove <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }

    // amountToRemove was typed in the currently selected display currency —
    // convert it to USD before combining with the canonical amount.
    const amountSpan = currentListItem.querySelector(".amount-input");
    const currentAmount = parseFloat(amountSpan.value) || 0;
    const newAmount = Math.max(0, currentAmount - displayToUsd(amountToRemove));
    const symbol = getSymbol(getSelectedCurrency());

    amountSpan.value = newAmount;
    amountSpan.innerHTML = usdToDisplay(newAmount).toFixed(2);
    bumpAmount(amountSpan);
    saveListToFirebase();
    showToast(
      `Removed ${symbol}${amountToRemove.toFixed(2)} from ${currentListItem.querySelector(".name-span").textContent
      }.`
    );
    logUserAction(`Removed ${symbol}${amountToRemove.toFixed(2)} from ${currentListItem.querySelector(".name-span").textContent}`);

    closeEditMoneyModal();
  });

// Pop the amount after +$ / -$ so the change registers. Delayed until the
// money dialog has animated away, otherwise it plays behind the overlay.
function bumpAmount(el) {
  setTimeout(() => {
    el.classList.remove("amount-bump");
    void el.offsetWidth; // restart the animation if it is already applied
    el.classList.add("amount-bump");
    el.addEventListener("animationend", () => el.classList.remove("amount-bump"), { once: true });
  }, 220);
}

function closeEditMoneyModal() {
  document.getElementById("editMoneyModal").style.display = "none";
  document.querySelector("#editMoneyAdd input").value = "";
  document.querySelector("#editMoneyRemove input").value = "";
}

// Event listener for the "Edit Name" button
document.getElementById("edit-name-btn").addEventListener("click", () => {
  if (currentListItem) {
    const nameSpan = currentListItem.querySelector(".name-span");
    editNameInput.value = nameSpan.textContent;
    editNameModal.style.display = "flex";
  }
});

document.getElementById("edit-item-btn").addEventListener("click", () => {
  document.getElementById("editItemModal").style.display = "flex";
});

const closeEditItem = document.getElementById("closeEditItem");

closeEditItem.addEventListener("click", () => {
  console.log("closeEditItem clicked");
  document.getElementById("editItemModal").style.display = "none";
});
// Function to edit a person's name
editNameBtn.addEventListener("click", () => {
  if (currentListItem) {
    const newName = editNameInput.value.trim();
    const nameSpan = currentListItem.querySelector(".name-span");
    const oldName = nameSpan.textContent; // Store the old name for logging

    if (newName !== "" && newName !== oldName) {
      nameSpan.textContent = newName; // Update the name in the UI
      labelRowButtons(currentListItem, newName);
      saveListToFirebase(); // Save the updated name to Firebase
      logUserAction(`Renamed ${oldName} to: ${newName}`);
      showToast("Name updated successfully.");
    } else if (newName === "") {
      showToast("Name cannot be empty.", "error");
    } else {
      showToast("No changes were made.", "info");
    }
  }
  editNameModal.style.display = "none";
});


// Close the modal when clicking the cancel button
closeEditName.addEventListener("click", () => {
  editNameModal.style.display = "none";
});

document.getElementById("editItemBtn").addEventListener("click", function () {
  if (!currentListItem) return;

  const editInput = document.getElementById("editItemInput");
  const newItemName = editInput.value.trim();

  if (newItemName === "") {
    showToast("Please enter a valid item name.", "error");
    return;
  }

  const amountSpan = currentListItem.querySelector(".amount-input");
  const text = amountSpan.textContent.trim(); // ✅ Now it's safe to access

  amountSpan.value = newItemName; // If it's an <input>
  amountSpan.innerHTML = newItemName; // If it's a <span> or <div>

  saveListToFirebase();
  showToast(`Updated item to "${newItemName}".`);

  document.getElementById("editItemModal").style.display = "none";
});

closePrompt.addEventListener("click", () => {
  handleResponse();
});
function handleResponse() {
  const amountSpan = currentListItem.querySelector(".amount-input");
  const text = amountSpan.textContent.trim();
  document.getElementById("customModal").style.display = "none";
  const dollarSpan = currentListItem._dollarSpan;
  const amountContainer = currentListItem._amountContainer;
  if (!isNaN(text) && text !== "") {
    console.log("This is a number:", parseFloat(text));
    if (!amountContainer.contains(dollarSpan)) {
      amountContainer.insertBefore(dollarSpan, amountSpan);
    }
  }
  currentListItem = null;
}

function closeEditExtraInfoModal() {
  document.getElementById("editExtraInfoModal").style.display = "none";
}

const extraInfoModal = document.getElementById("add-extra-info-modal");
const extraInfoInput = document.getElementById("extra-info-input");
const closeExtraInfoBtn = document.getElementById("close-extra-info");
const addextrainfo = document.getElementById("add-extra-info");

addExtraInfoBtn.addEventListener("click", () => {
  if (currentListItem) {
    extraInfoModal.style.display = "flex";
  }
});

addextrainfo.addEventListener("click", () => {
  if (currentListItem) {
    const extraInfo = extraInfoInput.value.trim();
    if (extraInfo) {
      let extraInfoContainer = currentListItem.querySelector(
        ".extra-info-container"
      );
      if (!extraInfoContainer) {
        extraInfoContainer = document.createElement("div");
        extraInfoContainer.classList.add("extra-info-container");
        currentListItem.appendChild(extraInfoContainer);
      }

      createExtraInfoElement(extraInfoContainer, extraInfo, true);
      saveListToFirebase();
      showToast("Extra info added.");
    } else {
      showToast("Information cannot be empty", "error");
    }
    logUserAction(`Added extra info to ${currentListItem.querySelector(".name-span").textContent}`);

    closeExtraInfoModal();
  }
});

closeExtraInfoBtn.addEventListener("click", closeExtraInfoModal);

function closeExtraInfoModal() {
  extraInfoModal.style.display = "none";
  extraInfoInput.value = ""; // Clear input field
}

let extraInfoElement = null; // 🔧 Declare it here

function createExtraInfoElement(container, text, animate = false) {
  const extraInfoElement = document.createElement("div");
  extraInfoElement.classList.add("extra-info-item");
  if (animate) {
    extraInfoElement.classList.add("note-enter");
    extraInfoElement.addEventListener("animationend", () => extraInfoElement.classList.remove("note-enter"), { once: true });
  }

  // Create a span for the text
  const textSpan = document.createElement("span");
  textSpan.classList.add("extra-info-text");
  textSpan.textContent = text;
  extraInfoElement.appendChild(textSpan);

  const editExtraInfoBtn = document.createElement("button");
  editExtraInfoBtn.innerHTML = '<span class="material-icons">edit</span>';
  editExtraInfoBtn.classList.add("remove-info-btn");
  editExtraInfoBtn.id = "edit-info-btn";
  editExtraInfoBtn.setAttribute("aria-label", `Edit note: ${text}`);
  editExtraInfoBtn.title = "Edit note";
  editExtraInfoBtn.querySelector(".material-icons")?.setAttribute("aria-hidden", "true");

  editExtraInfoBtn.addEventListener("click", () => {
    openEditExtraInfoModal(textSpan); // Pass only the textSpan!
  });

  const removeExtraBtn = document.createElement("button");
  removeExtraBtn.textContent = "x";
  removeExtraBtn.classList.add("remove-info-btn");
  removeExtraBtn.setAttribute("aria-label", `Remove note: ${text}`);
  removeExtraBtn.title = "Remove note";

  removeExtraBtn.addEventListener("click", () => {
    // Collapse it first, then remove and save (saving reads the DOM, so the
    // note has to be gone by then).
    extraInfoElement.classList.add("note-leave");
    extraInfoElement.addEventListener("animationend", () => {
      extraInfoElement.remove();
      saveListToFirebase();
    }, { once: true });
    showToast("Extra info removed.");
  });

  extraInfoElement.appendChild(editExtraInfoBtn);
  extraInfoElement.appendChild(removeExtraBtn);
  container.appendChild(extraInfoElement);
}

function openEditExtraInfoModal(element) {
  extraInfoElement = element; // Save the specific element being edited
  editinffoInput.value = element.textContent.trim(); // Pre-fill the textarea
  document.getElementById("editExtraInfoModal").style.display = "flex";

}

editinffoBtn.addEventListener("click", () => {
  if (extraInfoElement) {
    const newText = editinffoInput.value.trim();
    if (newText) {
      extraInfoElement.textContent = newText; // Only change this one
      saveListToFirebase();
      showToast("Extra info updated.");
      closeEditExtraInfoModal();
    } else {
      showToast("Information cannot be empty", "error");
    }
  }
});

document.getElementById("closeEditinffo").addEventListener("click", () => {
  document.getElementById("editExtraInfoModal").style.display = "none";
  extraInfoElement = null; // clear reference after editing});
});

// --- Bottom action dock: Add / Clear behave like Google tabs -----------
// Pressing a tab slides its pane up out of the bar; pressing the other
// while one is open switches panes; pressing the active tab (or Close /
// the backdrop) collapses the sheet.
const actionSheet = document.getElementById("action-sheet");
const actionButtonsBar = document.getElementById("buttons");

// While closed, the sheet sits off-screen but its fields and Close button were
// still in the Tab order; `inert` takes them out (and hides them from screen
// readers) until it opens.
actionSheet.inert = !["add", "clear"].includes(actionSheet.dataset.open);

function openActionPane(pane) {
  actionSheet.dataset.open = pane;
  actionSheet.inert = false;
  actionButtonsBar.classList.toggle("active-add", pane === "add");
  actionButtonsBar.classList.toggle("active-clear", pane === "clear");
  actionButtonsBar.classList.add("sheet-open");
  document.body.classList.add("action-open");
  if (pane === "add") {
    setTimeout(() => document.getElementById("name-input")?.focus(), 260);
  }
}

function closeActionSheet() {
  // Hand focus back to the tab that opened the sheet, rather than letting it
  // fall to <body> when the sheet goes inert.
  if (actionSheet.contains(document.activeElement)) {
    const opener =
      actionSheet.dataset.open === "clear"
        ? document.getElementById("clear-list-btn")
        : addPersonBtn;
    opener?.focus();
  }
  actionSheet.dataset.open = "none";
  actionSheet.inert = true;
  actionButtonsBar.classList.remove("active-add", "active-clear", "sheet-open");
  document.body.classList.remove("action-open");
}

function toggleActionPane(pane) {
  if (actionSheet.dataset.open === pane) closeActionSheet();
  else openActionPane(pane);
}

addPersonBtn.addEventListener("click", () => toggleActionPane("add"));
document
  .getElementById("clear-list-btn")
  .addEventListener("click", () => toggleActionPane("clear"));
document
  .getElementById("action-sheet-close")
  .addEventListener("click", closeActionSheet);
document
  .getElementById("action-backdrop")
  .addEventListener("click", closeActionSheet);

document.getElementById("add").addEventListener("click", () => {
  const nameInput = document.getElementById("name-input");
  const moneyInput = document.getElementById("money-input");
  const itemInput = document.getElementById("item-input");

  const name = nameInput.value.trim();
  const moneyRaw = moneyInput.value.trim();
  const itemRaw = itemInput.value.trim();

  if (!name) {
    showToast("Name cannot be empty", "error");
    return;
  }

  const hasMoney = moneyRaw !== "" && !isNaN(moneyRaw);
  if (moneyRaw !== "" && !hasMoney) {
    showToast("Amount must be a number.", "error");
    return;
  }

  if (!hasMoney && !itemRaw) {
    showToast("Enter an amount, an item, or both.", "error");
    return;
  }

  // Money and item are two separate fields now:
  //  - money only  -> amount shows normally (with the currency sign)
  //  - item only   -> the item text takes the amount slot, as before
  //  - both         -> money shows as the amount, item goes in as an info row
  // moneyRaw was typed in the currently selected display currency —
  // addPerson expects a canonical USD amount, so convert it here.
  const amount = hasMoney ? displayToUsd(parseFloat(moneyRaw)) : itemRaw;
  const extraInfo = hasMoney && itemRaw ? [{ text: itemRaw }] : [];

  addPerson(name, amount, extraInfo, undefined, false, true);
  addAdBox(); // re-park it at the bottom, below the row just added
  saveListToFirebase();

  // Clear inputs and hide modal after adding
  nameInput.value = "";
  moneyInput.value = "";
  itemInput.value = "";
  showToast(`Added a tab for ${name}.`);
  logUserAction(`Added a tab for: ${name}`);

  closeActionSheet();
});

// Load list when page loads
document.addEventListener("DOMContentLoaded", loadListFromFirebase);

const clearListBtn = document.getElementById("clearListBtn");
clearListBtn.addEventListener("click", async () => {
  // Count actual rows — comparing innerHTML to "" broke whenever any stray
  // node (whitespace, leftovers) sat in the container. The ad box isn't a
  // person, so it doesn't count toward "already empty" (and clearing wipes
  // it along with everyone else — addAdBox() below puts it right back).
  const realItems = peopleList.querySelectorAll(
    ".personlist-item:not(.ad-box)"
  ).length;
  if (realItems === 0) {
    showToast("The list is already empty.", "info");
    closeActionSheet();
    return;
  }
  closeActionSheet();

  // Rows leave in a quick stagger rather than all vanishing in one frame;
  // keep them (listeners and all) so Undo can put the whole list back.
  const rows = [...peopleList.querySelectorAll(".personlist-item:not(.ad-box)")];
  rows.forEach((row, i) => {
    row.style.animationDelay = `${Math.min(i, 8) * 35}ms`;
    row.classList.add("item-leave");
  });
  const lastDelay = Math.min(rows.length - 1, 8) * 35;
  await new Promise((resolve) => setTimeout(resolve, lastDelay + 260));
  rows.forEach((row) => {
    row.remove();
    row.classList.remove("item-leave");
    row.style.animationDelay = "";
  });
  addAdBox();
  saveListToFirebase();
  logUserAction("Cleared people list");
  showToast(`Cleared ${rows.length} tab${rows.length === 1 ? "" : "s"}.`, "success", {
    label: "Undo",
    icon: "undo",
    ariaLabel: "Undo clearing the list",
    onClick: () => {
      // Skip if the list was rebuilt meanwhile (e.g. synced from another
      // device): restoring would duplicate rows.
      if (peopleList.querySelector(".personlist-item:not(.ad-box)")) {
        showToast("Couldn't restore the list: it has changed since.", "error");
        return;
      }
      rows.forEach((row, i) => {
        row.style.animationDelay = `${Math.min(i, 8) * 35}ms`;
        row.classList.add("item-enter");
        row.addEventListener("animationend", () => {
          row.classList.remove("item-enter");
          row.style.animationDelay = "";
        }, { once: true });
        peopleList.appendChild(row);
      });
      addAdBox(); // keep the ad at the bottom
      saveListToFirebase();
      logUserAction("Restored cleared list");
      showToast(`Restored ${rows.length} tab${rows.length === 1 ? "" : "s"}.`);
    },
  });
});

async function addFriend() {
  const friendCodeInput = document.getElementById("friend-code");
  const friendCode = friendCodeInput.value.trim();

  if (!currentUser) {
    showToast("You need to be logged in to add friends.", "error");
    return;
  }

  if (!friendCode) {
    showToast("Friend code cannot be empty.", "error");
    return;
  }

  try {
    const friendRef = ref(database, `friendCodes/${friendCode}`);
    const snapshot = await get(friendRef);

    if (!snapshot.exists()) {
      showToast("Friend code not found.", "error");
      return;
    }

    const friendData = snapshot.val();
    const friendUserId = friendData.userId;

    if (friendUserId === currentUser.uid) {
      showToast("You can't add yourself as a friend.", "error");
      return;
    }

    // Check if already friends
    const userFriendsRef = ref(database, `users/${currentUser.uid}/friendsList`);
    const userFriendsSnapshot = await get(userFriendsRef);
    if (userFriendsSnapshot.exists()) {
      let alreadyFriend = false;
      userFriendsSnapshot.forEach((childSnapshot) => {
        if (childSnapshot.val().userId === friendUserId) {
          alreadyFriend = true;
        }
      });
      if (alreadyFriend) {
        showToast("This user is already in your friends list.", "error");
        return;
      }
    }

    // Check if request was already sent
    const sentRequestRef = ref(database, `users/${currentUser.uid}/sentRequests/${friendUserId}`);
    const sentRequestSnap = await get(sentRequestRef);
    if (sentRequestSnap.exists()) {
      showToast("Friend request already sent.", "info");
      return;
    }

    // Check if there's an incoming request from them already
    const pendingRequestRef = ref(database, `users/${currentUser.uid}/pendingRequests/${friendUserId}`);
    const pendingRequestSnap = await get(pendingRequestRef);
    if (pendingRequestSnap.exists()) {
      showToast("This user has already sent you a request. Check Pending.", "info");
      return;
    }

    await sendFriendRequest(friendUserId, friendData);

    friendCodeInput.value = "";
    document.getElementById("addFriendModal").style.display = "none";

  } catch (error) {
    console.error("❌ Error sending friend request:", error);
    showToast(`Error: ${error.message}`, "error");
  }
}

function closeAddFriend() {
  document.getElementById("addFriendModal").style.display = "none";
}


// Bound once (not per-friend-per-render) so it always acts on whichever
// friend was last clicked via friendPendingRemoval, instead of getting
// clobbered by the last friend rendered in populateFriendsList's loop.
// Removes one friendsList entry plus its UID-keyed index entry, so the
// ex-friend can no longer read our phone number. Shared by "Remove friend"
// and Block. Throws on failure.
async function removeFriendship(friendId, friendData) {
  await remove(
    ref(database, `users/${currentUser.uid}/friendsList/${friendId}`)
  );
  // friendData.userId is the friend's UID.
  if (friendData.userId) {
    await remove(
      ref(database, `users/${currentUser.uid}/friendUids/${friendData.userId}`)
    );
  }
}

document.getElementById("removeFriendBtn").addEventListener("click", async () => {
  if (!friendPendingRemoval) return;
  const { friendId, friendData } = friendPendingRemoval;

  try {
    await removeFriendship(friendId, friendData);
  } catch (error) {
    console.error("❌ Error removing friend:", error);
    showToast(`Couldn't remove ${friendData.firstName}. Try again.`, "error");
    populateFriendsList();
    return;
  }
  showToast(
    `${friendData.firstName} has been removed from your friends list.`,
    "info"
  );
  await logUserAction(`Removed friend: ${friendData.firstName} ${friendData.lastName}`);

  friendPendingRemoval = null;
  populateFriendsList(); // Refresh list after removal
  RFModal2.style.display = "none";
});

async function populateFriendsList() {
  const friendsListUl = document.getElementById("friendsList");
  if (!friendsListUl) return; // Exit if the <ul> element doesn't exist

  // Clear the current list
  friendsListUl.innerHTML = "";

  // Guests / not-yet-signed-in: say so instead of throwing on a null uid and
  // rendering "Error loading friends list."
  if (!currentUser) {
    friendsListUl.innerHTML = "<li>Log in to add friends.</li>";
    return;
  }

  try {
    // Fetch the user's friends list from Firebase
    const friendsListRef = ref(
      database,
      `users/${currentUser.uid}/friendsList`
    );
    const friendsListSnapshot = await get(friendsListRef);

    if (friendsListSnapshot.exists()) {
      friendsListSnapshot.forEach((childSnapshot) => {
        const friendData = childSnapshot.val();
        const friendId = childSnapshot.key;

        // Create a new <li> element for each friend
        const friendItem = document.createElement("li");
        friendItem.classList.add("friend-item");

        // Name lives in its own span so the row can be a flex layout (buttons
        // on the left, name filling the rest) instead of the name being a bare
        // text node that long names overflow onto the buttons.
        const friendName = document.createElement("span");
        friendName.classList.add("friend-name");
        friendName.textContent = `${friendData.firstName} ${friendData.lastName}`;


        // Create a remove button (✖️)
        let removeButton = document.createElement("button");
        removeButton.textContent = "X";
        removeButton.classList.add("remove-friend-from-list");
        removeButton.setAttribute("aria-label", `Remove ${friendData.firstName} ${friendData.lastName} from friends`);
        removeButton.title = "Remove friend";
        removeButton.id = "RemoveButton";

        removeButton.onclick = () => {
          // Remember which friend this click was for, so the shared confirm
          // button (bound once, below) removes the right one instead of
          // whichever friend happened to render last.
          friendPendingRemoval = { friendId, friendData };

          const removeFriendPrompt = document.getElementById("removeFriendPrompt");
          if (removeFriendPrompt) {
            const friendName = `${friendData.firstName || ""} ${friendData.lastName || ""}`.trim();
            removeFriendPrompt.textContent = friendName
              ? `Are you sure you want to remove ${friendName}? They will be upset.`
              : "Remove this friend?";
          }

          const RFModal2 = document.getElementById("RFModal");
          if (RFModal2) {
            RFModal2.style.display = "flex";
          } else {
            console.error("RFModal2 not found in DOM!");
          }
        };

        const friendAddButton = document.createElement("button");
        friendAddButton.classList.add("add-friend-to-list");
        // Labeled + icon'd (rather than a bare "➕") so it reads clearly as
        // "add this friend to my tab list" and can't be mistaken for an
        // accept-request button.
        friendAddButton.innerHTML =
          '<span class="material-icons" aria-hidden="true">playlist_add</span>';
        friendAddButton.setAttribute("aria-label", `Add ${friendData.firstName} ${friendData.lastName} to your tabs list`);
        friendAddButton.title = "Add this friend to your tab list";
        friendAddButton.onclick = () => {
          addPerson(
            `${friendData.firstName} ${friendData.lastName}`,
            0,
            [],
            undefined,
            true, // Add friend  person list, flagged so the row shows the friend icon
            true // animate in
          );
          showToast(
            `${friendData.firstName} has been added to your tabs list.`,
            "success"
          );
          addAdBox(); // re-park it at the bottom, below the row just added
          windowClosed();
          saveListToFirebase();
          document.getElementById("addFriendModal").style.display = "none";
        };
        // "⋯" → Block / Report (App Store Review Guideline 1.2).
        const moreButton = document.createElement("button");
        moreButton.type = "button";
        moreButton.classList.add("safety-more-btn");
        moreButton.innerHTML =
          '<span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>';
        moreButton.setAttribute(
          "aria-label",
          `Block or report ${friendData.firstName || ""} ${friendData.lastName || ""}`.trim()
        );
        moreButton.title = "Block or report";
        moreButton.onclick = () =>
          openUserActions({
            uid: friendData.userId,
            firstName: friendData.firstName,
            lastName: friendData.lastName,
          });

        // Group the action buttons together. The name (added first, and
        // free to grow/wrap) fills the row so the buttons are pushed to the
        // right edge and can never overlap the name.
        const friendActions = document.createElement("div");
        friendActions.classList.add("friend-actions");
        friendActions.appendChild(friendAddButton);
        if (friendData.userId) friendActions.appendChild(moreButton);
        friendActions.appendChild(removeButton);

        friendItem.appendChild(friendName);
        friendItem.appendChild(friendActions);
        friendsListUl.appendChild(friendItem);
      });
    } else {
      friendsListUl.innerHTML = "<li>You have no friends added.</li>";
    }
  } catch (error) {
    console.error("❌ Error fetching friends list:", error);
    friendsListUl.innerHTML = "<li>Error loading friends list.</li>";
    showToast("Couldn't load your friends list. Check your connection.", "error");
  }
}
document.getElementById('closeRemovefriend').addEventListener('click', () => {
  const RFModal = document.getElementById('RFModal');
  RFModal.style.display = "none";
});

// (No window.onload populate here — auth hasn't resolved at load time, so it
// only ever rendered an error; onAuthStateChanged populates the list once the
// user is actually signed in.)
document.getElementById("pendingRequestsBtn").addEventListener("click", () => {
  document.getElementById("pendingRequestsModal").style.display = "flex";
  loadFriendRequests();
});

document
  .getElementById("closePendingRequests")
  .addEventListener("click", () => {
    document.getElementById("pendingRequestsModal").style.display = "none";
  });

export async function sendFriendRequest(friendUserId, friendData) {
  const db = getDatabase();

  const currentUserId = currentUser.uid;

  // Add a request to the friend's pending requests
  const theirPendingRef = ref(db, `users/${friendUserId}/pendingRequests/${currentUserId}`);
  const myProfileSnap = await get(ref(db, `users/${currentUserId}/profile`));
  const myProfile = myProfileSnap.val();

  // NOTE: the sender's phone number is intentionally NOT carried on the
  // request — that used to hand your number to anyone you merely *sent* a
  // request to, before they accepted. After acceptance, reminders resolve the
  // phone via the friend-scoped profile read rule (friendUids) instead.
  //
  // If the recipient has blocked us, the rules deny this write. Finish exactly
  // like a normal send (sentRequests entry + "sent" toast) so the block isn't
  // revealed — the request just never arrives. Any other error goes to the
  // caller's handler as before.
  let deliveredRequest = true;
  try {
    await set(theirPendingRef, {
      fromUserId: currentUserId,
      firstName: myProfile.firstName,
      lastName: myProfile.lastName,
      friendCode: myProfile.friendCode,
    });
  } catch (err) {
    // RTDB JS reports rule denials with code "PERMISSION_DENIED".
    if (err?.code !== "PERMISSION_DENIED") throw err;
    deliveredRequest = false;
  }

  // Add a request to the current user's sent requests
  const mySentRef = ref(db, `users/${currentUserId}/sentRequests/${friendUserId}`);
  await set(mySentRef, {
    toUserId: friendUserId,
    firstName: friendData.firstName,
    lastName: friendData.lastName,
  });

  showToast("Friend request sent!", "success");
  logUserAction(`Sent friend request to ${friendData.firstName} ${friendData.lastName}`);
  // The sendFriendEventPush function writes the recipient's in-app
  // notification (cross-user notifications are server-written only) and
  // pushes it to their device(s), so they see it even with the app closed.
  // Skipped when the request was silently dropped by a block (above).
  if (deliveredRequest) pushFriendEvent(friendUserId, "request");
  updatePendingCount();
}


async function loadFriendRequests() {
  const list = document.getElementById("pendingRequestsList");
  list.innerHTML = "";

  // Turn any acceptance markers into real friendships before rendering, so
  // they never show up as bogus "incoming requests".
  await reconcileAcceptedRequests();

  const incomingRef = ref(database, `users/${currentUser.uid}/pendingRequests`);
  const outgoingRef = ref(database, `users/${currentUser.uid}/sentRequests`);

  const [incomingSnap, outgoingSnap] = await Promise.all([
    get(incomingRef),
    get(outgoingRef),
  ]);

  // Incoming Requests
  let shownIncoming = 0;
  if (incomingSnap.exists()) {
    const incoming = incomingSnap.val();
    Object.entries(incoming).forEach(([id, req]) => {
      if (req.type === "accepted") return; // handled by reconcile above
      if (isBlocked(id)) return; // hidden client-side; rules stop new ones
      shownIncoming++;
      const li = document.createElement("li");
      li.textContent = `${req.firstName} ${req.lastName} sent you a friend request`;

      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.classList.add("safety-more-btn");
      moreBtn.innerHTML =
        '<span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>';
      moreBtn.setAttribute("aria-label", `Block or report ${req.firstName || ""} ${req.lastName || ""}`.trim());
      moreBtn.title = "Block or report";
      moreBtn.onclick = () =>
        openUserActions({ uid: id, firstName: req.firstName, lastName: req.lastName });

      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "✔️";
      acceptBtn.setAttribute("aria-label", `Accept ${req.firstName}'s friend request`);
      acceptBtn.title = "Accept";
      acceptBtn.onclick = () => approveFriendRequest(id, req);

      const rejectBtn = document.createElement("button");
      rejectBtn.textContent = "❌";
      rejectBtn.setAttribute("aria-label", `Reject ${req.firstName}'s friend request`);
      rejectBtn.title = "Reject";
      rejectBtn.onclick = async () => {
        try {
          await Promise.all([
            remove(ref(database, `users/${currentUser.uid}/pendingRequests/${id}`)),
            // Also clear it from the sender's sentRequests, otherwise they'd
            // see "request sent" forever with no way to know it was rejected.
            // (Allowed by the recipient-may-delete rule on sentRequests.)
            remove(ref(database, `users/${id}/sentRequests/${currentUser.uid}`)),
          ]);
          showToast("Request rejected.", "info");
        } catch (error) {
          console.error("❌ Error rejecting request:", error);
          showToast("Could not fully reject the request.", "error");
        } finally {
          // Refresh even on partial failure so the UI reflects whatever state
          // the database actually reached.
          loadFriendRequests();
          updatePendingCount();
        }
      };

      li.appendChild(acceptBtn);
      li.appendChild(rejectBtn);
      li.appendChild(moreBtn);
      list.appendChild(li);
    });
  }

  // Outgoing Requests
  if (outgoingSnap.exists()) {
    const outgoing = outgoingSnap.val();
    Object.entries(outgoing).forEach(([id, req]) => {
      const li = document.createElement("li");
      li.textContent = `You sent a request to ${req.firstName} ${req.lastName}`;

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "❌";
      cancelBtn.setAttribute("aria-label", `Cancel the request to ${req.firstName}`);
      cancelBtn.title = "Cancel request";
      cancelBtn.onclick = async () => {
        try {
          await Promise.all([
            remove(ref(database, `users/${currentUser.uid}/sentRequests/${id}`)),
            // Also clear it from the recipient's pendingRequests, otherwise
            // they'd keep seeing a request that was already canceled.
            remove(ref(database, `users/${id}/pendingRequests/${currentUser.uid}`)),
          ]);
          showToast("Request canceled.", "info");
        } catch (error) {
          console.error("❌ Error canceling request:", error);
          showToast("Could not fully cancel the request.", "error");
        } finally {
          loadFriendRequests();
          updatePendingCount();
        }
      };

      li.appendChild(cancelBtn);
      list.appendChild(li);
    });
  }

  if (shownIncoming === 0 && !outgoingSnap.exists()) {
    list.innerHTML = "<li>No pending requests.</li>";
  }
}

async function approveFriendRequest(requestId, request) {
  try {
    // Do everything under our own uid first — these writes are always
    // permitted. The cross-user mirroring below is best-effort: database
    // rules may deny writing into the other user's friendsList, and that
    // used to abort this whole function AFTER the friend was already added
    // to our list, surfacing a permissions error for an accept that had
    // effectively succeeded.
    const userFriendRef = ref(database, `users/${currentUser.uid}/friendsList`);
    await set(push(userFriendRef), {
      userId: request.fromUserId,
      firstName: request.firstName,
      lastName: request.lastName,
      friendCode: request.friendCode ?? null,
      // Their number, carried in on the request — stored here so reminders
      // read it from our own subtree (no cross-user profile read).
      phoneNumber: request.phoneNumber ?? null,
    });

    // UID-keyed index (own node) so the phone-read rule can verify this
    // friendship without scanning the push-keyed friendsList.
    await set(
      ref(database, `users/${currentUser.uid}/friendUids/${request.fromUserId}`),
      true
    );

    // Remove pending request
    await remove(
      ref(database, `users/${currentUser.uid}/pendingRequests/${requestId}`)
    );

    const profileSnapshot = await get(
      ref(database, `users/${currentUser.uid}/profile`)
    );
    const currentProfile = profileSnapshot.val();
    const myInfo = {
      userId: currentUser.uid,
      firstName: currentProfile.firstName,
      lastName: currentProfile.lastName,
      friendCode: currentProfile.friendCode ?? null,
      // Our number goes to the sender's friendsList entry for us (directly or
      // via the acceptance marker) so their reminders can read it locally.
      phoneNumber: currentProfile.phoneNumber ?? null,
    };

    // Mirror the friendship onto the sender's side. Security rules
    // (correctly) don't let us write into another user's friendsList or
    // sentRequests, so instead of attempting those doomed writes we leave an
    // acceptance marker in the sender's pendingRequests — a path we ARE
    // allowed to write, since that's how their request reached us. Their
    // client turns the marker into a real friendship (and clears their own
    // sentRequest) via reconcileAcceptedRequests() — live if they're online.
    //
    // Order matters: push FIRST and wait for it. The callable verifies our
    // friendUids entry (written above) AND the sender's sentRequests entry for
    // us; once the marker lands, the sender's live reconcile deletes that
    // sentRequest, which would make the server check fail. pushFriendEvent
    // never throws, so a failed push can't block the marker write. The
    // sender's own client writes their "accepted" inbox entry when it
    // reconciles (no server inbox copy for accepts).
    await pushFriendEvent(request.fromUserId, "accept");

    try {
      await set(
        ref(database, `users/${request.fromUserId}/pendingRequests/${currentUser.uid}`),
        { ...myInfo, fromUserId: currentUser.uid, type: "accepted" }
      );
    } catch (markerError) {
      console.error("❌ Could not leave acceptance marker:", markerError);
    }

    showToast(
      `${request.firstName} has been added to your friends list!`,
      "success"
    );
    await logUserAction(`Accepted friend request from ${request.firstName} ${request.lastName}`);
    populateFriendsList();
    loadFriendRequests();
    updatePendingCount();
  } catch (error) {
    console.error("❌ Error approving friend:", error);
    showToast(`Error approving friend: ${error.message}`, "error");
  }
}

// Completes friendships that were accepted while this user was offline (or
// where rules blocked the acceptor from writing into this user's
// friendsList): the acceptor leaves a {type: "accepted"} marker in our
// pendingRequests, and this turns it into a real friendsList entry.
//
// A marker is only honored if we actually sent that person a request
// (users/{me}/sentRequests/{markerId} exists — only we can create that) and
// it's keyed by the uid it claims to be from; anything else is a forged
// "friendship" and is deleted without befriending anyone.
//
// Runs from sign-in, the Pending modal and the live pendingRequests listener,
// so overlapping calls are coalesced: a call made while one is in flight
// waits for it and schedules one more pass to pick up anything new.
let reconcileInFlight = null;
let reconcileAgain = false;
async function reconcileAcceptedRequests() {
  if (reconcileInFlight) {
    reconcileAgain = true;
    return reconcileInFlight;
  }
  reconcileInFlight = (async () => {
    do {
      reconcileAgain = false;
      await reconcileAcceptedRequestsOnce();
    } while (reconcileAgain && currentUser);
  })();
  try {
    await reconcileInFlight;
  } finally {
    reconcileInFlight = null;
  }
}

async function reconcileAcceptedRequestsOnce() {
  if (!currentUser) return;

  try {
    const pendingSnap = await get(
      ref(database, `users/${currentUser.uid}/pendingRequests`)
    );
    if (!pendingSnap.exists()) return;

    const accepted = Object.entries(pendingSnap.val()).filter(
      ([, req]) => req.type === "accepted"
    );
    if (accepted.length === 0) return;

    const friendsSnap = await get(
      ref(database, `users/${currentUser.uid}/friendsList`)
    );
    const existingFriendIds = new Set();
    if (friendsSnap.exists()) {
      friendsSnap.forEach((child) => {
        existingFriendIds.add(child.val().userId);
      });
    }

    for (const [markerId, req] of accepted) {
      if (isBlocked(req.fromUserId) || isBlocked(markerId)) {
        // Someone we blocked — drop the marker instead of befriending them.
        await remove(
          ref(database, `users/${currentUser.uid}/pendingRequests/${markerId}`)
        );
        continue;
      }
      const sentSnap = await get(
        ref(database, `users/${currentUser.uid}/sentRequests/${markerId}`)
      );
      if (!sentSnap.exists() || markerId !== req.fromUserId) {
        // We never asked this person (or the marker lies about who it's
        // from) — not a real acceptance. Drop it.
        await remove(
          ref(database, `users/${currentUser.uid}/pendingRequests/${markerId}`)
        );
        continue;
      }
      if (!existingFriendIds.has(req.fromUserId)) {
        await set(push(ref(database, `users/${currentUser.uid}/friendsList`)), {
          userId: req.fromUserId,
          firstName: req.firstName,
          lastName: req.lastName,
          friendCode: req.friendCode ?? null,
          phoneNumber: req.phoneNumber ?? null, // carried in via the marker
        });
      }
      // Keep the UID-keyed index in step (see syncFriendUids / phone rule).
      await set(
        ref(database, `users/${currentUser.uid}/friendUids/${req.fromUserId}`),
        true
      );
      // Only now that the friendship is written: clearing the sentRequest
      // first would make a retry (after a failed write) drop the marker as
      // unverifiable.
      await remove(
        ref(database, `users/${currentUser.uid}/sentRequests/${req.fromUserId}`)
      );
      await remove(
        ref(database, `users/${currentUser.uid}/pendingRequests/${markerId}`)
      );
      addNotification(currentUser.uid, {
        type: "friend-accept",
        message: `${req.firstName} ${req.lastName} accepted your friend request!`,
      });
    }
  } catch (error) {
    console.error("❌ Error reconciling accepted requests:", error);
  }
}

// Attach the addFriend function to the "Add Friend" link
document
  .getElementById("addFriendBtn")
  .addEventListener("click", function (event) {
    event.preventDefault(); // Prevent the default behavior of the <a> tag
    document.getElementById("addFriendModal").style.display = "flex";
  });
document.getElementById("addFriendBtn2").addEventListener("click", () => {
  addFriend();
});

// "Invite to TABS" — opens the device's default messaging app with a
// prefilled invite that includes the user's friend code and step-by-step
// instructions for adding them as a friend. Falls back gracefully on
// desktops where SMS deep links / the Web Share API aren't available.
async function inviteToTabs() {
  if (!currentUser) {
    showToast("Please log in first.", "error");
    return;
  }

  // Prefer the globally cached code; fall back to a fresh profile read in
  // case the invite is triggered before the profile finished loading.
  let friendCode = window.userFriendCode;
  if (!friendCode) {
    try {
      const snap = await get(ref(database, `users/${currentUser.uid}/profile`));
      friendCode = snap.exists() ? snap.val().friendCode : null;
      if (friendCode) window.userFriendCode = friendCode;
    } catch (error) {
      console.error("Couldn't read friend code for invite:", error);
    }
  }

  if (!friendCode) {
    showToast("Couldn't find your friend code. Try again in a moment.", "error");
    return;
  }

  const appUrl = window.location.origin + window.location.pathname;
  const message =
    `Join me on TABS! 💸\n\n` +
    `TABS is an app that keeps track of who owes who between friends.\n\n` +
    `My friend code is: ${friendCode}\n\n` +
    `To add me as a friend:\n` +
    `1. Sign up or log in at ${appUrl}\n` +
    `2. Open the Friends tab\n` +
    `3. Tap "Add" and enter my friend code: ${friendCode}\n\n` +
    `See you on TABS!`;

  // The Web Share API opens the native share sheet (Messages, WhatsApp, etc.)
  // with the text prefilled — the nicest experience on modern mobile.
  if (navigator.share) {
    try {
      await navigator.share({ title: "Join me on TABS", text: message });
      return;
    } catch (error) {
      // AbortError just means the user dismissed the share sheet — don't fall
      // through to the SMS link in that case.
      if (error && error.name === "AbortError") return;
    }
  }

  // Fall back to an SMS deep link, which opens the default messaging app with
  // the body prefilled. iOS and Android disagree on the separator before
  // "body", so pick based on the platform.
  const isIOS =
    /iP(hone|od|ad)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const smsUrl = `sms:${isIOS ? "&" : "?"}body=${encodeURIComponent(message)}`;
  window.location.href = smsUrl;
}

document.getElementById("inviteToTabsBtn").addEventListener("click", inviteToTabs);

closeAddFriend();

const closeWindow = document.getElementsByClassName("close-btn");
closeWindow[0].onclick = function () {
  console.log("closed");

  // Hide Login and Signup pages
  const loginPage = document.getElementById("Loginpage");
  const signupPage = document.getElementById("signupPage");
  const friendBox = document.getElementById("friendModal");

  if (loginPage) loginPage.style.display = "none";
  if (signupPage) signupPage.style.display = "none";
  setListControlsVisible(true);
  if (friendBox) friendBox.style.display = "none";
  // Load the add window
  loadAddWindow();
};
function windowClosed() {
  console.log("closed");

  // Hide Login and Signup pages
  const loginPage = document.getElementById("Loginpage");
  const signupPage = document.getElementById("signupPage");
  const friendBox = document.getElementById("friendModal");

  if (loginPage) loginPage.style.display = "none";
  if (signupPage) signupPage.style.display = "none";
  setListControlsVisible(true);
  if (friendBox) friendBox.style.display = "none";
}

function loadAddWindow() {
  // Show Person List (helper lives in script.js and also fixes the old
  // getElementById("personlist") lookup — .personlist is a class, not an id)
  setPersonListVisible(true);
}

var slider = document.getElementById("interestRange");
var output = document.getElementById("rate");
output.innerHTML = slider.value + "%";

slider.oninput = function () {
  output.innerHTML = this.value + "%";
};

// ---------------------------------------------------------------------------
// Notification system
//
// Notifications live at users/{uid}/notifications, which database rules make
// owner-only. They're written either by the user's own client (own reminder
// notes, reconciled accepts) or by Cloud Functions (friend requests and
// reminders from friends — server templates that include only the sender's
// own display name). No client can write into another user's inbox. A
// realtime listener keeps the bell badge and the notifications modal in sync
// and toasts anything that arrives while the app is open. Types the user muted
// in Manage Notifications are still stored but hidden here (and not toasted).
// ---------------------------------------------------------------------------

let latestNotifications = {};
let knownNotificationKeys = null;
let notificationPrefs = { enabled: true, friends: true, reminders: true };

function notificationAllowed(type) {
  if (!notificationPrefs.enabled) return false;
  if ((type === "friend-request" || type === "friend-accept") && !notificationPrefs.friends) return false;
  // "Payment reminders" covers both your own auto-reminder notes and
  // reminders friends send you.
  if ((type === "sms-reminder" || type === "reminder-received") && !notificationPrefs.reminders) return false;
  return true;
}

// Writes into the CURRENT user's own inbox (rules deny cross-user writes).
// Best-effort: a missed notification should never break the action that
// triggered it.
async function addNotification(targetUid, notification) {
  try {
    await push(ref(database, `users/${targetUid}/notifications`), {
      fromUid: currentUser ? currentUser.uid : null,
      ...notification,
      read: false,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.warn("⚠️ Could not deliver notification:", error);
  }
}

function subscribeToNotifications() {
  if (!currentUser) return;
  if (notificationsUnsub) notificationsUnsub();
  knownNotificationKeys = null;

  const notifRef = ref(database, `users/${currentUser.uid}/notifications`);
  notificationsUnsub = onValue(notifRef, (snapshot) => {
    latestNotifications = snapshot.exists() ? snapshot.val() : {};
    renderNotifications();

    // Toast only notifications that arrived after the initial snapshot.
    if (knownNotificationKeys) {
      Object.entries(latestNotifications).forEach(([key, notif]) => {
        if (
          !knownNotificationKeys.has(key) &&
          !notif.read &&
          notificationAllowed(notif.type) &&
          !isBlocked(notificationSenderUid(notif))
        ) {
          showToast(notif.message, "success");
          // (Live accepts are handled by the pendingRequests listener set up
          // in onAuthStateChanged — the "friend-accept" entry is written by
          // our own reconcile, so it arrives after the friendship exists.)
        }
      });
    }
    knownNotificationKeys = new Set(Object.keys(latestNotifications));
  });
}

function renderNotifications() {
  const list = document.getElementById("notificationsList");
  const badge = document.getElementById("notificationBadge");
  const folderBadge = document.getElementById("folderNotificationBadge");
  list.innerHTML = "";

  // Anything from a blocked person is hidden client-side (the server also
  // stops delivering new ones once the block exists), as is any type the user
  // muted in Manage Notifications — the server still stores the inbox copy,
  // so un-muting brings it back. Applies to the list and the unread badges.
  const entries = Object.entries(latestNotifications)
    .filter(
      ([, notif]) =>
        notif &&
        notificationAllowed(notif.type) &&
        !isBlocked(notificationSenderUid(notif))
    )
    .sort(([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0));

  // Drive both the badge on the Notifications menu item and the count that
  // sits on the folder button itself (so an unread count is visible without
  // opening the menu).
  const unreadCount = entries.filter(([, notif]) => !notif.read).length;
  const badgeText = unreadCount > 9 ? "9+" : String(unreadCount);
  const badgeDisplay = unreadCount > 0 ? "inline-flex" : "none";
  badge.textContent = badgeText;
  badge.style.display = badgeDisplay;
  if (folderBadge) {
    folderBadge.textContent = badgeText;
    folderBadge.style.display = badgeDisplay;
  }

  if (entries.length === 0) {
    list.innerHTML = "<li>No notifications yet.</li>";
    return;
  }

  entries.forEach(([key, notif]) => {
    const li = document.createElement("li");
    if (!notif.read) li.classList.add("unread");

    const messageSpan = document.createElement("span");
    messageSpan.classList.add("notification-message");
    messageSpan.textContent = notif.message;

    const timeSpan = document.createElement("span");
    timeSpan.classList.add("notification-time");
    timeSpan.textContent = notif.timestamp
      ? new Date(notif.timestamp).toLocaleString()
      : "";
    messageSpan.appendChild(timeSpan);
    li.appendChild(messageSpan);

    // Payment reminders get a shortcut to push the friend a reminder right
    // away — a real notification on their device via FCM, no SMS app.
    if (notif.type === "sms-reminder") {
      const textBtn = document.createElement("button");
      textBtn.classList.add("notification-action");
      textBtn.textContent = "Remind now";
      textBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        textBtn.disabled = true;
        try {
          // Built fresh at tap time (current amount, server-validated
          // template) — the old stored smsBody was free text and is ignored.
          const reminder = await reminderForFriendUid(notif.friendUid);
          if (!reminder) {
            showToast("They're no longer in your friends list.", "error");
            return;
          }
          const { delivered, reason } = await deliverReminder(notif.friendUid, reminder);
          if (delivered) {
            showToast("Reminder sent.", "success");
          } else if (reason === "no-devices") {
            showToast("Reminded in-app (they have no device notifications on).", "success");
          }
        } finally {
          textBtn.disabled = false;
        }
      });
      li.appendChild(textBtn);
    }

    // Friend requests get Accept / Decline buttons so the request can be
    // handled right from the notification, without opening Friends → Pending.
    // Hidden once resolved (notif.accepted / notif.declined) so they don't
    // linger.
    if (notif.type === "friend-request" && !notif.accepted && !notif.declined) {
      const acceptBtn = document.createElement("button");
      acceptBtn.classList.add("notification-action", "accept");
      acceptBtn.textContent = "Accept";

      const declineBtn = document.createElement("button");
      declineBtn.classList.add("notification-action", "decline");
      declineBtn.textContent = "Decline";

      acceptBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        acceptBtn.disabled = true;
        declineBtn.disabled = true;
        const ok = await acceptFriendRequestFromNotification(key, notif);
        // On failure, re-enable so the user can retry (on success the list
        // re-renders without these buttons anyway).
        if (!ok) {
          acceptBtn.disabled = false;
          declineBtn.disabled = false;
        }
      });
      declineBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        acceptBtn.disabled = true;
        declineBtn.disabled = true;
        const ok = await declineFriendRequestFromNotification(key, notif);
        if (!ok) {
          acceptBtn.disabled = false;
          declineBtn.disabled = false;
        }
      });

      li.appendChild(acceptBtn);
      li.appendChild(declineBtn);
    }

    // Any notification another person triggered can be blocked or reported
    // right from the notification (App Store Review Guideline 1.2). Those are
    // written server-side with the sender's fromUid, so this keys off the
    // sender, not the type. notificationSenderUid() is null for our own
    // (self-written) notifications.
    const senderUid = notificationSenderUid(notif);
    if (senderUid) {
      const safetyBtn = document.createElement("button");
      safetyBtn.type = "button";
      safetyBtn.classList.add("notification-action", "safety-notif-btn");
      safetyBtn.textContent = "Block / Report";
      safetyBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const person = await resolvePersonName(senderUid);
        openUserActions({ uid: senderUid, ...person });
      });
      li.appendChild(safetyBtn);
    }

    li.addEventListener("click", () => {
      if (!notif.read) {
        update(ref(database, `users/${currentUser.uid}/notifications/${key}`), {
          read: true,
        });
      }
    });

    list.appendChild(li);
  });
}

// Accept a friend request straight from its notification. Resolves the still-
// pending request (by the sender uid the notification carries, or — for older
// notifications that predate that field — by matching the sender's name in the
// message), reuses the normal approveFriendRequest flow, then marks the
// notification accepted so its button disappears.
async function acceptFriendRequestFromNotification(notifKey, notif) {
  if (!currentUser) return;
  try {
    const pendingSnap = await get(
      ref(database, `users/${currentUser.uid}/pendingRequests`)
    );
    const pending = pendingSnap.exists() ? pendingSnap.val() : {};

    let senderUid = null;
    if (
      notif.fromUserId &&
      pending[notif.fromUserId] &&
      pending[notif.fromUserId].type !== "accepted"
    ) {
      senderUid = notif.fromUserId;
    } else {
      const match = Object.entries(pending).find(
        ([, r]) =>
          r.type !== "accepted" &&
          notif.message &&
          notif.message.includes(`${r.firstName} ${r.lastName}`)
      );
      if (match) senderUid = match[0];
    }

    const request = senderUid ? pending[senderUid] : null;
    if (!request) {
      // Already accepted/rejected elsewhere, or withdrawn — nothing to do but
      // tidy up the notification so its button goes away.
      showToast("This friend request is no longer pending.", "info");
      await update(
        ref(database, `users/${currentUser.uid}/notifications/${notifKey}`),
        { read: true, accepted: true }
      );
      return true;
    }

    // requestId is the pendingRequests key = the sender's uid, matching how
    // the Pending list calls approveFriendRequest.
    await approveFriendRequest(senderUid, request);

    await update(
      ref(database, `users/${currentUser.uid}/notifications/${notifKey}`),
      {
        read: true,
        accepted: true,
        message: `You are now friends with ${request.firstName} ${request.lastName}`,
      }
    );
    return true;
  } catch (error) {
    console.error("❌ Error accepting request from notification:", error);
    showToast("Could not accept the request.", "error");
    return false;
  }
}

// Decline a friend request straight from its notification. Resolves the still-
// pending request the same way as accept, removes it from both sides (our
// pendingRequests and the sender's sentRequests, mirroring the Pending list's
// reject), then marks the notification declined so its buttons disappear.
async function declineFriendRequestFromNotification(notifKey, notif) {
  if (!currentUser) return false;
  try {
    const pendingSnap = await get(
      ref(database, `users/${currentUser.uid}/pendingRequests`)
    );
    const pending = pendingSnap.exists() ? pendingSnap.val() : {};

    let senderUid = null;
    if (
      notif.fromUserId &&
      pending[notif.fromUserId] &&
      pending[notif.fromUserId].type !== "accepted"
    ) {
      senderUid = notif.fromUserId;
    } else {
      const match = Object.entries(pending).find(
        ([, r]) =>
          r.type !== "accepted" &&
          notif.message &&
          notif.message.includes(`${r.firstName} ${r.lastName}`)
      );
      if (match) senderUid = match[0];
    }

    const request = senderUid ? pending[senderUid] : null;
    if (!request) {
      showToast("This friend request is no longer pending.", "info");
      await update(
        ref(database, `users/${currentUser.uid}/notifications/${notifKey}`),
        { read: true, declined: true }
      );
      return true;
    }

    await Promise.all([
      remove(
        ref(database, `users/${currentUser.uid}/pendingRequests/${senderUid}`)
      ),
      // Also clear it from the sender's sentRequests, otherwise they'd see
      // "request sent" forever with no way to know it was declined.
      remove(ref(database, `users/${senderUid}/sentRequests/${currentUser.uid}`)),
    ]);

    await update(
      ref(database, `users/${currentUser.uid}/notifications/${notifKey}`),
      {
        read: true,
        declined: true,
        message: `You declined ${request.firstName} ${request.lastName}'s friend request`,
      }
    );

    showToast("Request declined.", "info");
    // Keep the Pending list / counts in step if they're open.
    loadFriendRequests();
    updatePendingCount();
    return true;
  } catch (error) {
    console.error("❌ Error declining request from notification:", error);
    showToast("Could not decline the request.", "error");
    return false;
  }
}

document.getElementById("notificationsBtn").addEventListener("click", () => {
  document.getElementById("notificationsModal").style.display = "flex";
  closeNav(); // the trigger now lives inside the folder side-nav
});
document.getElementById("closeNotifications").addEventListener("click", () => {
  document.getElementById("notificationsModal").style.display = "none";
});
document.getElementById("markAllReadBtn").addEventListener("click", () => {
  if (!currentUser) return;
  const updates = {};
  Object.entries(latestNotifications).forEach(([key, notif]) => {
    if (!notif.read) updates[`${key}/read`] = true;
  });
  if (Object.keys(updates).length === 0) {
    showToast("You're all caught up — nothing unread.", "info");
    return;
  }
  update(ref(database, `users/${currentUser.uid}/notifications`), updates)
    .then(() => showToast("All notifications marked as read."))
    .catch(() => showToast("Couldn't mark notifications as read.", "error"));
});
document.getElementById("clearNotificationsBtn").addEventListener("click", async () => {
  if (!currentUser) return;
  if (Object.keys(latestNotifications).length === 0) {
    showToast("No notifications to clear.", "info");
    return;
  }
  try {
    await remove(ref(database, `users/${currentUser.uid}/notifications`));
    showToast("Notifications cleared.", "success");
  } catch (error) {
    showToast("Couldn't clear notifications.", "error");
  }
});

// --- Notification settings (the Profile "Manage Notifications" button) ---

async function loadNotificationPrefs() {
  if (!currentUser) return;
  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/settings/notifications`)
    );
    if (snapshot.exists()) {
      notificationPrefs = { ...notificationPrefs, ...snapshot.val() };
    }
  } catch (error) {
    console.error("❌ Error loading notification settings:", error);
  }
  document.getElementById("notifEnabledToggle").checked = notificationPrefs.enabled;
  document.getElementById("notifFriendsToggle").checked = notificationPrefs.friends;
  document.getElementById("notifRemindersToggle").checked = notificationPrefs.reminders;
  // Muted types are hidden from the inbox, so re-filter now that the real
  // prefs are in (the listener may have rendered with the defaults).
  renderNotifications();
}

async function saveNotificationPrefs() {
  notificationPrefs = {
    enabled: document.getElementById("notifEnabledToggle").checked,
    friends: document.getElementById("notifFriendsToggle").checked,
    reminders: document.getElementById("notifRemindersToggle").checked,
  };
  if (!currentUser) return;
  renderNotifications(); // show/hide muted types right away
  try {
    await set(
      ref(database, `users/${currentUser.uid}/settings/notifications`),
      notificationPrefs
    );
    showToast("Notification settings saved.");
  } catch (error) {
    showToast("Could not save notification settings.", "error");
  }
}

["notifEnabledToggle", "notifFriendsToggle", "notifRemindersToggle"].forEach((id) => {
  document.getElementById(id).addEventListener("change", saveNotificationPrefs);
});

// Turning the master notifications toggle ON is a user gesture, so use it to
// (re)request device notification permission — the same registration the
// legacy-account banner triggers. Routes to the native shell inside the app.
document.getElementById("notifEnabledToggle").addEventListener("change", (e) => {
  if (!e.target.checked) return;
  if (window.ReactNativeWebView) {
    requestNativePushToken();
  } else {
    registerPushToken();
  }
});
manageNotifications.addEventListener("click", () => {
  document.getElementById("notificationSettingsModal").style.display = "flex";
});
document.getElementById("closeNotificationSettings").addEventListener("click", () => {
  document.getElementById("notificationSettingsModal").style.display = "none";
});

// ---------------------------------------------------------------------------
// Block and report (App Store Review Guideline 1.2)
//
// users/{uid}/blocked/{blockedUid} = { firstName, lastName, blockedAt } — owner
// read/write only. Database rules refuse new friend requests / notifications
// from a blocked uid, and sendReminderPush / sendFriendEventPush silently skip
// the push; here we hide anything already delivered and clean up the
// relationship. Blocking is never announced to the other person.
// Every user-provided name below goes in with textContent, never innerHTML.
// ---------------------------------------------------------------------------

function isBlocked(uid) {
  return !!uid && Object.prototype.hasOwnProperty.call(blockedUsers, uid);
}

// Who a notification came from (null for our own: auto reminders, reconciled
// accepts). Cross-user notifications are written only by Cloud Functions,
// which stamp the sender's fromUid; friend-request ones also carry fromUserId.
function notificationSenderUid(notif) {
  const me = currentUser ? currentUser.uid : null;
  if (!notif) return null;
  if (notif.fromUid && notif.fromUid !== me) return notif.fromUid;
  if (notif.fromUserId && notif.fromUserId !== me) return notif.fromUserId;
  return null;
}

// Live mirror of our blocked list. Resolves once the first snapshot is in (or
// after 5s / on error, so sign-in never hangs on it).
function subscribeToBlockedUsers() {
  if (blockedUnsub) {
    blockedUnsub();
    blockedUnsub = null;
  }
  blockedUsers = {};
  if (!currentUser) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    setTimeout(done, 5000);
    blockedUnsub = onValue(
      ref(database, `users/${currentUser.uid}/blocked`),
      (snapshot) => {
        blockedUsers = snapshot.exists() ? snapshot.val() || {} : {};
        if (settled) {
          // A later change (block/unblock here or on another device):
          // refresh whatever is filtered on screen.
          renderNotifications();
          updatePendingCount();
        }
        renderBlockedUsersList();
        done();
      },
      (error) => {
        console.warn("Couldn't load blocked users:", error?.code || error);
        done();
      }
    );
  });
}

const cleanPersonName = (value) => String(value ?? "").trim().slice(0, 50);

function personDisplayName(person) {
  return `${person?.firstName || ""} ${person?.lastName || ""}`.trim();
}

// Best-effort name lookup for a uid we only know from a notification.
async function resolvePersonName(uid) {
  const empty = { firstName: "", lastName: "" };
  if (!currentUser || !uid) return empty;
  const me = currentUser.uid;
  try {
    let found = null;
    const friendsSnap = await get(ref(database, `users/${me}/friendsList`));
    friendsSnap.forEach((child) => {
      if (child.val()?.userId === uid) found = child.val();
    });
    if (!found) {
      const pendingSnap = await get(ref(database, `users/${me}/pendingRequests/${uid}`));
      if (pendingSnap.exists()) found = pendingSnap.val();
    }
    if (!found) {
      const sentSnap = await get(ref(database, `users/${me}/sentRequests/${uid}`));
      if (sentSnap.exists()) found = sentSnap.val();
    }
    if (found) return { firstName: found.firstName || "", lastName: found.lastName || "" };
  } catch (error) {
    console.debug("Couldn't resolve a name for", uid, error?.code || error);
  }
  return empty;
}

// The person the open Block / Report dialogs act on.
let safetyTarget = null;

function openUserActions(person) {
  if (!currentUser || !person?.uid || person.uid === currentUser.uid) return;
  safetyTarget = {
    uid: person.uid,
    firstName: cleanPersonName(person.firstName),
    lastName: cleanPersonName(person.lastName),
  };
  document.getElementById("userActionsTitle").textContent =
    personDisplayName(safetyTarget) || "This person";
  document.getElementById("userActionsModal").style.display = "flex";
}

function openBlockConfirm() {
  if (!safetyTarget) return;
  const name = personDisplayName(safetyTarget);
  document.getElementById("blockConfirmTitle").textContent = name
    ? `Block ${name}?`
    : "Block this person?";
  document.getElementById("userActionsModal").style.display = "none";
  document.getElementById("blockConfirmModal").style.display = "flex";
}

function openReportModal() {
  if (!safetyTarget) return;
  const name = personDisplayName(safetyTarget);
  document.getElementById("reportTitle").textContent = name ? `Report ${name}` : "Report";
  document.getElementById("reportReason").value = "spam";
  document.getElementById("reportDetails").value = "";
  document.getElementById("reportAlsoBlock").checked = true;
  document.getElementById("userActionsModal").style.display = "none";
  document.getElementById("reportModal").style.display = "flex";
}

// Block: write the blocked entry, then end the relationship — remove the
// friendship (same steps as "Remove friend"), their pending request to us, our
// sent request to them (both sides), and any auto reminder about them.
async function blockUser(person) {
  if (!currentUser || !person?.uid) return false;
  const me = currentUser.uid;
  const uid = person.uid;
  const entry = {
    firstName: cleanPersonName(person.firstName),
    lastName: cleanPersonName(person.lastName),
    blockedAt: Date.now(),
  };

  try {
    await set(ref(database, `users/${me}/blocked/${uid}`), entry);
  } catch (error) {
    console.error("❌ Error blocking user:", error);
    showToast("Couldn't block them. Check your connection and try again.", "error");
    return false;
  }
  blockedUsers = { ...blockedUsers, [uid]: entry }; // filter immediately

  const steps = [];
  try {
    const friendsSnap = await get(ref(database, `users/${me}/friendsList`));
    friendsSnap.forEach((child) => {
      const friendData = child.val();
      if (friendData?.userId === uid) steps.push(removeFriendship(child.key, friendData));
    });
  } catch (error) {
    console.warn("Block: couldn't read friends list:", error);
  }
  steps.push(
    // Index entry too, even if no friendsList row matched.
    remove(ref(database, `users/${me}/friendUids/${uid}`)),
    remove(ref(database, `users/${me}/pendingRequests/${uid}`)),
    remove(ref(database, `users/${me}/sentRequests/${uid}`)),
    remove(ref(database, `users/${me}/autoReminders/${uid}`)),
    // Cross-user halves, allowed by the requester-/recipient-may-delete rules.
    remove(ref(database, `users/${uid}/pendingRequests/${me}`)),
    remove(ref(database, `users/${uid}/sentRequests/${me}`))
  );
  const results = await Promise.allSettled(steps);
  results
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.warn("Block cleanup step failed:", r.reason));

  logUserAction(`Blocked ${personDisplayName(entry) || "a user"}`);
  populateFriendsList();
  updatePendingCount();
  renderNotifications();
  if (document.getElementById("pendingRequestsModal").style.display === "flex") {
    loadFriendRequests();
  }
  return true;
}

async function unblockUser(uid) {
  if (!currentUser || !uid) return;
  const entry = blockedUsers[uid] || {};
  try {
    await remove(ref(database, `users/${currentUser.uid}/blocked/${uid}`));
    const name = personDisplayName(entry);
    showToast(name ? `${name} is unblocked.` : "Unblocked.", "success");
    logUserAction(`Unblocked ${name || "a user"}`);
  } catch (error) {
    console.error("❌ Error unblocking user:", error);
    showToast("Couldn't unblock them. Try again.", "error");
  }
}

function renderBlockedUsersList() {
  const list = document.getElementById("blockedUsersList");
  if (!list) return;
  list.textContent = "";

  const entries = Object.entries(blockedUsers || {}).sort(
    ([, a], [, b]) => (b?.blockedAt || 0) - (a?.blockedAt || 0)
  );
  if (entries.length === 0) {
    const li = document.createElement("li");
    li.classList.add("blocked-empty");
    li.textContent = "You haven't blocked anyone.";
    list.appendChild(li);
    return;
  }

  entries.forEach(([uid, entry]) => {
    const li = document.createElement("li");
    const text = document.createElement("span");
    text.classList.add("blocked-name");
    text.textContent = personDisplayName(entry) || "Unknown user";
    if (entry?.blockedAt) {
      const when = document.createElement("span");
      when.classList.add("blocked-when");
      when.textContent = `Blocked ${new Date(entry.blockedAt).toLocaleDateString()}`;
      text.appendChild(when);
    }
    const unblockBtn = document.createElement("button");
    unblockBtn.type = "button";
    unblockBtn.textContent = "Unblock";
    unblockBtn.setAttribute("aria-label", `Unblock ${personDisplayName(entry) || "this user"}`);
    unblockBtn.addEventListener("click", async () => {
      unblockBtn.disabled = true;
      await unblockUser(uid);
      unblockBtn.disabled = false;
    });
    li.appendChild(text);
    li.appendChild(unblockBtn);
    list.appendChild(li);
  });
}

document.getElementById("userActionsBlockBtn").addEventListener("click", openBlockConfirm);
document.getElementById("userActionsReportBtn").addEventListener("click", openReportModal);
document.getElementById("closeUserActions").addEventListener("click", () => {
  document.getElementById("userActionsModal").style.display = "none";
});

document.getElementById("cancelBlockBtn").addEventListener("click", () => {
  document.getElementById("blockConfirmModal").style.display = "none";
});
document.getElementById("confirmBlockBtn").addEventListener("click", async () => {
  if (!safetyTarget) return;
  const btn = document.getElementById("confirmBlockBtn");
  btn.disabled = true;
  try {
    const target = safetyTarget;
    if (await blockUser(target)) {
      const name = personDisplayName(target);
      showToast(name ? `${name} is blocked.` : "Blocked.", "success");
      document.getElementById("blockConfirmModal").style.display = "none";
      safetyTarget = null;
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("cancelReportBtn").addEventListener("click", () => {
  document.getElementById("reportModal").style.display = "none";
});
document.getElementById("submitReportBtn").addEventListener("click", async () => {
  if (!currentUser || !safetyTarget) return;
  const target = safetyTarget;
  const reason = document.getElementById("reportReason").value;
  const details = document.getElementById("reportDetails").value.trim().slice(0, 1000);
  const alsoBlock = document.getElementById("reportAlsoBlock").checked;
  const btn = document.getElementById("submitReportBtn");

  btn.disabled = true;
  try {
    let reportError = null;
    try {
      await reportUserFn({ reportedUid: target.uid, reason, details });
    } catch (error) {
      reportError = error;
      console.error("❌ Report failed:", error);
    }

    // Blocking still happens if they asked for it — getting away from the
    // person matters even when the report couldn't be filed.
    const blocked = alsoBlock ? await blockUser(target) : false;

    if (!reportError) {
      showToast("Thanks. We review reports within 24 hours.", "success");
      document.getElementById("reportModal").style.display = "none";
      safetyTarget = null;
    } else {
      // reportUser itself throws not-found ("That user doesn't exist.") when
      // the reported account is gone, e.g. reported from an old notification
      // after they deleted their account. Only a not-found without that
      // server message means the function isn't deployed.
      const serverNotFound =
        reportError?.code === "functions/not-found" &&
        /doesn't exist|no longer exists/i.test(reportError?.message || "");
      const notDeployed =
        !serverNotFound &&
        (reportError?.code === "functions/not-found" ||
          reportError?.code === "functions/internal");
      const why = serverNotFound
        ? "That account no longer exists."
        : notDeployed
          ? "Reporting isn't available right now."
          : reportError?.message || "Couldn't send the report.";
      showToast(blocked ? `They're blocked, but the report wasn't sent: ${why}` : why, "error");
      if (blocked) {
        document.getElementById("reportModal").style.display = "none";
        safetyTarget = null;
      }
    }
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("manage-blocked").addEventListener("click", () => {
  renderBlockedUsersList();
  document.getElementById("blockedUsersModal").style.display = "flex";
});
document.getElementById("closeBlockedUsers").addEventListener("click", () => {
  document.getElementById("blockedUsersModal").style.display = "none";
});

// ---------------------------------------------------------------------------
// Payment requests (Venmo / PayPal.Me / Cash App) — deep links only
//
// TABS never moves money. A tab is a ledger entry; when you want to collect,
// this builds a link and hands off to the payment app, which manages the whole
// transaction. Two directions:
//   • Venmo *charge* — needs the DEBTOR's handle, so we read the friend's
//     profile.paymentHandles.venmo (friend-scoped read rule). Opens Venmo with
//     a prefilled request you tap to send.
//   • PayPal.Me / Cash App — carry YOUR handle for the friend to pay, so we
//     build them from your own handles and copy the link for you to send.
// The whole feature is gated behind a per-user toggle (settings/payments).
// ---------------------------------------------------------------------------

let paymentSettings = { enabled: false };
let myPaymentHandles = { venmo: "", paypal: "", cashApp: "" };

const cleanHandle = (v) => String(v || "").trim().replace(/^[@$]/, "");
const fmtAmount = (n) => Number(n).toFixed(2);

function venmoChargeLink(username, amount, note) {
  const params = new URLSearchParams({ txn: "charge" });
  if (amount) params.set("amount", fmtAmount(amount));
  if (note) params.set("note", note);
  return `https://venmo.com/${encodeURIComponent(cleanHandle(username))}?${params.toString()}`;
}
// "Pay me" link built from YOUR Venmo — the friend opens it and pays you (same
// direction as PayPal.Me / Cash App links). Works from any row.
function venmoPayLink(username, amount, note) {
  const params = new URLSearchParams({ txn: "pay" });
  if (amount) params.set("amount", fmtAmount(amount));
  if (note) params.set("note", note);
  return `https://venmo.com/${encodeURIComponent(cleanHandle(username))}?${params.toString()}`;
}
function paypalMeLink(username, amount) {
  return `https://paypal.me/${encodeURIComponent(cleanHandle(username))}${amount ? `/${fmtAmount(amount)}` : ""}`;
}
function cashAppLink(tag, amount) {
  return `https://cash.app/$${encodeURIComponent(cleanHandle(tag))}${amount ? `/${fmtAmount(amount)}` : ""}`;
}

async function loadPaymentSettings() {
  if (!currentUser) return;
  try {
    const [sSnap, hSnap] = await Promise.all([
      get(ref(database, `users/${currentUser.uid}/settings/payments`)),
      get(ref(database, `users/${currentUser.uid}/profile/paymentHandles`)),
    ]);
    if (sSnap.exists()) paymentSettings = { ...paymentSettings, ...sSnap.val() };
    if (hSnap.exists()) myPaymentHandles = { ...myPaymentHandles, ...hSnap.val() };
  } catch (error) {
    console.error("Error loading payment settings:", error);
  }
  document.getElementById("paymentsEnabledToggle").checked = !!paymentSettings.enabled;
  document.getElementById("venmoHandleInput").value = myPaymentHandles.venmo || "";
  document.getElementById("paypalHandleInput").value = myPaymentHandles.paypal || "";
  document.getElementById("cashAppHandleInput").value = myPaymentHandles.cashApp || "";
  // The request buttons on rows show/hide via this body class, so flipping the
  // toggle doesn't need a list rebuild.
  document.body.classList.toggle("payments-enabled", !!paymentSettings.enabled);
  renderProfilePaymentHandles();
}

// Read-only summary of the user's saved handles, shown on the Profile screen.
function renderProfilePaymentHandles() {
  const el = document.getElementById("profile-payment");
  if (!el) return;
  const parts = [];
  if (myPaymentHandles.venmo) parts.push(`Venmo: @${myPaymentHandles.venmo}`);
  if (myPaymentHandles.paypal) parts.push(`PayPal.Me /${myPaymentHandles.paypal}`);
  if (myPaymentHandles.cashApp) parts.push(`Cash App: $${myPaymentHandles.cashApp}`);
  el.innerHTML = parts.length
    ? `Payment Handles: <br> ${parts.join(" · ")}`
    : "Payment Handles: <br> Not set up";
}

async function savePaymentSettings() {
  if (!currentUser) return;
  const enabled = document.getElementById("paymentsEnabledToggle").checked;
  const handles = {
    venmo: cleanHandle(document.getElementById("venmoHandleInput").value),
    paypal: cleanHandle(document.getElementById("paypalHandleInput").value),
    cashApp: cleanHandle(document.getElementById("cashAppHandleInput").value),
  };
  // Only one handle is required — but if the feature is on, at least one must be
  // set, otherwise there's nothing to request with.
  if (enabled && !handles.venmo && !handles.paypal && !handles.cashApp) {
    showToast("Add at least one payment handle (Venmo, PayPal, or Cash App).", "error");
    return;
  }
  paymentSettings = { enabled };
  myPaymentHandles = handles;
  try {
    await Promise.all([
      set(ref(database, `users/${currentUser.uid}/settings/payments`), paymentSettings),
      set(ref(database, `users/${currentUser.uid}/profile/paymentHandles`), myPaymentHandles),
    ]);
    document.body.classList.toggle("payments-enabled", !!paymentSettings.enabled);
    renderProfilePaymentHandles();
    showToast("Payment settings saved.", "success");
    document.getElementById("paymentSettingsModal").style.display = "none";
  } catch (error) {
    showToast("Could not save payment settings.", "error");
  }
}

async function copyPaymentLink(link, name) {
  const first = name.split(" ")[0];
  try {
    await navigator.clipboard.writeText(link);
    showToast(`Payment link copied — send it to ${first}.`, "success");
  } catch (error) {
    // Clipboard blocked (older browser / insecure context): open it so the
    // user can copy or share it manually.
    window.open(link, "_blank");
  }
  document.getElementById("paymentRequestModal").style.display = "none";
}

async function openPaymentRequestModal(listItem) {
  const name = listItem.querySelector(".name-span").textContent.trim();
  // .value is the canonical USD amount; .textContent is its converted display
  // in whatever currency is selected. Payment platforms (Venmo / PayPal.Me /
  // Cash App links) interpret the amount as USD, so the link must carry the
  // USD figure — using the converted display number used to send e.g. a
  // €-converted value as dollars.
  // Number(), not parseFloat(): an item tab like "2 tickets" parsed as 2 and
  // showed (and linked) a made-up "$2.00".
  const rawAmount = listItem.querySelector(".amount-input").value;
  const amount = typeof rawAmount === "number" ? rawAmount : Number(String(rawAmount).trim());
  const amountValid = Number.isFinite(amount) && amount > 0;
  const amt = amountValid ? amount : null;

  document.getElementById("paymentRequestTitle").textContent = `Request from ${name}`;
  document.getElementById("paymentRequestSubtitle").textContent = amountValid
    ? `They owe you ${getSymbol(getSelectedCurrency())}${usdToDisplay(amount).toFixed(2)}`
    : rawAmount && isNaN(Number(rawAmount))
      ? `For: ${rawAmount}. The link won't include an amount.`
      : "Choose how to request payment";

  const optionsEl = document.getElementById("paymentRequestOptions");
  optionsEl.innerHTML = "";

  // The friend's own Venmo handle lets us open a charge (request) directly.
  const friend = await findFriendByName(name);
  let friendVenmo = "";
  if (friend?.userId) {
    try {
      const snap = await get(
        ref(database, `users/${friend.userId}/profile/paymentHandles`)
      );
      if (snap.exists()) friendVenmo = snap.val().venmo || "";
    } catch (error) {
      // Not a linked friend, or they haven't shared a handle — just skip Venmo.
    }
  }

  const addOption = (label, onClick) => {
    const btn = document.createElement("button");
    btn.className = "payment-option-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    optionsEl.appendChild(btn);
  };

  const note = "TABS: settle up";

  // Your own handles → a "pay me" link the friend opens to pay you. Works on
  // every row (friend or not) and needs only ONE handle configured.
  if (myPaymentHandles.venmo) {
    addOption("Copy my Venmo link", () =>
      copyPaymentLink(venmoPayLink(myPaymentHandles.venmo, amt, note), name)
    );
  }
  if (myPaymentHandles.paypal) {
    addOption("Copy my PayPal.Me link", () =>
      copyPaymentLink(paypalMeLink(myPaymentHandles.paypal, amt), name)
    );
  }
  if (myPaymentHandles.cashApp) {
    addOption("Copy my Cash App link", () =>
      copyPaymentLink(cashAppLink(myPaymentHandles.cashApp, amt), name)
    );
  }

  // Bonus for a linked friend who shared their Venmo: charge them directly
  // (opens Venmo with a request to them, which you tap to send).
  if (friendVenmo) {
    addOption(`Charge ${name.split(" ")[0]} on Venmo`, () => {
      window.open(venmoChargeLink(friendVenmo, amt, note), "_blank");
      document.getElementById("paymentRequestModal").style.display = "none";
    });
  }

  if (!optionsEl.children.length) {
    const p = document.createElement("p");
    p.className = "payment-empty";
    p.textContent =
      "Add at least one payment handle in Payment Requests (Profile → Account) to send a pay link.";
    optionsEl.appendChild(p);
  }

  document.getElementById("paymentRequestModal").style.display = "flex";
}

document.getElementById("manage-payments").addEventListener("click", () => {
  document.getElementById("paymentSettingsModal").style.display = "flex";
});
document.getElementById("closePaymentSettings").addEventListener("click", () => {
  document.getElementById("paymentSettingsModal").style.display = "none";
});
document.getElementById("savePaymentSettings").addEventListener("click", savePaymentSettings);
document.getElementById("closePaymentRequest").addEventListener("click", () => {
  document.getElementById("paymentRequestModal").style.display = "none";
});

// ---------------------------------------------------------------------------
// SMS payment reminders (friend rows only)
//
// "Send SMS Now" opens the phone's SMS composer via an sms: link with a
// prefilled message. Auto reminders can't send texts by themselves from a
// static web app — instead the chosen frequency (once a day … once a week)
// is stored at users/{uid}/autoReminders/{friendUserId}, and whenever a
// reminder comes due the app drops an in-app notification with a "Text now"
// shortcut into the composer.
// ---------------------------------------------------------------------------

let currentReminderTarget = null;

function openSmsComposer(phone, body) {
  const digits = phone ? String(phone).replace(/\D/g, "") : "";
  // iOS expects "sms:123&body=", everything else "sms:123?body="
  const separator = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?";
  window.location.href = `sms:${digits}${separator}body=${encodeURIComponent(body)}`;
}

// Witty, Duolingo-style reminder lines, loaded from reminder-messages.json so
// they're easy to edit without touching code. The Cloud Function bundles the
// same file (firebase.json predeploy copy) and the client only sends an INDEX
// into it, so the indices must line up: the built-in fallback below mirrors
// the first two entries of reminder-messages.json for when the fetch fails
// (e.g. offline) — keep them in step if those two lines are ever edited.
let reminderMessages = [
  "Hey {name}, your {amount} tab misses you. Pay It? Now? 🥹",
  "{name}, this is your {amount} speaking. I want to go home. 🏠",
];
let reminderMessagesLoaded = false;

async function loadReminderMessages() {
  try {
    const res = await fetch("reminder-messages.json", { cache: "no-cache" });
    const data = await res.json();
    if (Array.isArray(data.messages) && data.messages.length) {
      reminderMessages = data.messages;
      reminderMessagesLoaded = true;
    }
  } catch (error) {
    console.debug("Using built-in reminder messages:", error?.message);
  }
}
let reminderMessagesReady = loadReminderMessages();

// Make sure the real template list is in hand before picking an index (one
// retry if the first fetch failed); falls back to the mirrored built-ins.
async function ensureReminderMessages() {
  await reminderMessagesReady;
  if (!reminderMessagesLoaded) {
    reminderMessagesReady = loadReminderMessages();
    await reminderMessagesReady;
  }
}

// The amount string the templates show, formatted the way the app always has:
// currency symbol + two decimals ("$12.50", "Mex$12.50", "kr12.50",
// "CHF12.50"). This exact string is what sendReminderPush validates. Returns
// "" when the tab has no numeric amount (an item, e.g. "pizza"): the server
// never accepts free text there, and renders "" as "what you owe" — so the
// item text itself is never sent.
const REMINDER_AMOUNT_FALLBACK = "what you owe"; // must match functions/index.js
function formatReminderAmount(amountText) {
  const amount = parseFloat(amountText);
  if (!Number.isFinite(amount)) return "";
  return `${getSymbol(getSelectedCurrency())}${Math.abs(amount).toFixed(2)}`;
}

// Picks a template and returns everything needed to send it:
//   templateIndex / amount → the push request (server builds the text);
//   text → the same text rendered locally, used for the in-app inbox copy.
// Single-pass fill (like the server) so a name containing "{amount}" is never
// expanded twice.
function pickReminder(name, amountText) {
  const templateIndex = Math.floor(Math.random() * reminderMessages.length);
  const amount = formatReminderAmount(amountText);
  const owed = amount || REMINDER_AMOUNT_FALLBACK;
  const firstName = String(name || "").trim().split(" ")[0] || "friend";
  const text = reminderMessages[templateIndex].replace(/\{name\}|\{amount\}/g, (token) =>
    token === "{name}" ? firstName : owed
  );
  return { templateIndex, amount, text };
}

// Push + in-app inbox copy, both written by sendReminderPush with server-built
// text. Returns { delivered, reason }.
async function deliverReminder(friendUid, reminder) {
  const outcome = await sendReminderPushViaFCM(
    friendUid,
    reminder.templateIndex,
    reminder.amount
  );
  return outcome;
}

// Rebuilds a reminder for a friend from their uid (used by the auto-reminder
// "Remind now" shortcut): their name from our friends list, the CURRENT
// amount from our tab list. Null if they're no longer a friend.
async function reminderForFriendUid(friendUid) {
  if (!currentUser || !friendUid) return null;
  await ensureReminderMessages();
  const snapshot = await get(ref(database, `users/${currentUser.uid}/friendsList`));
  let friend = null;
  snapshot.forEach((child) => {
    if (child.val()?.userId === friendUid) friend = child.val();
  });
  if (!friend) return null;
  const name = `${friend.firstName || ""} ${friend.lastName || ""}`.trim();
  const person = (latestPeopleData || []).find(
    (p) => p && String(p.name ?? "").trim() === name
  );
  let amountText = "";
  if (person) {
    amountText = typeof person.amount === "number"
      ? String(usdToDisplay(person.amount))
      : String(person.amount ?? "");
  }
  return pickReminder(name, amountText);
}

async function findFriendByName(fullName) {
  const snapshot = await get(
    ref(database, `users/${currentUser.uid}/friendsList`)
  );
  if (!snapshot.exists()) return null;
  let match = null;
  snapshot.forEach((child) => {
    const friend = child.val();
    if (`${friend.firstName} ${friend.lastName}`.trim() === fullName.trim()) {
      match = friend;
    }
  });
  return match;
}

async function getFriendPhone(friendUserId) {
  try {
    const snapshot = await get(
      ref(database, `users/${friendUserId}/profile/phoneNumber`)
    );
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    // Expected for older friendships: the phone isn't stored on our own
    // friendsList entry yet, and the friend hasn't logged in since the
    // friendUids index shipped (so their rules don't authorize us to read
    // their profile). Not an error — the composer just opens without a
    // prefilled number. Logged at debug level so it isn't alarming.
    console.debug("Friend phone not available yet (using blank number):", error?.code);
    return null;
  }
}

// Rebuild the UID-keyed friend index from the (push-keyed) friendsList on our
// own node. Security rules can't scan friendsList by member UID, so the
// phone-number read rule checks users/{owner}/friendUids/{reader} instead —
// a value only the owner can write, which keeps the check unforgeable.
// Running this on login backfills the index for friendships made before the
// index existed, and self-heals if an entry ever goes missing.
async function syncFriendUids() {
  if (!currentUser) return;
  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/friendsList`)
    );
    if (!snapshot.exists()) return;

    const updates = {};
    snapshot.forEach((child) => {
      const friendUid = child.val().userId;
      if (friendUid) updates[friendUid] = true;
    });

    if (Object.keys(updates).length > 0) {
      await update(
        ref(database, `users/${currentUser.uid}/friendUids`),
        updates
      );
    }
  } catch (error) {
    console.error("❌ Error syncing friendUids index:", error);
  }
}

function updateAutoRemindUI() {
  const enabled = document.getElementById("autoRemindToggle").checked;
  const frequencyBox = document.getElementById("autoRemindFrequency");
  frequencyBox.style.display = enabled ? "flex" : "none";

  const days = parseInt(document.getElementById("autoRemindRange").value, 10);
  const label = document.getElementById("autoRemindLabel");
  if (days === 1) label.textContent = "Once a day";
  else if (days === 7) label.textContent = "Once a week";
  else label.textContent = `Every ${days} days`;
}

async function openSmsReminderModal(listItem) {
  const name = listItem.querySelector(".name-span").textContent.trim();
  const amountText = listItem.querySelector(".amount-input").textContent.trim();

  document.getElementById("smsReminderTitle").textContent = `Remind ${name}`;
  document.getElementById("smsReminderSubtitle").textContent = !isNaN(parseFloat(amountText))
    ? `They owe you ${getSymbol(getSelectedCurrency())}${parseFloat(amountText).toFixed(2)}`
    : `They owe you: ${amountText}`;

  currentReminderTarget = { name, amountText, friendUserId: null, phone: null };
  document.getElementById("autoRemindToggle").checked = false;
  document.getElementById("autoRemindRange").value = 7;
  updateAutoRemindUI();
  document.getElementById("smsReminderModal").style.display = "flex";

  const friend = await findFriendByName(name);
  if (friend) {
    currentReminderTarget.friendUserId = friend.userId;
    // Prefer the phone number stored on our OWN friendsList entry (copied in
    // when the friendship was made) — no cross-user read, so no permission
    // barrier. Only fall back to reading their profile for older friendships
    // whose record predates phone denormalization.
    currentReminderTarget.phone =
      friend.phoneNumber || (await getFriendPhone(friend.userId));

    try {
      const snapshot = await get(
        ref(database, `users/${currentUser.uid}/autoReminders/${friend.userId}`)
      );
      if (snapshot.exists()) {
        const saved = snapshot.val();
        document.getElementById("autoRemindToggle").checked = !!saved.enabled;
        document.getElementById("autoRemindRange").value = saved.frequencyDays || 7;
        updateAutoRemindUI();
      }
    } catch (error) {
      console.error("❌ Error loading auto-reminder settings:", error);
    }
  }
}

document.getElementById("sendSmsNowBtn").addEventListener("click", async () => {
  if (!currentReminderTarget) return;
  const { name, amountText, phone, friendUserId } = currentReminderTarget;
  const btn = document.getElementById("sendSmsNowBtn");

  btn.disabled = true;
  try {
    if (!friendUserId) {
      showToast("Reminders only work for people from your friends list.", "error");
      return;
    }
    await ensureReminderMessages();
    const reminder = pickReminder(name, amountText);
    // Deliver a real push notification to the friend's device via FCM — no
    // SMS app, no carrier — and also leave an in-app notification in their
    // TABS inbox, so they see it even if they have no push device. The push
    // text is chosen server-side from the template index (see
    // sendReminderPushViaFCM).
    const { delivered, reason } = await deliverReminder(friendUserId, reminder);
    if (delivered) {
      showToast(`Reminder sent to ${name}.`, "success");
      document.getElementById("smsReminderModal").style.display = "none";
    } else if (reason === "no-devices") {
      showToast(
        `${name} was reminded in-app. (They haven't turned on device notifications yet.)`,
        "success"
      );
      document.getElementById("smsReminderModal").style.display = "none";
    }
    logUserAction(`Sent a reminder to ${name}`);

    // Sending manually also resets the auto-reminder clock.
    if (friendUserId) {
      try {
        await update(
          ref(database, `users/${currentUser.uid}/autoReminders/${friendUserId}`),
          { lastSent: Date.now() }
        );
      } catch (error) {
        // No auto reminder saved yet — nothing to update.
      }
    }
  } finally {
    btn.disabled = false;
  }
});

async function saveAutoReminderSettings() {
  if (!currentUser || !currentReminderTarget) return;
  const toggle = document.getElementById("autoRemindToggle");
  const { name, friendUserId, phone } = currentReminderTarget;

  if (!friendUserId) {
    if (toggle.checked) {
      toggle.checked = false;
      updateAutoRemindUI();
      showToast("Auto reminders only work for people from your friends list.", "error");
    }
    return;
  }

  const reminderRef = ref(
    database,
    `users/${currentUser.uid}/autoReminders/${friendUserId}`
  );

  try {
    if (!toggle.checked) {
      await remove(reminderRef);
      showToast(`Auto reminders turned off for ${name}.`);
      return;
    }

    const frequencyDays = parseInt(document.getElementById("autoRemindRange").value, 10);
    const existing = await get(reminderRef);
    await set(reminderRef, {
      enabled: true,
      frequencyDays,
      friendName: name,
      phone: phone ?? null,
      lastSent: existing.exists() ? existing.val().lastSent || Date.now() : Date.now(),
    });
    showToast(
      `${name} will be reminded every ${frequencyDays} day${frequencyDays === 1 ? "" : "s"}.`
    );
  } catch (error) {
    console.error("❌ Error saving auto-reminder settings:", error);
    showToast("Couldn't save auto reminder settings.", "error");
  }
}

document.getElementById("autoRemindToggle").addEventListener("change", () => {
  updateAutoRemindUI();
  saveAutoReminderSettings();
});
document.getElementById("autoRemindRange").addEventListener("input", updateAutoRemindUI);
document.getElementById("autoRemindRange").addEventListener("change", saveAutoReminderSettings);
document.getElementById("closeSmsReminder").addEventListener("click", () => {
  document.getElementById("smsReminderModal").style.display = "none";
});

// On login, surface any auto reminders that have come due as notifications
// (with a "Text now" shortcut) and advance their clock.
async function checkAutoReminders() {
  if (!currentUser) return;

  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/autoReminders`)
    );
    if (!snapshot.exists()) return;

    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    for (const [friendUserId, reminder] of Object.entries(snapshot.val())) {
      if (!reminder.enabled) continue;
      if (blockedUsers[friendUserId]) continue; // blocked — never nudge about them
      const frequencyMs = (reminder.frequencyDays || 7) * DAY_MS;
      if (now - (reminder.lastSent || 0) < frequencyMs) continue;

      // No pre-built message text is stored any more: the "Remind now"
      // shortcut builds the reminder at tap time (template index + current
      // amount) via reminderForFriendUid, and the push text is chosen
      // server-side.
      await addNotification(currentUser.uid, {
        type: "sms-reminder",
        message: `Reminder: time to text ${reminder.friendName} about what they owe you.`,
        friendUid: friendUserId, // lets the "Remind now" shortcut send a push
        phone: reminder.phone ?? null,
      });
      await update(
        ref(database, `users/${currentUser.uid}/autoReminders/${friendUserId}`),
        { lastSent: now }
      );
    }
  } catch (error) {
    console.error("❌ Error checking auto reminders:", error);
  }
}

// Get a reference to the user's profile data



