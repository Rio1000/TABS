// Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  push,
  get,
  remove,
} from "https://www.gstatic.com/firebasejs/10.6.0/firebase-database.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
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
    duration: 3000,
    close: true,
    gravity: "top",
    position: "right",
    className: type === "error" ? "toastify toastify-error" : "toastify toastify-success", // Set class dynamically
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

const addMoreMoneyBtn = document.getElementById("add-more-money-btn");
const addExtraInfoBtn = document.getElementById("add-extra-info-btn");
const closePrompt = document.getElementById("close-prompt");
const removeMoneyBtn = document.getElementById("remove-money-btn");
// Function to show the modal

// Auth State Listener
let currentUser = null;
let currentListItem = null;
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    console.log(`User logged in: ${user.email}`);
    logoutButton.style.display = "block";
    loginSignup.style.display = "none";
    loadListFromFirebase();
    windowClosed();
  } else {
    currentUser = null;
    console.log("No user logged in");
    logoutButton.style.display = "none";
    loginSignup.style.display = "block";
    peopleList.innerHTML = ""; // Clear UI when logged out
  }
});

// Login Event
loginButton.addEventListener("click", async () => {
  const email = loginEmail.value;
  const password = loginPassword.value;



  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );
    showToast(`Welcome back, ${userCredential.user.email}!`);
  } catch (error) {
    showToast(`Login failed: ${error.message}`, "error");
  }
});

// Signup Event
// Signup Event
// Helper function to generate a unique friend code
function generateFriendCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase(); // Example: 'A1B2C3D4'
}

signupButton.addEventListener("click", async () => {
  const email = signupEmail.value;
  const password = signupPassword.value;
  const nameFirst = signupNameFirst.value;
  const nameLast = signupNameLast.value;
  const number = signupNumber.value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Generate a unique friend code
    const friendCode = generateFriendCode();

    // Save additional user info along with friend code to Realtime Database
    await set(ref(database, `users/${user.uid}/profile`), {
      firstName: nameFirst,
      lastName: nameLast,
      phoneNumber: number,
      email: email,
      friendCode: friendCode, // Save friend code
    });

    // Make friend code accessible outside the signup function
    window.userFriendCode = friendCode; // Store in a global variable for external use

    showToast(`Account created for ${user.email}! `);
  } catch (error) {
    showToast(`Signup failed: ${error.message}`, "error");
  }
});




// Logout Event
logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
    showToast("Logged out successfully.");
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
    const name = item.querySelector(".name-span").textContent;
    const amount = parseFloat(item.querySelector(".amount-input").value) || 0;

    // Extract extra information
    let extraInfoElements = item.querySelectorAll(".extra-info-item");
    let extraInfoArray = [];

    extraInfoElements.forEach((infoElement) => {
      // Get the text content of the span inside the extra-info-item
      const textSpan = infoElement.querySelector("span");
      const text = textSpan ? textSpan.textContent.trim() : "";

      if (text) {
        // Ensure text is defined and not empty
        extraInfoArray.push({ text, hasRemoveBtn: true });
      }
    });

    peopleData.push({ name, amount, extraInfo: extraInfoArray });
  });

  try {
    await set(ref(database, `users/${currentUser.uid}/peopleList`), peopleData);
    console.log("✅ Data saved to Firebase:", peopleData);
  } catch (error) {
    console.error("❌ Error saving data:", error);
  }
}
// Load list from Firebase instead of localStorage
async function loadListFromFirebase() {
  if (!currentUser) return;

  try {
    const snapshot = await get(
      ref(database, `users/${currentUser.uid}/peopleList`)
    );
    if (snapshot.exists()) {
      const peopleData = snapshot.val();
      peopleList.innerHTML = ""; // Clear the list before loading

      Object.values(peopleData).forEach((person) => {
        const extraInfoArray = person.extraInfo ? person.extraInfo : [];
        addPerson(person.name, person.amount, extraInfoArray); // Pass extra info
      });
    }
  } catch (error) {
    console.error("❌ Error loading data:", error);
  }
}

// Function to add a person to the list
function addPerson(name, amount, extraInfoArray = []) {
  const listItem = document.createElement("div");
  listItem.classList.add("personlist-item");

  const nameAmountContainer = document.createElement("div");
  nameAmountContainer.classList.add("name-amount-container");

  const nameSpan = document.createElement("span");
  nameSpan.textContent = name;
  nameSpan.classList.add("name-span");

  const amountContainer = document.createElement("div");
  amountContainer.classList.add("amount-container");

  const dollarSpan = document.createElement("span");
  dollarSpan.textContent = currencySymbols[selectedCurrency];
  dollarSpan.classList.add("dollar-sign");

  const amountSpan = document.createElement("span");
  amountSpan.textContent = amount.toFixed(2);
  amountSpan.classList.add("amount-input");
  amountSpan.value = amount || 0;

  amountSpan.addEventListener("input", debounce(saveListToFirebase, 300));

  amountContainer.appendChild(dollarSpan);
  amountContainer.appendChild(amountSpan);

  nameAmountContainer.appendChild(nameSpan);
  nameAmountContainer.appendChild(amountContainer);

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
  removeBtn.textContent = "X";
  removeBtn.classList.add("remove-btn");
  removeBtn.addEventListener("click", () => {
    peopleList.removeChild(listItem);
    saveListToFirebase();
  });

  // More Button (Expand/Collapse)
  const addInfoBtn = document.createElement('button');
  addInfoBtn.innerHTML = '<span class="material-symbols-outlined">more_horiz</span>';  
  addInfoBtn.classList.add('add-info-btn');
  addInfoBtn.addEventListener('click', () => openModal(listItem)); // Pass the specific listItem

  nameAmountContainer.appendChild(removeBtn);
  nameAmountContainer.appendChild(addInfoBtn);
  peopleList.appendChild(listItem);
}



addMoreMoneyBtn.addEventListener("click", () => {
  addMoreMoney();
});
removeMoneyBtn.addEventListener("click", () => {
  removeMoney();
})


function openModal(listItem) {
    currentListItem = listItem; // Set the current list item
    document.getElementById("customModal").style.display = "flex";
  }



  function addMoreMoney() {
    if (!currentListItem) return; // Ensure there's a selected list item
  
    const addMoneyInput = prompt("Enter amount to add:");
    if (!addMoneyInput || isNaN(parseFloat(addMoneyInput))) {
      showToast("Please enter a valid amount.", "error");
      return;
    }
  
    const amountToAdd = parseFloat(addMoneyInput);
    const amountSpan = currentListItem.querySelector(".amount-input");
    const currentAmount = parseFloat(amountSpan.value) || 0;
  
    const newAmount = currentAmount + amountToAdd;
    amountSpan.value = newAmount.toFixed(2); // Update the amount in the UI
    amountSpan.innerHTML = newAmount.toFixed(2);
    saveListToFirebase(); // Save the updated amount to Firebase
    showToast(`Added $${amountToAdd.toFixed(2)} to ${currentListItem.querySelector(".name-span").textContent}.`);
  
    document.getElementById("customModal").style.display = "none"; // Close the modal
  }

  function removeMoney() {
    if (!currentListItem) return; // Ensure there's a selected list item
  
    const removeMoneyAmount = prompt("Enter amount to add:");
    if (!removeMoneyAmount || isNaN(parseFloat(removeMoneyAmount))) {
      showToast("Please enter a valid amount.", "error");
      return;
    }
  
    const amountToAdd = parseFloat(removeMoneyAmount);
    const amountSpan = currentListItem.querySelector(".amount-input");
    const currentAmount = parseFloat(amountSpan.value) || 0;
  
    const newAmount = currentAmount - amountToAdd;
    amountSpan.value = newAmount.toFixed(2); // Update the amount in the UI
    amountSpan.innerHTML = newAmount.toFixed(2);
    saveListToFirebase(); // Save the updated amount to Firebase
    showToast(`Removed $${amountToAdd.toFixed(2)} to ${currentListItem.querySelector(".name-span").textContent}.`);
  
    document.getElementById("customModal").style.display = "none"; // Close the modal
  }
// Event listener for the "Edit Name" button
const editNameBtn = document.getElementById("edit-name-btn");

editNameBtn.addEventListener("click", () => {
  if (currentListItem) {
    editName(currentListItem);
  }
  document.getElementById("customModal").style.display = "none"; // Close the modal
});

// Function to edit a person's name
function editName(listItem) {
  const currentName = listItem.querySelector(".name-span").textContent;
  const newName = prompt("Edit name:", currentName);

  if (newName && newName.trim() !== "" && newName !== currentName) {
    const nameSpan = listItem.querySelector(".name-span");
    nameSpan.textContent = newName.trim(); // Update the name in the UI
    saveListToFirebase(); // Save the updated name to Firebase
    showToast("Name updated successfully.");
  } else if (newName === null || newName.trim() === "") {
    showToast("Name cannot be empty.", "error");
  } else {
    showToast("No changes were made.", "info");
  }
}

closePrompt.addEventListener("click", () => {
    handleResponse();
})




addExtraInfoBtn.addEventListener('click', () => {
    if (currentListItem) {
      promptForExtraInfo(currentListItem);
    }
    document.getElementById("customModal").style.display = "none";
  });
  function handleResponse() {
    document.getElementById("customModal").style.display = "none";
    currentListItem = null; // Clear the reference when closing
  }

function promptForExtraInfo(listItem) {
  const extraInfo = prompt("Enter extra information:");

  if (extraInfo) {
    let extraInfoContainer = listItem.querySelector(".extra-info-container");
    if (!extraInfoContainer) {
      extraInfoContainer = document.createElement("div");
      extraInfoContainer.classList.add("extra-info-container");
      listItem.appendChild(extraInfoContainer);
    }

    createExtraInfoElement(extraInfoContainer, extraInfo);
    saveListToFirebase();
    showToast("Extra info added.");
  } else {
    showToast("Information cannot be empty", "error");
  }
}

function createExtraInfoElement(container, text) {
  const extraInfoElement = document.createElement("div");
  extraInfoElement.classList.add("extra-info-item");

  // Create a span for the text
  const textSpan = document.createElement("span");
  textSpan.textContent = text; // Store only the text in the span
  extraInfoElement.appendChild(textSpan);

  // Create the remove button
  const removeExtraBtn = document.createElement("button");
  removeExtraBtn.textContent = "x";
  removeExtraBtn.classList.add("remove-info-btn");

  // Add event listener to remove the extra info item
  removeExtraBtn.addEventListener("click", () => {
    extraInfoElement.remove();
    saveListToFirebase(); // Save updated list
  });

  // Append the remove button to the extraInfoElement
  extraInfoElement.appendChild(removeExtraBtn);

  // Append the extraInfoElement to the container
  container.appendChild(extraInfoElement);
}

// Event listener to add a person
addPersonBtn.addEventListener("click", () => {
  const name = prompt("Enter Person's Name:");
  if (!name || name.trim() === "") {
    alert("Name cannot be empty");
    return;
  }

  const amountInput = prompt("Enter Amount:");
  let amount = parseFloat(amountInput.replace(/[^0-9.]/g, ""));

  if (isNaN(amount)) {
    alert("Please enter a valid amount");
    return;
  }
  addPerson(name, amount);
  saveListToFirebase();
});

// Load list when page loads
document.addEventListener("DOMContentLoaded", loadListFromFirebase);

const clearListBtn = document.getElementById("clear-list-btn");
// Event listener to clear the list
clearListBtn.addEventListener("click", () => {
  if (confirm("Do you want to proceed?")) {
    peopleList.innerHTML = ""; // Clear the list
    saveListToFirebase(); // Save updated list  } else {
    console.log("User clicked No");
  }
  
});