import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import * as LocalAuthentication from "expo-local-authentication";
import { RootStackParamList } from "../navigation/RootNavigator";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/Web3AuthProvider";
import { spacing, typography } from "../utils/theme";
import { TextField } from "../components/TextField";
import { PrimaryButton } from "../components/PrimaryButton";
import { getCusdBalance, encodeCusdTransfer } from "../services/blockchain";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../utils/toast";
import { ToastModal } from "../components/ToastModal";
import {
  getAvailableOfframpProviders,
  buildOfframpUrl,
  getRegionFromCountryCode,
  getRegionRecommendations,
  type OfframpProvider,
} from "../services/offramp";
import { RampProvider } from "../services/ramp";
import { CUSD_TOKEN_ADDRESS } from "../config/celo";

type Props = NativeStackScreenProps<RootStackParamList, "Withdraw">;

// Helper function to get currency from country code
const getCurrencyFromCountryCode = (countryCode: string): { currency: string; symbol: string } => {
  const currencyByCountry: Record<string, { currency: string; symbol: string }> = {
    'US': { currency: 'USD', symbol: '$' },
    'GB': { currency: 'GBP', symbol: '£' },
    'NG': { currency: 'NGN', symbol: '₦' },
    'KE': { currency: 'KES', symbol: 'KSh' },
    'ZA': { currency: 'ZAR', symbol: 'R' },
    'GH': { currency: 'GHS', symbol: 'GH₵' },
    'JP': { currency: 'JPY', symbol: '¥' },
    'CN': { currency: 'CNY', symbol: '¥' },
    'IN': { currency: 'INR', symbol: '₹' },
    'BR': { currency: 'BRL', symbol: 'R$' },
    'CA': { currency: 'CAD', symbol: 'CA$' },
    'AU': { currency: 'AUD', symbol: 'A$' },
    'NZ': { currency: 'NZD', symbol: 'NZ$' },
    'MX': { currency: 'MXN', symbol: 'MX$' },
    'AR': { currency: 'ARS', symbol: 'AR$' },
    'DE': { currency: 'EUR', symbol: '€' },
    'FR': { currency: 'EUR', symbol: '€' },
    'IT': { currency: 'EUR', symbol: '€' },
    'ES': { currency: 'EUR', symbol: '€' },
    'NL': { currency: 'EUR', symbol: '€' },
    'BE': { currency: 'EUR', symbol: '€' },
    'AT': { currency: 'EUR', symbol: '€' },
    'PT': { currency: 'EUR', symbol: '€' },
    'IE': { currency: 'EUR', symbol: '€' },
    'FI': { currency: 'EUR', symbol: '€' },
    'GR': { currency: 'EUR', symbol: '€' },
  };
  return currencyByCountry[countryCode] ?? { currency: 'USD', symbol: '$' };
};

// Exchange rate fetch
const fetchFxRate = async (currency: string): Promise<number> => {
  if (currency === 'USD') {
    return 1;
  }

  try {
    const response = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
    const data = await response.json();

    if (data.rates && data.rates[currency]) {
      return data.rates[currency];
    }
    return 1;
  } catch (error) {
    console.error('Error fetching FX rate:', error);
    return 1;
  }
};

// Simulate quote fetching (in production, you'd call provider APIs)
const fetchProviderQuote = async (
  provider: RampProvider,
  amountCUSD: number,
  fxRate: number
): Promise<{ estimatedAmount: number; fee: number; total: number }> => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // Simulate different fee structures
  const feePercentages = {
    moonpay: 0.045, // 4.5%
    transak: 0.039, // 3.9%
    paycrest: 0.029, // 2.9% (best for Africa)
  };

  const feePercent = feePercentages[provider] || 0.04;
  const estimatedFiat = amountCUSD * fxRate;
  const fee = estimatedFiat * feePercent;
  const total = estimatedFiat - fee;

  return {
    estimatedAmount: estimatedFiat,
    fee,
    total,
  };
};

export const WithdrawScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { profile, sendUserOperation } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { toast, showToast, hideToast } = useToast();

  const withdrawType = route.params?.type || 'local';
  const isWalletWithdraw = withdrawType === 'wallet';

  const [walletAddress, setWalletAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [userCountry, setUserCountry] = useState<string>('');
  const [userCountryCode, setUserCountryCode] = useState<string>('');
  const [userCurrency, setUserCurrency] = useState<string>('USD');
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [fxRate, setFxRate] = useState<number>(1);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [availableProviders, setAvailableProviders] = useState<OfframpProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<RampProvider | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [providerQuotes, setProviderQuotes] = useState<Record<RampProvider, { estimatedAmount: number; fee: number; total: number } | null>>({
    moonpay: null,
    transak: null,
    paycrest: null,
  });
  const [showWebView, setShowWebView] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [isConfirmModalVisible, setIsConfirmModalVisible] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);

  // Query cUSD balance
  const { data: cusdBalance, isLoading: loadingBalance } = useQuery({
    queryKey: ["cusdBalance", profile?.walletAddress],
    queryFn: () => {
      if (!profile?.walletAddress) throw new Error("No wallet");
      return getCusdBalance(profile.walletAddress as `0x${string}`);
    },
    enabled: Boolean(profile?.walletAddress),
    refetchInterval: 10000,
  });

  // Auto-detect location and fetch providers
  useEffect(() => {
    const initializeLocation = async () => {
      setIsLoadingLocation(true);
      let location = null;
      try {
        const res = await fetch('https://ipinfo.io/json');
        const text = await res.text();
        try {
          location = JSON.parse(text);
        } catch (e) {
          console.error('IP location response was not JSON:', text);
        }
      } catch (err) {
        console.error('Error fetching IP location:', err);
      }

      let countryCode = 'US'; // Default
      if (location && location.country) {
        countryCode = location.country;
        setUserCountry(location.country);
        setUserCountryCode(location.country);
        const currencyData = getCurrencyFromCountryCode(location.country);
        setUserCurrency(currencyData.currency);
        setCurrencySymbol(currencyData.symbol);
        const rate = await fetchFxRate(currencyData.currency);
        setFxRate(rate);
      } else {
        // Fallback to device locale
        const locale = Intl.NumberFormat().resolvedOptions().locale;
        const region = locale.split('-')[1]?.toUpperCase();
        if (region) {
          countryCode = region;
          const currencyData = getCurrencyFromCountryCode(region);
          setUserCurrency(currencyData.currency);
          setCurrencySymbol(currencyData.symbol);
          const rate = await fetchFxRate(currencyData.currency);
          setFxRate(rate);
        }
      }

      // Fetch available providers based on location
      const providers = await getAvailableOfframpProviders(countryCode);
      setAvailableProviders(providers);

      setIsLoadingLocation(false);
    };

    initializeLocation();
  }, []);

  const handleViewQuotes = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }

    setIsLoadingQuotes(true);
    setShowProviderModal(true);

    // Fetch quotes from all available providers
    const quotes: Record<RampProvider, { estimatedAmount: number; fee: number; total: number } | null> = {
      moonpay: null,
      transak: null,
      paycrest: null,
    };

    await Promise.all(
      availableProviders.map(async (provider) => {
        try {
          const quote = await fetchProviderQuote(
            provider.provider,
            parseFloat(amount),
            fxRate
          );
          quotes[provider.provider] = quote;
        } catch (error) {
          console.error(`Failed to fetch quote from ${provider.provider}:`, error);
        }
      })
    );

    setProviderQuotes(quotes);
    setIsLoadingQuotes(false);
  };

  const handleProviderSelect = (provider: RampProvider) => {
    setSelectedProvider(provider);
  };

  const handleContinueWithProvider = async () => {
    if (!selectedProvider) {
      Alert.alert("Select Provider", "Please select a payment provider.");
      return;
    }

    if (!profile?.walletAddress) {
      Alert.alert("Wallet Error", "No wallet address found.");
      return;
    }

    setShowProviderModal(false);

    // Open offramp provider in WebView
    try {
      setWebViewLoading(true);
      const url = await buildOfframpUrl(
        selectedProvider,
        profile.walletAddress,
        amount,
        userCurrency
      );
      setWebViewUrl(url);
      setShowWebView(true);
    } catch (error) {
      console.error("Failed to build offramp URL:", error);
      Alert.alert("Error", "Failed to open payment provider. Please try again.");
    }
  };

  const handleWalletWithdraw = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }

    if (!walletAddress) {
      Alert.alert("Missing Address", "Please enter a wallet address.");
      return;
    }

    if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
      Alert.alert("Invalid Address", "Please enter a valid Ethereum/Celo wallet address.");
      return;
    }

    const withdrawAmount = parseFloat(amount);
    if (cusdBalance !== undefined && withdrawAmount > cusdBalance) {
      Alert.alert("Insufficient Balance", `You only have ${cusdBalance.toFixed(2)} cUSD available.`);
      return;
    }

    setIsConfirmModalVisible(true);
  };

  const handleBiometricAuth = async () => {
    setIsAuthenticating(true);

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert(
          "Confirm Transaction",
          "Biometric authentication is not available. Do you want to proceed?",
          [
            { text: "Cancel", style: "cancel", onPress: () => setIsAuthenticating(false) },
            { text: "Confirm", onPress: () => { executeWithdrawal(); } }
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
            { text: "Confirm", onPress: () => { executeWithdrawal(); } }
          ]
        );
        setIsAuthenticating(false);
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Confirm Withdrawal",
        fallbackLabel: "Use Passcode",
        disableDeviceFallback: false,
      });

      if (result.success) {
        executeWithdrawal();
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

  const executeWithdrawal = async () => {
    if (!profile?.walletAddress) {
      showToast("Wallet not connected", "error");
      setIsAuthenticating(false);
      return;
    }

    setIsWithdrawing(true);

    try {
      console.log("🔵 Starting withdrawal to:", walletAddress);
      console.log("📍 Amount:", amount);

      const callData = encodeCusdTransfer(
        walletAddress as `0x${string}`,
        parseFloat(amount)
      );

      console.log("📦 Encoded call data:", callData);

      const result = await sendUserOperation([
        {
          to: CUSD_TOKEN_ADDRESS,
          data: callData,
          value: 0n,
        }
      ]);

      console.log("✅ Withdrawal successful:", result);

      await queryClient.invalidateQueries({ queryKey: ["cusdBalance", profile.walletAddress] });

      showToast(`Successfully withdrawn ${amount} cUSD to ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`, "success");

      setWalletAddress("");
      setAmount("");
      setIsConfirmModalVisible(false);

      setTimeout(() => {
        navigation.goBack();
      }, 2000);
    } catch (error) {
      console.error("❌ Withdrawal error:", error);
      showToast(error instanceof Error ? error.message : "Withdrawal failed", "error");
    } finally {
      setIsWithdrawing(false);
      setIsAuthenticating(false);
    }
  };

  const handleCancelConfirmation = () => {
    setIsConfirmModalVisible(false);
    setIsAuthenticating(false);
  };

  const closeWebView = () => {
    setShowWebView(false);
    setWebViewLoading(true);
    setWebViewUrl(null);
  };

  const closeProviderModal = () => {
    setShowProviderModal(false);
    setSelectedProvider(null);
  };

  // Show WebView
  if (showWebView && webViewUrl) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.webViewHeader}>
          <TouchableOpacity onPress={closeWebView} style={styles.closeButton}>
            <Text style={[styles.closeButtonText, { color: colors.textPrimary }]}>✕ Close</Text>
          </TouchableOpacity>
          <Text style={[styles.webViewTitle, { color: colors.textPrimary }]}>
            {selectedProvider?.toUpperCase()} Withdrawal
          </Text>
        </View>
        {webViewLoading && (
          <View style={styles.webViewLoadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.webViewLoadingText, { color: colors.textSecondary }]}>
              Loading payment provider...
            </Text>
          </View>
        )}
        <WebView
          source={{ uri: webViewUrl }}
          onLoadStart={() => setWebViewLoading(true)}
          onLoadEnd={() => setWebViewLoading(false)}
          onError={() => {
            setWebViewLoading(false);
            Alert.alert("Error", "Failed to load payment provider.");
          }}
          style={{ flex: 1 }}
        />
      </SafeAreaView>
    );
  }

  // Local Fiat Payout View
  if (!isWalletWithdraw) {
    const region = getRegionFromCountryCode(userCountryCode);
    const recommendations = getRegionRecommendations(region);

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={[styles.headerText, { color: colors.textPrimary }]}>
            Withdraw to Local Fiat
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Convert your cUSD to your local currency and receive it via bank transfer or mobile money.
          </Text>

          {isLoadingLocation ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Detecting your location...
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.currencyCard}>
                <View style={styles.currencyRow}>
                  <View>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Location</Text>
                    <Text style={[styles.valueText, { color: colors.textPrimary }]}>
                      {userCountry} ({userCountryCode})
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Currency</Text>
                    <Text style={[styles.valueText, { color: colors.textPrimary }]}>
                      {userCurrency} ({currencySymbol})
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.balanceCard}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Available Balance</Text>
                <Text style={[styles.balanceAmount, { color: colors.primary }]}>
                  {loadingBalance ? "..." : cusdBalance !== undefined ? `$${cusdBalance.toFixed(2)} cUSD` : "$0.00 cUSD"}
                </Text>
                {cusdBalance !== undefined && fxRate !== 1 && (
                  <Text style={[styles.fiatEquivalent, { color: colors.textSecondary }]}>
                    ≈ {currencySymbol}{(cusdBalance * fxRate).toFixed(2)} {userCurrency}
                  </Text>
                )}
              </View>

              {availableProviders.length === 0 ? (
                <View style={styles.noProvidersCard}>
                  <Text style={[styles.noProvidersText, { color: colors.textSecondary }]}>
                    ⚠️ No offramp providers available for your region yet. Please try the Exchange/Wallet option instead.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.inputSection}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>Amount to Withdraw (cUSD)</Text>
                    <View style={styles.amountInputContainer}>
                      <Text style={[styles.currencySymbolLarge, { color: colors.textPrimary }]}>
                        $
                      </Text>
                      <TextInput
                        style={[styles.amountInput, { color: colors.textPrimary }]}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>
                        cUSD
                      </Text>
                    </View>
                    {amount && parseFloat(amount) > 0 && fxRate !== 1 && (
                      <Text style={[styles.conversionHint, { color: colors.textSecondary }]}>
                        ≈ {currencySymbol}{(parseFloat(amount) * fxRate).toFixed(2)} {userCurrency}
                      </Text>
                    )}
                  </View>

                  <View style={styles.infoBox}>
                    <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                      💡 Click "View Quotes" to compare rates from {availableProviders.length} available provider{availableProviders.length > 1 ? 's' : ''} for your region.
                    </Text>
                    <Text style={[styles.infoText, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                      Available methods: {recommendations.paymentMethods.join(', ')}
                    </Text>
                  </View>

                  <PrimaryButton
                    title="View Quotes & Select Provider"
                    onPress={handleViewQuotes}
                    disabled={!amount || parseFloat(amount) <= 0}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* Provider Selection Modal */}
        <Modal
          visible={showProviderModal}
          animationType="slide"
          transparent={true}
          onRequestClose={closeProviderModal}
        >
          <View style={styles.modalOverlay}>
            <Pressable style={styles.modalBackdrop} onPress={closeProviderModal} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  Select Provider
                </Text>
                <TouchableOpacity onPress={closeProviderModal} style={styles.modalCloseButton}>
                  <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  {isLoadingQuotes ? "Fetching quotes from providers..." : `Compare quotes for ${currencySymbol}${amount} cUSD withdrawal to ${userCurrency}`}
                </Text>

                {isLoadingQuotes ? (
                  <View style={styles.quoteLoadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={[styles.quoteLoadingText, { color: colors.textSecondary }]}>
                      Loading quotes...
                    </Text>
                  </View>
                ) : (
                  availableProviders.map((provider) => {
                    const quote = providerQuotes[provider.provider];
                    const isSelected = selectedProvider === provider.provider;

                    return (
                      <TouchableOpacity
                        key={provider.provider}
                        style={[
                          styles.providerQuoteCard,
                          {
                            borderColor: isSelected ? colors.primary : colors.border,
                            backgroundColor: isSelected ? `${colors.primary}10` : colors.cardBackground,
                          }
                        ]}
                        onPress={() => handleProviderSelect(provider.provider)}
                      >
                        <View style={styles.providerQuoteHeader}>
                          <View style={styles.providerQuoteIcon}>
                            <Text style={styles.providerEmoji}>{provider.logo}</Text>
                          </View>
                          <View style={styles.providerQuoteInfo}>
                            <Text style={[styles.providerName, { color: colors.textPrimary }]}>
                              {provider.name}
                            </Text>
                            <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>
                              {provider.description}
                            </Text>
                          </View>
                          {isSelected && (
                            <View style={[styles.selectedBadge, { backgroundColor: colors.primary }]}>
                              <Text style={styles.selectedBadgeText}>✓</Text>
                            </View>
                          )}
                        </View>

                        {quote && (
                          <View style={[styles.quoteDetails, { borderTopColor: colors.border }]}>
                            <View style={styles.quoteRow}>
                              <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>
                                You'll receive
                              </Text>
                              <Text style={[styles.quoteValue, { color: colors.primary }]}>
                                {currencySymbol}{quote.total.toFixed(2)} {userCurrency}
                              </Text>
                            </View>
                            <View style={styles.quoteRow}>
                              <Text style={[styles.quoteLabel, { color: colors.textSecondary }]}>
                                Provider fee
                              </Text>
                              <Text style={[styles.quoteValue, { color: colors.textSecondary }]}>
                                {currencySymbol}{quote.fee.toFixed(2)}
                              </Text>
                            </View>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <PrimaryButton
                  title={selectedProvider ? `Continue with ${availableProviders.find(p => p.provider === selectedProvider)?.name}` : "Select a Provider"}
                  onPress={handleContinueWithProvider}
                  disabled={!selectedProvider || isLoadingQuotes}
                />
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  // Exchange/Wallet Withdraw View
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.headerText, { color: colors.textPrimary }]}>
          Withdraw to Exchange/Wallet
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Send your cUSD directly to another wallet address or exchange.
        </Text>

        <View style={styles.balanceCard}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Available Balance</Text>
          <Text style={[styles.balanceAmount, { color: colors.primary }]}>
            {loadingBalance ? "..." : cusdBalance !== undefined ? `$${cusdBalance.toFixed(2)} cUSD` : "$0.00 cUSD"}
          </Text>
        </View>

        <TextField
          label="Wallet Address"
          value={walletAddress}
          onChangeText={setWalletAddress}
          placeholder="0x..."
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.infoBox}>
          <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>
            💡 How to get your deposit address:
          </Text>
          <Text style={[styles.infoText, { color: colors.textSecondary }]}>
            {'\n'}• <Text style={{ fontWeight: '600' }}>From Exchange (Binance, Coinbase, etc.):</Text>
            {'\n'}  1. Go to Wallet → Deposit
            {'\n'}  2. Search for "cUSD" or "Celo Dollar"
            {'\n'}  3. Select Celo network
            {'\n'}  4. Copy the deposit address
            {'\n\n'}• <Text style={{ fontWeight: '600' }}>From External Wallet (MetaMask, Trust Wallet, etc.):</Text>
            {'\n'}  1. Open your wallet app
            {'\n'}  2. Make sure you're on Celo network
            {'\n'}  3. Copy your wallet address
          </Text>
        </View>

        <View style={styles.inputSection}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Amount (cUSD)</Text>
          <View style={styles.amountInputContainer}>
            <Text style={[styles.currencySymbolLarge, { color: colors.textPrimary }]}>
              $
            </Text>
            <TextInput
              style={[styles.amountInput, { color: colors.textPrimary }]}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
            />
            <Text style={[styles.currencyLabel, { color: colors.textSecondary }]}>
              cUSD
            </Text>
          </View>
        </View>

        <View style={styles.warningBox}>
          <Text style={[styles.warningText, { color: colors.error }]}>
            ⚠️ Warning: Double-check the address and network. Sending to the wrong address or network may result in permanent loss of funds.
          </Text>
        </View>

        <PrimaryButton
          title="Review & Withdraw"
          onPress={handleWalletWithdraw}
          disabled={!walletAddress || !amount || parseFloat(amount) <= 0}
        />
      </ScrollView>


      {/* Confirmation Modal for Wallet Withdrawal */}
      <Modal
        visible={isConfirmModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCancelConfirmation}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Confirm Withdrawal</Text>
              <Pressable onPress={handleCancelConfirmation} style={styles.modalCloseButton}>
                <Text style={[styles.modalCloseText, { color: colors.textPrimary }]}>✕</Text>
              </Pressable>
            </View>

            <View style={styles.confirmationDetails}>
              <View style={styles.confirmationRow}>
                <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Sending to</Text>
                <Text style={[styles.confirmationValue, { color: colors.textPrimary }]}>
                  {walletAddress.slice(0, 10)}...{walletAddress.slice(-8)}
                </Text>
              </View>

              <View style={styles.confirmationDivider} />

              <View style={styles.confirmationRow}>
                <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Amount</Text>
                <Text style={[styles.confirmationAmount, { color: colors.textPrimary }]}>
                  {amount} cUSD
                </Text>
              </View>

              <View style={styles.confirmationDivider} />

              <View style={styles.confirmationRow}>
                <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Network</Text>
                <Text style={[styles.confirmationValue, { color: colors.textPrimary }]}>Celo Sepolia</Text>
              </View>

              <View style={styles.confirmationRow}>
                <Text style={[styles.confirmationLabel, { color: colors.textSecondary }]}>Gas Fee</Text>
                <Text style={[styles.confirmationFree, { color: colors.success }]}>Free (Celo Paymaster)</Text>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                onPress={handleCancelConfirmation}
                disabled={isAuthenticating || isWithdrawing}
              >
                <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  { backgroundColor: colors.primary },
                  (isAuthenticating || isWithdrawing) && styles.confirmButtonDisabled
                ]}
                onPress={handleBiometricAuth}
                disabled={isAuthenticating || isWithdrawing}
              >
                {isAuthenticating || isWithdrawing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmButtonText}>🔒 Confirm</Text>
                )}
              </TouchableOpacity>
            </View>

            <Text style={[styles.biometricHint, { color: colors.textSecondary }]}>
              You'll be asked to authenticate with biometrics
            </Text>
          </View>
        </View>
      </Modal>

      <ToastModal
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={hideToast}
      />
    </SafeAreaView>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollContent: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    headerText: {
      fontSize: 24,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    subtitle: {
      fontSize: 14,
      marginBottom: spacing.md,
    },
    label: {
      fontSize: 13,
      fontWeight: "500",
      marginBottom: spacing.xs,
    },
    balanceCard: {
      backgroundColor: colors.cardBackground,
      padding: spacing.lg,
      borderRadius: 12,
      marginBottom: spacing.md,
    },
    balanceAmount: {
      fontSize: 28,
      fontWeight: "700",
    },
    fiatEquivalent: {
      fontSize: 14,
      marginTop: spacing.xs,
    },
    currencyCard: {
      backgroundColor: colors.cardBackground,
      padding: spacing.lg,
      borderRadius: 12,
      marginBottom: spacing.md,
    },
    currencyRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    valueText: {
      fontSize: 16,
      fontWeight: "600",
    },
    inputSection: {
      marginBottom: spacing.md,
    },
    amountInputContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    currencySymbolLarge: {
      fontSize: 24,
      fontWeight: "600",
      marginRight: spacing.xs,
    },
    amountInput: {
      flex: 1,
      fontSize: 24,
      fontWeight: "600",
      paddingVertical: spacing.sm,
    },
    currencyLabel: {
      fontSize: 16,
      fontWeight: "500",
    },
    conversionHint: {
      fontSize: 13,
      marginTop: spacing.xs,
    },
    infoBox: {
      backgroundColor: `${colors.primary}15`,
      padding: spacing.md,
      borderRadius: 12,
      marginBottom: spacing.md,
    },
    infoText: {
      fontSize: 13,
    },
    warningBox: {
      backgroundColor: `${colors.error}15`,
      padding: spacing.md,
      borderRadius: 12,
      marginBottom: spacing.md,
    },
    warningText: {
      fontSize: 13,
    },
    loadingContainer: {
      padding: spacing.xl,
      alignItems: "center",
    },
    loadingText: {
      marginTop: spacing.md,
      fontSize: 14,
    },
    noProvidersCard: {
      backgroundColor: colors.cardBackground,
      padding: spacing.lg,
      borderRadius: 12,
      marginBottom: spacing.md,
    },
    noProvidersText: {
      fontSize: 14,
      textAlign: "center",
    },
    webViewHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    closeButton: {
      padding: spacing.sm,
    },
    closeButtonText: {
      fontSize: 16,
      fontWeight: "600",
    },
    webViewTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 16,
      fontWeight: "600",
      marginRight: 40,
    },
    webViewLoadingContainer: {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: [{ translateX: -50 }, { translateY: -50 }],
      alignItems: "center",
    },
    webViewLoadingText: {
      marginTop: spacing.sm,
      fontSize: 14,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: spacing.xl,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: "700",
    },
    modalCloseButton: {
      padding: spacing.sm,
    },
    modalCloseText: {
      fontSize: 20,
    },
    modalActions: {
      flexDirection: "row",
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
    providerQuoteCard: {
      padding: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: spacing.sm,
    },
    providerQuoteHeader: {
      flexDirection: "row",
      alignItems: "center",
    },
    providerQuoteIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.cardBackground,
      justifyContent: "center",
      alignItems: "center",
      marginRight: spacing.md,
    },
    providerEmoji: {
      fontSize: 24,
    },
    providerQuoteInfo: {
      flex: 1,
    },
    providerName: {
      fontSize: 16,
      fontWeight: "600",
    },
    providerDescription: {
      fontSize: 12,
      marginTop: 2,
    },
    selectedBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    selectedBadgeText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "700",
    },
    quoteDetails: {
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: 1,
    },
    quoteRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: spacing.xs,
    },
    quoteLabel: {
      fontSize: 13,
    },
    quoteValue: {
      fontSize: 14,
      fontWeight: "600",
    },
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
      fontWeight: "500",
    },
    confirmationValue: {
      fontSize: 15,
      fontWeight: "500",
      textAlign: "right",
      flex: 1,
    },
    confirmationAmount: {
      fontSize: 20,
      fontWeight: "700",
    },
    confirmationFree: {
      fontSize: 15,
      fontWeight: "600",
    },
    confirmationDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: spacing.sm,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: "600",
    },
    confirmButton: {
      flex: 1,
      paddingVertical: spacing.md,
      borderRadius: 12,
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
      textAlign: "center",
      marginTop: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
  });