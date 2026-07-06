import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Same Firebase project as the TABS web app, so mobile and web share the
// exact same user accounts and Realtime Database data.
const firebaseConfig = {
  apiKey: "AIzaSyA93Cfu5ehpOeZMCBKtiTvw1kJZZU_EvkE",
  authDomain: "tabs-4a0eb.firebaseapp.com",
  databaseURL: "https://tabs-4a0eb-default-rtdb.firebaseio.com",
  projectId: "tabs-4a0eb",
  storageBucket: "tabs-4a0eb.firebasestorage.app",
  messagingSenderId: "295362517303",
  appId: "1:295362517303:web:fbd0037e697eade181a2b2",
  measurementId: "G-Y9CWXD96D9",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch (e) {
  // initializeAuth throws if it's already been called (e.g. Fast Refresh).
  auth = getAuth(app);
}

const database = getDatabase(app);

export { app, auth, database };
