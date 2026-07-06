import { ref, get, set, remove, push, onValue } from "firebase/database";
import { database } from "../firebaseConfig";

export function generateFriendCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

export function subscribeFriendsList(uid, callback) {
  return onValue(ref(database, `users/${uid}/friendsList`), (snapshot) => {
    const val = snapshot.val() || {};
    callback(Object.entries(val).map(([friendId, data]) => ({ friendId, ...data })));
  });
}

// Real-time, unlike the web app's one-off get() — the badge here stays in
// sync as requests arrive/leave without needing an explicit refresh call.
export function subscribePendingCount(uid, callback) {
  return onValue(ref(database, `users/${uid}/pendingRequests`), (snapshot) => {
    callback(snapshot.exists() ? Object.keys(snapshot.val()).length : 0);
  });
}

export async function loadFriendRequests(uid) {
  const [incomingSnap, outgoingSnap] = await Promise.all([
    get(ref(database, `users/${uid}/pendingRequests`)),
    get(ref(database, `users/${uid}/sentRequests`)),
  ]);

  const incoming = incomingSnap.exists()
    ? Object.entries(incomingSnap.val()).map(([id, req]) => ({ id, ...req }))
    : [];
  const outgoing = outgoingSnap.exists()
    ? Object.entries(outgoingSnap.val()).map(([id, req]) => ({ id, ...req }))
    : [];

  return { incoming, outgoing };
}

export async function addFriendByCode(currentUser, friendCode) {
  const friendSnap = await get(ref(database, `friendCodes/${friendCode}`));
  if (!friendSnap.exists()) {
    throw new Error("Friend code not found.");
  }

  const friendData = friendSnap.val();
  const friendUserId = friendData.userId;

  if (friendUserId === currentUser.uid) {
    throw new Error("You can't add yourself as a friend.");
  }

  const friendsSnap = await get(ref(database, `users/${currentUser.uid}/friendsList`));
  if (friendsSnap.exists()) {
    const alreadyFriend = Object.values(friendsSnap.val()).some(
      (f) => f.userId === friendUserId
    );
    if (alreadyFriend) {
      throw new Error("This user is already in your friends list.");
    }
  }

  const sentSnap = await get(
    ref(database, `users/${currentUser.uid}/sentRequests/${friendUserId}`)
  );
  if (sentSnap.exists()) {
    throw new Error("Friend request already sent.");
  }

  const pendingSnap = await get(
    ref(database, `users/${currentUser.uid}/pendingRequests/${friendUserId}`)
  );
  if (pendingSnap.exists()) {
    throw new Error("This user has already sent you a request. Check Pending.");
  }

  const myProfileSnap = await get(ref(database, `users/${currentUser.uid}/profile`));
  const myProfile = myProfileSnap.val();

  await set(ref(database, `users/${friendUserId}/pendingRequests/${currentUser.uid}`), {
    fromUserId: currentUser.uid,
    firstName: myProfile.firstName,
    lastName: myProfile.lastName,
    friendCode: myProfile.friendCode,
  });

  await set(ref(database, `users/${currentUser.uid}/sentRequests/${friendUserId}`), {
    toUserId: friendUserId,
    firstName: friendData.firstName,
    lastName: friendData.lastName,
  });
}

export async function approveFriendRequest(currentUid, requestId, request) {
  await set(push(ref(database, `users/${currentUid}/friendsList`)), {
    userId: request.fromUserId,
    firstName: request.firstName,
    lastName: request.lastName,
    friendCode: request.friendCode,
  });

  const currentProfileSnap = await get(ref(database, `users/${currentUid}/profile`));
  const currentProfile = currentProfileSnap.val();

  await set(push(ref(database, `users/${request.fromUserId}/friendsList`)), {
    userId: currentUid,
    firstName: currentProfile.firstName,
    lastName: currentProfile.lastName,
    friendCode: currentProfile.friendCode,
  });

  await Promise.all([
    remove(ref(database, `users/${request.fromUserId}/sentRequests/${currentUid}`)),
    remove(ref(database, `users/${currentUid}/pendingRequests/${requestId}`)),
  ]);
}

// Rejecting an incoming request clears it from both sides — the sender's
// sentRequests entry is removed too, so they don't see "request sent"
// forever with no indication it was declined.
export async function rejectFriendRequest(currentUid, senderId) {
  await Promise.all([
    remove(ref(database, `users/${currentUid}/pendingRequests/${senderId}`)),
    remove(ref(database, `users/${senderId}/sentRequests/${currentUid}`)),
  ]);
}

// Canceling an outgoing request clears it from both sides — the recipient's
// pendingRequests entry is removed too, so a canceled request can't linger
// on their end forever.
export async function cancelFriendRequest(currentUid, recipientId) {
  await Promise.all([
    remove(ref(database, `users/${currentUid}/sentRequests/${recipientId}`)),
    remove(ref(database, `users/${recipientId}/pendingRequests/${currentUid}`)),
  ]);
}

export async function removeFriend(currentUid, friendId) {
  await remove(ref(database, `users/${currentUid}/friendsList/${friendId}`));
}
