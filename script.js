const peopleList = document.getElementById("people-list");
const addPersonBtn = document.getElementById("add-person-btn");
const clearListBtn = document.getElementById("clear-list-btn");




// Listen for currency change




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
  document.getElementById("customModal").style.opacity = "0";
  document.getElementById("friendModal").style.opacity = "0";
  document.getElementById("ProfileModal").style.opacity = "0";
  document.getElementById("adsModal").style.opacity = "0";
  }

function closeNav() {
  document.getElementById("mySidenav").style.width = "0";
  document.getElementById("openButton").style.display = "flex";
  document.getElementById("TITLE").style.opacity = "1";
  document.getElementById("add-person-btn").style.opacity = "1";
  document.getElementById("clear-list-btn").style.opacity = "1";
  document.getElementById("people-list").style.opacity = "1";
  document.getElementById("customModal").style.opacity = "1";
  document.getElementById("friendModal").style.opacity = "1";
  document.getElementById("ProfileModal").style.opacity = "1";
  document.getElementById("adsModal").style.opacity = "1";

}
// Load list from local storage on page load
document.getElementById("Login").addEventListener("click", function() { 
  document.getElementById("ProfileBox").style.display = "none";
  document.getElementById("ProfileModal").style.display = "none";
}); 
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


function openFriends() {
  document.getElementById("friendModal").style.display = "flex";
  document.getElementById("ProfileModal").style.display = "none";
  closeNav();
}
document.getElementById("Profile").addEventListener("click", () => {
  console.log("Profile clicked");
  document.getElementById("ProfileModal").style.display = "flex";
  document.getElementById("ProfileBox").style.display = "flex";
  document.getElementById("ProfileModal").style.opacity = "1";
  closeNav();
});
document.getElementById("closeProfile").addEventListener("click", () => {
  document.getElementById("ProfileModal").style.display = "none";
})
function closeFriends() {
  document.getElementById("friendModal").style.display = "none";
}
function closeModal() {
  document.getElementById("customModal").style.display = "none";
}
document.getElementById("close-prompt").addEventListener("click", () => {
  document.getElementById("customModal").style.display = "none";
});

document.getElementById("Ads").addEventListener("click", () => {
  document.getElementById("adsModal").style.display = "flex";
  closeNav();
});
function moreinfo() {
  document.getElementById("myDropdown").classList.toggle("show");
}
// After adding a new personlist-item
peopleList.scrollTop = peopleList.scrollHeight;


// Close the dropdown menu if the user clicks outside of it
window.onclick = function(event) {
  if (!event.target.matches('.dropbtn')) {
    var dropdowns = document.getElementsByClassName("dropdown-content");
    var i;
    for (i = 0; i < dropdowns.length; i++) {
      var openDropdown = dropdowns[i];
      if (openDropdown.classList.contains('show')) {
        openDropdown.classList.remove('show');
      }
    }
  }
} 
function openSignup() {
  document.getElementById("signupPage").style.display = "flex";
  document.getElementById("Loginpage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "none";
}
document.getElementById("Back-btn").addEventListener("click", () => {
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "flex";
  document.getElementById("Loginpage").style.display = "none";
  const personlist = document.getElementById("personlist");
  const peopleList = document.getElementById("people-list");
  const addPersonBtn = document.getElementById("add-person-btn");
  const clearListBtn = document.getElementById("clear-list-btn");
  if (personlist) personlist.style.display = "none";
  if (peopleList) peopleList.style.display = "none";
  if (addPersonBtn) addPersonBtn.style.display = "none";
  if (clearListBtn) clearListBtn.style.display = "none";
});
document.getElementById("Back-btn2").addEventListener("click", () => {
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("Loginpage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "flex";
  const personlist = document.getElementById("personlist");
  const peopleList = document.getElementById("people-list");
  const addPersonBtn = document.getElementById("add-person-btn");
  const clearListBtn = document.getElementById("clear-list-btn");
  if (personlist) personlist.style.display = "none";
  if (peopleList) peopleList.style.display = "none";
  if (addPersonBtn) addPersonBtn.style.display = "none";
  if (clearListBtn) clearListBtn.style.display = "none";
});
document.getElementById("ContinueasGuest").addEventListener("click", () => {
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("Loginpage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "none";
  const personlist = document.getElementById("personlist");
  const peopleList = document.getElementById("people-list");
  const addPersonBtn = document.getElementById("add-person-btn");
  const clearListBtn = document.getElementById("clear-list-btn");
  if (personlist) personlist.style.display = "flex";
  if (peopleList) peopleList.style.display = "flex";
  if (addPersonBtn) addPersonBtn.style.display = "flex";
  if (clearListBtn) clearListBtn.style.display = "flex";
})
document.getElementById("profileInfo").addEventListener("click", () => {
  
});
const scrollToBottomBtn = document.getElementById('scroll-to-bottom');
const scrollToTopBtn = document.getElementById('scroll-to-top');

function updateScrollButtons() {
  const canScroll = peopleList.scrollHeight > peopleList.clientHeight;
  const atTop = peopleList.scrollTop <= 10;
  const atBottom = peopleList.scrollTop + peopleList.clientHeight >= peopleList.scrollHeight - 1;

  if (!canScroll) {
    scrollToBottomBtn.style.display = 'none';
    scrollToTopBtn.style.display = 'none';
  } else {
    scrollToBottomBtn.style.display = atTop ? 'block' : 'none';
    scrollToTopBtn.style.display = atBottom ? 'block' : 'none';
  }
}

function scrollToBottom() {
  peopleList.scrollTo({
    top: peopleList.scrollHeight,
    behavior: 'smooth'
  });
}

function scrollToTop() {
  peopleList.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}
document.getElementById('closeAdsBox').addEventListener('click', () =>   {
   document.getElementById("adsModal").style.display = "none"; 
  });



window.addEventListener('load', updateScrollButtons);
window.addEventListener('resize', updateScrollButtons);
peopleList.addEventListener('scroll', updateScrollButtons);


// Optional: recheck after dynamically adding items
const observer = new MutationObserver(updateScrollButtons);
observer.observe(peopleList, { childList: true, subtree: true });

const profileInfoButton = document.getElementById('profileInfo');
const profileStatsButton = document.getElementById('profileStats');
const profileAccountButton = document.getElementById('profileAccount');

const profileInfo = document.getElementById("Profile-info");
const profileStats = document.getElementById('profile-stats');
const profileAccounts = document.getElementById('profile-Accounts');

const buttons = [profileInfoButton, profileStatsButton, profileAccountButton];
const sections = [profileInfo, profileStats, profileAccounts];

buttons.forEach((button, index) => {
  button.addEventListener('click', () => {
    sections.forEach((section, i) => {
      section.style.display = i === index ? "flex" : "none";
    });
    buttons.forEach((btn, i) => {
      btn.style.backgroundColor = i === index
        ? "rgba(89, 192, 199, 0.8)"
        : "rgba(50, 108, 112, 0.8)";
    });
  });
});

document.getElementById("view-account-history").addEventListener("click", () => {
  document.getElementById("AccountHistoryModal").style.display = "flex";
});
document.getElementById("closeAccountHistory").addEventListener("click", () => {
  document.getElementById("AccountHistoryModal").style.display = "none";
});

