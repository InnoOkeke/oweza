import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useTheme } from "../providers/ThemeProvider";
import { spacing, typography } from "../utils/theme";
import { TextField } from "../components/TextField";

type Props = NativeStackScreenProps<RootStackParamList, "Withdraw">;

export const WithdrawScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const [activeTab, setActiveTab] = useState<"to" | "amount">("to");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");

  const handleContinue = () => {
    // TODO: Implement withdraw logic
    console.log("Withdraw", { recipient, amount });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.inner, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>Withdraw cUSD</Text>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "to" && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab("to")}
          >
            <Text style={[styles.tabText, activeTab === "to" && { color: "#FFFFFF" }, { color: activeTab === "to" ? "#FFFFFF" : colors.textPrimary }]}>
              To
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "amount" && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab("amount")}
          >
            <Text style={[styles.tabText, activeTab === "amount" && { color: "#FFFFFF" }, { color: activeTab === "amount" ? "#FFFFFF" : colors.textPrimary }]}>
              Amount
            </Text>
          </TouchableOpacity>
        </View>

        {activeTab === "to" && (
          <View style={styles.inputContainer}>
            <TextField
              label="Recipient"
              value={recipient}
              onChangeText={setRecipient}
              placeholder="Enter email or wallet address"
              autoFocus
            />
          </View>
        )}

        {activeTab === "amount" && (
          <View style={styles.amountContainer}>
            <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>$</Text>
            <TextInput
              style={[styles.amountInput, { color: colors.textPrimary }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              autoFocus
            />
            <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>cUSD</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: colors.primary }]}
          onPress={handleContinue}
          disabled={!recipient || !amount}
        >
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  inner: {
    padding: spacing.lg,
    flex: 1,
  },
  headerText: {
    ...typography.subtitle,
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  tabText: {
    ...typography.body,
    fontWeight: "600",
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  amountContainer: {
    alignItems: "center",
    marginVertical: spacing.xl,
  },
  currencySymbol: {
    ...typography.title,
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  amountInput: {
    ...typography.title,
    fontSize: 48,
    textAlign: "center",
    width: "100%",
  },
  currencyLabel: {
    ...typography.body,
    fontSize: 16,
    marginTop: spacing.sm,
  },
  continueButton: {
    paddingVertical: spacing.lg,
    borderRadius: 16,
    alignItems: "center",
    marginTop: "auto",
  },
  continueButtonText: {
    ...typography.subtitle,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});