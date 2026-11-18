// Matches the showToast in firebase-setup.js (same duration/colors) so toasts
// look identical no matter which file fired them.
function showToast(message, type = "success") {
  // Toastify comes from a CDN; if it failed to load (e.g. offline), log
  // instead of throwing so callers like the boot failsafe keep working.
  if (typeof Toastify !== "function") {
    console[type === "error" ? "error" : "log"](message);
    announceToast(message, type);
    return null;
  }
  const toast = Toastify({
    text: `${message}`,
    // Keep these in step with the showToast in firebase-setup.js.
    duration: type === "error" ? 6000 : 4000,
    close: true,
    gravity: "top",
    position: "right",
    // Announced through announceToast's live regions instead; a live region
    // that is created already filled is often skipped by screen readers.
    ariaLive: "off",
    className:
      type === "error"
        ? "toastify toastify-error"
        : "toastify toastify-success",
    style: {
      // #2e7d32, not the old #52bc38: white text on that green was 2.4:1,
      // below the 4.5:1 WCAG AA minimum. This is 5.1:1.
      background: type === "error" ? "#bc3838" : "#2e7d32",
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
  }).showToast();
  enhanceToast(toast, message, type);
  return toast;
}

// Screen readers: two live regions that exist from page load, so writes to
// them are reliably announced. Errors interrupt (assertive); everything else
// waits its turn (polite).
const toastLiveRegions = {};
["polite", "assertive"].forEach((level) => {
  const region = document.createElement("div");
  region.className = "toast-live-region";
  region.setAttribute("role", level === "assertive" ? "alert" : "status");
  region.setAttribute("aria-live", level);
  region.setAttribute("aria-atomic", "true");
  document.body.appendChild(region);
  toastLiveRegions[level] = region;
});
function announceToast(message, type = "success", actionLabel = "") {
  const region = toastLiveRegions[type === "error" ? "assertive" : "polite"];
  const text = actionLabel ? `${message} ${actionLabel} available.` : `${message}`;
  // Clear first so the same message twice in a row is still announced.
  region.textContent = "";
  setTimeout(() => {
    region.textContent = text;
  }, 100);
}

// Shared by both showToast functions once the toast is on screen:
// announce it, pause its timer while it has keyboard focus (Toastify only
// pauses on mouse hover), and enforce the on-screen limit.
function enhanceToast(toast, message, type, actionLabel = "") {
  announceToast(message, type, actionLabel);
  const el = toast.toastElement;
  const duration = toast.options.duration;
  // Toasts that stay until dismissed (duration -1) are never auto-bumped.
  if (duration <= 0) el.dataset.persistent = "true";
  el.addEventListener("focusin", () => clearTimeout(el.timeOutValue));
  el.addEventListener("focusout", (event) => {
    if (el.contains(event.relatedTarget) || duration <= 0) return;
    clearTimeout(el.timeOutValue);
    el.timeOutValue = setTimeout(() => toast.hideToast(), duration);
  });
  capToasts();
}
window.enhanceToast = enhanceToast;

// At most two toasts on screen at once, so a burst of them can't cover the
// list. When a new one pushes past the limit, the oldest success/info toasts
// give way; errors and toasts meant to stay until dismissed are never
// bumped. They stay until they time out or are closed, since they carry
// something the user has to read or act on.
const MAX_VISIBLE_TOASTS = 2;
function capToasts() {
  // Toastify inserts the newest toast first, so walk the list backwards to
  // bump the oldest ones first. ".on" is dropped the moment a toast starts
  // fading out, so toasts already leaving don't count.
  const visible = [...document.querySelectorAll(".toastify.on")];
  let excess = visible.length - MAX_VISIBLE_TOASTS;
  for (let i = visible.length - 1; i >= 0 && excess > 0; i--) {
    if (visible[i].classList.contains("toastify-error")) continue;
    if (visible[i].dataset.persistent) continue;
    // Don't yank a toast out from under someone who is on it.
    if (visible[i].contains(document.activeElement)) continue;
    // The close button runs Toastify's own fade-out and timer cleanup.
    visible[i].querySelector(".toast-close")?.click();
    excess--;
  }
}


const peopleList = document.getElementById("people-list");
const addPersonBtn = document.getElementById("add-person-btn");
const clearListBtn = document.getElementById("clear-list-btn");




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
  showToast("Guest mode: your tabs won't be saved after you leave.", "info");
});

// Connection status. Firebase queues writes while offline and sends them on
// reconnect, so tell people their edits are not lost, just waiting.
let offlineToast = null;
window.addEventListener("offline", () => {
  offlineToast = showToast("You're offline. Changes will sync when you reconnect.", "error");
});
window.addEventListener("online", () => {
  offlineToast?.hideToast();
  offlineToast = null;
  showToast("Back online.");
});

// Failsafe: firebase-setup.js is the module that reveals the login / guest
// screen (it does so from onAuthStateChanged). It is an ES module loaded from a
// CDN, so if that import fails — offline, blocked network, CDN outage — the
// callback never runs, the screen is never shown and NOTHING on the page is
// clickable: no login, no signup, not even "Continue as Guest". This script is
// a classic script and always runs, so it can hand the user a way in.
// It only fires when the page is genuinely stuck: both the auth screen and the
// list are still hidden, meaning the module never got far enough to choose.
;(function () {
  const STUCK_AFTER_MS = 6000;
  setTimeout(() => {
    // The module sets this the moment it executes. If it is still missing the
    // import failed outright, which is the only case we rescue — a module that
    // loaded and is merely slow must be left alone.
    if (window.__tabsFirebaseBooted) return;
    const auth = document.getElementById("loginorsignupmodal");
    if (!auth) return;
    // Symptom of the failure: the loader overlay stays up over everything.
    const loader = document.getElementById("loader");
    if (loader) loader.style.display = "none";
    auth.style.display = "flex";
    const signup = document.getElementById("signupPage");
    const login = document.getElementById("Loginpage");
    if (signup) signup.style.display = "none";
    if (login) login.style.display = "none";
    showToast("Couldn't reach the server — you can still continue as a guest.", "error");
  }, STUCK_AFTER_MS);
})();

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
    const codeEl = document.getElementById("profile-friend-code");
    let text = codeEl.innerText;
    if (text.includes(':')) {
        text = text.split(':').pop().trim();
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text)
            .then(() => {
                showToast(`Copied: ${text}`);
            })
            .catch(() => {
                showToast("Failed to copy friend code.", "error");
            });
    } else {
        // Older browser / insecure context: the friend code lives in a <p>
        // (which has no .select()), so copy it through a temporary textarea.
        try {
            const helper = document.createElement("textarea");
            helper.value = text;
            helper.setAttribute("readonly", "");
            helper.style.position = "fixed";
            helper.style.opacity = "0";
            document.body.appendChild(helper);
            helper.select();
            const successful = document.execCommand('copy');
            helper.remove();
            if (successful) {
                showToast(`Copied: ${text}`);
            } else {
                showToast("Failed to copy friend code.", "error");
            }
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

/* =====================================================================
   Dialog accessibility
   -------------------------------------------------------------------
   Every .modal-fx is marked role="dialog" by the animation code below,
   which also calls onDialogOpen / onDialogClose on each real open/close.
   • Name: screen readers announce a dialog by its name. Taken from the
     heading that is visible when it opens (the money modal swaps between
     "Add Money" and "Remove Money"), or from DIALOG_LABELS where there
     is no heading or the heading isn't a title.
   • Focus: on open, focus moves to the dialog itself (not its first
     field, which would pop the phone keyboard), so screen readers read
     its name and Tab starts inside it. Tab and Shift+Tab stay inside the
     open dialog. On close, focus returns to whatever opened it.
   • Escape closes the dialog on top through its ✕ button, so the
     modal's own close logic runs. */
const DIALOG_LABELS = {
  loginorsignupmodal: "Welcome to TABS",
  interestModal: "Interest",
  friendModal: "Friends",
  RFModal: "Remove friend",
  adsModal: "About TABS",
  ProfileModal: "Profile",
  "delete-account-modal": "Delete account",
  clearAccountHistoryModal: "Clear account history",
};
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const isShown = (el) => el.getClientRects().length > 0;
const openDialogs = []; // [{ el, returnTo }], most recent last

function nameDialog(el) {
  if (DIALOG_LABELS[el.id]) {
    el.removeAttribute("aria-labelledby");
    el.setAttribute("aria-label", DIALOG_LABELS[el.id]);
    return;
  }
  const headings = [...el.querySelectorAll("h1, h2, h3")].filter((h) => h.textContent.trim());
  const heading = headings.find(isShown) || headings[0];
  if (!heading) return;
  if (!heading.id) heading.id = `${el.id || "dialog"}-title-${headings.indexOf(heading)}`;
  el.removeAttribute("aria-label");
  el.setAttribute("aria-labelledby", heading.id);
}

function onDialogOpen(el) {
  if (el.id === "loader") return;
  nameDialog(el);
  openDialogs.push({ el, returnTo: document.activeElement });
  requestAnimationFrame(() => {
    // Leave focus alone if the code that opened the dialog already put it
    // somewhere inside (e.g. a field it wants typed into).
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
  });
}

function onDialogClose(el) {
  const i = openDialogs.findIndex((d) => d.el === el);
  if (i === -1) return;
  const [{ returnTo }] = openDialogs.splice(i, 1);
  const focusLost = el.contains(document.activeElement) || document.activeElement === document.body;
  if (!focusLost) return;
  // Back to the opener, or to whichever dialog is still open underneath.
  const under = openDialogs[openDialogs.length - 1];
  if (returnTo && returnTo.isConnected && isShown(returnTo) && !(under && !under.el.contains(returnTo))) {
    returnTo.focus({ preventScroll: true });
  } else if (under) {
    under.el.focus({ preventScroll: true });
  }
}

document.addEventListener("keydown", (event) => {
  const top = openDialogs[openDialogs.length - 1];
  if (!top || !isShown(top.el)) return;
  if (event.key === "Escape") {
    const closeX = [...top.el.querySelectorAll(".modal-close-x")].find(isShown);
    if (closeX) {
      event.preventDefault();
      closeX.click();
    }
    return;
  }
  if (event.key !== "Tab") return;
  const items = [...top.el.querySelectorAll(FOCUSABLE)].filter(isShown);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (!top.el.contains(active) || active === top.el) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
});

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
  // Each *_ANIM_MS is the matching CSS animation/transition duration (in
  // styles.css) plus a small buffer, so display:none never lands mid-fade
  // and cuts an animation off early. Close: 0.24s backdrop fade + card exit
  // (was 190ms against a 220ms card animation — the card used to visibly
  // snap the last 30ms short of finishing).
  const CLOSE_ANIM_MS = 260;
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
    // Baseline dialog semantics for assistive tech — these are all
    // full-screen overlays acting as dialogs.
    if (el.id === "loader") {
      // A spinner, not a dialog: announce it as a status instead.
      el.setAttribute("role", "status");
      el.setAttribute("aria-label", "Loading");
    } else {
      el.setAttribute("role", "dialog");
      el.setAttribute("aria-modal", "true");
      el.tabIndex = -1; // focus target on open (see onDialogOpen)
      nameDialog(el);
    }
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
      if (visible) onDialogOpen(el);
      else onDialogClose(el);

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
    ["#editMoneyAdd", "closeEditMoneyAdd"],
    ["#editMoneyRemove", "closeEditMoneyRemove"],
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

/* =====================================================================
   Keyboard support
   -------------------------------------------------------------------
   • The folder "…" opener is a <span>, so give it Enter/Space handling
     to match its role="button".
   • Pressing Enter in the login / signup / add-friend / add-person
     inputs submits that form's primary button (there are no <form>
     elements, so the browser gives us nothing for free). */
(function keyboardSupport() {
  const openButton = document.getElementById("openButton");
  if (openButton) {
    openButton.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openNav();
      }
    });
  }

  // [ input ids..., button id to "click" on Enter ]
  const enterSubmits = [
    [["login-email", "login-password"], "login-btn"],
    [["first-name", "last-name", "phonenumber", "signup-email", "signup-password"], "signup-btn"],
    [["friend-code"], "addFriendBtn2"],
    [["name-input", "money-input", "item-input"], "add"],
  ];
  enterSubmits.forEach(([inputIds, buttonId]) => {
    inputIds.forEach((id) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        document.getElementById(buttonId)?.click();
      });
    });
  });
})();

/* =====================================================================
   Landing-ad fallback (ad blockers / unfilled AdSense)
   -------------------------------------------------------------------
   The AdSense <ins> in #landing-ad renders nothing when the loader
   script is blocked (ERR_BLOCKED_BY_CLIENT) or when Google has no fill
   (e.g. the account isn't approved yet). Both used to leave a labeled
   empty hole on the landing card. Detect either state and swap in the
   first-party house card (#house-ad) instead:
     • unfilled → AdSense stamps data-ad-status="unfilled" on the <ins>;
     • blocked  → window.adsbygoogle never becomes the real processor
       (adsbygoogle.loaded stays unset), checked after a grace period. */
(function landingAdFallback() {
  const landingAd = document.getElementById("landing-ad");
  if (!landingAd) return;
  const ins = landingAd.querySelector(".adsbygoogle");
  const label = document.getElementById("landing-ad-label");
  const house = document.getElementById("house-ad");
  if (!ins || !house) return;

  function showHouseAd() {
    // Our own card isn't a paid ad, so the ADVERTISEMENT label comes off.
    if (label) label.style.display = "none";
    ins.style.display = "none";
    house.style.display = "block";
  }

  // Unfilled: Google loaded but had nothing to serve.
  new MutationObserver(() => {
    if (ins.dataset.adStatus === "unfilled") showHouseAd();
  }).observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });

  // Blocked / failed to load: after the page settles, the loader script
  // never upgraded the adsbygoogle array (no .loaded flag) — or it did
  // load but the slot still has no height and no fill status.
  window.addEventListener("load", () => {
    setTimeout(() => {
      const scriptBlocked = !(window.adsbygoogle && window.adsbygoogle.loaded);
      const neverFilled = ins.dataset.adStatus !== "filled" && ins.offsetHeight === 0;
      if (scriptBlocked || neverFilled) showHouseAd();
    }, 3000);
  });
})();
