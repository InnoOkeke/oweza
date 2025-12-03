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
import { RootStackParamList } from "../navigation/RootNavigator";
import { useTheme } from "../providers/ThemeProvider";
import { useAuth } from "../providers/Web3AuthProvider";
import { spacing, typography } from "../utils/theme";
import { TextField } from "../components/TextField";
import { PrimaryButton } from "../components/PrimaryButton";
import { getCusdBalance } from "../services/blockchain";
import { useQuery } from "@tanstack/react-query";
import {
  getAvailableOfframpProviders,
  buildOfframpUrl,
  getRegionFromCountryCode,
  getRegionRecommendations,
  type OfframpProvider,
} from "../services/offramp";
import { RampProvider } from "../services/ramp";

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
  const { profile } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);

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

    // TODO: Implement direct wallet transfer
    console.log("Withdraw to wallet:", { walletAddress, amount });
    Alert.alert("Coming Soon", "Direct wallet withdrawal will be implemented soon.");
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
    </SafeAreaView>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl * 2,
  },
  headerText: {
    ...typography.subtitle,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    fontSize: 15,
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  loadingText: {
    marginTop: spacing.md,
    ...typography.body,
  },
  currencyCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueText: {
    ...typography.subtitle,
    fontSize: 18,
    fontWeight: '600',
  },
  balanceAmount: {
    ...typography.title,
    fontSize: 32,
    fontWeight: '700',
    marginTop: spacing.xs,
  },
  fiatEquivalent: {
    ...typography.body,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  noProvidersCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: spacing.lg,
    marginVertical: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noProvidersText: {
    ...typography.body,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputSection: {
    marginBottom: spacing.lg,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  currencySymbolLarge: {
    ...typography.title,
    fontSize: 28,
    marginRight: spacing.sm,
  },
  amountInput: {
    flex: 1,
    ...typography.title,
    fontSize: 28,
    paddingVertical: 0,
  },
  currencyLabel: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  conversionHint: {
    ...typography.caption,
    fontSize: 12,
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  infoBox: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  infoText: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: `${colors.error}15`,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  warningText: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 20,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.subtitle,
    fontSize: 20,
    fontWeight: '700',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCloseText: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalScroll: {
    maxHeight: '70%',
  },
  modalSubtitle: {
    ...typography.body,
    fontSize: 14,
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    lineHeight: 20,
  },
  quoteLoadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
  },
  quoteLoadingText: {
    marginTop: spacing.md,
    ...typography.body,
  },
  providerQuoteCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
  },
  providerQuoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  providerQuoteIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  providerEmoji: {
    fontSize: 24,
  },
  providerQuoteInfo: {
    flex: 1,
  },
  providerName: {
    ...typography.subtitle,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  providerDescription: {
    ...typography.caption,
    fontSize: 12,
    lineHeight: 16,
  },
  selectedBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedBadgeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  quoteDetails: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  quoteLabel: {
    ...typography.caption,
    fontSize: 13,
  },
  quoteValue: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  modalActions: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },

  // WebView Styles
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.sm,
  },
  closeButtonText: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
  },
  webViewTitle: {
    ...typography.subtitle,
    fontSize: 16,
    fontWeight: '700',
  },
  webViewLoadingContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  webViewLoadingText: {
    marginTop: spacing.md,
    ...typography.body,
  },
});