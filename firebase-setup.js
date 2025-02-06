// Firebase Setup
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-app.js";
import { getDatabase, ref, set, push, get, remove } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-database.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.6.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {

    apiKey: "AIzaSyA93Cfu5ehpOeZMCBKtiTvw1kJZZU_EvkE",
  
    authDomain: "tabs-4a0eb.firebaseapp.com",
  
    databaseURL: "https://tabs-4a0eb-default-rtdb.firebaseio.com",
  
    projectId: "tabs-4a0eb",
  
    storageBucket: "tabs-4a0eb.firebasestorage.app",
  
    messagingSenderId: "295362517303",
  
    appId: "1:295362517303:web:fbd0037e697eade181a2b2",
  
    measurementId: "G-Y9CWXD96D9"
  
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Reference to DOM elements
const peopleList = document.getElementById('people-list');
const addPersonBtn = document.getElementById('add-person-btn');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const signupEmail = document.getElementById('signup-email')
const signupPassword = document.getElementById('signup-password')
const loginButton = document.getElementById('login-btn');
const signupButton = document.getElementById('signup-btn');
const logoutButton = document.getElementById('logout-btn');
const loginSignup = document.getElementById('Login')

// Auth State Listener
let currentUser = null;
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log(`User logged in: ${user.email}`);
        logoutButton.style.display = 'block';
        loginSignup.style.display = 'none';
        loadListFromFirebase();
    } else {
        currentUser = null;
        console.log('No user logged in');
        logoutButton.style.display = 'none';
        loginSignup.style.display = 'block'
        peopleList.innerHTML = ""; // Clear UI when logged out
    }
});

// Login Event
loginButton.addEventListener('click', async () => {
    const email = loginEmail.value;
    const password = loginPassword.value;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        alert(`Welcome back, ${userCredential.user.email}!`);
    } catch (error) {
        alert(`Login failed: ${error.message}`);
    }
});

// Signup Event
signupButton.addEventListener('click', async () => {
    const email = signupEmail.value;
    const password = signupPassword.value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        alert(`Account created for ${userCredential.user.email}!`);
        hideModal();
    } catch (error) {
        alert(`Signup failed: ${error.message}`);
    }
});

// Logout Event
logoutButton.addEventListener('click', async () => {
    try {
        await signOut(auth);
        alert("Logged out successfully.");
        peopleList.innerHTML = ""; // Clear list on logout
    } catch (error) {
        alert(`Logout failed: ${error.message}`);
    }
});

// Save list to Firebase instead of localStorage
async function saveListToFirebase() {
    if (!currentUser) return;

    const listItems = peopleList.querySelectorAll('.personlist-item');
    const peopleData = [];

    listItems.forEach(item => {
        const name = item.querySelector('.name-span').textContent;
        const amount = parseFloat(item.querySelector('.amount-input').value) || 0;
        
        // Collect extra info elements
        let extraInfoElements = item.querySelectorAll('.extra-info-item');
        let extraInfoArray = [];
        extraInfoElements.forEach(infoElement => {
            extraInfoArray.push(infoElement.textContent);
        });

        peopleData.push({ name, amount, extraInfo: extraInfoArray });
    });

    try {
        await set(ref(database, `users/${currentUser.uid}/peopleList`), peopleData);
        console.log('Data saved to Firebase:', peopleData);
    } catch (error) {
        console.error('Error saving data:', error);
    }
}

// Load list from Firebase instead of localStorage
async function loadListFromFirebase() {
    if (!currentUser) return;

    try {
        const snapshot = await get(ref(database, `users/${currentUser.uid}/peopleList`));
        if (snapshot.exists()) {
            const peopleData = snapshot.val();
            peopleList.innerHTML = ''; // Clear existing list

            peopleData.forEach(person => {
                addPerson(person.name, person.amount, person.extraInfo);
            });
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
}

// Function to add a person to the list
function addPerson(name, amount, extraInfoArray = []) {
    const listItem = document.createElement('div');
    listItem.classList.add('personlist-item');

    const nameAmountContainer = document.createElement('div');
    nameAmountContainer.classList.add('name-amount-container');

    const nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.classList.add('name-span');

    const amountContainer = document.createElement('div');
    amountContainer.classList.add('amount-container');

    const dollarSpan = document.createElement('span');
    dollarSpan.textContent = currencySymbols[selectedCurrency]; 
    dollarSpan.classList.add('dollar-sign');

    const amountInput = document.createElement('input');
    amountInput.type = 'number';
    amountInput.placeholder = 'Enter amount...';
    amountInput.classList.add('amount-input');
    amountInput.value = amount || 0;

    amountInput.addEventListener('input', debounce(saveListToFirebase, 300));

    amountContainer.appendChild(dollarSpan);
    amountContainer.appendChild(amountInput);

    nameAmountContainer.appendChild(nameSpan);
    nameAmountContainer.appendChild(amountContainer);

    listItem.appendChild(nameAmountContainer);

    // Remove Button
    const removeBtn = document.createElement('a');
    removeBtn.textContent = 'X'; 
    removeBtn.classList.add('remove-btn');
    removeBtn.addEventListener('click', () => {
        peopleList.removeChild(listItem);
        saveListToFirebase();
    });

    // More Button (Expand/Collapse)
    const addInfoBtn = document.createElement('button');
    addInfoBtn.textContent = "+";
    addInfoBtn.classList.add('add-info-btn');
    addInfoBtn.addEventListener('click', () => promptForExtraInfo(listItem));

    nameAmountContainer.appendChild(removeBtn);
    nameAmountContainer.appendChild(addInfoBtn);
    peopleList.appendChild(listItem);

    // Restore extra info if available
    if (extraInfoArray.length > 0) {
        let extraInfoContainer = document.createElement('div');
        extraInfoContainer.classList.add('extra-info-container');
        extraInfoArray.forEach(info => {
            const extraInfoElement = document.createElement('div');
            extraInfoElement.classList.add('extra-info-item');
            extraInfoElement.textContent = info;
            extraInfoContainer.appendChild(extraInfoElement);
        });
        listItem.appendChild(extraInfoContainer);
    }
}

// Event listener to add a person
addPersonBtn.addEventListener('click', () => {
    const name = prompt("Enter Person's Name:");
    if (!name || name.trim() === '') {
        alert('Name cannot be empty');
        return;
    }
    
    const amountInput = prompt("Enter Amount:");
    const amount = parseFloat(amountInput.replace(/[^0-9.]/g, '')); 
    
    if (isNaN(amount)) {
        alert('Please enter a valid amount');
        return;
    }
    
    addPerson(name, amount);
    saveListToFirebase();
});

// Load list when page loads
document.addEventListener('DOMContentLoaded', loadListFromFirebase);
