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
  const sidenav = document.getElementById("mySidenav");
  const modal = document.getElementById("sideNavModal");

  modal.style.visibility = "visible";
  modal.style.zIndex = "10000";
  modal.classList.add("active");
  sidenav.classList.add("open");

  document.getElementById("openButton").style.display = "none";
  document.getElementById("closeButton").style.display = "flex";
}


function closeNav() {
  const sidenav = document.getElementById("mySidenav");
  const modal = document.getElementById("sideNavModal");

  sidenav.classList.remove("open");
  modal.classList.remove("active"); // triggers fade-out

  // Wait for transition (match CSS time)
  setTimeout(() => {
    modal.style.zIndex = "0";
    modal.style.visibility = "hidden";
  }, 400); // same as your CSS transition duration

  document.getElementById("openButton").style.display = "flex";
  document.getElementById("closeButton").style.display = "none";
}
document.getElementById("sideNavModal").addEventListener("click", closeNav);



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

// List of all modals tied to the sideNav links
const modalMap = {
  Login: "Loginpage",
  Profile: "ProfileModal",
  FriendsTab: "friendModal",
  Ads: "adsModal",
  confirmation: "customModal"
};

function hideAllModals() {
  Object.values(modalMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = "none";
  });
}

// Attach click listeners to each link
Object.keys(modalMap).forEach(linkId => {
  const link = document.getElementById(linkId);
  const modalId = modalMap[linkId];
  link?.addEventListener("click", () => {
    hideAllModals();
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = "flex";
    closeNav(); // Optional: close sidebar if desired
  });
});
document.getElementById("cancelClearHistory").addEventListener("click", () => {
  document.getElementById("clearAccountHistoryModal").style.display = "none";
});


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
  document.getElementById("loader").style.display = "none";
  document.getElementById("clearListBtn").style.display = "flex";
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
    if (button.id === 'profileStats') {
      document.dispatchEvent(new Event('renderSpendingChart'));
    }
  });
});

document.getElementById("view-account-history").addEventListener("click", () => {
  document.getElementById("AccountHistoryModal").style.display = "flex";
});
document.getElementById("closeAccountHistory").addEventListener("click", () => {
  document.getElementById("AccountHistoryModal").style.display = "none";
});

document.getElementById('closeAddFriend').addEventListener('click', () => {
  document.getElementById("addFriendModal").style.display = "none";
});


/* When the user clicks on the button, 
toggle between hiding and showing the dropdown content */


// Close the dropdown if the user clicks outside of it
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
document.getElementById("add-more-money-btn").addEventListener("click", () => {
  document.getElementById("customModal").style.display = "none";
});
document.getElementById("remove-money-btn").addEventListener("click", () => {
  document.getElementById("customModal").style.display = "none";
});


document.getElementById("loginbutton").addEventListener("click", () => {
  document.getElementById("loader").style.display = "none";
});
document.getElementById("signupbutton").addEventListener("click", () => {
  document.getElementById("loader").style.display = "none";
});
document.getElementById("interest-btn").addEventListener("click", () => {
  document.getElementById("interestModal").style.display = "flex";
});
document.getElementById("close-interest").addEventListener("click", () => {
  document.getElementById("interestModal").style.display = "none";
});


const phoneInput = document.getElementById('phonenumber');
phoneInput.addEventListener('input', () => {
let digits = phoneInput.value.replace(/\D/g, '').substring(0, 10);
let formatted = digits;
if (digits.length > 6) {
formatted = `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
} else if (digits.length > 3) {
formatted = `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
} else if (digits.length > 0) {
formatted = `(${digits}`;
}
phoneInput.value = formatted;
});

function copyText() {
    const textArea = document.getElementById("profile-friend-code");
    let text = textArea.innerText;
    if (text.includes(':')) {
        text = text.split(':').pop().trim();
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast(`Copied: ${text}`);
            })
            .catch(err => {
                showToast("Failed to copy friend code.", "error");
            });
    } else {
        textArea.select();
        try {
            const successful = document.execCommand('copy');
            showToast(successful ? "Text copied to clipboard!" : "Failed to copy friend code.", "error");
        } catch (err) {
            console.error("Fallback copy failed: ", err);
            showToast("Failed to copy friend code.", "error");
        }
    }
}