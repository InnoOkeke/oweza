import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Alert } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useMutation } from "@tanstack/react-query";

import { PrimaryButton } from "../../components/PrimaryButton";
import { useAuth } from "../../providers/Web3AuthProvider";
import { useTheme } from "../../providers/ThemeProvider";
import { getTransferDetails, claimPendingTransfer, type PendingTransferDetails } from "../../services/api";
import { PendingTransfer } from "../../types/database";
import type { ColorPalette } from "../../utils/theme";
import { spacing, typography } from "../../utils/theme";
import { RootStackParamList } from "../../navigation/RootNavigator";

type ClaimScreenRouteProp = RouteProp<RootStackParamList, "Claim">;
type ClaimScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, "Claim">;

export const ClaimScreen: React.FC = () => {
  const route = useRoute<ClaimScreenRouteProp>();
  const navigation = useNavigation<ClaimScreenNavigationProp>();
  const { profile, isConnected } = useAuth();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const [transfer, setTransfer] = useState<PendingTransferDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const transferId = route.params?.transferId;

  useEffect(() => {
    if (transferId) {
      loadTransferDetails();
    } else {
      setError("No transfer ID provided");
      setLoading(false);
    }
  }, [transferId]);

  const loadTransferDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const details = await getTransferDetails(transferId);

      if (!details) {
        setError("Transfer not found");
      } else if (details.status !== "pending") {
        setError(`This transfer has already been ${details.status}`);
      } else {
        setTransfer(details);
      }
    } catch (err) {
      console.error("Failed to load transfer:", err);
      setError(err instanceof Error ? err.message : "Failed to load transfer details");
    } finally {
      setLoading(false);
    }
  };

  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.userId) {
        throw new Error("Please sign in to claim this transfer");
      }
      if (!transferId) {
        throw new Error("No transfer ID");
      }
      return await claimPendingTransfer(transferId, profile.userId);
    },
    onSuccess: (txHash) => {
      Alert.alert(
        "Success! 🎉",
        `Your ${transfer?.amount} ${transfer?.token} has been claimed and sent to your wallet.`,
        [
          {
            text: "View Wallet",
            onPress: () => navigation.navigate("Home"),
          },
        ]
      );
    },
    onError: (err) => {
      Alert.alert(
        "Claim Failed",
        err instanceof Error ? err.message : "Failed to claim transfer. Please try again.",
        [{ text: "OK" }]
      );
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading transfer details...</Text>
      </View>
    );
  }

  if (error || !transfer) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Unable to Load Transfer</Text>
          <Text style={styles.errorMessage}>{error || "Transfer not found"}</Text>
          <PrimaryButton
            title="Go to Home"
            onPress={() => navigation.navigate("Home")}
          />
        </View>
      </View>
    );
  }

  const calculateDaysRemaining = (expiresAt: string): number => {
    const now = Date.now();
    const expires = new Date(expiresAt).getTime();
    const diff = expires - now;
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };

  if (!isConnected) {
    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.card}>
            <Text style={styles.icon}>💸</Text>
            <Text style={styles.title}>You've Got Money!</Text>
            <Text style={styles.amount}>
              {transfer.amount} {transfer.token}
            </Text>
            <Text style={styles.fromText}>
              from {transfer.senderName || transfer.senderEmail}
            </Text>

            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                ⏰ This transfer expires in {calculateDaysRemaining(transfer.expiresAt)} days
              </Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.instructionTitle}>Sign in to claim</Text>
            <Text style={styles.instruction}>
              Please sign in with <Text style={styles.bold}>{transfer.recipientEmail}</Text> to claim this transfer.
            </Text>

            <PrimaryButton
              title="Sign In"
              onPress={() => navigation.navigate("Home")}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  // User is signed in - check if email matches
  const emailMatches = profile?.email?.toLowerCase() === transfer.recipientEmail.toLowerCase();

  if (!emailMatches) {
    return (
      <View style={styles.container}>
        <View style={styles.errorCard}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Email Mismatch</Text>
          <Text style={styles.errorMessage}>
            This transfer is for <Text style={styles.bold}>{transfer.recipientEmail}</Text>, but you're signed in as{" "}
            <Text style={styles.bold}>{profile?.email}</Text>.
          </Text>
          <Text style={styles.errorMessage}>
            Please sign in with the correct email to claim this transfer.
          </Text>
          <PrimaryButton
            title="Go to Home"
            onPress={() => navigation.navigate("Home")}
          />
        </View>
      </View>
    );
  }

  // User can claim
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.card}>
          <Text style={styles.icon}>💰</Text>
          <Text style={styles.title}>Ready to Claim!</Text>
          <Text style={styles.amount}>
            {transfer.amount} {transfer.token}
          </Text>
          <Text style={styles.fromText}>
            from {transfer.senderName || transfer.senderEmail}
          </Text>

          <View style={styles.divider} />

          <View style={styles.detailsSection}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Network:</Text>
              <Text style={styles.detailValue}>{transfer.chain.toUpperCase()}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Sent to:</Text>
              <Text style={styles.detailValue}>{transfer.recipientEmail}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Expires in:</Text>
              <Text style={styles.detailValue}>
                {calculateDaysRemaining(transfer.expiresAt)} days
              </Text>
            </View>
          </View>

          {transfer.message && (
            <View style={styles.messageBox}>
              <Text style={styles.messageLabel}>Message from sender:</Text>
              <Text style={styles.messageText}>{transfer.message}</Text>
            </View>
          )}

          <PrimaryButton
            title={claimMutation.isPending ? "Claiming..." : "Claim Now"}
            onPress={() => claimMutation.mutate()}
            disabled={claimMutation.isPending}
          />
        </View>
      </ScrollView>
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          justifyContent: "center",
          alignItems: "center",
        },
        scrollContent: {
          flexGrow: 1,
          padding: spacing.lg,
          justifyContent: "center",
        },
        card: {
          backgroundColor: colors.cardBackground,
          borderRadius: 18,
          padding: spacing.xl,
          alignItems: "center",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          elevation: 4,
        },
        errorCard: {
          backgroundColor: colors.cardBackground,
          borderRadius: 18,
          padding: spacing.xl,
          alignItems: "center",
          maxWidth: 400,
          margin: spacing.lg,
        },
        icon: {
          fontSize: 64,
          marginBottom: spacing.md,
        },
        errorIcon: {
          fontSize: 64,
          marginBottom: spacing.md,
        },
        title: {
          ...typography.title,
          color: colors.textPrimary,
          textAlign: "center",
          marginBottom: spacing.sm,
        },
        errorTitle: {
          ...typography.subtitle,
          color: colors.textPrimary,
          textAlign: "center",
          marginBottom: spacing.md,
        },
        amount: {
          fontSize: 42,
          fontWeight: "bold",
          color: colors.primary,
          marginBottom: spacing.xs,
        },
        fromText: {
          ...typography.body,
          color: colors.textSecondary,
          textAlign: "center",
          marginBottom: spacing.lg,
        },
        divider: {
          width: "100%",
          height: 1,
          backgroundColor: colors.border,
          marginVertical: spacing.lg,
        },
        instructionTitle: {
          ...typography.subtitle,
          color: colors.textPrimary,
          marginBottom: spacing.sm,
          textAlign: "center",
        },
        instruction: {
          ...typography.body,
          color: colors.textSecondary,
          textAlign: "center",
          marginBottom: spacing.lg,
        },
        detailsSection: {
          width: "100%",
          backgroundColor: colors.background,
          borderRadius: 12,
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
        detailRow: {
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: spacing.sm,
        },
        detailLabel: {
          ...typography.body,
          color: colors.textSecondary,
        },
        detailValue: {
          ...typography.body,
          color: colors.textPrimary,
          fontWeight: "600",
        },
        messageBox: {
          width: "100%",
          backgroundColor: colors.background,
          borderRadius: 12,
          borderLeftWidth: 4,
          borderLeftColor: colors.primary,
          padding: spacing.md,
          marginBottom: spacing.lg,
        },
        messageLabel: {
          ...typography.caption,
          color: colors.textSecondary,
          marginBottom: spacing.xs,
          textTransform: "uppercase",
        },
        messageText: {
          ...typography.body,
          color: colors.textPrimary,
          fontStyle: "italic",
        },
        infoBox: {
          width: "100%",
          backgroundColor: colors.accent + "20",
          borderRadius: 8,
          padding: spacing.md,
        },
        infoText: {
          ...typography.caption,
          color: colors.textSecondary,
          textAlign: "center",
        },
        errorMessage: {
          ...typography.body,
          color: colors.textSecondary,
          textAlign: "center",
          marginBottom: spacing.md,
        },
        bold: {
          fontWeight: "bold",
          color: colors.textPrimary,
        },
        loadingText: {
          ...typography.body,
          color: colors.textSecondary,
          marginTop: spacing.md,
        },
      });
