import React, { useMemo, useRef, useState } from "react";
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Modal, Pressable, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import * as LocalAuthentication from "expo-local-authentication";

import { PrimaryButton } from "../../components/PrimaryButton";
import { TextField } from "../../components/TextField";
import { ToastModal } from "../../components/ToastModal";
import { useAuth } from "../../providers/Web3AuthProvider";
import { resolveEmailToWallet } from "../../services/addressResolution";
import { sendCusdWithPaymaster, TransferIntent, TransferResult } from "../../services/transfers";
import { getCusdBalance } from "../../services/blockchain";
import { useTheme } from "../../providers/ThemeProvider";
import type { ColorPalette } from "../../utils/theme";
import { spacing, typography } from "../../utils/theme";
import { useToast } from "../../utils/toast";
import type { RootStackParamList } from "../../navigation/RootNavigator";

const FormSchema = z.object({
  email: z.string().email(),
  amount: z.number().gt(0, "Enter an amount greater than zero"),
  memo: z.string().max(120, "Keep memo under 120 characters").optional(),
});

type FormState = {
  email: string;
  amount: string;
  memo: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

export const SendScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { profile, sendUserOperation } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const scrollViewRef = useRef<ScrollView>(null);
  const [form, setForm] = useState<FormState>({ email: "", amount: "", memo: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<TransferResult | null>(null);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<TransferIntent | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  // Query cUSD balance
  const { data: cusdBalance, isLoading: loadingBalance } = useQuery({
    queryKey: ["cusdBalance", profile?.walletAddress],
    queryFn: () => {
      if (!profile?.walletAddress) throw new Error("No wallet");
      return getCusdBalance(profile.walletAddress as `0x${string}`);
    },
    enabled: Boolean(profile?.walletAddress),
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  if (!profile) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.card}>
          <Text style={styles.title}>Wallet not connected</Text>
          <Text style={styles.subtitle}>Please sign in with your Smart Wallet to send cUSD.</Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (!profile.walletAddress || !profile.walletAddress.startsWith("0x")) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={styles.card}>
          <Text style={styles.title}>Celo wallet not ready</Text>
          <Text style={styles.subtitle}>
            Your Smart Wallet is being created. Please wait a moment and try again.
          </Text>
        </View>
      </KeyboardAvoidingView>
    );
  }

  const emailIsValid = useMemo(() => z.string().email().safeParse(form.email).success, [form.email]);

  const { data: emailLookup, isFetching: resolvingEmail } = useQuery({
    queryKey: ["emailLookup", form.email.toLowerCase().trim()],
    queryFn: () => resolveEmailToWallet({ email: form.email.toLowerCase().trim() }),
    enabled: emailIsValid,
    staleTime: 1000 * 5, // Reduced from 30s to 5s to pick up newly registered users faster
    retry: 1, // Retry once if lookup fails
  });

  const mutation = useMutation({
    mutationFn: async (intent: TransferIntent) => {
      console.log("🔵 Mutation started for:", intent);

      if (!profile?.walletAddress) {
        console.error("❌ No wallet address");
        throw new Error("Wallet not connected");
      }

      console.log("📍 Wallet address:", profile.walletAddress);

      console.log(" Calling sendCusdWithPaymaster...");
      const result = await sendCusdWithPaymaster(
        profile.walletAddress as `0x${string}`,
        intent,
        sendUserOperation
      );
      console.log("✅ Transfer result:", result);
      return result;
    },
    onSuccess: async (payload) => {
      console.log("🎉 Mutation success:", payload);
      await queryClient.invalidateQueries({ queryKey: ["transfers", profile?.walletAddress] });
      await queryClient.invalidateQueries({ queryKey: ["cusdBalance", profile?.walletAddress] });
      setResult(payload);
      setForm((prev) => ({ ...prev, amount: "", memo: "" }));
      setIsConfirmModalVisible(false);
      setPendingIntent(null);
      setIsAuthenticating(false);

      // Show toast notification
      if (payload.status === "pending_recipient_signup") {
        showToast(`Invite sent to ${form.email}. They'll receive an email to claim funds.`, "success");
      } else if (payload.status === "sent") {
        showToast(`Successfully sent ${form.amount} cUSD to ${form.email}`, "success");
      }
    },
    onError: (error) => {
      console.error("❌ Mutation error:", error);
      setIsConfirmModalVisible(false);
      setPendingIntent(null);
      setIsAuthenticating(false);
      showToast(error instanceof Error ? error.message : "Transfer failed", "error");
    },
  });

  const handleChange = (key: keyof FormState, value: string) => {
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleMemoFocus = () => {
    // Scroll to bottom to show send button when memo is focused
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const buildTransferIntent = (): TransferIntent | null => {
    try {
      // Basic validation before parsing
      if (!form.email.trim()) {
        setErrors({ email: "Email is required" });
        return null;
      }

      if (!form.amount.trim()) {
        setErrors({ amount: "Amount is required" });
        return null;
      }

      const amountNumber = parseFloat(form.amount);
      if (isNaN(amountNumber)) {
        setErrors({ amount: "Please enter a valid number" });
        return null;
      }

      const parsed = FormSchema.safeParse({
        email: form.email.trim().toLowerCase(),
        amount: amountNumber,
        memo: form.memo.trim() || undefined,
      });

      if (!parsed.success) {
        const fieldErrors: FieldErrors = {};
        parsed.error.issues.forEach((issue) => {
          const path = issue.path[0] as keyof FormState | undefined;
          if (path) fieldErrors[path] = issue.message;
        });
        setErrors(fieldErrors);
        return null;
      }

      setErrors({});
      setResult(null);

      const payload: TransferIntent = {
        recipientEmail: parsed.data.email,
        amountCusd: parsed.data.amount,
        memo: parsed.data.memo,
        senderEmail: profile.email ?? undefined,
        senderName: profile.displayName ?? profile.email ?? undefined,
        senderUserId: profile.userId,
      };
      return payload;
    } catch (error) {
      console.error("Submit error:", error);
      setErrors({ email: "An error occurred. Please try again." });
      return null;
    }
  };

  const handleReviewAndSend = () => {
    Keyboard.dismiss();
    const intent = buildTransferIntent();
    if (!intent) {
      return;
    }

    setPendingIntent(intent);
    setIsConfirmModalVisible(true);
  };

  const handleBiometricAuth = async () => {
    if (!pendingIntent) return;

    setIsAuthenticating(true);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        // If no biometric hardware, proceed without authentication
        Alert.alert(
          "Confirm Transaction",
          "Biometric authentication is not available. Do you want to proceed?",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsAuthenticating(false) },
            {
              text: "Confirm",
              onPress: () => {
                mutation.mutate(pendingIntent);
              }
            }
          ]
        );
        setIsAuthenticating(false);
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        Alert.alert(
          "Biometrics Not Set Up",
          "Biometric authentication is not set up. Do you want to proceed?",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsAuthenticating(false) },
            {
              text: "Confirm",
              onPress: () => {
                mutation.mutate(pendingIntent);
              }
            }
          ]
        );
        setIsAuthenticating(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm Transaction",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        mutation.mutate(pendingIntent);
      } else {
        setIsAuthenticating(false);
        showToast("Authentication cancelled", "info");
      }
    } catch (error) {
      console.error("Biometric auth error:", error);
      setIsAuthenticating(false);
      showToast("Authentication failed. Please try again.", "error");
    }
  };

  const handleCancelConfirmation = () => {
    setIsConfirmModalVisible(false);
    setPendingIntent(null);
    setIsAuthenticating(false);
  };

  const recipientInfo = useMemo(() => {
    if (!emailLookup) return null;
    if (emailLookup.isRegistered && emailLookup.walletAddress) {
      return `Registered user (${emailLookup.walletAddress.slice(0, 6)}...${emailLookup.walletAddress.slice(-4)})`;
    }
    return emailLookup.isRegistered
      ? "Registered user"
      : "New user - will receive invite email";
  }, [emailLookup]);

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Send cUSD via email</Text>
            <Text style={styles.subtitle}>
              Oweza resolves the recipient's wallet automatically. If they do not have an account yet, we
              email them a redemption link to claim funds after onboarding.
            </Text>

            <TextField
              label="Recipient email"
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              value={form.email}
              onChangeText={(value) => handleChange("email", value)}
              error={errors.email}
            />
            {emailLookup ? (
              <Text style={styles.lookup}>
                {emailLookup.isRegistered
                  ? `Registered Oweza user. Wallet: ${emailLookup.walletAddress}`
                  : "No Oweza account yet — transfer will queue until signup."}
              </Text>
            ) : resolvingEmail && emailIsValid ? (
              <Text style={styles.lookup}>Resolving recipient wallet…</Text>
            ) : null}

            <TextField
              label="Amount (cUSD)"
              keyboardType="numeric"
              value={form.amount}
              onChangeText={(value) => handleChange("amount", value)}
              error={errors.amount}
            />

            {cusdBalance !== undefined && (
              <Text style={styles.balanceText}>
                Balance: {cusdBalance.toFixed(2)} cUSD
              </Text>
            )}

            <TextField
              label="Memo (optional)"
              value={form.memo}
              onChangeText={(value) => handleChange("memo", value)}
              onFocus={handleMemoFocus}
              error={errors.memo}
              placeholder="Add a note for the recipient"
              multiline
              numberOfLines={2}
            />

            <PrimaryButton
              title="Review & Send"
              onPress={handleReviewAndSend}
              loading={mutation.isPending}
            />

            {mutation.error ? (
              <Text style={styles.error}>
                {mutation.error instanceof Error
                  ? mutation.error.message
                  : "Something went wrong while sending the transfer."}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirmation Modal */}
      <Modal
        visible={isConfirmModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancelConfirmation}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Confirm Transaction</Text>
              <Pressable onPress={handleCancelConfirmation} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.confirmationDetails}>
              <View style={styles.confirmationRow}>
                <Text style={styles.confirmationLabel}>Sending to</Text>
                <View style={styles.confirmationValueContainer}>
                  <Text style={styles.confirmationValue}>{pendingIntent?.recipientEmail}</Text>
                  {recipientInfo && (
                    <Text style={styles.confirmationSubtext}>{recipientInfo}</Text>
                  )}
                </View>
              </View>

              <View style={styles.confirmationDivider} />

              <View style={styles.confirmationRow}>
                <Text style={styles.confirmationLabel}>Amount</Text>
                <Text style={styles.confirmationAmount}>
                  {pendingIntent?.amountCusd} cUSD
                </Text>
              </View>

              {pendingIntent?.memo && (
                <>
                  <View style={styles.confirmationDivider} />
                  <View style={styles.confirmationRow}>
                    <Text style={styles.confirmationLabel}>Memo</Text>
                    <Text style={styles.confirmationValue}>{pendingIntent.memo}</Text>
                  </View>
                </>
              )}

              <View style={styles.confirmationDivider} />

              <View style={styles.confirmationRow}>
                <Text style={styles.confirmationLabel}>Network</Text>
                <Text style={styles.confirmationValue}>Celo Sepolia</Text>
              </View>

              <View style={styles.confirmationRow}>
                <Text style={styles.confirmationLabel}>Gas Fee</Text>
                <Text style={styles.confirmationFree}>Free (Celo Paymaster)</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancelConfirmation}
                disabled={isAuthenticating || mutation.isPending}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  (isAuthenticating || mutation.isPending) && styles.confirmButtonDisabled
                ]}
                onPress={handleBiometricAuth}
                disabled={isAuthenticating || mutation.isPending}
              >
                {isAuthenticating || mutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.confirmButtonText}>🔒 Confirm</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.biometricHint}>
              You'll be asked to authenticate with biometrics
            </Text>
          </View>
        </View>
      </Modal>

      {/* Toast Modal */}
      <ToastModal
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={hideToast}
      />
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flexGrow: 1,
      padding: spacing.lg,
      paddingBottom: spacing.xl * 4, // Extra padding to ensure button is visible above keyboard
      backgroundColor: colors.background,
    },
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: 18,
      padding: spacing.lg,
      gap: spacing.md,
    },
    title: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
    },
    lookup: {
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    balanceText: {
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: -spacing.sm,
      marginBottom: spacing.sm,
    },
    error: {
      color: colors.error,
      marginTop: spacing.sm,
    },
    success: {
      color: colors.success,
      marginTop: spacing.sm,
    },

    // Modal Styles
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: spacing.xl,
      maxHeight: "90%",
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      ...typography.subtitle,
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    modalClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    modalCloseText: {
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: "600",
    },

    // Confirmation Details
    confirmationDetails: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      gap: spacing.md,
    },
    confirmationRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: spacing.md,
    },
    confirmationLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    confirmationValueContainer: {
      flex: 1,
      alignItems: "flex-end",
    },
    confirmationValue: {
      fontSize: 15,
      color: colors.textPrimary,
      fontWeight: "500",
      textAlign: "right",
    },
    confirmationSubtext: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      textAlign: "right",
    },
    confirmationAmount: {
      fontSize: 20,
      color: colors.textPrimary,
      fontWeight: "700",
    },
    confirmationFree: {
      fontSize: 15,
      color: colors.success,
      fontWeight: "600",
    },
    confirmationDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
    },

    // Modal Actions
    modalActions: {
      flexDirection: "row",
      paddingHorizontal: spacing.lg,
      gap: spacing.md,
      marginTop: spacing.md,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    confirmButtonDisabled: {
      opacity: 0.6,
    },
    confirmButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    biometricHint: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
  });
