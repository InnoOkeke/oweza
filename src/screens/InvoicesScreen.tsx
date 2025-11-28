import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, TouchableOpacity, Share, Clipboard, Linking } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";

import * as LocalAuthentication from "expo-local-authentication";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useAuth } from "../providers/AppKitProvider";
import { useTheme } from "../providers/ThemeProvider";
import { PrimaryButton } from "../components/PrimaryButton";
import { invoiceService } from "../services/InvoiceService";
import { sendCusdWithPaymaster, TransferIntent } from "../services/transfers";
import { getCusdBalance } from "../services/blockchain";
import type { ColorPalette } from "../utils/theme";
import { spacing, typography } from "../utils/theme";
import Constants from "expo-constants";
import { TransactionCard } from "../components/TransactionCard";

type Props = NativeStackScreenProps<RootStackParamList, "Invoices">;

export const InvoicesScreen: React.FC<Props> = ({ route, navigation }) => {
  const { profile, sendUserOperation } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);


  const [showPayModal, setShowPayModal] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const { invoiceId } = route.params || {};

  const { data: deepLinkInvoice, isLoading: isLoadingInvoice } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => invoiceId ? invoiceService.getInvoice(invoiceId) : Promise.resolve(null),
    enabled: !!invoiceId,
  });

  const { data: cusdBalance } = useQuery({
    queryKey: ["cusdBalance", profile?.walletAddress],
    queryFn: () => {
      if (!profile?.walletAddress) throw new Error("No wallet");
      return getCusdBalance(profile.walletAddress as `0x${string}`);
    },
    enabled: Boolean(profile?.walletAddress),
  });

  const { data: myInvoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["my-invoices", profile?.userId],
    queryFn: () => profile ? invoiceService.getMyInvoices(profile.userId) : Promise.resolve([]),
    enabled: !!profile,
  });

  // Show pay modal when invoice is loaded
  React.useEffect(() => {
    if (deepLinkInvoice && deepLinkInvoice.status !== 'paid') {
      setShowPayModal(true);
    }
  }, [deepLinkInvoice]);
  const payInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.walletAddress || !deepLinkInvoice) throw new Error("Not ready");

      const sendUserOpFn = async (calls: any[]) => {
        return await sendUserOperation(calls);
      };

      const intent: TransferIntent = {
        recipientEmail: deepLinkInvoice.creatorEmail,
        amountCusd: parseFloat(deepLinkInvoice.total),
        memo: `Payment for Invoice #${deepLinkInvoice.invoiceNumber}`,
        senderUserId: profile.userId,
        senderEmail: profile.email,
        senderName: profile.displayName,
      };

      const result = await sendCusdWithPaymaster(
        profile.walletAddress as `0x${string}`,
        intent,
        sendUserOpFn
      );

      if (result.status !== 'sent') {
        throw new Error("Payment failed or queued");
      }

      await invoiceService.markInvoicePaid(
        deepLinkInvoice.invoiceId,
        result.txHash || "0x"
      );

      return result;
    },
    onSuccess: () => {
      setShowPayModal(false);
      Alert.alert("Success", "Invoice paid successfully! 🎉");
      navigation.setParams({ invoiceId: undefined });
    },
    onError: (error) => {
      Alert.alert("Error", error instanceof Error ? error.message : "Payment failed");
    },
  });

  const handlePayInvoice = async () => {
    setIsAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (hasHardware) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Confirm Payment",
        });
        if (!result.success) {
          setIsAuthenticating(false);
          return;
        }
      }
      payInvoiceMutation.mutate();
    } catch (error) {
      Alert.alert("Error", "Authentication failed");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCreateInvoice = () => {
    navigation.navigate("CreateInvoice");
  };

  if (!profile) {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.subtitle}>Please sign in to manage invoices</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📄 Invoices</Text>
        <Text style={styles.headerSubtitle}>
          Create professional invoices and track payments
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>✨ Features</Text>
        <View style={styles.infoList}>
          <Text style={styles.infoItem}>• Add line items with quantities and prices</Text>
          <Text style={styles.infoItem}>• Automatic tax calculations</Text>
          <Text style={styles.infoItem}>• Set payment due dates</Text>
          <Text style={styles.infoItem}>• Track payment status</Text>
          <Text style={styles.infoItem}>• Send reminders for overdue invoices</Text>
          <Text style={styles.infoItem}>• Export to PDF</Text>
        </View>

        <PrimaryButton
          title="Create Invoice"
          onPress={handleCreateInvoice}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📋 Your Invoices</Text>
        {isLoadingInvoices ? (
          <ActivityIndicator color={colors.primary} />
        ) : myInvoices && myInvoices.length > 0 ? (
          myInvoices.map((inv) => {
            const explorerUrl = Constants?.expoConfig?.extra?.CELO_EXPLORER_URL;
            const txHash = (inv as any).txHash || undefined;

            const actions: Array<any> = [];
            // Only show actions for invoices that are not paid or cancelled
            if (inv.status !== 'paid' && inv.status !== 'cancelled') {
              actions.push({
                label: "Share", onPress: () => {
                  const link = invoiceService.generateInvoiceLink(inv.invoiceId);
                  Share.share({ message: `Invoice #${inv.invoiceNumber}: ${link}` });
                }
              });
              actions.push({
                label: "Copy Link", onPress: () => {
                  Clipboard.setString(invoiceService.generateInvoiceLink(inv.invoiceId));
                  Alert.alert("Copied", "Link copied to clipboard");
                }
              });
            }

            const isSender = inv.creatorEmail === profile?.email;

            return (
              <TransactionCard
                key={inv.invoiceId}
                title={`Invoice ${inv.invoiceNumber} ${isSender ? `to ${inv.clientEmail}` : `from ${inv.creatorEmail}`}`}
                subtitle={`${inv.status} · ${new Date(inv.issueDate).toLocaleDateString()}`}
                amount={`$${inv.total} ${inv.token}`}
                date={new Date(inv.issueDate).toLocaleDateString()}
                statusText={inv.status}
                transactionHash={txHash}
                explorerUrl={explorerUrl}
                onPressHash={txHash ? () => Linking.openURL(`${explorerUrl}/tx/${txHash}`) : undefined}
                actions={actions}
              />
            );
          })
        ) : (
          <Text style={styles.emptyText}>No invoices yet. Create your first one!</Text>
        )}
      </View>

      {/* Pay Invoice Modal */}
      {deepLinkInvoice && (
        <View style={[styles.modalOverlay, !showPayModal && { display: 'none' }]}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Pay Invoice</Text>
              <Text style={styles.modalClose} onPress={() => setShowPayModal(false)}>✕</Text>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <View style={styles.invoiceHeader}>
                <Text style={styles.invoiceNumber}>{deepLinkInvoice.invoiceNumber}</Text>
                <Text style={styles.invoiceAmount}>${deepLinkInvoice.total} {deepLinkInvoice.token}</Text>
                <Text style={styles.invoiceStatus}>{deepLinkInvoice.status}</Text>
              </View>

              <View style={styles.divider} />

              <Text style={styles.sectionLabel}>From</Text>
              <Text style={styles.value}>{deepLinkInvoice.creatorName || deepLinkInvoice.creatorEmail}</Text>

              <Text style={styles.sectionLabel}>Due Date</Text>
              <Text style={styles.value}>{new Date(deepLinkInvoice.dueDate).toLocaleDateString()}</Text>

              <Text style={styles.sectionLabel}>Items</Text>
              {deepLinkInvoice.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <Text style={styles.itemDescription}>{item.description} x{item.quantity}</Text>
                  <Text style={styles.itemAmount}>${item.amount}</Text>
                </View>
              ))}

              <View style={styles.divider} />

              <View style={styles.row}>
              </View>

              <View style={[styles.divider, { marginVertical: 20 }]} />

              <View style={styles.row}>
                <Text style={styles.label}>Your Balance</Text>
                <Text style={styles.value}>{cusdBalance?.toFixed(2) || "0.00"} cUSD</Text>
              </View>

              <PrimaryButton
                title={payInvoiceMutation.isPending || isAuthenticating ? "Processing..." : "Pay Invoice"}
                onPress={handlePayInvoice}
                loading={payInvoiceMutation.isPending || isAuthenticating}
                disabled={payInvoiceMutation.isPending || isAuthenticating || deepLinkInvoice.status === 'paid'}
              />
            </ScrollView>
          </View>
        </View>
      )}
    </ScrollView>
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
    infoList: {
      marginBottom: spacing.lg,
    },
    infoItem: {
      ...typography.body,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
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
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
      zIndex: 1000,
    },
    modalContent: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "90%",
      height: "80%",
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
      fontSize: 24,
      color: colors.textSecondary,
      padding: spacing.xs,
    },
    modalBody: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    invoiceHeader: {
      alignItems: 'center',
      marginBottom: spacing.lg,
    },
    invoiceNumber: {
      ...typography.caption,
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    invoiceAmount: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: spacing.xs,
    },
    invoiceStatus: {
      ...typography.caption,
      fontWeight: 'bold',
      textTransform: 'uppercase',
      color: colors.textSecondary,
      backgroundColor: colors.background,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: 4,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.md,
    },
    sectionLabel: {
      ...typography.caption,
      color: colors.textSecondary,
      marginBottom: 4,
      marginTop: spacing.md,
    },
    value: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: '500',
    },
    itemRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    itemDescription: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    itemAmount: {
      ...typography.body,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.xs,
    },
    label: {
      ...typography.body,
      color: colors.textSecondary,
    },

    // Invoice Item Styles
    invoiceItem: {
      padding: spacing.md,
      backgroundColor: colors.background,
      borderRadius: 12,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    invoiceItemHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.md,
    },
    invoiceItemNumber: {
      ...typography.body,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    invoiceItemDate: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    invoiceItemAmount: {
      ...typography.body,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 2,
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
    actionButtons: {
      flexDirection: "row",
      gap: spacing.sm,
    },
    actionButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 16,
      backgroundColor: colors.primary + "10",
    },
    actionButtonText: {
      ...typography.caption,
      color: colors.primary,
      fontWeight: "600",
    },
  });
