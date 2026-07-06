import { ref, get, set, remove, push } from "firebase/database";
import { deleteUser, sendPasswordResetEmail } from "firebase/auth";
import { database } from "../firebaseConfig";

export async function logUserAction(uid, action) {
  if (!uid) return;
  await push(ref(database, `users/${uid}/history`), {
    action,
    timestamp: new Date().toISOString(),
  });
}

export async function getStats(uid) {
  const [peopleSnap, friendsSnap] = await Promise.all([
    get(ref(database, `users/${uid}/peopleList`)),
    get(ref(database, `users/${uid}/friendsList`)),
  ]);

  let amountSpent = 0;
  let amountEarned = 0;
  if (peopleSnap.exists()) {
    const peopleData = peopleSnap.val().peopleData || [];
    Object.values(peopleData).forEach((person) => {
      if (person.status === "iOwe" && typeof person.amount === "number") {
        amountSpent += person.amount;
      } else if (person.status === "owesMe" && typeof person.amount === "number") {
        amountEarned += person.amount;
      }
    });
  }

  const totalFriends = friendsSnap.exists() ? Object.keys(friendsSnap.val()).length : 0;

  return { amountSpent, amountEarned, totalFriends };
}

export async function viewAccountHistory(uid) {
  const snap = await get(ref(database, `users/${uid}/history`));
  if (!snap.exists()) return [];
  return Object.values(snap.val()).sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
}

export async function clearAccountHistory(uid) {
  const clearRef = ref(database, `users/${uid}/lastCleared`);
  const snap = await get(clearRef);
  const now = Date.now();

  if (snap.exists()) {
    const daysSince = (now - snap.val()) / (1000 * 60 * 60 * 24);
    if (daysSince < 30) {
      throw new Error(
        `You can clear your history again in ${Math.ceil(30 - daysSince)} day(s).`
      );
    }
  }

  await set(ref(database, `users/${uid}/history`), null);
  await set(clearRef, now);
}

export async function exportUserData(uid) {
  const snap = await get(ref(database, `users/${uid}`));
  if (!snap.exists()) {
    throw new Error("No data found to export.");
  }
  return JSON.stringify(snap.val(), null, 2);
}

export async function deleteAccountAndData(user) {
  await remove(ref(database, `users/${user.uid}`));
  await deleteUser(user);
}

export async function resetPassword(auth, email) {
  await sendPasswordResetEmail(auth, email, {
    url: "https://tabsonfriends.com",
    handleCodeInApp: false,
  });
}
