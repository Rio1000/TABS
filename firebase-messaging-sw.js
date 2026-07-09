/* Firebase Cloud Messaging service worker.
 *
 * Must live at the site root (/firebase-messaging-sw.js) so its scope covers
 * the whole app — the FCM SDK looks for it here by default. It handles push
 * notifications that arrive while the TABS tab is closed or in the background;
 * foreground messages are handled by onMessage() in firebase-setup.js.
 *
 * Service workers can't use ES modules/importmaps, so we load the compat
 * builds via importScripts. Keep the version in sync with the app SDK (10.6.0).
 */
importScripts(
  "https://www.gstatic.com/firebasejs/10.6.0/firebase-app-compat.js"
);
importScripts(
  "https://www.gstatic.com/firebasejs/10.6.0/firebase-messaging-compat.js"
);

firebase.initializeApp({
  apiKey: "AIzaSyA93Cfu5ehpOeZMCBKtiTvw1kJZZU_EvkE",
  authDomain: "tabs-4a0eb.firebaseapp.com",
  databaseURL: "https://tabs-4a0eb-default-rtdb.firebaseio.com",
  projectId: "tabs-4a0eb",
  storageBucket: "tabs-4a0eb.firebasestorage.app",
  messagingSenderId: "295362517303",
  appId: "1:295362517303:web:fbd0037e697eade181a2b2",
  measurementId: "G-Y9CWXD96D9",
});

const messaging = firebase.messaging();

// Show the notification when a push arrives in the background.
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || "TABS reminder";
  const options = {
    body: payload.notification?.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    data: { link: payload.fcmOptions?.link || "https://tabsonfriends.com" },
  };
  self.registration.showNotification(title, options);
});

// Focus (or open) the app when the notification is tapped.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "https://tabsonfriends.com";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes("tabsonfriends") && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(link);
      })
  );
});
