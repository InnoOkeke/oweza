import React, { useMemo, useState, useEffect } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";

import { PrimaryButton } from "../components/PrimaryButton";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/Web3AuthProvider";
import type { ColorPalette } from "../utils/theme";
import { spacing, typography } from "../utils/theme";
import {
  buildRampUrl,
  getAvailableProviders,
  getProviderInfo,
  type RampProvider,
  type RampType,
} from "../services/ramp";

export type OffRampScreenProps = NativeStackScreenProps<RootStackParamList, "OffRamp">;

export const OffRampScreen: React.FC<OffRampScreenProps> = () => {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedProvider, setSelectedProvider] = useState<RampProvider | null>(null);
  const [selectedRampType, setSelectedRampType] = useState<RampType>("offramp");
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [availableProviders, setAvailableProviders] = useState<RampProvider[]>([]);

  useEffect(() => {
    getAvailableProviders(selectedRampType).then(setAvailableProviders);
  }, [selectedRampType]);

  const availablePaymentMethods: any[] = [];

  const handleProviderSelect = (provider: RampProvider) => {
    setSelectedProvider(provider);
    const info = getProviderInfo(provider);

    // If provider supports payment methods, show payment method selection
    if (info.supportsPaymentMethods) {
      setSelectedPaymentMethod(null);
    } else {
      // Otherwise, open directly
      openRamp(provider, null);
    }
  };

  const handlePaymentMethodSelect = (method: any) => {
    setSelectedPaymentMethod(method);
    if (selectedProvider) {
      openRamp(selectedProvider, method);
    }
  };

  const openRamp = (provider: RampProvider, paymentMethod: any | null) => {
    if (!profile?.walletAddress) {
      console.error("No wallet address available");
      return;
    }

    const url = buildRampUrl({
      provider,
      type: selectedRampType,
      walletAddress: profile.walletAddress,
      assetSymbol: "CUSD",
      destinationNetwork: "celo",
    });

    console.log(`Opening ${provider} ${selectedRampType}:`, url);
    setShowWebView(true);
  };

  const closeWebView = () => {
    setShowWebView(false);
    setWebViewLoading(true);
    setSelectedProvider(null);
    setSelectedPaymentMethod(null);
  };

  return (
    <View style={styles.container}>
      {/* Ramp Type Selector */}
      <View style={styles.typeSelector}>
        <Pressable
          style={[styles.typeButton, selectedRampType === "onramp" && styles.typeButtonActive]}
          onPress={() => {
            setSelectedRampType("onramp");
            setSelectedProvider(null);
            setSelectedPaymentMethod(null);
          }}
        >
          <Text style={[styles.typeButtonText, selectedRampType === "onramp" && styles.typeButtonTextActive]}>
            Buy Crypto
          </Text>
        </Pressable>
        <Pressable
          style={[styles.typeButton, selectedRampType === "offramp" && styles.typeButtonActive]}
          onPress={() => {
            setSelectedRampType("offramp");
            setSelectedProvider(null);
            setSelectedPaymentMethod(null);
          }}
        >
          <Text style={[styles.typeButtonText, selectedRampType === "offramp" && styles.typeButtonTextActive]}>
            Sell Crypto
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Provider Selection */}
        {!selectedProvider && (
          <>
            <Text style={styles.sectionTitle}>Select Provider</Text>
            {availableProviders.map((provider) => {
              const info = getProviderInfo(provider);
              const canUse = selectedRampType === "onramp" ? info.supportsBuy : info.supportsSell;

              if (!canUse) return null;

              return (
                <Pressable
                  key={provider}
                  style={styles.card}
                  onPress={() => handleProviderSelect(provider)}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.providerLogo}>{info.logo}</Text>
                    <Text style={styles.title}>{info.name}</Text>
                  </View>
                  <Text style={styles.description}>{info.description}</Text>
                </Pressable>
              );
            })}
          </>
        )}

        {/* Payment Method Selection (Coinbase only) */}
        {selectedProvider && availablePaymentMethods.length > 0 && !showWebView && (
          <>
            <Pressable style={styles.backButton} onPress={() => setSelectedProvider(null)}>
              <Text style={styles.backButtonText}>← Back to providers</Text>
            </Pressable>

            <Text style={styles.sectionTitle}>Select Payment Method</Text>
            {availablePaymentMethods.map((method) => (
              <Pressable
                key={String(method)}
                style={styles.card}
                onPress={() => handlePaymentMethodSelect(method)}
              >
                <Text style={styles.title}>{String(method)}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {/* In-App WebView Modal */}
      <Modal
        visible={showWebView}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeWebView}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedProvider && getProviderInfo(selectedProvider).name}
            </Text>
            <Pressable style={styles.closeButton} onPress={closeWebView}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {webViewLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading...</Text>
            </View>
          )}

          <WebView
            source={{
              uri: buildRampUrl({
                  provider: selectedProvider!,
                  type: selectedRampType,
                  walletAddress: profile?.walletAddress ?? "",
                  assetSymbol: "cUSD",
                  destinationNetwork: "celo",
                })
            }}
            style={styles.webView}
            onLoadStart={() => setWebViewLoading(true)}
            onLoadEnd={() => setWebViewLoading(false)}
            onError={(syntheticEvent) => {
              const { nativeEvent } = syntheticEvent;
              console.error("WebView error:", nativeEvent);
              setWebViewLoading(false);
            }}
          />
        </View>
      </Modal>
    </View>
  );
};
const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
      padding: spacing.lg,
    },
    typeSelector: {
      flexDirection: "row",
      gap: spacing.sm,
      padding: spacing.lg,
      backgroundColor: colors.background,
    },
    typeButton: {
      flex: 1,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: 12,
      backgroundColor: colors.cardBackground,
      alignItems: "center",
    },
    typeButtonActive: {
      backgroundColor: colors.primary,
    },
    typeButtonText: {
      ...typography.body,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    typeButtonTextActive: {
      color: "#FFFFFF",
    },
    sectionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      marginBottom: spacing.md,
      fontWeight: "600",
    },
    card: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.md,
    },
    cardHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    providerLogo: {
      fontSize: 28,
    },
    title: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    description: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    backButton: {
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    backButtonText: {
      ...typography.body,
      color: colors.primary,
      fontWeight: "500",
    },
    modalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border ?? colors.cardBackground,
      backgroundColor: colors.cardBackground,
    },
    modalTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    closeButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    closeButtonText: {
      fontSize: 20,
      color: colors.textPrimary,
    },
    webView: {
      flex: 1,
      backgroundColor: colors.background,
    },
    loadingContainer: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
      zIndex: 10,
    },
    loadingText: {
      ...typography.body,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
  });
