import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radius, spacing } from "../theme";

const STATUS_COLOR = {
  owesMe: colors.owesMe,
  iOwe: colors.iOwe,
};

export default function PersonRow({ person, currencySymbol, onPress }) {
  const amountIsNumber = typeof person.amount === "number" && !isNaN(person.amount);
  const amountColor = STATUS_COLOR[person.status] || colors.text;

  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.headerLine}>
        <Text style={styles.name} numberOfLines={1}>
          {person.name}
        </Text>
        <Text style={[styles.amount, { color: amountColor }]} numberOfLines={1}>
          {amountIsNumber ? `${currencySymbol}${person.amount.toFixed(2)}` : String(person.amount)}
        </Text>
      </View>

      {person.interest?.enabled ? (
        <Text style={styles.meta}>
          Interest: {person.interest.rate}% ({person.interest.period})
        </Text>
      ) : null}

      {person.extraInfo?.length ? (
        <View style={styles.extraInfoWrap}>
          {person.extraInfo.map((info, i) => (
            <Text key={i} style={styles.extraInfo} numberOfLines={2}>
              • {info.text}
            </Text>
          ))}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  headerLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "600",
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  amount: {
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  extraInfoWrap: {
    marginTop: spacing.xs,
  },
  extraInfo: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
