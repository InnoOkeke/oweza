import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Alert, Share, Clipboard, Platform, ActivityIndicator, Linking } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../providers/Web3AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { TextField } from "../components/TextField";

import { cryptoGiftService, CreateGiftInput, GiftSummary } from "../services/CryptoGiftService";
import { sendCusdWithPaymaster, TransferIntent } from "../services/transfers";
import { GiftTheme } from "../types/database";
import type { ColorPalette } from "../utils/theme";
import { spacing, typography } from "../utils/theme";
import Constants from "expo-constants";
import { TransactionCard } from "../components/TransactionCard";
import { getCusdBalance } from "../services/blockchain";

type Props = NativeStackScreenProps<RootStackParamList, "Gifts">;

export const GiftsScreen: React.FC<Props> = ({ navigation }) => {
  const { profile, sendUserOperation } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [selectedGift, setSelectedGift] = useState<GiftSummary & { direction: 'sent' | 'received' } | null>(null);
  const [form, setForm] = useState({
    recipientEmail: "",
    recipientName: "",
    amount: "",
    message: "",
    selectedTheme: "birthday" as GiftTheme,
  });

  const themes = cryptoGiftService.getAllThemes();

  // Fetch sent gifts
  const { data: sentGifts, isLoading: isLoadingSent, refetch: refetchSent } = useQuery({
    queryKey: ["gifts", "sent", profile?.userId],
    queryFn: () => cryptoGiftService.getSentGifts(profile!.userId),
    enabled: !!profile?.userId,
  });

  // Fetch received gifts
  const { data: receivedGifts, isLoading: isLoadingReceived, refetch: refetchReceived } = useQuery({
    queryKey: ["gifts", "received", profile?.email],
    queryFn: () => cryptoGiftService.getReceivedGifts(profile!.email!),
    enabled: !!profile?.email,
  });

  // Combine and sort gifts by date (most recent first)
  const allGifts = useMemo(() => {
    const sent = (sentGifts || []).map(g => ({ ...g, direction: 'sent' as const }));
    const received = (receivedGifts || []).map(g => ({ ...g, direction: 'received' as const }));
    return [...sent, ...received].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [sentGifts, receivedGifts]);

  const isLoadingGifts = isLoadingSent || isLoadingReceived;

  // Query USDC balance
  const { data: usdcBalance } = useQuery({
    queryKey: ["cusdBalance", profile?.walletAddress],
    queryFn: () => {
      if (!profile?.walletAddress) throw new Error("No wallet");
      return getCusdBalance(profile.walletAddress as `0x${string}`);
    },
    enabled: !!profile?.walletAddress,
  });

  const createGiftMutation = useMutation({
    mutationFn: async (input: CreateGiftInput) => {
      if (!profile) throw new Error("Not signed in");

      // Create gift record in database
      const gift = await cryptoGiftService.createGift(
        profile.userId,
        profile.email,
        profile.displayName || undefined,
        input
      );

      return gift;
    },
    onSuccess: async (gift) => {
      refetchSent();
      refetchReceived();
      queryClient.invalidateQueries({ queryKey: ["cusdBalance"] });

      const link = cryptoGiftService.generateGiftLink(gift.giftId);
      const themeConfig = cryptoGiftService.getGiftTheme(gift.theme);

      Alert.alert(
        `${themeConfig.emoji} Gift Sent!`,
        `Your ${gift.amount} cUSD gift has been sent to ${gift.recipientEmail}!\n\nShare the link with them to claim it.`,
        [
          {
            text: "Copy Link",
            onPress: () => {
              Clipboard.setString(link);
              Alert.alert("✓ Copied!", "Gift link copied to clipboard");
            },
          },
          {
            text: "Share Link",
            onPress: () => {
              Share.share({
                message: `${themeConfig.emoji} ${themeConfig.description}\n\n${gift.message || "I sent you a crypto gift!"}\n\nClaim it here: ${link}`,
                title: `${themeConfig.name} Gift`,
              });
            },
          },
          {
            text: "Done",
            onPress: () => {
              setShowCreateModal(false);
              setForm({ recipientEmail: "", recipientName: "", amount: "", message: "", selectedTheme: "birthday" });
            },
          },
        ]
      );
    },
    onError: (error) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to send gift");
    },
  });

  const claimGiftMutation = useMutation({
    mutationFn: async (gift: GiftSummary) => {
      if (!profile?.userId || !profile?.email || !profile?.walletAddress) {
        throw new Error("Not signed in");
      }

      // Call the backend to claim the gift
      const txHash = await cryptoGiftService.claimGift(
        gift.giftId,
        profile.userId,
        profile.email,
        "" // Backend generates hash
      );

      return { gift, txHash };
    },
    onSuccess: ({ gift, txHash }) => {
      setShowClaimModal(false);
      setSelectedGift(null);
      refetchSent();
      refetchReceived();
      queryClient.invalidateQueries({ queryKey: ["cusdBalance"] });

      Alert.alert(
        "🎉 Gift Claimed!",
        `You've successfully claimed ${gift.amount} ${gift.token}!\n\nThe funds are now in your wallet.\n\nTx: ${txHash.slice(0, 10)}...`,
        [{ text: "Great!" }]
      );
    },
    onError: (error) => {
      setShowClaimModal(false);
      Alert.alert(
        "Claim Failed",
        error instanceof Error ? error.message : "Failed to claim gift. Please try again."
      );
    },
  });

  const cancelGiftMutation = useMutation({
    mutationFn: async (gift: GiftSummary) => {
      if (!profile?.userId) throw new Error("Not signed in");
      await cryptoGiftService.cancelGift(gift.giftId, profile.userId);
      return gift;
    },
    onSuccess: (gift) => {
      refetchSent();
      queryClient.invalidateQueries({ queryKey: ["cusdBalance"] });
      Alert.alert("Gift Cancelled", "The gift has been cancelled and funds will be returned to your wallet.");
    },
    onError: (error) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to cancel gift");
    },
  });

  const handleClaimGift = (gift: GiftSummary & { direction: 'sent' | 'received' }) => {
    setSelectedGift(gift);
    setShowClaimModal(true);
  };

  const confirmClaim = () => {
    if (selectedGift) {
      claimGiftMutation.mutate(selectedGift);
    }
  };

  const handleCancelGift = async (gift: GiftSummary) => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirm Gift Cancellation",
        });
        if (!result.success) {
          return;
        }
      }
    } catch (error) {
      console.error("Biometric auth failed", error);
      return;
    }

    cancelGiftMutation.mutate(gift);
  };

  const handleSendGift = async () => {
    if (!form.recipientEmail || !form.amount) {
      Alert.alert("Required Fields", "Please provide recipient email and amount");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.recipientEmail)) {
      Alert.alert("Invalid Email", "Please enter a valid email address");
      return;
    }

    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount");
      return;
    }

    if (usdcBalance === undefined) {
      Alert.alert("Error", "Unable to fetch wallet balance. Please try again.");
      return;
    }

    if (amount > usdcBalance) {
      Alert.alert("Insufficient Balance", `You have $${usdcBalance.toFixed(2)} cUSD available.`);
      return;
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirm Gift Sending",
        });
        if (!result.success) {
          return;
        }
      }
    } catch (error) {
      console.error("Biometric auth failed", error);
    }

    createGiftMutation.mutate({
      recipientEmail: form.recipientEmail,
      recipientName: form.recipientName || undefined,
      amount: form.amount,
      token: "cUSD",
      chain: "celo",
      theme: form.selectedTheme,
      message: form.message || undefined,
      expiresInDays: 30,
    });
  };

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.subtitle}>Please sign in to send crypto gifts</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🎁 Crypto Gifts</Text>
          <Text style={styles.headerSubtitle}>
            Send themed crypto gifts for special occasions
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎉 Occasions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScroll}>
            {themes.map((theme) => (
              <View key={theme.theme} style={[styles.themeCard, { backgroundColor: theme.backgroundColor }]}>
                <Text style={styles.themeEmoji}>{theme.emoji}</Text>
                <Text style={[styles.themeName, { color: theme.primaryColor }]}>{theme.name}</Text>
              </View>
            ))}
          </ScrollView>

          <PrimaryButton
            title="Send a Gift"
            onPress={() => setShowCreateModal(true)}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📦 Recent Activity</Text>
          {isLoadingGifts ? (
            <ActivityIndicator color={colors.primary} />
          ) : allGifts && allGifts.length > 0 ? (
            allGifts.map((gift) => {
              const theme = cryptoGiftService.getGiftTheme(gift.theme);
              const isReceived = gift.direction === 'received';
              const isPending = gift.status === 'pending';
              const explorerUrl = Constants?.expoConfig?.extra?.BASE_EXPLORER_URL;
              const txHash = (gift as any).txHash || undefined;

              const actions: Array<any> = [];
              // Only show actions for pending gifts
              if (gift.status === 'pending') {
                if (isReceived) {
                  actions.push({ label: "Claim", onPress: () => handleClaimGift(gift) });
                } else {
                  actions.push({
                    label: "Share", onPress: () => {
                      const link = cryptoGiftService.generateGiftLink(gift.giftId);
                      Share.share({ message: `${theme.emoji} Gift for you: ${link}` });
                    }
                  });
                  actions.push({ label: "Cancel", variant: "danger", onPress: () => handleCancelGift(gift) });
                }
              }

              return (
                <TransactionCard
                  key={`${gift.direction}-${gift.giftId}`}
                  icon={<View style={[styles.giftIcon, { backgroundColor: theme.backgroundColor }]}><Text style={styles.giftEmoji}>{theme.emoji}</Text></View>}
                  title={isReceived ? `Gift from ${gift.senderName || gift.senderEmail}` : `Gift to ${gift.recipientName || gift.recipientEmail}`}
                  subtitle={`${gift.status} · ${new Date(gift.createdAt).toLocaleDateString()}`}
                  amount={`${isReceived ? "+" : "-"}${gift.amount} ${gift.token}`}
                  date={new Date(gift.createdAt).toLocaleDateString()}
                  statusText={gift.status}
                  transactionHash={txHash}
                  explorerUrl={explorerUrl}
                  onPressHash={txHash ? () => Linking.openURL(`${explorerUrl}/tx/${txHash}`) : undefined}
                  actions={actions}
                />
              );
            })
          ) : (
            <Text style={styles.emptyText}>No gifts yet</Text>
          )}
        </View>
      </ScrollView>

      {/* Create Gift Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Crypto Gift</Text>
              <Pressable onPress={() => setShowCreateModal(false)} style={styles.modalClose}>
                <Text style={styles.modalCloseText}>✕</Text>
              </Pressable>
            </View>

            <KeyboardAwareScrollView
              contentContainerStyle={[styles.modalBody, { flexGrow: 1 }]}
              keyboardShouldPersistTaps="handled"
              enableAutomaticScroll
              enableOnAndroid
              extraScrollHeight={Platform.OS === 'ios' ? 20 : 120}
            >
              <Text style={styles.sectionLabel}>Choose Theme</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeSelector}>
                {themes.map((theme) => (
                  <TouchableOpacity
                    key={theme.theme}
                    style={[
                      styles.themeSelectorCard,
                      { backgroundColor: theme.backgroundColor },
                      form.selectedTheme === theme.theme && styles.themeSelectorCardSelected,
                    ]}
                    onPress={() => setForm({ ...form, selectedTheme: theme.theme })}
                  >
                    <Text style={styles.themeSelectorEmoji}>{theme.emoji}</Text>
                    <Text style={[styles.themeSelectorName, { color: theme.primaryColor }]}>{theme.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TextField
                label="Recipient Email *"
                keyboardType="email-address"
                autoCapitalize="none"
                value={form.recipientEmail}
                onChangeText={(value) => setForm({ ...form, recipientEmail: value })}
                placeholder="friend@example.com"
              />

              <TextField
                label="Recipient Name (Optional)"
                value={form.recipientName}
                onChangeText={(value) => setForm({ ...form, recipientName: value })}
                placeholder="John Doe"
              />

              <TextField
                label="Amount (cUSD) *"
                keyboardType="numeric"
                value={form.amount}
                onChangeText={(value) => setForm({ ...form, amount: value })}
                placeholder="25.00"
              />

              <TextField
                label="Personal Message (Optional)"
                value={form.message}
                onChangeText={(value) => setForm({ ...form, message: value })}
                placeholder="Happy Birthday! 🎉"
                multiline
                numberOfLines={3}
              />

              <PrimaryButton
                title={createGiftMutation.isPending ? "Sending..." : "Send Gift"}
                onPress={handleSendGift}
                loading={createGiftMutation.isPending}
                disabled={createGiftMutation.isPending}
              />
            </KeyboardAwareScrollView>
          </View>
        </View>
      </Modal>

      {/* Claim Gift Modal */}
      <Modal
        visible={showClaimModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !claimGiftMutation.isPending && setShowClaimModal(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '50%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Claim Gift</Text>
              {!claimGiftMutation.isPending && (
                <Pressable onPress={() => setShowClaimModal(false)} style={styles.modalClose}>
                  <Text style={styles.modalCloseText}>✕</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.modalBody}>
              {selectedGift && (
                <>
                  {(() => {
                    const theme = cryptoGiftService.getGiftTheme(selectedGift.theme);
                    return (
                      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
                        <Text style={{ fontSize: 64, marginBottom: spacing.sm }}>{theme.emoji}</Text>
                        <Text style={[typography.title, { color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.xs }]}>
                          {theme.name}
                        </Text>
                        <Text style={[typography.title, { color: colors.primary, marginBottom: spacing.sm, fontSize: 24 }]}>
                          ${selectedGift.amount} {selectedGift.token}
                        </Text>
                        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                          From: {selectedGift.senderName || selectedGift.senderEmail}
                        </Text>
                      </View>
                    );
                  })()}

                  <PrimaryButton
                    title={claimGiftMutation.isPending ? "Claiming..." : "Claim Now"}
                    onPress={confirmClaim}
                    loading={claimGiftMutation.isPending}
                    disabled={claimGiftMutation.isPending}
                  />
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: spacing.lg,
      paddingBottom: spacing.xl * 2,
    },
    header: {
      marginBottom: spacing.lg,
    },
    headerTitle: {
      ...typography.title,
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    headerSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
    },
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: 18,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      marginBottom: spacing.md,
    },
    themeScroll: {
      marginBottom: spacing.lg,
    },
    themeCard: {
      width: 100,
      height: 100,
      borderRadius: 16,
      padding: spacing.md,
      marginRight: spacing.sm,
      justifyContent: "center",
      alignItems: "center",
    },
    themeEmoji: {
      fontSize: 36,
      marginBottom: spacing.xs,
    },
    themeName: {
      ...typography.caption,
      fontWeight: "600",
      textAlign: "center",
    },
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
      paddingVertical: spacing.xl,
    },
    title: {
      ...typography.subtitle,
      color: colors.textPrimary,
      textAlign: "center",
      marginBottom: spacing.sm,
    },
    subtitle: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
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
    modalBody: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    sectionLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: "600",
      marginBottom: spacing.sm,
    },
    themeSelector: {
      marginBottom: spacing.lg,
    },
    themeSelectorCard: {
      width: 80,
      height: 80,
      borderRadius: 16,
      padding: spacing.sm,
      marginRight: spacing.sm,
      justifyContent: "center",
      alignItems: "center",
      borderWidth: 2,
      borderColor: "transparent",
    },
    themeSelectorCardSelected: {
      borderColor: colors.primary,
    },
    themeSelectorEmoji: {
      fontSize: 28,
      marginBottom: spacing.xs,
    },
    themeSelectorName: {
      ...typography.caption,
      fontSize: 11,
      fontWeight: "600",
      textAlign: "center",
    },

    // Gift Item Styles
    giftItem: {
      flexDirection: "row",
      padding: spacing.md,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
    },
    giftIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    giftEmoji: {
      fontSize: 24,
    },
    giftDetails: {
      flex: 1,
    },
    giftRecipient: {
      ...typography.body,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    giftAmount: {
      ...typography.caption,
      color: colors.textPrimary,
      fontWeight: "700",
    },
    giftDate: {
      ...typography.caption,
      color: colors.textSecondary,
      fontSize: 10,
    },
    giftStatus: {
      alignItems: "flex-end",
      gap: spacing.xs,
    },
    statusBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 12,
    },
    statusPending: {
      backgroundColor: colors.warning + "20",
    },
    statusSuccess: {
      backgroundColor: colors.success + "20",
    },
    statusText: {
      ...typography.caption,
      fontSize: 10,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    statusTextPending: {
      color: colors.warning,
    },
    statusTextSuccess: {
      color: colors.success,
    },

    // Direction badges
    giftMetaContainer: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 2,
      marginBottom: 2,
    },
    directionBadge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 8,
      marginLeft: spacing.sm,
    },
    sentBadge: {
      backgroundColor: colors.primary + "15",
    },
    receivedBadge: {
      backgroundColor: colors.success + "15",
    },
    directionText: {
      ...typography.caption,
      fontSize: 9,
      fontWeight: "600",
    },
    sentText: {
      color: colors.primary,
    },
    receivedText: {
      color: colors.success,
    },

    miniActionButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.primary + "10",
    },
    miniActionText: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: "600",
      fontSize: 10,
    },
  });
