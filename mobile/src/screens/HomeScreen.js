import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { usePeopleList } from "../lib/usePeopleList";
import { CURRENCIES, useCurrency } from "../lib/currency";
import PersonRow from "../components/PersonRow";
import PersonActionModal from "../components/PersonActionModal";
import ModalCard from "../components/ModalCard";
import Button from "../components/Button";
import TextField from "../components/TextField";
import { colors, spacing } from "../theme";

export default function HomeScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { people, loading, addPerson, removePerson, updatePerson, clearAll } =
    usePeopleList(user?.uid);

  const { currency, setCurrency, symbol, toDisplay, toUsd } = useCurrency();
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [addVisible, setAddVisible] = useState(false);
  const [clearVisible, setClearVisible] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");

  const selectedPerson = selectedIndex !== null ? people[selectedIndex] : null;

  const submitAdd = () => {
    if (!name.trim()) {
      showToast("Name cannot be empty", "error");
      return;
    }
    if (!amount.trim()) {
      showToast("Amount cannot be empty", "error");
      return;
    }
    // amount was typed in the currently selected display currency —
    // usePeopleList/Firebase stores everything in USD, so convert it here.
    const trimmed = amount.trim();
    const numeric = parseFloat(trimmed);
    const canonicalAmount = isNaN(numeric) ? trimmed : toUsd(numeric);
    addPerson(name.trim(), canonicalAmount);
    setName("");
    setAmount("");
    setAddVisible(false);
  };

  const submitClear = () => {
    clearAll();
    setClearVisible(false);
    showToast("People list cleared successfully.");
  };

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.currencyRow}
      >
        {CURRENCIES.map(({ code }) => (
          <TouchableOpacity
            key={code}
            onPress={() => setCurrency(code)}
            style={[styles.chip, currency === code && styles.chipActive]}
          >
            <Text style={[styles.chipText, currency === code && styles.chipTextActive]}>
              {code}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.accent} />
      ) : (
        <FlatList
          data={people}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingVertical: spacing.md }}
          renderItem={({ item, index }) => (
            <PersonRow
              person={item}
              currencySymbol={symbol}
              toDisplay={toDisplay}
              onPress={() => setSelectedIndex(index)}
            />
          )}
          ListEmptyComponent={
            <Text style={styles.empty}>No tabs yet. Tap "Add" to start one.</Text>
          }
        />
      )}

      <View style={styles.footer}>
        <Button title="Add" onPress={() => setAddVisible(true)} style={styles.flex1} />
        <Button
          title="Clear"
          variant="danger"
          onPress={() => setClearVisible(true)}
          style={styles.flex1}
        />
      </View>

      <PersonActionModal
        visible={selectedIndex !== null}
        person={selectedPerson}
        currencySymbol={symbol}
        toDisplay={toDisplay}
        toUsd={toUsd}
        onClose={() => setSelectedIndex(null)}
        onUpdate={(updates) => updatePerson(selectedIndex, updates)}
        onRemove={() => {
          removePerson(selectedIndex);
          setSelectedIndex(null);
        }}
      />

      <ModalCard visible={addVisible} onRequestClose={() => setAddVisible(false)} title="Add Person">
        <TextField placeholder="Name" value={name} onChangeText={setName} autoFocus />
        <TextField
          placeholder={`Amount (${symbol})/Item`}
          value={amount}
          onChangeText={setAmount}
        />
        <Button title="Add" onPress={submitAdd} />
        <Button
          title="Cancel"
          variant="muted"
          onPress={() => setAddVisible(false)}
          style={{ marginTop: spacing.sm }}
        />
      </ModalCard>

      <ModalCard
        visible={clearVisible}
        onRequestClose={() => setClearVisible(false)}
        title="Clear list?"
      >
        <Text style={styles.confirmText}>Are you sure you want to clear the list?</Text>
        <Button title="Clear" variant="danger" onPress={submitClear} />
        <Button
          title="Cancel"
          variant="muted"
          onPress={() => setClearVisible(false)}
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
  currencyRow: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fff",
  },
  empty: {
    color: colors.textDim,
    textAlign: "center",
    marginTop: spacing.xl,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  flex1: {
    flex: 1,
  },
  confirmText: {
    color: colors.text,
    marginBottom: spacing.md,
  },
});
