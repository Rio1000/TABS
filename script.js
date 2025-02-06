const peopleList = document.getElementById("people-list");
const addPersonBtn = document.getElementById("add-person-btn");
const clearListBtn = document.getElementById("clear-list-btn");

document.addEventListener("DOMContentLoaded", () => {
  // Show Modal for Login
  document.getElementById("Login").addEventListener("click", () => {
    showModal(loginModal);
  });
});




const currencySymbols = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
};

const currencySelect = document.createElement("select");
currencySelect.id = "currencySelect";
Object.keys(currencySymbols).forEach((currency) => {
  const option = document.createElement("option");
  option.value = currency;
  option.textContent = currency;
  currencySelect.appendChild(option);
});

// Default currency is USD
let selectedCurrency = "USD";
currencySelect.value = selectedCurrency;

// Append the currency selector to the page (or a specific div)
document.body.appendChild(currencySelect);




// Listen for currency change
currencySelect.addEventListener("change", (e) => {
  selectedCurrency = e.target.value;
  reloadListWithSelectedCurrency();
});

// Function to reload the list with the updated currency
function reloadListWithSelectedCurrency() {
  const peopleData = JSON.parse(localStorage.getItem("peopleList")) || [];
  peopleList.innerHTML = ""; // Clear the existing list

  peopleData.forEach((person) => {
    addPerson(person.name, person.amount);
  });
}
function promptForExtraInfo(listItem) {
  const extraInfo = prompt("Enter extra information:");

  if (extraInfo) {
    const extraInfoElement = document.createElement("div");
    extraInfoElement.classList.add("extra-info-item");
    extraInfoElement.textContent = extraInfo;

    let extraInfoContainer = listItem.querySelector(".extra-info-container");
    if (!extraInfoContainer) {
      extraInfoContainer = document.createElement("div");
      extraInfoContainer.classList.add("extra-info-container");
      listItem.appendChild(extraInfoContainer);
    }

    extraInfoContainer.appendChild(extraInfoElement);

    // Save updated list to local storage
    saveListToLocalStorage();
  } else {
    alert("Information cannot be empty");
  }
}


function saveListToLocalStorage() {
  const listItems = peopleList.querySelectorAll(".personlist-item");
  const peopleData = [];

  listItems.forEach((item) => {
    const name = item.querySelector(".name-span").textContent;
    const amount = parseFloat(item.querySelector(".amount-input").value) || 0;

    // Collect extra info elements
    let extraInfoElements = item.querySelectorAll(".extra-info-item");
    let extraInfoArray = [];
    extraInfoElements.forEach((infoElement) => {
      extraInfoArray.push(infoElement.textContent);
    });

    peopleData.push({ name, amount, extraInfo: extraInfoArray });
  });

  localStorage.setItem("peopleList", JSON.stringify(peopleData));
  console.log("Data saved to local storage:", peopleData);
}

function loadListFromLocalStorage() {
  const peopleData = JSON.parse(localStorage.getItem("peopleList")) || [];
  peopleList.innerHTML = ""; // Clear existing list

  peopleData.forEach((person) => {
    const listItem = addPerson(person.name, person.amount);

    // Restore extra info
    if (person.extraInfo && person.extraInfo.length > 0) {
      person.extraInfo.forEach((info) => {
        const extraInfoElement = document.createElement("div");
        extraInfoElement.classList.add("extra-info-item");
        extraInfoElement.textContent = info;

        // Find or create an extra info container
        let extraInfoContainer = listItem.querySelector(
          ".extra-info-container"
        );
        if (!extraInfoContainer) {
          extraInfoContainer = document.createElement("div");
          extraInfoContainer.classList.add("extra-info-container");
          listItem.appendChild(extraInfoContainer);
        }

        extraInfoContainer.appendChild(extraInfoElement);
      });
    }
  });

  console.log("Data loaded from local storage:", peopleData);
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
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
document.addEventListener("DOMContentLoaded", loadListFromLocalStorage);

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
