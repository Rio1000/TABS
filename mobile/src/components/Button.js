import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { colors, radius, spacing } from "../theme";

const VARIANTS = {
  primary: { backgroundColor: colors.accent, color: "#fff" },
  danger: { backgroundColor: colors.danger, color: "#fff" },
  muted: { backgroundColor: colors.surfaceAlt, color: colors.text },
  success: { backgroundColor: colors.success, color: "#172022" },
};

export default function Button({
  title,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
}) {
  const v = VARIANTS[variant] || VARIANTS.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
      style={[
        styles.base,
        { backgroundColor: v.backgroundColor, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.color} />
      ) : (
        <Text style={[styles.text, { color: v.color }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontWeight: "600",
    fontSize: 15,
  },
});
