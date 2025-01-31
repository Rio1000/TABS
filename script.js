const peopleList = document.getElementById('people-list');
const addPersonBtn = document.getElementById('add-person-btn');
const clearListBtn = document.getElementById('clear-list-btn');
document.addEventListener('DOMContentLoaded', () => {
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyA93Cfu5ehpOeZMCBKtiTvw1kJZZU_EvkE",
    authDomain: "tabs-4a0eb.firebaseapp.com",
    projectId: "tabs-4a0eb",
    storageBucket: "tabs-4a0eb.firebasestorage.app",
    messagingSenderId: "295362517303",
    appId: "1:295362517303:web:fbd0037e697eade181a2b2",
    measurementId: "G-Y9CWXD96D9"
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
});
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

function addPerson(name, amount) {
    const listItem = document.createElement('div');
    listItem.classList.add('personlist-item');

    // Container for name and amount
    const nameAmountContainer = document.createElement('div');
    nameAmountContainer.classList.add('name-amount-container');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.classList.add('name-span');

    const amountContainer = document.createElement('div');
    amountContainer.classList.add('amount-container');

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

    // Remove Button
    const removeBtn = document.createElement('a');
    removeBtn.textContent = 'X'; // X for remove button
    removeBtn.classList.add('remove-btn');
    removeBtn.addEventListener('click', () => {
        peopleList.removeChild(listItem);
        saveListToLocalStorage();
    });

    // More Button (Expand/Collapse)
    const addInfoBtn = document.createElement('button');
    addInfoBtn.textContent = "+";
    addInfoBtn.classList.add('add-info-btn');
    addInfoBtn.addEventListener('click', () => promptForExtraInfo(listItem)); // Trigger input for extra info
    listItem.appendChild(addInfoBtn);

    nameAmountContainer.appendChild(removeBtn);
    nameAmountContainer.appendChild(addInfoBtn);
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
function promptForExtraInfo(listItem) {
    const extraInfo = prompt("Enter extra information:");

    if (extraInfo) {
        // Create a new list item for the extra info
        const extraInfoElement = document.createElement('div');
        extraInfoElement.classList.add('extra-info-item');
        extraInfoElement.textContent = extraInfo;

        // Create a container for the extra info list (if it doesn't exist yet)
        let extraInfoContainer = listItem.querySelector('.extra-info-container');
        if (!extraInfoContainer) {
            extraInfoContainer = document.createElement('div');
            extraInfoContainer.classList.add('extra-info-container');
            listItem.appendChild(extraInfoContainer);
        }

        // Add the new extra info item to the container
        extraInfoContainer.appendChild(extraInfoElement);

        // Ensure that the text wraps correctly inside the extra-info-item
        extraInfoElement.style.wordWrap = 'break-word';  // Allow the text to wrap
    } else {
        alert('Information cannot be empty');
    }
}

// Event listener to add a person when the button is clicked
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
// Load list from local storage on page load
document.addEventListener('DOMContentLoaded', loadListFromLocalStorage);

function openLogin() {
   document.getElementById("Loginpage").style.display = "flex";
   document.getElementById("signupPage").style.display = "none";
   const personlist = document.getElementById("personlist");
   const subscript = document.getElementById("Subscript");
   const peopleList = document.getElementById("people-list");
   const addPersonBtn = document.getElementById("add-person-btn");
   const clearListBtn = document.getElementById("clear-list-btn");

   if (personlist) personlist.style.display = "none";
   if (subscript) subscript.style.display = "none";
   if (peopleList) peopleList.style.display = "none";
   if (addPersonBtn) addPersonBtn.style.display = "none";
   if (clearListBtn) clearListBtn.style.display = "none";

   closeNav();
}
function openSignUp() {
    document.getElementById("signupPage").style.display = "flex";
    document.getElementById("Loginpage").style.display = "none";
}


function windowClosed() {
    console.log("closed");

    // Hide Login and Signup pages
    const loginPage = document.getElementById("Loginpage");
    const signupPage = document.getElementById("signupPage");

    if (loginPage) loginPage.style.display = "none";
    if (signupPage) signupPage.style.display = "none";
    if (addPersonBtn) addPersonBtn.style.display = "flex";
    if (clearListBtn) clearListBtn.style.display = "flex";
    // Load the add window
    loadAddWindow();
}

function loadAddWindow() {
    // Show Person List and Subscript
    const personlist = document.getElementById("personlist");
    const subscript = document.getElementById("Subscript");
    const peopleList = document.getElementById("people-list");

    if (personlist) personlist.style.display = "flex";
    if (subscript) subscript.style.display = "flex";
    if (peopleList) peopleList.style.display = "block";
}

