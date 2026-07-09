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
  signInWithPopup

} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";

import {
  getFunctions,
  httpsCallable,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-functions.js";

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
function showToast(message, type = "success") {
  Toastify({
    text: `${message}`, // Prepend icon to message
    duration: 2000,
    close: true,
    gravity: "top",
    position: "right",
    className:
      type === "error"
        ? "toastify toastify-error"
        : "toastify toastify-success", // Set class dynamically
    style: {
      background: type === "error" ? "#ef4444" : "#50c444",
      display: "flex",
      alignItems: "center",
      gap: "8px", // Space between icon & text
    },
  }).showToast();
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
// Callable that sends SMS through Twilio server-side (see functions/index.js).
const functionsClient = getFunctions(app);
const sendReminderSmsFn = httpsCallable(functionsClient, "sendReminderSms");

// Sends a reminder text via the Twilio Cloud Function. Returns true on
// success; on failure shows a toast and returns false so the caller can fall
// back to the device's messaging app.
async function sendReminderSmsViaTwilio(friendUid, message) {
  if (!friendUid) return false;
  try {
    await sendReminderSmsFn({ friendUid, message });
    return true;
  } catch (error) {
    console.error("Twilio SMS failed:", error);
    // functions/not-found means the function isn't deployed yet.
    const notDeployed = error?.code === "functions/not-found" ||
      error?.code === "functions/internal";
    showToast(
      notDeployed
        ? "Auto-texting isn't set up yet — opening your messaging app."
        : error?.message || "Couldn't send the text automatically.",
      "error"
    );
    return false;
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

// Currency handling — a single delegated listener updates every rendered
// row instead of each person-row registering its own "change" listener
// (which used to leak a new listener per person on every add/reload).
const currencySymbols = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
};
const currencySelectEl = document.getElementById("currency-select");
currencySelectEl.addEventListener("change", () => {
  const symbol = currencySymbols[currencySelectEl.value];
  document.querySelectorAll(".dollar-sign").forEach((el) => {
    el.textContent = symbol;
  });
  addMoreMoneyBtn.innerHTML = `+ ${symbol}`;
  removeMoneyBtn.innerHTML = `- ${symbol}`;
});
// Function to show the modal

// Auth State Listener
let currentUser = null;
let currentListItem = null;
let peopleListUnsub = null;
let friendsListUnsub = null;
let friendPendingRemoval = null;
let notificationsUnsub = null;

onAuthStateChanged(auth, async (user) => {
  const loginPage = document.getElementById("Loginpage");
  const signupPage = document.getElementById("signupPage");
  const friendBox = document.getElementById("friendModal");

  if (user) {
    currentUser = user;
    console.log(`User logged in: ${user.email}`);

    logoutButton.style.display = "block";
    loginSignup.style.display = "none";

    // Settle accrued interest before rendering the list, so the amounts
    // shown on load already reflect it instead of needing a second refresh.
    await applyInterestToAll();

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
    subscribeToNotifications();
    checkAutoReminders();

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
      const profileData = snapshot.val();
      document.getElementById('profile-name').innerHTML = `Name: <br> ${profileData.firstName} ${profileData.lastName}`;
      document.getElementById('profile-email').innerHTML = `Email: <br> ${profileData.email}`;
      document.getElementById('profile-phone').innerHTML = `Phone Number: <br> ${profileData.phoneNumber}`;
      document.getElementById('profile-friend-code').innerHTML = `Friend Code: <br> ${profileData.friendCode || 'N/A'}`;
    });


    const totalSpendingEl = document.getElementById("total-spending");
    const amountSpentEl = document.getElementById("amount-spent");
    const amountEarnedEl = document.getElementById("amount-earned");
    const totalFriendsEl = document.getElementById("total-friends");
    const lastLoginEl = document.getElementById("last-login");
    const createdEl = document.getElementById("account-created");

    const peopleListRef = ref(database, `users/${user.uid}/peopleList`);
    if (peopleListUnsub) peopleListUnsub();
    peopleListUnsub = onValue(peopleListRef, (snapshot) => {
      if (snapshot.exists()) {
        const peopleData = snapshot.val().peopleData || [];
        let amountSpent = 0;
        let amountEarned = 0;

        peopleData.forEach((person) => {
          if (person.status === "iOwe" && typeof person.amount === 'number') {
            amountSpent += person.amount;
          } else if (person.status === "owesMe" && typeof person.amount === 'number') {
            amountEarned += person.amount;
          }
        });

        if (totalSpendingEl) totalSpendingEl.innerText = `Total Spent: $${(amountSpent + amountEarned).toFixed(2)}`;
        if (amountSpentEl) amountSpentEl.innerText = `Amount Spent: $${amountSpent.toFixed(2)}`;
        if (amountEarnedEl) amountEarnedEl.innerText = `Amount Earned: $${amountEarned.toFixed(2)}`;
      } else {
        if (totalSpendingEl) totalSpendingEl.innerText = `Total Spent: $0.00`;
        if (amountSpentEl) amountSpentEl.innerText = `Amount Spent: $0.00`;
        if (amountEarnedEl) amountEarnedEl.innerText = `Amount Earned: $0.00`;
      }
    });

    const friendsRef = ref(database, `users/${user.uid}/friendsList`);
    if (friendsListUnsub) friendsListUnsub();
    friendsListUnsub = onValue(friendsRef, (snapshot) => {
      const friends = snapshot.val();
      const totalFriends = friends ? Object.keys(friends).length : 0;
      if (totalFriendsEl) totalFriendsEl.innerText = `Total Friends: ${totalFriends}`;
    });

    updatePendingCount();

    user.reload().then(() => {
      const creationTime = new Date(user.metadata.creationTime).toLocaleDateString();
      const lastSignInTime = new Date(user.metadata.lastSignInTime).toLocaleDateString();

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

    logoutButton.style.display = "none";
    loginSignup.style.display = "flex";

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
// Google Sign-In Button Listener
const googleBtn = document.getElementById("googleSignInBtn");

if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user profile exists
      const profileRef = ref(database, `users/${user.uid}/profile`);
      const snapshot = await get(profileRef);

      if (!snapshot.exists()) {
        const displayName = user.displayName || "User";
        const [firstName, ...rest] = displayName.split(" ");
        const lastName = rest.join(" ") || "";

        const friendCode = generateFriendCode();

        await set(profileRef, {
          firstName: firstName,
          lastName: lastName,
          phoneNumber: user.phoneNumber || "",
          email: user.email,
          friendCode: friendCode,
        });

        await set(ref(database, `friendCodes/${friendCode}`), {
          userId: user.uid,
          firstName: firstName,
          lastName: lastName,
        });
      }

      showToast(`Signed in with Google as ${user.displayName}`, "success");
      await logUserAction("Signed in with Google");

    } catch (error) {
      console.error("Google Sign-In Error:", error);
      showToast("Google sign-in failed: " + error.message, "error");
    }
  });
}
const googleSignUpBtn = document.getElementById("googleSignUpBtn");
if (googleSignUpBtn) {
  googleSignUpBtn.addEventListener("click", async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user profile exists
      const profileRef = ref(database, `users/${user.uid}/profile`);
      const snapshot = await get(profileRef);

      if (!snapshot.exists()) {
        const displayName = user.displayName || "User";
        const [firstName, ...rest] = displayName.split(" ");
        const lastName = rest.join(" ") || "";

        const friendCode = generateFriendCode();

        await set(profileRef, {
          firstName: firstName,
          lastName: lastName,
          phoneNumber: user.phoneNumber || "",
          email: user.email,
          friendCode: friendCode,
        });

        await set(ref(database, `friendCodes/${friendCode}`), {
          userId: user.uid,
          firstName: firstName,
          lastName: lastName,
        });
      }

      showToast(`Signed up with Google as ${user.displayName}`, "success");
      await logUserAction("Signed up with Google");

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
  "auth/too-many-requests": "Too many failed attempts. Try again later.",
  // Add more as needed
};
// Login Event
// Login Event
loginButton.addEventListener("click", async () => {
  const email = loginEmail.value;
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
    const cleanMessage = firebaseErrorMap[error.code] || "Something went wrong. Please try again.";
    showToast(cleanMessage, "error");
  }
});



// Helper function to generate a unique friend code
function generateFriendCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase(); // Example: 'A1B2C3D4'
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
    const friendCode = generateFriendCode();

    // Save additional user info along with friend code to Realtime Database
    // Save profile data excluding friend code
    await set(ref(database, `users/${user.uid}/profile`), {
      firstName: nameFirst,
      lastName: nameLast,
      phoneNumber: number,
      email: email,
      friendCode: friendCode,
    });

    // Save friend code in the friendCodes node
    await set(ref(database, `friendCodes/${friendCode}`), {
      userId: currentUser.uid,
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
  const email = signupEmail.value || loginEmail.value;

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

// Save list to Firebase instead of localStorage
async function saveListToFirebase() {
  if (!currentUser) return;

  const listItems = peopleList.querySelectorAll(".personlist-item");
  const peopleData = [];

  listItems.forEach((item) => {
    if (item.classList.contains('ad-box')) {
      return;
    }
    const name = item.querySelector(".name-span").textContent;
    const rawAmount = item.querySelector(".amount-input").textContent.trim();
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

  // Get interest data

  try {
    await set(ref(database, `users/${currentUser.uid}/peopleList`), {
      peopleData,
    });
    console.log("✅ Data saved to Firebase:", { peopleData });
  } catch (error) {
    console.error("❌ Error saving data:", error);
  }
}

// Load list and interest data from Firebase
async function loadListFromFirebase() {
  if (!currentUser) return;
  document.getElementById("loader").style.display = "flex";
  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/peopleList`)
    );
    if (snapshot.exists()) {
      const data = snapshot.val();

      // Load people list
      const peopleData = data.peopleData || [];
      if (peopleList) peopleList.innerHTML = "";

      peopleData.forEach((person) => {
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
    }
  } catch (error) {
    console.error("❌ Error loading data:", error);
  } finally {
    addAdBox();
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
async function deleteAccountAndData() {
  if (!currentUser) return;

  try {
    // Delete user data from Realtime Database
    await remove(ref(database, `users/${currentUser.uid}`));

    // Delete user authentication account
    await currentUser.delete();

    showToast("Account deleted successfully.");
  } catch (error) {
    if (error.code === "auth/requires-recent-login") {
      showToast("Please re-login before deleting your account.", "error");
    } else {
      showToast("Error deleting account: " + error.message, "error");
    }
  }
}
disableAccount.addEventListener("click", disableUserAccount);
async function disableUserAccount() {
  if (!currentUser) return;

  try {
    await update(ref(database, `users/${currentUser.uid}/profile`), {
      accountDisabled: true,
    });
    showToast("Account disabled in database (soft disable).");
  } catch (error) {
    showToast("Error disabling account: " + error.message, "error");
  }
}
exportData.addEventListener("click", exportUserData);
async function exportUserData() {
  if (!currentUser) return;

  try {
    const snapshot = await get(ref(database, `users/${currentUser.uid}`));
    if (snapshot.exists()) {
      const data = snapshot.val();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "exported_user_data.json";
      a.click();
      URL.revokeObjectURL(url);
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
      ? Object.values(pendingSnap.val()).filter((req) => req.type !== "accepted").length
      : 0;
    const sentCount = sentSnap.exists() ? Object.keys(sentSnap.val()).length : 0;

    const receivedBadge = document.getElementById("pendingCount");
    receivedBadge.textContent = receivedCount;
    receivedBadge.style.display = receivedCount > 0 ? "inline-flex" : "none";

    const sentBadge = document.getElementById("sentCount");
    sentBadge.textContent = sentCount;
    sentBadge.style.display = sentCount > 0 ? "inline-flex" : "none";
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

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name;
  nameSpan.classList.add("name-span");

  const amountContainer = document.createElement("div");
  amountContainer.classList.add("amount-container");

  const dollarSpan = document.createElement("span");
  dollarSpan.textContent = currencySymbols[document.getElementById("currency-select").value];
  dollarSpan.classList.add("dollar-sign");

  const amountSpan = document.createElement("span");
  amountSpan.classList.add("amount-input");
  amountSpan.style.color = "rgb(73, 255, 97)";
  if (!isNaN(amount)) {
    amountSpan.textContent = parseFloat(amount).toFixed(2);
    amountContainer.appendChild(dollarSpan);
  } else {
    amountSpan.textContent = amount;
  }
  amountSpan.classList.add("amount-input");
  amountSpan.value = amount || 0;
  amountSpan.addEventListener("input", debounce(saveListToFirebase, 300));
  amountContainer.appendChild(amountSpan);

  const personItem = document.createElement("div");
  personItem.appendChild(nameSpan);
  if (isFriend) {
    // Sibling of nameSpan, not a child of it — anything reading
    // nameSpan.textContent as the person's name (save/edit/logging) would
    // otherwise pick up this icon's ligature text too.
    const friendIcon = document.createElement("span");
    friendIcon.className = "material-icons friend-icon";
    friendIcon.textContent = "how_to_reg";
    friendIcon.title = "This person is one of your friends";
    personItem.appendChild(friendIcon);
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
  removeBtn.innerHTML = "<img src='check_24dp_E8EAED_FILL0_wght400_GRAD0_opsz24.svg' alt='Remove'/>";
  removeBtn.classList.add("remove-btn");
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
        listItem.remove();
        saveListToFirebase();
        logUserAction(`Removed ${removedName}'s tab`);
      },
      { once: true }
    );
  });

  // More Button (Expand/Collapse)
  const addInfoBtn = document.createElement("button");
  addInfoBtn.innerHTML =
    '<span class="material-symbols-outlined">more_horiz</span>';
  addInfoBtn.classList.add("add-info-btn");
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
    smsBtn.innerHTML = '<span class="material-icons">sms</span>';
    smsBtn.classList.add("sms-remind-btn");
    smsBtn.title = "Send a payment reminder over SMS";
    smsBtn.addEventListener("click", () => openSmsReminderModal(listItem));
    extraBox.appendChild(smsBtn);
  }
  nameAmountContainer.appendChild(personItem);
  nameAmountContainer.appendChild(extraBox);

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
function addAdBox() {
  // Idempotent: loadListFromFirebase can run more than once per session
  // (login, reloads), and stacking a new ad box each time both clutters the
  // list and double-push()es slots AdSense then refuses to fill.
  const existingAd = peopleList.querySelector(".ad-box");
  if (existingAd) existingAd.remove();

  const adItem = document.createElement("div");
  adItem.classList.add("personlist-item", "ad-box");
  adItem.style.justifyContent = "center";
  adItem.style.background = "rgba(255, 255, 255, 0.05)"; // Subtly different background

  adItem.innerHTML = `
    <div style="text-align: center; font-size: 12px; color: #888; width: 100%;">
      <p style="margin: 0;">ADVERTISEMENT</p>
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-7825788728707782"
           data-ad-slot="8944873686"
           data-ad-format="auto"
           data-full-width-responsive="true"></ins>
    </div>
  `;

  peopleList.appendChild(adItem);
  pushAdWhenVisible(adItem);
}

// The <ins> is only in the DOM after the list has rendered — unlike the ins
// tags baked into index.html (pushed once at page load), it needs its own
// push(). But AdSense skips slots with zero layout width ("availableWidth=0"),
// and the person list can still be display:none at this point (e.g. the
// loader or a login page is up), so wait until the box actually has width.
function pushAdWhenVisible(adItem, attempt = 0) {
  if (adItem.offsetWidth > 0) {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (error) {
      console.error("❌ AdSense push failed:", error);
    }
  } else if (attempt < 40) {
    setTimeout(() => pushAdWhenVisible(adItem, attempt + 1), 250);
  }
}

// Guests never run loadListFromFirebase (it bails without a user), so give
// them the ad box in the person list too.
document.getElementById("ContinueasGuest").addEventListener("click", () => {
  addAdBox();
});
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

  if (oweToggle.checked) {
    currentListItem.setAttribute("data-status", "owesMe");
    amountInput.style.color = "rgb(73, 255, 97)";
  } else {
    currentListItem.setAttribute("data-status", "iOwe");
    amountInput.style.color = "rgb(255, 73, 73)";
  }

  saveListToFirebase();
});

const interestBox = document.getElementById("interestTitle");
if (!interestBox) {
  console.error("Element with ID 'interestTitle' not found.");
}

// Create and append toggle checkbox
const interestToggle = document.createElement("input");
interestToggle.type = "checkbox";
interestToggle.id = "interestToggle";
interestBox.appendChild(interestToggle);

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
document
  .getElementById("interestRange")
  .addEventListener("input", updateInterest);
document
  .getElementById("interestSelect")
  .addEventListener("change", updateInterest);

let debounceTimer;

function debounce(fn, delay) {
  return function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fn, delay);
  };
}

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
      amountSpan.textContent = settled.amount.toFixed(2);
      amountSpan.value = settled.amount.toFixed(2);
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


document.querySelectorAll("#closeEditMoney").forEach((button) => {
  button.addEventListener("click", function () {
    document.getElementById("editMoneyModal").style.display = "none";
  });
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

    const amountSpan = currentListItem.querySelector(".amount-input");
    const currentAmount = parseFloat(amountSpan.value) || 0;
    const newAmount = currentAmount + amountToAdd;

    amountSpan.value = newAmount.toFixed(2);
    amountSpan.innerHTML = newAmount.toFixed(2);
    saveListToFirebase();
    showToast(
      `Added $${amountToAdd.toFixed(2)} to ${currentListItem.querySelector(".name-span").textContent
      }.`
    );
    logUserAction(`Added $${amountToAdd.toFixed(2)} to ${currentListItem.querySelector(".name-span").textContent}`);

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

    const amountSpan = currentListItem.querySelector(".amount-input");
    const currentAmount = parseFloat(amountSpan.value) || 0;
    const newAmount = Math.max(0, currentAmount - amountToRemove);

    amountSpan.value = newAmount.toFixed(2);
    amountSpan.innerHTML = newAmount.toFixed(2);
    saveListToFirebase();
    showToast(
      `Removed $${amountToRemove.toFixed(2)} from ${currentListItem.querySelector(".name-span").textContent
      }.`
    );
    logUserAction(`Removed $${amountToRemove.toFixed(2)} from ${currentListItem.querySelector(".name-span").textContent}`);

    closeEditMoneyModal();
  });

document
  .getElementById("closeEditMoney")
  .addEventListener("click", closeEditMoneyModal);
const addInfoBtn = document.getElementById("add-info-btn");

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

      createExtraInfoElement(extraInfoContainer, extraInfo);
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

function createExtraInfoElement(container, text) {
  const extraInfoElement = document.createElement("div");
  extraInfoElement.classList.add("extra-info-item");

  // Create a span for the text
  const textSpan = document.createElement("span");
  textSpan.classList.add("extra-info-text");
  textSpan.textContent = text;
  extraInfoElement.appendChild(textSpan);

  const editExtraInfoBtn = document.createElement("button");
  editExtraInfoBtn.innerHTML = '<span class="material-icons">edit</span>';
  editExtraInfoBtn.classList.add("remove-info-btn");
  editExtraInfoBtn.id = "edit-info-btn";

  editExtraInfoBtn.addEventListener("click", () => {
    openEditExtraInfoModal(textSpan); // Pass only the textSpan!
  });

  const removeExtraBtn = document.createElement("button");
  removeExtraBtn.textContent = "x";
  removeExtraBtn.classList.add("remove-info-btn");

  removeExtraBtn.addEventListener("click", () => {
    extraInfoElement.remove();
    saveListToFirebase();
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

addPersonBtn.addEventListener("click", () => {
  document.getElementById("add-person-box-modal").style.display = "flex";
});
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
  const amount = hasMoney ? parseFloat(moneyRaw) : itemRaw;
  const extraInfo = hasMoney && itemRaw ? [{ text: itemRaw }] : [];

  addPerson(name, amount, extraInfo, undefined, false, true);
  saveListToFirebase();

  // Clear inputs and hide modal after adding
  nameInput.value = "";
  moneyInput.value = "";
  itemInput.value = "";
  logUserAction(`Added a tab for: ${name}`);

  document.getElementById("add-person-box-modal").style.display = "none";
});

document.getElementById("cancel").addEventListener("click", () => {
  document.getElementById("add-person-box-modal").style.display = "none";
});

// Load list when page loads
document.addEventListener("DOMContentLoaded", loadListFromFirebase);

document.getElementById("clear-list-btn").addEventListener("click", () => {
  document.getElementById("clear-list-modal").style.display = "flex";
});


document.getElementById("clear-list-cancel").addEventListener("click", () => {
  document.getElementById("clear-list-modal").style.display = "none";
})


const clearListBtn = document.getElementById("clearListBtn");
clearListBtn.addEventListener("click", async () => {
  if (peopleList.innerHTML === "") {
    showToast("The list is already empty.", "info");
    return;
  } else {
    peopleList.innerHTML = ""; // Clear the list
    saveListToFirebase();
    await logUserAction("Cleared people list");
    showToast("People list cleared successfully.", "success");
    document.getElementById("clear-list-modal").style.display = "none";

  }
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
document.getElementById("removeFriendBtn").addEventListener("click", async () => {
  if (!friendPendingRemoval) return;
  const { friendId, friendData } = friendPendingRemoval;

  await remove(
    ref(database, `users/${currentUser.uid}/friendsList/${friendId}`)
  );
  // Also drop the UID-keyed index entry so this ex-friend can no longer read
  // our phone number (friendData.userId is the friend's UID).
  if (friendData.userId) {
    await remove(
      ref(database, `users/${currentUser.uid}/friendUids/${friendData.userId}`)
    );
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
        friendItem.textContent = `${friendData.firstName} ${friendData.lastName} `;

        // Create a remove button (✖️)
        let removeButton = document.createElement("button");
        removeButton.textContent = "✖️";
        removeButton.style.marginLeft = "10px";
        removeButton.style.cursor = "pointer";
        removeButton.classList.add("remove-friend-from-list");
        removeButton.id = "RemoveButton";

        removeButton.onclick = () => {
          // Remember which friend this click was for, so the shared confirm
          // button (bound once, below) removes the right one instead of
          // whichever friend happened to render last.
          friendPendingRemoval = { friendId, friendData };

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
          '<span class="material-icons">playlist_add</span><span>Add to list</span>';
        friendAddButton.title = "Add this friend to your tab list";
        friendAddButton.onclick = () => {
          addPerson(
            `${friendData.firstName} ${friendData.lastName}`,
            0,
            [],
            undefined,
            true, // Add friend to person list, flagged so the row shows the friend icon
            true // animate in
          );
          showToast(
            `${friendData.firstName} has been added to your person list.`,
            "success"
          );
          windowClosed();
          saveListToFirebase();
          document.getElementById("addFriendModal").style.display = "none";
        };
        // Append the remove button to the friend item
        friendItem.appendChild(friendAddButton);
        friendItem.appendChild(removeButton);
        friendsListUl.appendChild(friendItem);
      });
    } else {
      friendsListUl.innerHTML = "<li>You have no friends added.</li>";
    }
  } catch (error) {
    console.error("❌ Error fetching friends list:", error);
    friendsListUl.innerHTML = "<li>Error loading friends list.</li>";
  }
}
document.getElementById('closeRemovefriend').addEventListener('click', () => {
  const RFModal = document.getElementById('RFModal');
  RFModal.style.display = "none";
});

// document.getElementById("RemovefriendModal").style.display = "flex";

// Call this function to populate the list when the page loads
window.onload = () => {
  populateFriendsList();
};
document.getElementById("pendingRequestsBtn").addEventListener("click", () => {
  document.getElementById("pendingRequestsModal").style.display = "flex";
  loadFriendRequests();
});

document
  .getElementById("closePendingRequests")
  .addEventListener("click", () => {
    document.getElementById("pendingRequestsModal").style.display = "none";
  });

async function getFriendCodeByUserId(userId) {
  const friendCodesRef = ref(database, "friendCodes");
  const snapshot = await get(friendCodesRef);

  if (snapshot.exists()) {
    const codes = snapshot.val();
    for (const [code, data] of Object.entries(codes)) {
      if (data.userId === userId) {
        return code;
      }
    }
  }
  return null;
}




export async function sendFriendRequest(friendUserId, friendData) {
  const db = getDatabase();

  const currentUserId = currentUser.uid;

  // Add a request to the friend's pending requests
  const theirPendingRef = ref(db, `users/${friendUserId}/pendingRequests/${currentUserId}`);
  const myProfileSnap = await get(ref(db, `users/${currentUserId}/profile`));
  const myProfile = myProfileSnap.val();

  await set(theirPendingRef, {
    fromUserId: currentUserId,
    firstName: myProfile.firstName,
    lastName: myProfile.lastName,
    friendCode: myProfile.friendCode,
    // Carried along so the recipient can store our number on their own
    // friendsList entry for us when they accept — that way SMS reminders read
    // the phone from their own subtree instead of cross-reading our profile.
    phoneNumber: myProfile.phoneNumber ?? null,
  });

  // Add a request to the current user's sent requests
  const mySentRef = ref(db, `users/${currentUserId}/sentRequests/${friendUserId}`);
  await set(mySentRef, {
    toUserId: friendUserId,
    firstName: friendData.firstName,
    lastName: friendData.lastName,
  });

  showToast("Friend request sent!", "success");
  logUserAction(`Sent friend request to ${friendData.firstName} ${friendData.lastName}`);
  addNotification(friendUserId, {
    type: "friend-request",
    message: `${myProfile.firstName} ${myProfile.lastName} sent you a friend request`,
  });
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
  if (incomingSnap.exists()) {
    const incoming = incomingSnap.val();
    Object.entries(incoming).forEach(([id, req]) => {
      if (req.type === "accepted") return; // handled by reconcile above
      const li = document.createElement("li");
      li.textContent = `${req.firstName} ${req.lastName} sent you a friend request`;

      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "✔️";
      acceptBtn.onclick = () => approveFriendRequest(id, req);

      const rejectBtn = document.createElement("button");
      rejectBtn.textContent = "❌";
      rejectBtn.onclick = async () => {
        await Promise.all([
          remove(ref(database, `users/${currentUser.uid}/pendingRequests/${id}`)),
          // Also clear it from the sender's sentRequests, otherwise they'd
          // see "request sent" forever with no way to know it was rejected.
          remove(ref(database, `users/${id}/sentRequests/${currentUser.uid}`)),
        ]);
        showToast("Request rejected.", "info");
        loadFriendRequests();
        updatePendingCount();
      };

      li.appendChild(acceptBtn);
      li.appendChild(rejectBtn);
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
      cancelBtn.onclick = async () => {
        await Promise.all([
          remove(ref(database, `users/${currentUser.uid}/sentRequests/${id}`)),
          // Also clear it from the recipient's pendingRequests, otherwise
          // they'd keep seeing a request that was already canceled.
          remove(ref(database, `users/${id}/pendingRequests/${currentUser.uid}`)),
        ]);
        showToast("Request canceled.", "info");
        loadFriendRequests();
        updatePendingCount();
      };

      li.appendChild(cancelBtn);
      list.appendChild(li);
    });
  }

  if (!incomingSnap.exists() && !outgoingSnap.exists()) {
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
    // sentRequest) on next load via reconcileAcceptedRequests().
    try {
      await set(
        ref(database, `users/${request.fromUserId}/pendingRequests/${currentUser.uid}`),
        { ...myInfo, fromUserId: currentUser.uid, type: "accepted" }
      );
    } catch (markerError) {
      console.error("❌ Could not leave acceptance marker:", markerError);
    }

    // Let the sender know, best-effort.
    addNotification(request.fromUserId, {
      type: "friend-accept",
      message: `${currentProfile.firstName} ${currentProfile.lastName} accepted your friend request!`,
    });

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
async function reconcileAcceptedRequests() {
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

// Function to check if the list is empty and show "No Friends Added"
function checkEmptyList() {
  const friendsList = document.getElementById("friendsList");
  if (friendsList.children.length === 0) {
    const noFriendsMessage = document.createElement("li");
    noFriendsMessage.id = "noFriendsMessage";
    noFriendsMessage.textContent = "No Friends Added";
    friendsList.appendChild(noFriendsMessage);
  }
}

// Run checkEmptyList on page load to show the message initially
document.addEventListener("DOMContentLoaded", checkEmptyList);

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
// Notifications live at users/{uid}/notifications and are written either by
// the user's own client (reminders, reconciled accepts) or best-effort by
// other users' clients (friend requests/accepts). A realtime listener keeps
// the bell badge and the notifications modal in sync and toasts anything
// that arrives while the app is open.
// ---------------------------------------------------------------------------

let latestNotifications = {};
let knownNotificationKeys = null;
let notificationPrefs = { enabled: true, friends: true, reminders: true };

function notificationAllowed(type) {
  if (!notificationPrefs.enabled) return false;
  if ((type === "friend-request" || type === "friend-accept") && !notificationPrefs.friends) return false;
  if (type === "sms-reminder" && !notificationPrefs.reminders) return false;
  return true;
}

// Best-effort delivery: writing into another user's node can be blocked by
// database rules, and a missed notification should never break the action
// that triggered it.
async function addNotification(targetUid, notification) {
  try {
    await push(ref(database, `users/${targetUid}/notifications`), {
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
        if (!knownNotificationKeys.has(key) && !notif.read && notificationAllowed(notif.type)) {
          showToast(notif.message, "success");
          // Someone just accepted our request — pull the acceptance marker
          // through immediately so their name appears in our friends list
          // without waiting for a reload.
          if (notif.type === "friend-accept") {
            reconcileAcceptedRequests().then(() => {
              populateFriendsList();
              updatePendingCount();
            });
          }
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

  const entries = Object.entries(latestNotifications).sort(
    ([, a], [, b]) => (b.timestamp || 0) - (a.timestamp || 0)
  );

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

    // Payment reminders get a shortcut to text the friend right away —
    // through Twilio when possible, otherwise the device's SMS composer.
    if (notif.type === "sms-reminder") {
      const textBtn = document.createElement("button");
      textBtn.classList.add("notification-action");
      textBtn.textContent = "Text now";
      textBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const body = notif.smsBody || notif.message;
        const sent = await sendReminderSmsViaTwilio(notif.friendUid, body);
        if (sent) {
          showToast("Reminder sent.", "success");
        } else {
          openSmsComposer(notif.phone, body);
        }
      });
      li.appendChild(textBtn);
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
  if (Object.keys(updates).length > 0) {
    update(ref(database, `users/${currentUser.uid}/notifications`), updates);
  }
});
document.getElementById("clearNotificationsBtn").addEventListener("click", async () => {
  if (!currentUser) return;
  await remove(ref(database, `users/${currentUser.uid}/notifications`));
  showToast("Notifications cleared.", "success");
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
}

async function saveNotificationPrefs() {
  notificationPrefs = {
    enabled: document.getElementById("notifEnabledToggle").checked,
    friends: document.getElementById("notifFriendsToggle").checked,
    reminders: document.getElementById("notifRemindersToggle").checked,
  };
  if (!currentUser) return;
  try {
    await set(
      ref(database, `users/${currentUser.uid}/settings/notifications`),
      notificationPrefs
    );
  } catch (error) {
    showToast("Could not save notification settings.", "error");
  }
}

["notifEnabledToggle", "notifFriendsToggle", "notifRemindersToggle"].forEach((id) => {
  document.getElementById(id).addEventListener("change", saveNotificationPrefs);
});
manageNotifications.addEventListener("click", () => {
  document.getElementById("notificationSettingsModal").style.display = "flex";
});
document.getElementById("closeNotificationSettings").addEventListener("click", () => {
  document.getElementById("notificationSettingsModal").style.display = "none";
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

function buildReminderMessage(name, amountText) {
  const firstName = name.split(" ")[0];
  const amount = parseFloat(amountText);
  const owed = !isNaN(amount) ? `$${amount.toFixed(2)}` : amountText;
  return `Hey ${firstName}, friendly reminder that you owe me ${owed} — tracked on TABS!`;
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
    ? `They owe you $${parseFloat(amountText).toFixed(2)}`
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
  const message = buildReminderMessage(name, amountText);
  const btn = document.getElementById("sendSmsNowBtn");

  btn.disabled = true;
  try {
    // Try to send it straight through Twilio (no leaving the app). Falls back
    // to the device's SMS composer if the function isn't set up or the friend
    // has no number on file.
    const sentAutomatically = await sendReminderSmsViaTwilio(friendUserId, message);
    if (sentAutomatically) {
      showToast(`Reminder texted to ${name}.`, "success");
      document.getElementById("smsReminderModal").style.display = "none";
    } else {
      openSmsComposer(phone, message);
    }
    logUserAction(`Sent an SMS reminder to ${name}`);

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

  if (!toggle.checked) {
    await remove(reminderRef);
    return;
  }

  const existing = await get(reminderRef);
  await set(reminderRef, {
    enabled: true,
    frequencyDays: parseInt(document.getElementById("autoRemindRange").value, 10),
    friendName: name,
    phone: phone ?? null,
    lastSent: existing.exists() ? existing.val().lastSent || Date.now() : Date.now(),
  });
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
      const frequencyMs = (reminder.frequencyDays || 7) * DAY_MS;
      if (now - (reminder.lastSent || 0) < frequencyMs) continue;

      await addNotification(currentUser.uid, {
        type: "sms-reminder",
        message: `Reminder: time to text ${reminder.friendName} about what they owe you.`,
        friendUid: friendUserId, // lets the "Text now" shortcut send via Twilio
        phone: reminder.phone ?? null,
        smsBody: `Hey ${String(reminder.friendName).split(" ")[0]}, friendly reminder that you still owe me — check TABS!`,
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



