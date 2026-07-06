import React, { useEffect, useState } from "react";
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { signOut } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Button from "../components/Button";
import ModalCard from "../components/ModalCard";
import { colors, spacing } from "../theme";
import {
  getStats,
  viewAccountHistory,
  clearAccountHistory,
  exportUserData,
  deleteAccountAndData,
  resetPassword,
  logUserAction,
} from "../lib/account";

const TABS = ["Info", "Stats", "Account"];

export default function ProfileScreen() {
  const { user, profile } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState("Info");
  const [stats, setStats] = useState(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [history, setHistory] = useState([]);
  const [deleteVisible, setDeleteVisible] = useState(false);

  useEffect(() => {
    if (user) getStats(user.uid).then(setStats);
  }, [user]);

  const copyFriendCode = async () => {
    if (!profile?.friendCode) return;
    await Clipboard.setStringAsync(profile.friendCode);
    showToast(`Copied: ${profile.friendCode}`);
  };

  const handleLogout = async () => {
    await signOut(auth);
    showToast("Logged out successfully.");
  };

  const handleResetPassword = async () => {
    try {
      await resetPassword(auth, user.email);
      showToast("Password reset link sent! Check your email.");
      logUserAction(user.uid, "Requested password reset");
    } catch (e) {
      showToast("Password reset failed: " + e.message, "error");
    }
  };

  const handleViewHistory = async () => {
    const entries = await viewAccountHistory(user.uid);
    setHistory(entries);
    setHistoryVisible(true);
  };

  const handleClearHistory = async () => {
    try {
      await clearAccountHistory(user.uid);
      setHistory([]);
      showToast("Account history cleared successfully.");
    } catch (e) {
      showToast(e.message, "error");
    }
  };

  const handleExport = async () => {
    try {
      const json = await exportUserData(user.uid);
      await Share.share({ message: json, title: "TABS data export" });
    } catch (e) {
      showToast("Error exporting data: " + e.message, "error");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await deleteAccountAndData(user);
      showToast("Account deleted successfully.");
      setDeleteVisible(false);
    } catch (e) {
      if (e.code === "auth/requires-recent-login") {
        showToast("Please re-login before deleting your account.", "error");
      } else {
        showToast("Error deleting account: " + e.message, "error");
      }
    }
  };

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.notLoggedIn}>Not Logged In</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={styles.tabText}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {tab === "Info" && profile && (
          <View>
            <Text style={styles.label}>
              Name: {profile.firstName} {profile.lastName}
            </Text>
            <Text style={styles.label}>Email: {profile.email}</Text>
            <Text style={styles.label}>Phone Number: {profile.phoneNumber || "N/A"}</Text>
            <View style={styles.friendCodeRow}>
              <Text style={styles.label}>Friend Code: {profile.friendCode || "N/A"}</Text>
              <TouchableOpacity onPress={copyFriendCode}>
                <Text style={styles.copyBtn}>Copy</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {tab === "Stats" && stats && (
          <View>
            <Text style={styles.label}>
              Total Spent: ${(stats.amountSpent + stats.amountEarned).toFixed(2)}
            </Text>
            <Text style={styles.label}>Amount Spent: ${stats.amountSpent.toFixed(2)}</Text>
            <Text style={styles.label}>Amount Earned: ${stats.amountEarned.toFixed(2)}</Text>
            <Text style={styles.label}>Total Friends: {stats.totalFriends}</Text>
            <Text style={styles.label}>
              Last Login: {new Date(user.metadata.lastSignInTime).toLocaleDateString()}
            </Text>
            <Text style={styles.label}>
              Account Created: {new Date(user.metadata.creationTime).toLocaleDateString()}
            </Text>
          </View>
        )}

        {tab === "Account" && (
          <View style={styles.accountButtons}>
            <Button title="Logout" onPress={handleLogout} />
            <Button title="Reset Password" variant="muted" onPress={handleResetPassword} />
            <Button title="View Account History" variant="muted" onPress={handleViewHistory} />
            <Button title="Export Data" variant="muted" onPress={handleExport} />
            <Button title="Delete Account" variant="danger" onPress={() => setDeleteVisible(true)} />
          </View>
        )}
      </ScrollView>

      <ModalCard
        visible={historyVisible}
        onRequestClose={() => setHistoryVisible(false)}
        title="Account History"
      >
        <ScrollView style={{ maxHeight: 300 }}>
          {history.length === 0 ? (
            <Text style={styles.label}>No account history available.</Text>
          ) : (
            history.map((entry, i) => (
              <Text key={i} style={styles.historyEntry}>
                {new Date(entry.timestamp).toLocaleString()} — {entry.action}
              </Text>
            ))
          )}
        </ScrollView>
        <Button title="Clear" variant="danger" onPress={handleClearHistory} style={{ marginTop: spacing.sm }} />
        <Button
          title="Close"
          variant="muted"
          onPress={() => setHistoryVisible(false)}
          style={{ marginTop: spacing.sm }}
        />
      </ModalCard>

      <ModalCard
        visible={deleteVisible}
        onRequestClose={() => setDeleteVisible(false)}
        title="Delete account?"
      >
        <Text style={styles.label}>Are you sure you want to delete your account?</Text>
        <Button title="Delete" variant="danger" onPress={handleDeleteAccount} />
        <Button
          title="Cancel"
          variant="muted"
          onPress={() => setDeleteVisible(false)}
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
  notLoggedIn: {
    color: colors.text,
    fontSize: 18,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: colors.accent,
  },
  tabText: {
    color: colors.text,
    fontWeight: "600",
  },
  content: {
    padding: spacing.md,
  },
  label: {
    color: colors.text,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  friendCodeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  copyBtn: {
    color: colors.accent,
    fontWeight: "700",
  },
  accountButtons: {
    gap: spacing.sm,
  },
  historyEntry: {
    color: colors.textMuted,
    marginBottom: spacing.xs,
    fontSize: 13,
  },
});
