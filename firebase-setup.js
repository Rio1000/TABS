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
  child
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
// Function to show the modal

// Auth State Listener
let currentUser = null;
let currentListItem = null;

onAuthStateChanged(auth, (user) => {
  const loginPage = document.getElementById("Loginpage");
  const signupPage = document.getElementById("signupPage");
  const friendBox = document.getElementById("friendModal");
  const addPersonBtn = document.getElementById("addPersonBtn");
  const clearListBtn = document.getElementById("clearListBtn");

  if (user) {
    currentUser = user;
    console.log(`User logged in: ${user.email}`);

    logoutButton.style.display = "block";
    loginSignup.style.display = "none";

    // Load data only after authentication
    loadListFromFirebase();
    populateFriendsList();
    loadAddWindow();

    // Hide login/signup pages
    if (loginPage) loginPage.style.display = "none";
    if (signupPage) signupPage.style.display = "none";
    if (friendBox) friendBox.style.display = "none";

    // Show buttons if they exist
    if (addPersonBtn) addPersonBtn.style.display = "flex";
    if (clearListBtn) clearListBtn.style.display = "flex";
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


    // Hook up static profile fields
    const totalEl = document.getElementById("total");
    const totalFriendsEl = document.getElementById("total-friends");
    const lastLoginEl = document.getElementById("last-login");
    const createdEl = document.getElementById("account-created");

    const spendingRef = ref(database, `users/${user.uid}/spending`);

    // Check if spending data exists; if not, initialize it
    get(spendingRef).then((snapshot) => {
      if (!snapshot.exists()) {
        const initialSpending = Array(12).fill(0);
        set(spendingRef, initialSpending)
          .then(() => {
            console.log("Initialized empty spending data for existing user.");
          })
          .catch((err) => {
            console.error("Error creating spending data:", err);
          });
      }
    });
    spendingRef.once('value').then((snapshot) => {
      const data = snapshot.val();
      if (Array.isArray(data)) {
        const totalSpending = data.reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        if (totalEl) totalEl.innerText = `Total Amount: $${totalSpending.toFixed(2)}`;
      } else {
        if (totalEl) totalEl.innerText = `Total Amount: $0.00`;
      }
    });

    // 2. Total Friends (assumes `users/uid/friends` is an object)
    const friendsRef = ref(database, `users/${user.uid}/friends`);
    friendsRef.once('value').then((snapshot) => {
      const friends = snapshot.val();
      const totalFriends = friends ? Object.keys(friends).length : 0;
      if (totalFriendsEl) totalFriendsEl.innerText = `Total Friends: ${totalFriends}`;
    });

    // 3. Last Login & 4. Account Created — from Auth metadata
    user.reload().then(() => {
      const creationTime = new Date(user.metadata.creationTime).toLocaleString();
      const lastSignInTime = new Date(user.metadata.lastSignInTime).toLocaleString();

      if (lastLoginEl) lastLoginEl.innerText = `Last Login: ${lastSignInTime}`;
      if (createdEl) createdEl.innerText = `Account Created: ${creationTime}`;
    });




  } else {
    currentUser = null;
    console.log("No user logged in");

    logoutButton.style.display = "none";
    loginSignup.style.display = "flex";

    // Clear UI when logged out
    peopleList.innerHTML = "";

    // Reset UI elements if necessary
    if (addPersonBtn) addPersonBtn.style.display = "none";
    if (clearListBtn) clearListBtn.style.display = "none";
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
  console.log("FriendsTab clicked");
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
          person.interest
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
  try {
    const snapshot = await get(pendingRef);
    const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 0;
    const badge = document.getElementById("pendingCount");
    badge.textContent = count;
    badge.style.display = count > 0 ? "inline-block" : "none";
  } catch (error) {
    console.error("❌ Error updating pending count:", error);
  }
}

function addPerson(
  name,
  amount,
  extraInfoArray = [],
  interest = { enabled: false, rate: 0, period: "monthly" }
) {
  const listItem = document.createElement("div");
  listItem.classList.add("personlist-item");

  const nameAmountContainer = document.createElement("div");
  nameAmountContainer.classList.add("name-amount-container");

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name;
  nameSpan.classList.add("name-span");

  const amountContainer = document.createElement("div");
  amountContainer.classList.add("amount-container");

  const currencySelect = document.getElementById("currency-select");
  let selectedCurrency = currencySelect.value;
  const currencySymbols = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
  };
  const dollarSpan = document.createElement("span");
  dollarSpan.textContent = currencySymbols[selectedCurrency];
  dollarSpan.classList.add("dollar-sign");

  currencySelect.addEventListener("change", () => {
    selectedCurrency = currencySelect.value;
    dollarSpan.textContent = currencySymbols[selectedCurrency];
    addMoreMoneyBtn.innerHTML = `+ ${currencySymbols[selectedCurrency]}`;
    removeMoneyBtn.innerHTML = `- ${currencySymbols[selectedCurrency]}`;
    console.log("Selected currency:", selectedCurrency);
  });

  const amountSpan = document.createElement("span");
  amountSpan.classList.add("amount-input");
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
    peopleList.removeChild(listItem);
    saveListToFirebase();
    logUserAction(`Removed ${nameSpan.textContent}'s tab`);

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
  nameAmountContainer.appendChild(personItem);
  nameAmountContainer.appendChild(extraBox);

  peopleList.appendChild(listItem);
  listItem.dataset.interest = JSON.stringify(interest);
  listItem._dollarSpan = dollarSpan;
  listItem._amountContainer = amountContainer;

  return listItem;

}
function addAdBox() {
  const adItem = document.createElement("div");
  adItem.classList.add("personlist-item", "ad-box");
  adItem.style.justifyContent = "center";
  adItem.style.background = "rgba(255, 255, 255, 0.05)"; // Subtly different background

  // Placeholder for your Ad Code
  adItem.innerHTML = `
    <div style="text-align: center; font-size: 12px; color: #888;">
      <p style="margin: 0;">ADVERTISEMENT</p>
      <div id="ad-container" style="display: flex; align-items: center; justify-content: center;">
         <span style="opacity: 0.5;">Support Tabs <a href="https://buymeacoffee.com/TABSonFriends" style="color: #3c94e7;">here</a></span>
      </div>
    </div>
  `;

  peopleList.appendChild(adItem);
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

// Ensure these buttons are created only once
const btnContainer = document.getElementById("btn-container");

// Create buttons only if they don't exist
if (!document.getElementById("IOBtn")) {
  const IOBtn = document.createElement("button");
  IOBtn.id = "IOBtn";
  IOBtn.textContent = "I Owe";
  btnContainer.appendChild(IOBtn);
  IOBtn.addEventListener("click", IOwe);
}

if (!document.getElementById("UOBtn")) {
  const UOBtn = document.createElement("button");
  UOBtn.id = "UOBtn";
  UOBtn.textContent = "Owed";
  btnContainer.appendChild(UOBtn);
  UOBtn.addEventListener("click", UOwe);
}

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

interestToggle.addEventListener("change", () => {
  console.log("Interest toggle changed:", interestToggle.checked);




  rateLabel.innerHTML = '<span class="rate">0</span>%';
  interestRange.value = 0;
  enableInterestForPerson();
});

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

function openModal(listItem) {
  currentListItem = listItem;
  const interest = JSON.parse(listItem.dataset.interest);

  // Update interest controls
  document.getElementById("interestToggle").checked = interest.enabled;
  document.getElementById("interestRange").value = interest.rate;
  document.getElementById("interestSelect").value = interest.period;

  // Update UI
  const interestContainer = document.getElementById("interest-container");
  const interestRangeContainer = document.getElementById(
    "interest-range-container"
  );
  interestContainer.style.height = interest.enabled ? "130px" : "34px";
  interestRangeContainer.style.opacity = interest.enabled ? 1 : 0;
  interestRangeContainer.style.display = interest.enabled ? "flex" : "none";
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

function updateInterest() {
  if (!currentListItem) return;

  const now = Date.now();
  const interest = {
    enabled: document.getElementById("interestToggle").checked,
    rate: parseFloat(document.getElementById("interestRange").value),
    period: document.getElementById("interestSelect").value,
    lastInterestApplied: now, // ✅ Ensure lastInterestApplied is stored
  };

  currentListItem.dataset.interest = JSON.stringify(interest);
  saveListToFirebase(); // ✅ Ensure data is saved properly in Firebase
}

// Function to apply interest to all people in the list
// Function to apply interest to all people in the list
// Function to apply interest to all people in the list
// Function to apply interest to all people in the list
// Function to apply interest to all people in the list
async function applyInterestToAll() {
  if (!currentUser) return;

  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/peopleList/peopleData`)
    );
    if (snapshot.exists()) {
      const peopleData = snapshot.val();

      Object.entries(peopleData).forEach(([key, person]) => {
        const interest = person.interest || {
          enabled: false,
          rate: 0,
          period: "monthly",
          lastInterestApplied: Date.now(),
        };

        if (interest.enabled) {
          const currentAmount = person.amount || 0;
          const interestRate = interest.rate / 100;
          let compoundingFrequency = 1;

          switch (interest.period) {
            case "weekly":
              compoundingFrequency = 52;
              break;
            case "monthly":
              compoundingFrequency = 12;
              break;
            case "quarterly":
              compoundingFrequency = 4;
              break;
            case "yearly":
              compoundingFrequency = 1;
              break;
          }

          const now = Date.now();
          const lastApplied = interest.lastInterestApplied || now;
          const timeElapsed = (now - lastApplied) / (1000 * 60 * 60 * 24 * 365); // Convert ms to years

          if (timeElapsed > 0) {
            // Compound Interest Formula: A = P * (1 + r/n)^(n*t)
            const newAmount =
              currentAmount *
              Math.pow(
                1 + interestRate / compoundingFrequency,
                compoundingFrequency * timeElapsed
              );
            const interestAmount = newAmount - currentAmount; // Interest gained

            // ✅ Update person with new amount and last interest applied timestamp
            update(
              ref(
                database,
                `users/${currentUser.uid}/peopleList/peopleData/${key}`
              ),
              {
                amount: newAmount,
                interest: {
                  ...interest,
                  lastInterestApplied: now, // ✅ Update timestamp to prevent double application
                },
              }
            )
              .then(() => {
                console.log(
                  `✅ Interest applied for person at index ${key}: +${interestAmount.toFixed(
                    2
                  )}`
                );
              })
              .catch((error) => {
                console.error(
                  `❌ Error updating person at index ${key}:`,
                  error
                );
              });
          }
        }
      });
    }
  } catch (error) {
    console.error("❌ Error applying interest:", error);
  }
}


function enableInterestForPerson(index, personName, rate = 5, period = "monthly") {
  const now = Date.now();
  personName = currentListItem.querySelector(".name-span").textContent;
  const interestRef = ref(
    database,
    `users/${currentUser.uid}/peopleList/peopleData/${index}/interest`
  );
  update(interestRef, {
    enabled: true,
    rate: rate,
    period: period,
    lastInterestApplied: now, // ✅ Ensure this is always saved
  })
    .then(() => {
      console.log(`✅ Interest enabled for person at index ${index}`);
      logUserAction(`Enabled interest for ${personName} at (${rate}% ${period})`);

    })
    .catch((error) => {
      console.error("❌ Error enabling interest:", error);
    });
}

// Call this function when the page loads
document.addEventListener("DOMContentLoaded", applyInterestToAll);
document
  .getElementById("interestToggle")
  .addEventListener("change", applyInterestToAll);
document
  .getElementById("interestRange")
  .addEventListener("input", applyInterestToAll);
document
  .getElementById("interestSelect")
  .addEventListener("change", applyInterestToAll);

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

function UOwe() {
  if (!currentListItem) return;
  const status = currentListItem.getAttribute("data-status");
  const amountInput = currentListItem.querySelector(".amount-input");
  const Ibtn = currentListItem.querySelector("#UOBtn");
  const Ubtn = currentListItem.querySelector("#IOBtn");

  if (status === "owesMe") {
    currentListItem.removeAttribute("data-status");
    amountInput.style.color = "";
    if (Ibtn) Ibtn.classList.remove("active");
  } else {
    currentListItem.setAttribute("data-status", "owesMe");
    amountInput.style.color = "rgb(73, 255, 97)";
    if (Ibtn) Ibtn.classList.add("active");
    if (Ubtn) Ubtn.classList.remove("active");
  }

  saveListToFirebase();
  document.getElementById("customModal").style.display = "none";
}

function IOwe() {
  if (!currentListItem) return;
  const status = currentListItem.getAttribute("data-status");
  const amountInput = currentListItem.querySelector(".amount-input");
  const Ubtn = currentListItem.querySelector("#IOBtn");
  const Ibtn = currentListItem.querySelector("#UOBtn");

  if (status === "iOwe") {
    currentListItem.removeAttribute("data-status");
    amountInput.style.color = "";
    if (Ubtn) Ubtn.classList.remove("active");
  } else {
    currentListItem.setAttribute("data-status", "iOwe");
    amountInput.style.color = "rgb(255, 73, 73)";
    if (Ubtn) Ubtn.classList.add("active");
    if (Ibtn) Ibtn.classList.remove("active");
  }

  saveListToFirebase();
  document.getElementById("customModal").style.display = "none";
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
  const amountInput = document.getElementById("amount-input");

  const name = nameInput.value.trim();
  const amountRaw = amountInput.value.trim();

  if (!name) {
    showToast("Name cannot be empty", "error");
    return;
  }

  if (!amountRaw) {
    showToast("Amount cannot be empty", "error");
    return;
  }

  // Use the raw input as-is, whether it's a number or string
  const amount = isNaN(amountRaw) ? amountRaw : parseFloat(amountRaw);

  addPerson(name, amount);
  saveListToFirebase();

  // Clear inputs and hide modal after adding
  nameInput.value = "";
  amountInput.value = "";
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
          console.log("Remove button clicked for", friendData.firstName);

          const RFModal2 = document.getElementById("RFModal");
          if (RFModal2) {
            RFModal2.style.display = "flex";
            console.log("RFModal2 should now be visible.");
          } else {
            console.error("RFModal2 not found in DOM!");
          }
        };


        const removeConfirmButton = document.getElementById("removeFriendBtn");
        removeConfirmButton.onclick = async () => {
          await remove(
            ref(database, `users/${currentUser.uid}/friendsList/${friendId}`)
          );
          showToast(
            `${friendData.firstName} has been removed from your friends list.`,
            "info"
          );
          await logUserAction(`Removed friend: ${friendData.firstName} ${friendData.lastName}`);

          populateFriendsList(); // Refresh list after removal
          RFModal2.style.display = "none";
        };

        const friendAddButton = document.createElement("button");
        friendAddButton.classList.add("add-friend-to-list");
        friendAddButton.textContent = "➕";
        friendAddButton.style.marginLeft = "10px";
        friendAddButton.style.cursor = "pointer";
        friendAddButton.style.backgroundColor = " #3c94e7";
        friendAddButton.onclick = () => {
          addPerson(`${friendData.firstName} ${friendData.lastName}`, 0); // Add friend to person list
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
}


async function loadFriendRequests() {
  const list = document.getElementById("pendingRequestsList");
  list.innerHTML = "";

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
      const li = document.createElement("li");
      li.textContent = `${req.firstName} ${req.lastName} sent you a friend request`;

      const acceptBtn = document.createElement("button");
      acceptBtn.textContent = "✔️";
      acceptBtn.onclick = () => approveFriendRequest(id, req);

      const rejectBtn = document.createElement("button");
      rejectBtn.textContent = "❌";
      rejectBtn.onclick = async () => {
        await remove(
          ref(database, `users/${currentUser.uid}/pendingRequests/${id}`)
        );
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
        await remove(
          ref(database, `users/${currentUser.uid}/sentRequests/${id}`)
        );
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
    // Add to current user's friend list
    const userFriendRef = ref(database, `users/${currentUser.uid}/friendsList`);
    await set(push(userFriendRef), {
      userId: request.fromUserId,
      firstName: request.firstName,
      lastName: request.lastName,
      friendCode: request.friendCode,
    });

    // Add current user to their friends list
    const profileSnapshot = await get(
      ref(database, `users/${currentUser.uid}/profile`)
    );
    const currentProfile = profileSnapshot.val();

    const otherFriendRef = ref(
      database,
      `users/${request.fromUserId}/friendsList`
    );
    await set(push(otherFriendRef), {
      userId: currentUser.uid,
      firstName: currentProfile.firstName,
      lastName: currentProfile.lastName,
      friendCode: currentProfile.friendCode,
    });

    // Also remove from the sender's sent requests list
    await remove(
      ref(database, `users/${request.fromUserId}/sentRequests/${currentUser.uid}`)
    );

    // Remove pending request
    await remove(
      ref(database, `users/${currentUser.uid}/pendingRequests/${requestId}`)
    );

    showToast(
      `${request.firstName} has been added to your friends list!`,
      "success"
    );
    populateFriendsList();
    loadFriendRequests();
  } catch (error) {
    console.error("❌ Error approving friend:", error);
    showToast(`Error approving friend: ${error.message}`, "error");
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
  if (addPersonBtn) addPersonBtn.style.display = "flex";
  if (clearListBtn) clearListBtn.style.display = "flex";
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
  if (addPersonBtn) addPersonBtn.style.display = "flex";
  if (clearListBtn) clearListBtn.style.display = "flex";
  if (friendBox) friendBox.style.display = "none";
}

function loadAddWindow() {
  // Show Person List and Subscript
  const personlist = document.getElementById("personlist");
  const subscript = document.getElementById("Subscript");
  const peopleList = document.getElementById("people-list");

  if (personlist) personlist.style.display = "flex";
  if (subscript) subscript.style.display = "flex";
  if (peopleList) peopleList.style.display = "flex";
}

var slider = document.getElementById("interestRange");
var output = document.getElementById("rate");
output.innerHTML = slider.value + "%";

slider.oninput = function () {
  output.innerHTML = this.value + "%";
};
// Get a reference to the user's profile data



