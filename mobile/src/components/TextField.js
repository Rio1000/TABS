import React from "react";
import { StyleSheet, TextInput } from "react-native";
import { colors, radius, spacing } from "../theme";

export default function TextField({ style, ...props }) {
  return (
    <TextInput
      placeholderTextColor={colors.textDim}
      style={[styles.input, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
});
