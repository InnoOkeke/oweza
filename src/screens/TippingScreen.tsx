import React, { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Alert, Share, ActivityIndicator } from "react-native";
import { setClipboardString } from "../utils/clipboard";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as LocalAuthentication from "expo-local-authentication";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../providers/Web3AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { TextField } from "../components/TextField";
import { tippingService, CreateTipJarInput } from "../services/TippingService";
import { sendCusdWithPaymaster, TransferIntent } from "../services/transfers";
import { getCusdBalance } from "../services/blockchain";
import { TransactionCard } from "../components/TransactionCard";
import Constants from "expo-constants";
import { Linking } from "react-native";
import type { ColorPalette } from "../utils/theme";
import { spacing, typography } from "../utils/theme";

type Props = NativeStackScreenProps<RootStackParamList, "Tipping">;

const SUGGESTED_TIPS = [1, 5, 10, 25, 50, 100];
export const TippingScreen: React.FC<Props> = ({ route, navigation }) => {
  const { profile, sendUserOperation } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [tipMessage, setTipMessage] = useState("");
  const [tipJarError, setTipJarError] = useState<string | null>(null);
  const [tipAmountError, setTipAmountError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    username: "",
    socialLinks: {
      twitter: "",
      farcaster: "",
      instagram: "",
      website: "",
    },
    selectedAmounts: [1, 5, 10, 25] as number[],
  });

  // Extract tipJarId from deep link params
  const { tipJarId } = route.params ?? {};

  // Fetch tip jar when deep link is present
  const {
    data: deepLinkJar,
    isLoading: isLoadingDeepLinkJar,
    error: deepLinkError,
  } = useQuery({
    queryKey: ["tipJar", tipJarId],
    queryFn: async () => {
      if (!tipJarId) return null;
      return await tippingService.getTipJar(tipJarId);
    },
    enabled: !!tipJarId,
    retry: false,
  });

  // Show tip modal when a jar is loaded via deep link
  useEffect(() => {
    if (deepLinkJar) {
      setShowTipModal(true);
    }
  }, [deepLinkJar]);

  // Load recent tips for the deep-linked jar (if any)
  const { data: recentTips = [], isLoading: isLoadingTips, refetch: refetchTips } = useQuery({
    queryKey: ["tips", deepLinkJar?.jarId],
    queryFn: async () => {
      if (!deepLinkJar?.jarId) return [] as any[];
      return await tippingService.getTipsForJar(deepLinkJar.jarId);
    },
    enabled: !!deepLinkJar?.jarId,
  });

  // Handle errors for deep link fetching
  useEffect(() => {
    if (deepLinkError) {
      setTipJarError("Failed to load tip jar.");
    } else if (!isLoadingDeepLinkJar && tipJarId && !deepLinkJar) {
      setTipJarError("Tip jar not found for this ID.");
    } else {
      setTipJarError(null);
    }
  }, [deepLinkError, deepLinkJar, isLoadingDeepLinkJar, tipJarId]);

  // Load user's tip jars for the create list
  const { data: tipJars = [], isLoading: isLoadingJars, refetch: refetchJars } = useQuery({
    queryKey: ["my-tip-jars", profile?.userId],
    queryFn: () =>
      profile ? tippingService.getMyTipJars(profile.userId) : Promise.resolve([]),
    enabled: !!profile,
  });

  // Load cUSD balance
  const { data: usdcBalance } = useQuery({
    queryKey: ["cusdBalance", profile?.walletAddress],
    queryFn: async () => {
      if (!profile?.walletAddress) return null;
      return await getCusdBalance(profile.walletAddress as `0x${string}`);
    },
    enabled: !!profile?.walletAddress,
  });

  const toggleAmount = (amount: number) => {
    const selected = form.selectedAmounts;
    if (selected.includes(amount)) {
      setForm({ ...form, selectedAmounts: selected.filter((a) => a !== amount) });
    } else if (selected.length < 6) {
      setForm({ ...form, selectedAmounts: [...selected, amount].sort((a, b) => a - b) });
    }
  };

  const createJarMutation = useMutation({
    mutationFn: async (input: CreateTipJarInput) => {
      if (!profile) throw new Error("Not signed in");
      return await tippingService.createTipJar(
        profile.userId,
        profile.email,
        profile.displayName || undefined,
        profile.photoUrl || undefined,
        input
      );
    },
    onSuccess: (jar) => {
      const link = tippingService.generateTipJarLink(jar.jarId);
      // Refresh list
      refetchJars();
      Alert.alert(
        "Tip Jar Created! 🎁",
        `Share your tip jar:\n${link}`,
        [
          { text: "Share Link", onPress: () => Share.share({ message: `Support me: ${link}` }) },
          {
            text: "Done",
            onPress: () => {
              setShowCreateModal(false);
              setForm({
                title: "",
                description: "",
                username: "",
                socialLinks: { twitter: "", farcaster: "", instagram: "", website: "" },
                selectedAmounts: [1, 5, 10, 25],
              });
            },
          },
        ]
      );
    },
    onError: (error) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to create tip jar");
    },
  });

  const sendTipMutation = useMutation({
    mutationFn: async (amountArg?: string) => {
      const usedAmount = amountArg ?? tipAmount;
      if (!profile?.walletAddress || !deepLinkJar) throw new Error("Not ready");
      if (!usedAmount || isNaN(parseFloat(usedAmount))) throw new Error("Invalid amount");

      // Create sendUserOperation callback
      const sendUserOpFn = async (calls: any[]) => {
        // sendUserOperation has varied typings across providers; cast to any to avoid TS issues
        return await (sendUserOperation as any)({
          evmSmartAccount: profile.walletAddress as `0x${string}`,
          network: "celo",
          calls,
          useCdpPaymaster: true, // keep flag for paymaster behavior
        } as any);
      };

      // Create transfer intent
      const intent: TransferIntent = {
        recipientEmail: deepLinkJar.creatorEmail,
        amountCusd: parseFloat(usedAmount),
        memo: tipMessage || `Tip for ${deepLinkJar.title}`,
        senderUserId: profile.userId,
        senderEmail: profile.email,
        senderName: profile.displayName,
      };

      const result = await sendCusdWithPaymaster(
        profile.walletAddress as `0x${string}`,
        intent,
        sendUserOpFn
      );

      if (result.status !== "sent") {
        throw new Error("Tip transfer failed or queued");
      }

      await tippingService.sendTip(
        profile.userId,
        profile.email,
        profile.displayName || undefined,
        {
          jarId: deepLinkJar.jarId,
          amount: usedAmount,
          token: "cUSD",
          chain: "celo",
          message: tipMessage,
          isAnonymous: false,
        },
        result.txHash || "0x"
      );

      return result;
    },
    onSuccess: () => {
      setShowTipModal(false);
      Alert.alert("Success", "Tip sent successfully! 🚀");
      setTipAmount("");
      setTipMessage("");
      navigation.setParams({ tipJarId: undefined });
    },
    onError: (error) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Failed to send tip");
    },
  });

  const handleSendTip = async () => {
    // Validate amount
    if (!tipAmount || isNaN(parseFloat(tipAmount))) {
      setTipAmountError("Enter a valid amount");
      Alert.alert("Invalid Amount", "Please enter a valid tip amount");
      return;
    }

    const numeric = parseFloat(tipAmount);
    if (usdcBalance !== null && usdcBalance !== undefined && numeric > usdcBalance) {
      setTipAmountError("Insufficient funds");
      Alert.alert("Insufficient Funds", `Your balance is $${usdcBalance.toFixed(2)}`);
      return;
    }

    setTipAmountError(null);
    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm Tip" });
        if (!result.success) {
          setIsAuthenticating(false);
          return;
        }
      }

      // Pass amount as arg to mutation so we can trigger preset sends too
      sendTipMutation.mutate(tipAmount);
    } catch (e) {
      Alert.alert("Error", "Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const performAuthenticatedSend = async (amountToSend: string) => {
    if (!amountToSend || isNaN(parseFloat(amountToSend))) {
      Alert.alert("Invalid Amount", "Please enter a valid tip amount");
      return;
    }
    const numeric = parseFloat(amountToSend);
    if (usdcBalance !== null && usdcBalance !== undefined && numeric > usdcBalance) {
      Alert.alert("Insufficient Funds", `Your balance is $${usdcBalance.toFixed(2)}`);
      return;
    }

    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirm Tip" });
        if (!result.success) {
          setIsAuthenticating(false);
          return;
        }
      }

      // Update tipAmount so UI reflects selection, then call mutation with explicit amount
      setTipAmount(String(amountToSend));
      sendTipMutation.mutate(String(amountToSend));
    } catch (e) {
      Alert.alert("Error", "Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCreateJar = () => {
    if (!form.title || form.selectedAmounts.length === 0) {
      Alert.alert("Required Fields", "Please provide a title and select at least one tip amount");
      return;
    }
    createJarMutation.mutate({
      title: form.title,
      description: form.description || undefined,
      username: form.username || undefined,
      socialLinks: {
        twitter: form.socialLinks.twitter || undefined,
        farcaster: form.socialLinks.farcaster || undefined,
        instagram: form.socialLinks.instagram || undefined,
        website: form.socialLinks.website || undefined,
      },
      suggestedAmounts: form.selectedAmounts,
      acceptedTokens: [{ token: "cUSD", chain: "celo" }],
    });
  };

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.subtitle}>Please sign in to create tip jars</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💸 Micro-Tipping</Text>
          <Text style={styles.headerSubtitle}>Receive tips from supporters with one-tap payments</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🎁 Create Your Tip Jar</Text>
          <View style={styles.infoList}>
            <Text style={styles.infoItem}>• Set custom tip amounts ($1-$100)</Text>
            <Text style={styles.infoItem}>• Share one link across all platforms</Text>
            <Text style={styles.infoItem}>• Instant notifications for each tip</Text>
            <Text style={styles.infoItem}>• No processing fees with Celo Paymaster</Text>
          </View>
          <PrimaryButton title="Create Tip Jar" onPress={() => setShowCreateModal(true)} />
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Your Tip Jars</Text>
          {isLoadingJars ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : tipJars && tipJars.length > 0 ? (
            tipJars.map((jar) => {
              const link = tippingService.generateTipJarLink(jar.jarId);
              return (
                <TransactionCard
                  key={jar.jarId}
                  icon={undefined}
                  title={jar.title}
                  subtitle={`${jar.tipCount} tips • $${jar.totalTipsReceived.toFixed(2)} received`}
                  amount={undefined}
                  statusText={jar.status}
                  actions={[
                    { label: 'Share Link', onPress: () => Share.share({ message: `Support me: ${link}` }), variant: 'primary' },
                    { label: 'Copy', onPress: async () => { await setClipboardString(link); Alert.alert('Copied', 'Link copied to clipboard'); }, variant: 'secondary' },
                  ]}
                />
              );
            })
          ) : (
            <Text style={styles.emptyText}>No tip jars yet. Create one to get started!</Text>
          )}
        </View>
      </ScrollView>

      {/* Create Jar Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent={true} onRequestClose={() => setShowCreateModal(false)} statusBarTranslucent>
        <KeyboardAwareScrollView contentContainerStyle={styles.modalContent}>
          <Text style={styles.modalTitle}>Create Tip Jar</Text>
          <TextField label="Title" value={form.title} onChangeText={(t) => setForm({ ...form, title: t })} />
          <TextField label="Description" value={form.description} onChangeText={(t) => setForm({ ...form, description: t })} />
          <Text style={styles.sectionHeader}>Suggested Amounts</Text>
          <View style={styles.amountGrid}>
            {SUGGESTED_TIPS.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[styles.amountChip, form.selectedAmounts.includes(amt) && styles.amountChipSelected]}
                onPress={() => toggleAmount(amt)}
              >
                <Text style={[styles.amountChipText, form.selectedAmounts.includes(amt) && styles.amountChipTextSelected]}>${amt}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <PrimaryButton title="Create" onPress={handleCreateJar} />
          <TouchableOpacity style={styles.modalClose} onPress={() => setShowCreateModal(false)}>
            <Text style={styles.modalCloseText}>Cancel</Text>
          </TouchableOpacity>
        </KeyboardAwareScrollView>
      </Modal>

      {/* Tip Modal */}
      <Modal visible={showTipModal} animationType="slide" transparent={true} onRequestClose={() => setShowTipModal(false)} statusBarTranslucent>
        <KeyboardAwareScrollView contentContainerStyle={styles.modalContent}>
          {deepLinkJar && (
            <>
              <Text style={styles.modalTitle}>Tip {deepLinkJar.title}</Text>
              <Text style={styles.modalSubtitle}>Created by {deepLinkJar.creatorName}</Text>
              <TextField label="Amount (cUSD)" value={tipAmount} onChangeText={setTipAmount} keyboardType="numeric" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginVertical: spacing.sm }}>
                {SUGGESTED_TIPS.map((amt) => (
                  <TouchableOpacity
                    key={amt}
                    style={[
                      { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 12, borderWidth: 1 },
                      tipAmount === String(amt) ? { backgroundColor: colors.primary, borderColor: colors.primary } : { backgroundColor: colors.background, borderColor: colors.border },
                    ]}
                    onPress={() => { setTipAmount(String(amt)); setTipAmountError(null); }}
                  >
                    <Text style={{ color: tipAmount === String(amt) ? colors.background : colors.textPrimary, fontWeight: '600' }}>${amt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs }}>
                Wallet balance: {usdcBalance !== null && usdcBalance !== undefined ? `$${usdcBalance.toFixed(2)}` : '—'}
              </Text>
              {tipAmountError ? <Text style={{ color: colors.error, marginBottom: spacing.xs }}>{tipAmountError}</Text> : null}
              <TextField label="Message (optional)" value={tipMessage} onChangeText={setTipMessage} />
              {isAuthenticating ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <PrimaryButton title="Send Tip" onPress={handleSendTip} />
              )}
              {/* Recent tips for this jar */}
              <Text style={[styles.sectionHeader, { marginTop: spacing.md }]}>Recent Tips</Text>
              {isLoadingTips ? (
                <ActivityIndicator color={colors.primary} />
              ) : recentTips && recentTips.length > 0 ? (
                recentTips.map((tip: any) => {
                  const txHash = tip.transactionHash || tip.transactionHash;
                  return (
                    <TransactionCard
                      key={tip.tipId}
                      icon={undefined}
                      title={tip.isAnonymous ? "Anonymous" : tip.tipperName || tip.tipperEmail}
                      subtitle={new Date(tip.createdAt).toLocaleString()}
                      amount={`+${tip.amount} ${tip.token}`}
                      date={new Date(tip.createdAt).toLocaleString()}
                      transactionHash={txHash}
                      explorerUrl={Constants?.expoConfig?.extra?.CELO_EXPLORER_URL}
                      onPressHash={txHash ? () => Linking.openURL(`${Constants?.expoConfig?.extra?.CELO_EXPLORER_URL}/tx/${txHash}`) : undefined}
                    />
                  );
                })
              ) : (
                <Text style={styles.emptyText}>No tips yet</Text>
              )}
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowTipModal(false)}>
                <Text style={styles.modalCloseText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
          {tipJarError && <Text style={styles.errorText}>{tipJarError}</Text>}
        </KeyboardAwareScrollView>
      </Modal>
    </>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
    header: { marginBottom: spacing.lg },
    headerTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.xs },
    headerSubtitle: { ...typography.body, color: colors.textSecondary },
    card: { backgroundColor: colors.cardBackground, borderRadius: 18, padding: spacing.lg, marginBottom: spacing.md },
    cardTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.sm },
    infoList: { marginBottom: spacing.md },
    infoItem: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xs },
    emptyText: { textAlign: "center", color: colors.textSecondary },
    jarItem: { marginBottom: spacing.md, backgroundColor: colors.background, padding: spacing.md, borderRadius: 12 },
    jarHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
    jarTitle: { ...typography.subtitle, color: colors.textPrimary },
    statusBadge: { paddingHorizontal: spacing.xs, paddingVertical: spacing.xs, borderRadius: 8 },
    statusActive: { backgroundColor: colors.success },
    statusInactive: { backgroundColor: colors.error },
    statusText: { ...typography.caption, color: colors.background },
    statusTextActive: { color: colors.background },
    statusTextInactive: { color: colors.background },
    jarStats: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
    jarActions: { flexDirection: "row", justifyContent: "space-around" },
    actionButton: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      backgroundColor: colors.primary + "15",
      borderRadius: 12
    },
    actionButtonText: {
      ...typography.caption,
      fontSize: 11,
      color: colors.primary,
      fontWeight: "600"
    },
    modalContent: { flex: 1, justifyContent: "center", padding: spacing.lg, backgroundColor: colors.background },
    modalTitle: { ...typography.title, color: colors.textPrimary, marginBottom: spacing.md, textAlign: "center" },
    modalSubtitle: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.md, textAlign: "center" },
    sectionHeader: { ...typography.subtitle, color: colors.textPrimary, marginTop: spacing.lg, marginBottom: spacing.sm },
    amountGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginBottom: spacing.md },
    amountChip: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 12, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
    amountChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    amountChipText: { ...typography.caption, color: colors.textPrimary },
    amountChipTextSelected: { color: colors.background, fontWeight: "600" },
    modalClose: { marginTop: spacing.md, alignItems: "center" },
    modalCloseText: { color: colors.accent, fontSize: 16 },
    errorText: { color: colors.error, textAlign: "center", marginTop: spacing.sm },
    title: { ...typography.title, color: colors.textPrimary },
    subtitle: { ...typography.body, color: colors.textSecondary },
  });
