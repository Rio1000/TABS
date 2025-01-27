const peopleList = document.getElementById('people-list');
const addPersonBtn = document.getElementById('add-person-btn');
const clearListBtn = document.getElementById('clear-list-btn');
const addFriendModal = document.getElementById('friendInputBox');
const container = document.querySelector('.container');
const currencySymbols = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    INR: "₹",
    AUD: "A$",
    CAD: "C$"
};

const currencySelect = document.createElement('select');
currencySelect.id = 'currencySelect';
Object.keys(currencySymbols).forEach(currency => {
    const option = document.createElement('option');
    option.value = currency;
    option.textContent = currency;
    currencySelect.appendChild(option);
});

// Default currency is USD
let selectedCurrency = 'USD';
currencySelect.value = selectedCurrency;

// Append the currency selector to the page (or a specific div)
document.body.appendChild(currencySelect);
function showModal(modal) {
    // Hide everything else on the screen
    container.style.opacity = '0';
    container.style.pointerEvents = 'none'; // Disable interactions with the main content
    modal.style.display = 'flex'; // Make the modal visible
    modal.style.opacity = '1';   // Ensure the modal is fully opaque
}

// Helper Function to Hide Modal
function hideModal(modal) {
    // Restore everything else on the screen
    container.style.opacity = '1';
    container.style.pointerEvents = 'auto'; // Re-enable interactions with the main content
    modal.style.display = 'none'; // Hide the modal
}
function addPerson(name, amount) {
    const listItem = document.createElement('div');
    listItem.classList.add('personlist-item');

    const nameAmountContainer = document.createElement('div');
    nameAmountContainer.classList.add('name-amount-container'); // Container for name and amount

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.classList.add('name-span');

    const amountContainer = document.createElement('div');
    amountContainer.classList.add('amount-container'); // Container for amount and currency symbol

    const currencySymbol = currencySymbols[selectedCurrency]; // Get symbol based on selected currency
    const dollarSpan = document.createElement('span');
    dollarSpan.textContent = currencySymbol; // Set the symbol based on currency
    dollarSpan.classList.add('dollar-sign');

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.placeholder = 'Enter amount...';
    amountInput.classList.add('amount-input');
    amountInput.value = amount || 0;

    amountInput.addEventListener('input', debounce(saveListToLocalStorage, 300));

    amountContainer.appendChild(dollarSpan);
    amountContainer.appendChild(amountInput);

    nameAmountContainer.appendChild(nameSpan);
    nameAmountContainer.appendChild(amountContainer);

    listItem.appendChild(nameAmountContainer);

    const removeBtn = document.createElement('a');
    removeBtn.textContent = 'X'; // X for remove button
    removeBtn.classList.add('remove-btn');
    removeBtn.addEventListener('click', () => {
        peopleList.removeChild(listItem);
        saveListToLocalStorage();
    });

    listItem.appendChild(removeBtn);
    peopleList.appendChild(listItem);
}

// Listen for currency change
currencySelect.addEventListener('change', (e) => {
    selectedCurrency = e.target.value;
    reloadListWithSelectedCurrency();
});

// Function to reload the list with the updated currency
function reloadListWithSelectedCurrency() {
    const peopleData = JSON.parse(localStorage.getItem('peopleList')) || [];
    peopleList.innerHTML = ''; // Clear the existing list

    peopleData.forEach(person => {
        addPerson(person.name, person.amount);
    });
}


addPersonBtn.addEventListener('click', () => {
    const name = prompt("Enter Person's Name:");
    if (!name || name.trim() === '') {
        alert('Name cannot be empty');
        return;
    }
    const amount = parseFloat(prompt("Enter Amount:"));
    if (isNaN(amount) || amount < 0) {
        alert('Please enter a valid amount');
        return;
    }
    addPerson(name, amount);
    saveListToLocalStorage();
});

clearListBtn.addEventListener('click', () => {
    peopleList.innerHTML = '';
    saveListToLocalStorage();
});

function saveListToLocalStorage() {
    const listItems = peopleList.querySelectorAll('.personlist-item');
    const peopleData = [];

    listItems.forEach(item => {
        const name = item.querySelector('.name-span').textContent;
        const amount = parseFloat(item.querySelector('.amount-input').value) || 0;
        peopleData.push({ name, amount });
    });

    localStorage.setItem('peopleList', JSON.stringify(peopleData));
    console.log('Data saved to local storage');
}

function loadListFromLocalStorage() {
    const peopleData = JSON.parse(localStorage.getItem('peopleList')) || [];
    peopleData.forEach(person => {
        addPerson(person.name, person.amount);
    });
    console.log('Data loaded from local storage');
}

function debounce(func, wait) {
    let timeout;
    return function(...args) { 
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
// Modal Event Listeners
document.getElementById('AddFriend').addEventListener('click', () => {
    showModal(addFriendModal); // Show the Add Friend modal
});

document.getElementById('Login').addEventListener('click', () => {
    showModal(loginModal); // Show the Login/Signup modal
});

// Event Listeners for Closing Modals
document.getElementById('closefriend').addEventListener('click', () => {
    hideModal(addFriendModal); // Hide the Add Friend modal
});

document.getElementById('Submit').addEventListener('click', () => {
    hideModal(loginModal); // Hide the Login modal after submission (if desired)
});
function openNav() {
    document.getElementById("mySidenav").style.width = "250px";
    document.getElementById("openButton").style.display = "none";
    document.getElementById("closeButton").style.display = "flex";
    document.getElementById("TITLE").style.opacity = "0.3";
    document.getElementById("add-person-btn").style.opacity = "0.3";
    document.getElementById("clear-list-btn").style.opacity = "0.3";
    document.getElementById("people-list").style.opacity = "0.3";
    document.getElementById("Subscript").style.opacity = "0.3";


  }
  
  function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
    document.getElementById("openButton").style.display = "flex";
    document.getElementById("TITLE").style.opacity = "1";
    document.getElementById("add-person-btn").style.opacity = "1";
    document.getElementById("clear-list-btn").style.opacity = "1";
    document.getElementById("people-list").style.opacity = "1";
    document.getElementById("Subscript").style.opacity = "1";

  }
// Optional: Dismiss modals when clicking outside
window.addEventListener('click', (event) => {
    if (event.target === addFriendModal) {
        hideModal(addFriendModal);
    } else if (event.target === loginModal) {
        hideModal(loginModal);
    }
});

// Firebase configuration
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// DOM Elements
const loginModal = document.getElementById('Loginpage');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginButton = document.getElementById('login-btn');
const signupButton = document.getElementById('signup-btn');
const logoutButton = document.getElementById('logout-btn');

// Show Modal for Login
document.getElementById('Login').addEventListener('click', () => {
    showModal(loginModal);
});

// Login Event
loginButton.addEventListener('click', async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        alert(`Welcome back, ${userCredential.user.email}!`);
        hideModal(loginModal);
    } catch (error) {
        alert(`Login failed: ${error.message}`);
    }
});

// Signup Event
signupButton.addEventListener('click', async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;

    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        alert(`Account created for ${userCredential.user.email}!`);
        hideModal(loginModal);
    } catch (error) {
        alert(`Signup failed: ${error.message}`);
    }
});

// Logout Event
logoutButton.addEventListener('click', async () => {
    try {
        await auth.signOut();
        alert("Logged out successfully.");
    } catch (error) {
        alert(`Logout failed: ${error.message}`);
    }
});

// Optional: Track Auth State
auth.onAuthStateChanged(user => {
    if (user) {
        console.log(`User logged in: ${user.email}`);
        logoutButton.style.display = 'block';
    } else {
        console.log('No user logged in');
        logoutButton.style.display = 'none';
    }
});


// Load list from local storage on page load
document.addEventListener('DOMContentLoaded', loadListFromLocalStorage);


