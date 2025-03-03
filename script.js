const peopleList = document.getElementById("people-list");
const addPersonBtn = document.getElementById("add-person-btn");
const clearListBtn = document.getElementById("clear-list-btn");

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
  document.getElementById("TITLE").style.opacity = "0";
  document.getElementById("add-person-btn").style.opacity = "0";
  document.getElementById("clear-list-btn").style.opacity = "0";
  document.getElementById("people-list").style.opacity = "0";
  document.getElementById("Subscript").style.opacity = "1";
  document.getElementById("customModal").style.opacity = "0";
  document.getElementById("friendModal").style.opacity = "0"; 
}

function closeNav() {
  document.getElementById("mySidenav").style.width = "0";
  document.getElementById("openButton").style.display = "flex";
  document.getElementById("TITLE").style.opacity = "1";
  document.getElementById("add-person-btn").style.opacity = "1";
  document.getElementById("clear-list-btn").style.opacity = "1";
  document.getElementById("people-list").style.opacity = "1";
  document.getElementById("Subscript").style.opacity = "0";
  document.getElementById("customModal").style.opacity = "1";
  document.getElementById("friendModal").style.opacity = "1";

}
// Load list from local storage on page load

function openLogin() {
  document.getElementById("Loginpage").style.display = "flex";
  document.getElementById("signupPage").style.display = "none";
  const personlist = document.getElementById("personlist");
  const subscript = document.getElementById("Subscript");
  const peopleList = document.getElementById("people-list");
  const addPersonBtn = document.getElementById("add-person-btn");
  const clearListBtn = document.getElementById("clear-list-btn");
  const modal = document.getElementsByClassName("modal-content");

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


function openFriends() {
  document.getElementById("friendModal").style.display = "flex";
  closeNav();
}



window.onload = () => {
  loadAddWindow();
};