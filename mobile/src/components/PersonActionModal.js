import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import ModalCard from "./ModalCard";
import Button from "./Button";
import TextField from "./TextField";
import { colors, spacing } from "../theme";
import { useToast } from "../context/ToastContext";

const PERIODS = ["weekly", "monthly", "quarterly", "yearly"];

export default function PersonActionModal({ visible, person, onClose, onUpdate, onRemove }) {
  const { showToast } = useToast();
  const [subModal, setSubModal] = useState(null); // 'addMoney' | 'removeMoney' | 'editName' | 'editItem' | 'addInfo' | 'interest' | null
  const [inputValue, setInputValue] = useState("");

  if (!person) return null;

  const isAmountNumeric = typeof person.amount === "number" && !isNaN(person.amount);

  const openSub = (name, prefill = "") => {
    setInputValue(prefill);
    setSubModal(name);
  };
  const closeSub = () => {
    setSubModal(null);
    setInputValue("");
  };

  const toggleStatus = (status) => {
    const next = person.status === status ? "neutral" : status;
    onUpdate({ status: next });
  };

  const submitAddMoney = () => {
    const amount = parseFloat(inputValue);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }
    const current = typeof person.amount === "number" ? person.amount : 0;
    onUpdate({ amount: current + amount });
    showToast(`Added $${amount.toFixed(2)} to ${person.name}.`);
    closeSub();
  };

  const submitRemoveMoney = () => {
    const amount = parseFloat(inputValue);
    if (isNaN(amount) || amount <= 0) {
      showToast("Please enter a valid amount.", "error");
      return;
    }
    const current = typeof person.amount === "number" ? person.amount : 0;
    onUpdate({ amount: Math.max(0, current - amount) });
    showToast(`Removed $${amount.toFixed(2)} from ${person.name}.`);
    closeSub();
  };

  const submitEditName = () => {
    const name = inputValue.trim();
    if (!name) {
      showToast("Name cannot be empty.", "error");
      return;
    }
    onUpdate({ name });
    showToast("Name updated successfully.");
    closeSub();
  };

  const submitEditItem = () => {
    const item = inputValue.trim();
    if (!item) {
      showToast("Please enter a valid item name.", "error");
      return;
    }
    onUpdate({ amount: item });
    showToast(`Updated item to "${item}".`);
    closeSub();
  };

  const submitAddInfo = () => {
    const text = inputValue.trim();
    if (!text) {
      showToast("Information cannot be empty", "error");
      return;
    }
    onUpdate({ extraInfo: [...(person.extraInfo || []), { text, hasRemoveBtn: true }] });
    showToast("Extra info added.");
    closeSub();
  };

  const removeInfo = (i) => {
    const next = (person.extraInfo || []).filter((_, idx) => idx !== i);
    onUpdate({ extraInfo: next });
  };

  const setInterest = (updates) => {
    onUpdate({
      interest: {
        ...(person.interest || { enabled: false, rate: 0, period: "monthly" }),
        ...updates,
        lastInterestApplied: Date.now(),
      },
    });
  };

  return (
    <>
      <ModalCard visible={visible && !subModal} onRequestClose={onClose} title={person.name}>
        <View style={styles.actionGrid}>
          {isAmountNumeric ? (
            <>
              <Button title="Add Money" onPress={() => openSub("addMoney")} />
              <Button title="Remove Money" variant="danger" onPress={() => openSub("removeMoney")} />
            </>
          ) : (
            <Button title="Edit Item" onPress={() => openSub("editItem", String(person.amount))} />
          )}
          <Button title="Add Info" variant="muted" onPress={() => openSub("addInfo")} />
          <Button title="Edit Name" variant="muted" onPress={() => openSub("editName", person.name)} />
        </View>

        {person.extraInfo?.length ? (
          <View style={styles.infoList}>
            {person.extraInfo.map((info, i) => (
              <View key={i} style={styles.infoRow}>
                <Text style={styles.infoText}>{info.text}</Text>
                <Text style={styles.removeX} onPress={() => removeInfo(i)}>
                  ✕
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.statusRow}>
          <Button
            title="I Owe"
            variant={person.status === "iOwe" ? "danger" : "muted"}
            disabled={person.status === "owesMe"}
            onPress={() => toggleStatus("iOwe")}
            style={styles.flex1}
          />
          <Button
            title="They Owe"
            variant={person.status === "owesMe" ? "success" : "muted"}
            disabled={person.status === "iOwe"}
            onPress={() => toggleStatus("owesMe")}
            style={styles.flex1}
          />
        </View>

        <Button title="Interest" variant="danger" onPress={() => openSub("interest")} />
        <Button title="Remove Person" variant="danger" onPress={onRemove} style={{ marginTop: spacing.sm }} />
        <Button title="Close" variant="muted" onPress={onClose} style={{ marginTop: spacing.sm }} />
      </ModalCard>

      <ModalCard visible={subModal === "addMoney"} onRequestClose={closeSub} title="Add Money">
        <TextField
          placeholder="Amount"
          keyboardType="decimal-pad"
          value={inputValue}
          onChangeText={setInputValue}
          autoFocus
        />
        <Button title="Add" onPress={submitAddMoney} />
        <Button title="Cancel" variant="muted" onPress={closeSub} style={{ marginTop: spacing.sm }} />
      </ModalCard>

      <ModalCard visible={subModal === "removeMoney"} onRequestClose={closeSub} title="Remove Money">
        <TextField
          placeholder="Amount"
          keyboardType="decimal-pad"
          value={inputValue}
          onChangeText={setInputValue}
          autoFocus
        />
        <Button title="Remove" variant="danger" onPress={submitRemoveMoney} />
        <Button title="Cancel" variant="muted" onPress={closeSub} style={{ marginTop: spacing.sm }} />
      </ModalCard>

      <ModalCard visible={subModal === "editName"} onRequestClose={closeSub} title="Edit Name">
        <TextField placeholder="Name" value={inputValue} onChangeText={setInputValue} autoFocus />
        <Button title="Done" onPress={submitEditName} />
        <Button title="Cancel" variant="muted" onPress={closeSub} style={{ marginTop: spacing.sm }} />
      </ModalCard>

      <ModalCard visible={subModal === "editItem"} onRequestClose={closeSub} title="Edit Item">
        <TextField placeholder="Item" value={inputValue} onChangeText={setInputValue} autoFocus />
        <Button title="Done" onPress={submitEditItem} />
        <Button title="Cancel" variant="muted" onPress={closeSub} style={{ marginTop: spacing.sm }} />
      </ModalCard>

      <ModalCard visible={subModal === "addInfo"} onRequestClose={closeSub} title="Add Extra Info">
        <TextField
          placeholder="Extra Info"
          value={inputValue}
          onChangeText={setInputValue}
          multiline
          autoFocus
        />
        <Button title="Add" onPress={submitAddInfo} />
        <Button title="Cancel" variant="muted" onPress={closeSub} style={{ marginTop: spacing.sm }} />
      </ModalCard>

      <ModalCard visible={subModal === "interest"} onRequestClose={closeSub} title="Interest">
        <View style={styles.statusRow}>
          <Button
            title={person.interest?.enabled ? "Enabled" : "Disabled"}
            variant={person.interest?.enabled ? "success" : "muted"}
            onPress={() => setInterest({ enabled: !person.interest?.enabled })}
            style={styles.flex1}
          />
        </View>
        {person.interest?.enabled ? (
          <>
            <Text style={styles.infoText}>Rate: {person.interest?.rate ?? 0}%</Text>
            <View style={styles.statusRow}>
              {[0, 5, 10, 15, 20, 25, 30].map((r) => (
                <Text
                  key={r}
                  onPress={() => setInterest({ rate: r })}
                  style={[
                    styles.rateChip,
                    person.interest?.rate === r && styles.rateChipActive,
                  ]}
                >
                  {r}%
                </Text>
              ))}
            </View>
            <View style={styles.statusRow}>
              {PERIODS.map((p) => (
                <Text
                  key={p}
                  onPress={() => setInterest({ period: p })}
                  style={[
                    styles.rateChip,
                    person.interest?.period === p && styles.rateChipActive,
                  ]}
                >
                  {p}
                </Text>
              ))}
            </View>
          </>
        ) : null}
        <Button title="Close" variant="muted" onPress={closeSub} style={{ marginTop: spacing.sm }} />
      </ModalCard>
    </>
  );
}

const styles = StyleSheet.create({
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  statusRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginVertical: spacing.sm,
    flexWrap: "wrap",
  },
  flex1: {
    flexGrow: 1,
  },
  infoList: {
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.xs,
  },
  infoText: {
    color: colors.textMuted,
    flexShrink: 1,
  },
  removeX: {
    color: colors.danger,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
  },
  rateChip: {
    color: colors.textMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    overflow: "hidden",
    fontSize: 12,
  },
  rateChipActive: {
    color: "#fff",
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
});
