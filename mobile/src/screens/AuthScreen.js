import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { ref, set } from "firebase/database";
import { auth, database } from "../firebaseConfig";
import { useToast } from "../context/ToastContext";
import Button from "../components/Button";
import TextField from "../components/TextField";
import { colors, spacing } from "../theme";
import { generateFriendCode } from "../lib/friends";
import { logUserAction, resetPassword } from "../lib/account";

const ERROR_MESSAGES = {
  "auth/invalid-email": "Invalid email or password",
  "auth/wrong-password": "Invalid email or password",
  "auth/user-not-found": "Invalid email or password",
  "auth/invalid-credential": "Invalid email or password",
  "auth/too-many-requests": "Too many failed attempts. Try again later.",
};

export default function AuthScreen({ onContinueAsGuest }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState("login"); // 'login' | 'signup'
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const formatPhone = (raw) => {
    const digits = raw.replace(/\D/g, "").substring(0, 10);
    if (digits.length > 6) {
      return `(${digits.substring(0, 3)}) ${digits.substring(3, 6)}-${digits.substring(6)}`;
    }
    if (digits.length > 3) {
      return `(${digits.substring(0, 3)}) ${digits.substring(3)}`;
    }
    if (digits.length > 0) return `(${digits}`;
    return digits;
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      await logUserAction(auth.currentUser?.uid, "Logged in");
      showToast("Welcome back!");
    } catch (e) {
      showToast(ERROR_MESSAGES[e.code] || "Something went wrong. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password || !firstName || !lastName || !phone) {
      showToast("Please fill in all fields before signing up.", "error");
      return;
    }
    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      const user = credential.user;
      const friendCode = generateFriendCode();

      await set(ref(database, `users/${user.uid}/profile`), {
        firstName,
        lastName,
        phoneNumber: phone,
        email: email.trim(),
        friendCode,
      });
      await set(ref(database, `friendCodes/${friendCode}`), {
        userId: user.uid,
        firstName,
        lastName,
      });

      await logUserAction(user.uid, "Signed up with email");
      showToast(`Account created for ${user.email}!`);
    } catch (e) {
      showToast(`Signup failed: ${e.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!email) {
      showToast("Please enter your email.", "error");
      return;
    }
    try {
      await resetPassword(auth, email.trim());
      showToast("Password reset link sent! Check your email.");
    } catch (e) {
      showToast("Password reset failed: " + e.message, "error");
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>TABS</Text>

        <View style={styles.modeRow}>
          <Button
            title="Login"
            variant={mode === "login" ? "primary" : "muted"}
            onPress={() => setMode("login")}
            style={styles.flex1}
          />
          <Button
            title="Signup"
            variant={mode === "signup" ? "primary" : "muted"}
            onPress={() => setMode("signup")}
            style={styles.flex1}
          />
        </View>

        {mode === "signup" && (
          <>
            <TextField placeholder="First Name" value={firstName} onChangeText={setFirstName} />
            <TextField placeholder="Last Name" value={lastName} onChangeText={setLastName} />
            <TextField
              placeholder="Phone Number"
              value={phone}
              onChangeText={(v) => setPhone(formatPhone(v))}
              keyboardType="phone-pad"
              maxLength={14}
            />
          </>
        )}

        <TextField
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {mode === "login" ? (
          <>
            <Button title="Login" onPress={handleLogin} loading={loading} />
            <Button
              title="Reset Password"
              variant="muted"
              onPress={handleReset}
              style={{ marginTop: spacing.sm }}
            />
          </>
        ) : (
          <Button title="Sign Up" onPress={handleSignup} loading={loading} />
        )}

        <Button
          title="Continue as Guest (Nothing will be saved)"
          variant="muted"
          onPress={onContinueAsGuest}
          style={{ marginTop: spacing.lg }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: spacing.lg,
    paddingTop: spacing.xl * 2,
  },
  title: {
    color: colors.text,
    fontSize: 36,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  flex1: {
    flex: 1,
  },
});
