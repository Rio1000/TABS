import React, { useCallback, useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import ModalCard from "../components/ModalCard";
import Button from "../components/Button";
import TextField from "../components/TextField";
import { colors, radius, spacing } from "../theme";
import {
  subscribeFriendsList,
  subscribePendingCount,
  loadFriendRequests,
  addFriendByCode,
  approveFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "../lib/friends";

export default function FriendsScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [] });

  const [addVisible, setAddVisible] = useState(false);
  const [friendCode, setFriendCode] = useState("");
  // Tracked per-selection in React state (not a single reused DOM handler),
  // so confirming removal always acts on the friend that was actually
  // tapped — no shared-state mixup between rows.
  const [friendToRemove, setFriendToRemove] = useState(null);

  const refreshRequests = useCallback(async () => {
    if (!user) return;
    const data = await loadFriendRequests(user.uid);
    setRequests(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const unsubFriends = subscribeFriendsList(user.uid, setFriends);
    const unsubPending = subscribePendingCount(user.uid, setPendingCount);
    refreshRequests();
    return () => {
      unsubFriends();
      unsubPending();
    };
  }, [user, refreshRequests]);

  const submitAddFriend = async () => {
    const code = friendCode.trim();
    if (!code) {
      showToast("Friend code cannot be empty.", "error");
      return;
    }
    try {
      await addFriendByCode(user, code);
      showToast("Friend request sent!");
      setFriendCode("");
      setAddVisible(false);
      refreshRequests();
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleApprove = async (req) => {
    try {
      await approveFriendRequest(user.uid, req.id, req);
      showToast(`${req.firstName} has been added to your friends list!`);
      refreshRequests();
    } catch (e) {
      showToast(`Error approving friend: ${e.message}`, "error");
    }
  };

  const handleReject = async (req) => {
    await rejectFriendRequest(user.uid, req.id);
    showToast("Request rejected.");
    refreshRequests();
  };

  const handleCancel = async (req) => {
    await cancelFriendRequest(user.uid, req.id);
    showToast("Request canceled.");
    refreshRequests();
  };

  const confirmRemoveFriend = async () => {
    if (!friendToRemove) return;
    await removeFriend(user.uid, friendToRemove.friendId);
    showToast(`${friendToRemove.firstName} has been removed from your friends list.`);
    setFriendToRemove(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tab, tab === "friends" && styles.tabActive]}
          onPress={() => setTab("friends")}
        >
          <Text style={styles.tabText}>Friends</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "pending" && styles.tabActive]}
          onPress={() => setTab("pending")}
        >
          <Text style={styles.tabText}>
            Pending {pendingCount > 0 ? `(${pendingCount})` : ""}
          </Text>
        </TouchableOpacity>
        <Button title="Add" onPress={() => setAddVisible(true)} style={styles.addBtn} />
      </View>

      {tab === "friends" ? (
        <FlatList
          data={friends}
          keyExtractor={(f) => f.friendId}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>You have no friends added.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowText}>
                {item.firstName} {item.lastName}
              </Text>
              <TouchableOpacity onPress={() => setFriendToRemove(item)}>
                <Text style={styles.removeX}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={[
            ...requests.incoming.map((r) => ({ ...r, kind: "incoming" })),
            ...requests.outgoing.map((r) => ({ ...r, kind: "outgoing" })),
          ]}
          keyExtractor={(r) => `${r.kind}-${r.id}`}
          contentContainerStyle={{ padding: spacing.md }}
          ListEmptyComponent={<Text style={styles.empty}>No pending requests.</Text>}
          renderItem={({ item }) =>
            item.kind === "incoming" ? (
              <View style={styles.row}>
                <Text style={styles.rowText}>
                  {item.firstName} {item.lastName} sent you a friend request
                </Text>
                <View style={styles.rowActions}>
                  <TouchableOpacity onPress={() => handleApprove(item)}>
                    <Text style={styles.accept}>✔</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleReject(item)}>
                    <Text style={styles.removeX}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                <Text style={styles.rowText}>
                  You sent a request to {item.firstName} {item.lastName}
                </Text>
                <TouchableOpacity onPress={() => handleCancel(item)}>
                  <Text style={styles.removeX}>✕</Text>
                </TouchableOpacity>
              </View>
            )
          }
        />
      )}

      <ModalCard visible={addVisible} onRequestClose={() => setAddVisible(false)} title="Add Friend">
        <TextField
          placeholder="Friend Code"
          value={friendCode}
          onChangeText={setFriendCode}
          autoCapitalize="characters"
          autoFocus
        />
        <Button title="Add" onPress={submitAddFriend} />
        <Button
          title="Cancel"
          variant="muted"
          onPress={() => setAddVisible(false)}
          style={{ marginTop: spacing.sm }}
        />
      </ModalCard>

      <ModalCard
        visible={!!friendToRemove}
        onRequestClose={() => setFriendToRemove(null)}
        title="Remove friend?"
      >
        <Text style={styles.rowText}>
          Remove {friendToRemove?.firstName} {friendToRemove?.lastName} from your friends list?
        </Text>
        <Button title="Remove" variant="danger" onPress={confirmRemoveFriend} />
        <Button
          title="Cancel"
          variant="muted"
          onPress={() => setFriendToRemove(null)}
          style={{ marginTop: spacing.sm }}
        />
      </ModalCard>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabText: {
    color: colors.text,
    fontWeight: "600",
  },
  addBtn: {
    marginLeft: "auto",
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rowText: {
    color: colors.text,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  rowActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  removeX: {
    color: colors.danger,
    fontWeight: "700",
    fontSize: 16,
  },
  accept: {
    color: colors.success,
    fontWeight: "700",
    fontSize: 16,
  },
  empty: {
    color: colors.textDim,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
