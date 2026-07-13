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
}
// Only close when the click lands on the backdrop itself — not on anything
// inside the sidenavnav links, the currency <select>, etc.), since a
// bubbled click from those was clthe nav out from under them (most
// noticeably, the currency dropdown would open and immediately get yanked
// shut).
document.getElementById("sideNavModal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    closeNav();
  }
});



// Shared visibility helpers for the person list and its Add/Clear controls.
// The old code toggled the two buttons by wrong IDs ("addPersonBtn"/
// "clearListBtn" — the real IDs are "add-person-btn"/"clear-list-btn"), so
// the buttons never actually hid, and the styled #buttons container kept
// rendering as an empty box behind the login screen. Everything now goes
// through these helpers, which also toggle the container itself.
function setListControlsVisible(visible) {
  const buttonsBox = document.getElementById("buttons");
  if (buttonsBox) buttonsBox.classList.toggle("hidden", !visible);
  const addPersonBtn = document.getElementById("add-person-btn");
  const clearListBtn = document.getElementById("clear-list-btn");
  if (addPersonBtn) addPersonBtn.style.display = visible ? "flex" : "none";
  if (clearListBtn) clearListBtn.style.display = visible ? "flex" : "none";
  // Show/hide the whole bottom action dock along with its bar, and make sure
  // its sheet is collapsed when the controls are hidden (e.g. on logout).
  const dock = document.getElementById("action-dock");
  if (dock) dock.classList.toggle("hidden", !visible);
  if (!visible) {
    const sheet = document.getElementById("action-sheet");
    if (sheet) sheet.dataset.open = "none";
    if (buttonsBox) buttonsBox.classList.remove("active-add", "active-clear", "sheet-open");
    document.body.classList.remove("action-open");
  }
}

function setPersonListVisible(visible) {
  // .personlist has a class, not an id — the old getElementById("personlist")
  // lookups always returned null, so the list never actually hid.
  const personlist = document.querySelector(".personlist");
  const peopleListEl = document.getElementById("people-list");
  if (personlist) personlist.style.display = visible ? "" : "none";
  if (peopleListEl) peopleListEl.style.display = visible ? "flex" : "none";
  if (typeof updateEmptyState === "function") updateEmptyState();
}

function openLogin() {
  document.getElementById("Loginpage").style.display = "flex";
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "none";
  setPersonListVisible(false);
  setListControlsVisible(false);

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
  activateProfileTab(0); // Always reopen on the highlighted Info tab
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
  setPersonListVisible(false);
  setListControlsVisible(false);
});
document.getElementById("Back-btn2").addEventListener("click", () => {
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("Loginpage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "flex";
  setPersonListVisible(false);
  setListControlsVisible(false);
});
document.getElementById("ContinueasGuest").addEventListener("click", () => {
  document.getElementById("signupPage").style.display = "none";
  document.getElementById("Loginpage").style.display = "none";
  document.getElementById("loginorsignupmodal").style.display = "none";
  document.getElementById("loader").style.display = "none";
  setPersonListVisible(true);
  setListControlsVisible(true);
})
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

// Show a centered "no tabs yet" message whenever the list has no real
// people in it. The ad box also lives in #people-list and carries the
// .personlist-item class, so it's excluded from the count — an empty list
// with only an ad still counts as empty.
function updateEmptyState() {
  const message = document.getElementById("empty-list-message");
  if (!message) return;
  const realItems = peopleList.querySelectorAll(
    ".personlist-item:not(.ad-box)"
  ).length;
  // Only surface the message once the list controls are visible (i.e. the
  // user is past the login/guest screen); otherwise it would show behind
  // the login modal on first load.
  const listActive =
    getComputedStyle(document.getElementById("people-list")).display !== "none";
  message.style.display = realItems === 0 && listActive ? "flex" : "none";
}

// Optional: recheck after dynamically adding items
const observer = new MutationObserver(() => {
  updateScrollButtons();
  updateEmptyState();
});
observer.observe(peopleList, { childList: true, subtree: true });
window.addEventListener('load', updateEmptyState);

const profileInfoButton = document.getElementById('profileInfo');
const profileStatsButton = document.getElementById('profileStats');
const profileAccountButton = document.getElementById('profileAccount');

const profileInfo = document.getElementById("Profile-info");
const profileStats = document.getElementById('profile-stats');
const profileAccounts = document.getElementById('profile-Accounts');

const buttons = [profileInfoButton, profileStatsButton, profileAccountButton];
const sections = [profileInfo, profileStats, profileAccounts];

// Activate a profile tab: show its section and give its button the lighter
// (active) background while the others get the default darker one.
function activateProfileTab(index) {
  sections.forEach((section, i) => {
    section.style.display = i === index ? "flex" : "none";
  });
  buttons.forEach((btn, i) => {
    btn.style.backgroundColor = i === index
      ? "rgba(89, 192, 199, 0.8)"
      : "rgba(50, 108, 112, 0.8)";
  });
  if (buttons[index] && buttons[index].id === 'profileStats') {
    document.dispatchEvent(new Event('renderSpendingChart'));
  }
}

buttons.forEach((button, index) => {
  button.addEventListener('click', () => activateProfileTab(index));
});

// Start on the Profile Info tab so it's already highlighted the first time
// the profile opens — otherwise no tab button looks active even though the
// info section is the one being shown.
activateProfileTab(0);

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

// The header (logo, title, menu button) is intentionally left visible and in
// place when a modal opens — no visibility toggle. Every modal is a
// full-screen overlay far above the header in z-index (.modal is z-index 9999;
// the header elements are all < 1000), so the blurred backdrop already sits on
// top of them: they show through blurred but can't be tapped.

// Animate modals in/out instead of an abrupt display:none <-> flex flip.
// Every modal open/close elsewhere in script.js and firebase-setup.js
// toggles visibility by setting `element.style.display` directly (~150
// call sites), so rather than rewriting each one this uses the same
// MutationObserver technique as the chrome-hiding logic above.
//
// Opening: pure CSS — the .modal-fx backdrop fade and .modal-fx > * card
// pop-in (styles.css) replay automatically whenever `display` flips from
// none to visible.
//
// Closing: a closed modal's display is restored for the length of the exit
// animation (.modal-fx-closing), then set back to none for real. Both the
// observer callbacks and the requestAnimationFrame below run before the
// frame paints, so the modal never flashes hidden in between.
//
// Swapping: opens and closes that land in the same tick (openSignup()
// hiding the login page while showing the signup page, the tab modal
// closing as the add-money modal opens, …) are batched here and handled
// as one pre-paint pass. When a batch contains both, it's a swap: the
// backdrop is held steady and only the content cards slide out/in
// (.modal-fx-swap-out / .modal-fx-swap-in) instead of fading the whole
// screen out and back in.
(function () {
  const CLOSE_ANIM_MS = 190;
  const SWAP_ANIM_MS = 320;
  const OPEN_ANIM_MS = 360;
  const lastVisibleDisplay = new WeakMap();
  const selfTriggered = new WeakSet();
  const closeTimers = new WeakMap();
  const swapInTimers = new WeakMap();
  const openTimers = new WeakMap();
  const wasVisible = new WeakMap();

  let pendingOpens = [];
  let pendingCloses = [];
  let flushScheduled = false;

  function flushModalChanges() {
    flushScheduled = false;
    const opens = pendingOpens;
    // A modal closed and reopened within the same tick nets out to "still
    // open" — it must not be treated as (half of) a swap.
    const openSet = new Set(pendingOpens);
    const closes = pendingCloses.filter((el) => !openSet.has(el));
    pendingOpens = [];
    pendingCloses = [];
    const isSwap = opens.length > 0 && closes.length > 0;

    closes.forEach((el) => {
      const restoreDisplay = lastVisibleDisplay.get(el) || "flex";
      selfTriggered.add(el);
      el.style.display = restoreDisplay;
      el.classList.add(isSwap ? "modal-fx-swap-out" : "modal-fx-closing");

      closeTimers.set(
        el,
        setTimeout(() => {
          selfTriggered.add(el);
          el.style.display = "none";
          el.classList.remove("modal-fx-closing", "modal-fx-swap-out");
        }, isSwap ? SWAP_ANIM_MS : CLOSE_ANIM_MS)
      );
    });

    opens.forEach((el) => {
      if (isSwap) {
        // Swap: hold the backdrop, slide the card in horizontally.
        el.classList.remove("modal-fx-open");
        clearTimeout(openTimers.get(el));
        el.classList.add("modal-fx-swap-in");
        clearTimeout(swapInTimers.get(el));
        swapInTimers.set(
          el,
          setTimeout(() => el.classList.remove("modal-fx-swap-in"), SWAP_ANIM_MS + 80)
        );
      } else {
        // Genuine open: slide the card up from the bottom. This class gates
        // the entrance animation so it only plays here (see styles.css).
        el.classList.add("modal-fx-open");
        clearTimeout(openTimers.get(el));
        openTimers.set(
          el,
          setTimeout(() => el.classList.remove("modal-fx-open"), OPEN_ANIM_MS)
        );
      }
    });
  }

  function scheduleFlush() {
    if (flushScheduled) return;
    flushScheduled = true;
    requestAnimationFrame(flushModalChanges);
  }

  document.querySelectorAll(".modal-fx").forEach((el) => {
    const initialDisplay = getComputedStyle(el).display;
    wasVisible.set(el, initialDisplay !== "none");
    if (initialDisplay !== "none") lastVisibleDisplay.set(el, initialDisplay);

    const observer = new MutationObserver(() => {
      if (selfTriggered.has(el)) {
        selfTriggered.delete(el);
        return;
      }

      // Only genuine visibility transitions count — style mutations on an
      // already-open modal (opacity tweaks, hideAllModals() re-hiding an
      // already-hidden one) must not register as opens/closes, or a lone
      // close could be misread as a swap.
      const visible =
        (el.style.display || getComputedStyle(el).display) !== "none";
      const before = wasVisible.get(el);
      wasVisible.set(el, visible);
      if (visible === before) return;

      if (visible) {
        lastVisibleDisplay.set(el, el.style.display || getComputedStyle(el).display);
        clearTimeout(closeTimers.get(el));
        el.classList.remove("modal-fx-closing", "modal-fx-swap-out");
        pendingOpens.push(el);
      } else {
        pendingCloses.push(el);
      }
      scheduleFlush();
    });

    observer.observe(el, { attributes: true, attributeFilter: ["style"] });
  });
})();
/* =====================================================================
   Modal close ✕ (top-right)
   -------------------------------------------------------------------
   Give every modal card the same round teal ✕ in its top-right corner as
   the add-person sheet. Each ✕ just forwards a click to that modal's real
   Close / Cancel button, so all the existing teardown keeps running — we
   don't duplicate any close logic here. */
(function addModalCloseButtons() {
  // [ card selector, existing Close/Cancel button id to forward to ]
  const cards = [
    ["#customModal .modal-content", "close-prompt"],
    ["#interest-container", "close-interest"],
    ["#friendModal .friend-content", "closeFriendModal"],
    ["#addFriendBox", "closeAddFriend"],
    ["#pendingRequestsBox", "closePendingRequests"],
    ["#editMoneyAdd", "closeEditMoney"],
    ["#editMoneyRemove", "closeEditMoney"],
    ["#editNameBox", "closeEditName"],
    ["#add-extra-info-box", "close-extra-info"],
    ["#RemovefriendBox", "closeRemovefriend"],
    ["#editItemBox", "closeEditItem"],
    ["#editinffoBox", "closeEditinffo"],
    ["#adsBox", "closeAdsBox"],
    ["#ProfileBox", "closeProfile"],
    ["#delete-account-box", "close-delete-account"],
    ["#AccountHistoryBox", "closeAccountHistory"],
    ["#clearAccountHistoryBox", "cancelClearHistory"],
    ["#notificationsBox", "closeNotifications"],
    ["#notificationSettingsBox", "closeNotificationSettings"],
    ["#paymentSettingsBox", "closePaymentSettings"],
    ["#paymentRequestBox", "closePaymentRequest"],
    ["#smsReminderBox", "closeSmsReminder"],
  ];

  cards.forEach(([selector, closeId]) => {
    const card = document.querySelector(selector);
    if (!card) return;
    if (card.querySelector(":scope > .modal-close-x")) return; // already added

    const x = document.createElement("button");
    x.type = "button";
    x.className = "modal-close-x";
    x.setAttribute("aria-label", "Close");
    x.title = "Close";
    x.textContent = "✕";
    x.addEventListener("click", (event) => {
      event.preventDefault();
      // Run the modal's real Close/Cancel handler (resets inputs, etc.).
      const closer = document.getElementById(closeId);
      if (closer) closer.click();
      // Fallback: if that didn't hide the modal, close it directly the same
      // way every close button does (the modal-fx observer animates it out).
      const modal = card.closest(".modal-fx") || card.parentElement;
      if (modal && modal.style.display !== "none") {
        modal.style.display = "none";
      }
    });
    card.appendChild(x);
  });
})();
