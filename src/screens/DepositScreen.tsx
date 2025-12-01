import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  Modal,
  Pressable,
  ScrollView,
  Animated,
  ActivityIndicator,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/Web3AuthProvider";
import { spacing, typography } from "../utils/theme";
import { getUserLocation } from "../services/location";
import {
  buildRampUrlWithSession,
  getAvailableProviders,
  getProviderInfo,
  type RampProvider,
} from "../services/ramp";
import { useToast } from "../utils/toast";

type Props = NativeStackScreenProps<RootStackParamList, "Deposit">;

export const DepositScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const [activeMethod, setActiveMethod] = useState<"bank" | "card">("bank");
  const [amount, setAmount] = useState("");
  const [showMethodOptions, setShowMethodOptions] = useState(false);
  const [showProvidersModal, setShowProvidersModal] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-50)).current;

  // Real provider integration
  const [availableProviders, setAvailableProviders] = useState<RampProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<RampProvider | null>(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<any | null>(null);
  const [availablePaymentMethods, setAvailablePaymentMethods] = useState<any[]>([]);
  const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [rampUrl, setRampUrl] = useState<string | null>(null);

  const getCurrencyFromCountryCode = (countryCode: string): { currency: string; symbol: string } => {
    const map: Record<string, { currency: string; symbol: string }> = {
      US: { currency: "USD", symbol: "$" },
      GB: { currency: "GBP", symbol: "£" },
      NG: { currency: "NGN", symbol: "₦" },
      KE: { currency: "KES", symbol: "KSh" },
      ZA: { currency: "ZAR", symbol: "R" },
      GH: { currency: "GHS", symbol: "GH₵" },
      JP: { currency: "JPY", symbol: "¥" },
      CN: { currency: "CNY", symbol: "¥" },
      IN: { currency: "INR", symbol: "₹" },
      BR: { currency: "BRL", symbol: "R$" },
      CA: { currency: "CAD", symbol: "CA$" },
      AU: { currency: "AUD", symbol: "A$" },
      NZ: { currency: "NZD", symbol: "NZ$" },
      MX: { currency: "MXN", symbol: "MX$" },
      AR: { currency: "ARS", symbol: "AR$" },
      DE: { currency: "EUR", symbol: "€" },
      FR: { currency: "EUR", symbol: "€" },
      IT: { currency: "EUR", symbol: "€" },
      ES: { currency: "EUR", symbol: "€" },
      PT: { currency: "EUR", symbol: "€" },
      NL: { currency: "EUR", symbol: "€" },
      BE: { currency: "EUR", symbol: "€" },
      AT: { currency: "EUR", symbol: "€" },
      IE: { currency: "EUR", symbol: "€" },
      GR: { currency: "EUR", symbol: "€" },
      PL: { currency: "PLN", symbol: "zł" },
      CZ: { currency: "CZK", symbol: "Kč" },
      HU: { currency: "HUF", symbol: "Ft" },
      RO: { currency: "RON", symbol: "lei" },
      SE: { currency: "SEK", symbol: "kr" },
      DK: { currency: "DKK", symbol: "kr" },
      NO: { currency: "NOK", symbol: "kr" },
      CH: { currency: "CHF", symbol: "CHF" },
      TR: { currency: "TRY", symbol: "₺" },
      EG: { currency: "EGP", symbol: "E£" },
      MA: { currency: "MAD", symbol: "DH" },
      TZ: { currency: "TZS", symbol: "TSh" },
      UG: { currency: "UGX", symbol: "USh" },
      RW: { currency: "RWF", symbol: "FRw" },
      SG: { currency: "SGD", symbol: "S$" },
      MY: { currency: "MYR", symbol: "RM" },
      TH: { currency: "THB", symbol: "฿" },
      ID: { currency: "IDR", symbol: "Rp" },
      PH: { currency: "PHP", symbol: "₱" },
      VN: { currency: "VND", symbol: "₫" },
      KR: { currency: "KRW", symbol: "₩" },
      HK: { currency: "HKD", symbol: "HK$" },
      AE: { currency: "AED", symbol: "د.إ" },
      SA: { currency: "SAR", symbol: "﷼" },
      IL: { currency: "ILS", symbol: "₪" },
    };
    return map[countryCode] ?? { currency: "USD", symbol: "$" };
  };

  useEffect(() => {
    const detectCurrency = async () => {
      try {
        // Try ipinfo.io first (no permission required)
        const res = await fetch('https://ipinfo.io/json');
        const data = await res.json();

        if (data.country) {
          console.log("🌍 Detected country from IP:", data.country);
          const currencyData = getCurrencyFromCountryCode(data.country);
          setCurrencySymbol(currencyData.symbol);
          return;
        }
      } catch (e) {
        console.log("Failed to get location from ipinfo.io:", e);
      }

      // Fallback to GPS location
      try {
        const loc = await getUserLocation();
        if (loc?.countryCode) {
          console.log("📍 Detected country from GPS:", loc.countryCode);
          setCurrencySymbol(getCurrencyFromCountryCode(loc.countryCode).symbol);
          return;
        }
      } catch (e) {
        console.log("Failed to get GPS location:", e);
      }

      // Final fallback to device locale
      try {
        const locale = Intl.NumberFormat().resolvedOptions().locale;
        const region = locale.split('-')[1]?.toUpperCase();
        if (region) {
          console.log("🌐 Detected country from locale:", region);
          setCurrencySymbol(getCurrencyFromCountryCode(region).symbol);
          return;
        }
      } catch (e) {
        console.log("Failed to get locale:", e);
      }

      // Ultimate fallback
      console.log("💵 Using default currency: USD");
      setCurrencySymbol("$");
    };

    detectCurrency();
  }, []);

  // Fetch available providers
  useEffect(() => {
    getAvailableProviders("onramp").then(providers => {
      setAvailableProviders(providers);
    });
  }, []);

  // Fetch payment methods when Coinbase is selected
  useEffect(() => {
    // No external payment-method integrations currently available.
    setAvailablePaymentMethods([]);
  }, [selectedProvider, profile?.walletAddress]);

  const toggleDropdown = () => {
    if (showMethodOptions) {
      // closing
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: -50,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setShowMethodOptions(false));
    } else {
      // opening
      setShowMethodOptions(true);
      dropdownOpacity.setValue(0);
      dropdownTranslateY.setValue(-50);
      Animated.parallel([
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  const handleContinue = () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast("Please enter a valid amount", "error");
      return;
    }
    setShowProvidersModal(true);
  };

  const handleProviderSelect = (provider: RampProvider) => {
    setSelectedProvider(provider);
    const info = getProviderInfo(provider);

    if (info.supportsPaymentMethods) {
      // Show payment method selection for Coinbase
      setSelectedPaymentMethod(null);
    } else {
      // Open ramp directly for other providers
      openRamp(provider, null);
    }
  };

  const handlePaymentMethodSelect = (method: any) => {
    setSelectedPaymentMethod(method);
    if (selectedProvider) {
      openRamp(selectedProvider, method);
    }
  };

  const openRamp = async (provider: RampProvider, paymentMethod: any | null) => {
    if (!profile?.walletAddress) {
      console.error("No wallet address available");
      return;
    }

    try {
      setWebViewLoading(true);

      const url = await buildRampUrlWithSession({
        provider,
        type: "onramp",
        walletAddress: profile.walletAddress,
        assetSymbol: "CUSD",
        amount: amount,
        destinationNetwork: "celo",
      });

      setRampUrl(url);
      setShowProvidersModal(false);
      setShowWebView(true);
    } catch (error) {
      console.error("Failed to build ramp URL:", error);
      showToast("Failed to open payment provider", "error");
    }
  };

  const closeRamp = () => {
    setShowWebView(false);
    setWebViewLoading(true);
    setRampUrl(null);
    setSelectedProvider(null);
    setSelectedPaymentMethod(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.inner, { backgroundColor: colors.background }]}>
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>Select Payment Method</Text>
        {/* Single dropdown selector for payment method */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.methodDropdown, { borderColor: colors.border }]}
            activeOpacity={0.9}
            onPress={toggleDropdown}
          >
            <Text style={[styles.dropdownLabel, { color: colors.textPrimary }]}>{activeMethod === "bank" ? "Bank Transfer" : "Card"}</Text>
            <Text style={{ color: colors.textSecondary }}>{showMethodOptions ? "▲" : "▼"}</Text>
          </TouchableOpacity>
          {showMethodOptions && (
            <Animated.View style={[styles.dropdownOptions, { backgroundColor: colors.cardBackground, borderColor: colors.border, opacity: dropdownOpacity, transform: [{ translateY: dropdownTranslateY }] }]}>
              <TouchableOpacity style={styles.dropdownOption} onPress={() => { setActiveMethod("bank"); Animated.parallel([Animated.timing(dropdownOpacity, { toValue: 0, duration: 200, useNativeDriver: true }), Animated.timing(dropdownTranslateY, { toValue: -50, duration: 200, useNativeDriver: true })]).start(() => setShowMethodOptions(false)); }}>
                <Text style={{ color: colors.textPrimary }}>🏦 Bank Transfer</Text>
              </TouchableOpacity>
              <View style={styles.separator} />
              <TouchableOpacity style={styles.dropdownOption} onPress={() => { setActiveMethod("card"); Animated.parallel([Animated.timing(dropdownOpacity, { toValue: 0, duration: 200, useNativeDriver: true }), Animated.timing(dropdownTranslateY, { toValue: -50, duration: 200, useNativeDriver: true })]).start(() => setShowMethodOptions(false)); }}>
                <Text style={{ color: colors.textPrimary }}>💳 Card</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        <View style={styles.amountContainer}>
          <Text style={[styles.currencySymbol, { color: colors.textPrimary }]}>{currencySymbol}</Text>
          <TextInput
            style={[styles.amountInput, { color: colors.textPrimary }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0"
            placeholderTextColor={colors.textSecondary}
            keyboardType="numeric"
            autoFocus
          />
        </View>

        <TouchableOpacity style={[styles.continueButton, { backgroundColor: colors.primary }]} onPress={handleContinue}>
          <Text style={styles.continueButtonText}>Continue</Text>
        </TouchableOpacity>
      </View>

      {/* Provider Selection Modal */}
      <Modal visible={showProvidersModal} animationType="slide" transparent onRequestClose={() => setShowProvidersModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowProvidersModal(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: (colors as any).cardBackground }]} onPress={(e) => e.stopPropagation()}>
            <Text style={[typography.subtitle, { fontSize: 20, fontWeight: "700", color: colors.textPrimary, textAlign: "center", marginBottom: spacing.md }]}>
              {!selectedProvider ? "Select Provider" : "Select Payment Method"}
            </Text>

            <ScrollView style={{ maxHeight: 400 }}>
              {!selectedProvider ? (
                // Provider Selection
                availableProviders.map((provider) => {
                  const info = getProviderInfo(provider);
                  if (!info.supportsBuy) return null;

                  return (
                    <TouchableOpacity
                      key={provider}
                      style={[styles.providerRow, { backgroundColor: colors.background }]}
                      onPress={() => handleProviderSelect(provider)}
                    >
                      <View style={styles.providerHeader}>
                        <Text style={styles.providerLogo}>{info.logo}</Text>
                        <Text style={[styles.providerName, { color: colors.textPrimary }]}>{info.name}</Text>
                      </View>
                      <Text style={[styles.providerDesc, { color: colors.textSecondary }]}>{info.description}</Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                // Payment Method Selection (Coinbase only)
                <>
                  <TouchableOpacity style={styles.backButton} onPress={() => setSelectedProvider(null)}>
                    <Text style={{ color: colors.primary }}>← Back to providers</Text>
                  </TouchableOpacity>

                  {loadingPaymentMethods ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={{ color: colors.textSecondary, marginTop: spacing.md }}>Loading payment methods...</Text>
                    </View>
                  ) : availablePaymentMethods.length > 0 ? (
                    availablePaymentMethods.map((method) => (
                      <TouchableOpacity
                        key={String(method)}
                        style={[styles.providerRow, { backgroundColor: colors.background }]}
                        onPress={() => handlePaymentMethodSelect(method)}
                      >
                        <Text style={[styles.providerName, { color: colors.textPrimary }]}>{String(method)}</Text>
                        <Text style={[styles.providerDesc, { color: colors.textSecondary }]}>{String(method)}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ color: colors.textSecondary, textAlign: "center", padding: spacing.xl }}>
                      No payment methods available for your region
                    </Text>
                  )}
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* WebView Modal */}
      <Modal
        visible={showWebView}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeRamp}
      >
        <View style={styles.webViewContainer}>
          <View style={styles.webViewHeader}>
            <Text style={styles.webViewTitle}>
              {selectedProvider && getProviderInfo(selectedProvider).name}
            </Text>
            <Pressable style={styles.closeButton} onPress={closeRamp}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {webViewLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ color: colors.textSecondary, marginTop: spacing.md }}>Loading...</Text>
            </View>
          )}

          {rampUrl && (
            <WebView
              source={{ uri: rampUrl }}
              style={styles.webView}
              onLoadStart={() => setWebViewLoading(true)}
              onLoadEnd={() => setWebViewLoading(false)}
              onError={(syntheticEvent) => {
                const { nativeEvent } = syntheticEvent;
                console.error("WebView error:", nativeEvent);
                setWebViewLoading(false);
              }}
            />
          )}
        </View>
      </Modal>
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
    gap: 8 as any,
    marginBottom: spacing.lg,
    position: "relative",
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: "center",
    borderRadius: 10,
  },
  tabText: {
    ...typography.body,
    fontWeight: "600",
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
  methodDropdown: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: "transparent",
    minHeight: 50,
    width: "100%",
  },
  labelContainer: {
    flex: 1,
  },
  arrowContainer: {
    paddingLeft: spacing.sm,
  },
  dropdownLabel: {
    ...typography.body,
    fontWeight: "600",
  },
  dropdownOptions: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    marginTop: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    zIndex: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 12,
    paddingVertical: spacing.sm,
  },
  dropdownOption: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  separator: {
    height: 1,
    backgroundColor: "#E6E6E6",
    marginHorizontal: spacing.md,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.lg,
  },
  providerRow: {
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
  },
  providerName: {
    ...typography.subtitle,
    fontWeight: "600",
  },
  providerDesc: {
    ...typography.body,
    marginTop: spacing.xs,
  },
  providerHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  providerLogo: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  backButton: {
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: "center",
  },
  seeAll: {
    marginTop: spacing.lg,
    alignItems: "center",
  },
  webViewContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webViewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: "#E6E6E6",
    backgroundColor: "#FFFFFF",
  },
    webViewTitle: {
    ...typography.title,
    fontSize: 18,
    fontWeight: "600",
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    fontSize: 24,
    color: "#000000",
  },
  webView: {
    flex: 1,
  },
});

