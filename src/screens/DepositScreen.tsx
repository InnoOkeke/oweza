import React, { useState, useEffect, useMemo } from "react";
import Svg, { Rect, Path } from 'react-native-svg';
import QRCodeUtil from 'qrcode';


import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
  TextInput,
  Clipboard,
  Alert,
  Share,
  Animated,
  Dimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { useAuth } from "../providers/Web3AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { RootStackParamList } from "../navigation/RootNavigator";
import { spacing, typography } from "../utils/theme";
import {
  buildRampUrlWithSession,
  type RampProvider,
} from "../services/ramp";
import {
  getAvailableOnrampProviders,
  buildOnrampUrl,
  getRegionFromCountryCode,
  getRegionRecommendations,
  type OnrampProvider,
} from "../services/onramp";
import { PrimaryButton } from "../components/PrimaryButton";
import { useToast } from "../utils/toast";

const { width } = Dimensions.get('window');



type Props = NativeStackScreenProps<RootStackParamList, "Deposit">;

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

export const DepositScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const { showToast } = useToast();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const depositType = route.params?.type || 'local';
  const isWalletDeposit = depositType === 'wallet';

  const [amount, setAmount] = useState("");
  const [userCountryCode, setUserCountryCode] = useState<string>('');
  const [userCurrency, setUserCurrency] = useState<string>('USD');
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [availableProviders, setAvailableProviders] = useState<OnrampProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<RampProvider | null>(null);
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewUrl, setWebViewUrl] = useState<string | null>(null);
  const [webViewLoading, setWebViewLoading] = useState(true);

  // Animation values
  const fadeAnim = useState(new Animated.Value(0))[0];
  const slideAnim = useState(new Animated.Value(50))[0];
  const scaleAnim = useState(new Animated.Value(0.95))[0];

  // Animate on mount
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  // Auto-detect location
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
        setUserCountryCode(location.country);
        const currencyData = getCurrencyFromCountryCode(location.country);
        setUserCurrency(currencyData.currency);
        setCurrencySymbol(currencyData.symbol);
      } else {
        // Fallback to device locale
        const locale = Intl.NumberFormat().resolvedOptions().locale;
        const region = locale.split('-')[1]?.toUpperCase();
        if (region) {
          countryCode = region;
          const currencyData = getCurrencyFromCountryCode(region);
          setUserCurrency(currencyData.currency);
          setCurrencySymbol(currencyData.symbol);
        }
      }

      // Fetch available providers based on location
      const providers = await getAvailableOnrampProviders(countryCode);
      setAvailableProviders(providers);

      // Auto-select recommended provider
      if (providers.length > 0) {
        const region = getRegionFromCountryCode(countryCode);
        const recommendations = getRegionRecommendations(region);
        const recommendedProvider = providers.find(p => p.provider === recommendations.preferredProvider);
        if (recommendedProvider) {
          setSelectedProvider(recommendedProvider.provider);
        } else {
          setSelectedProvider(providers[0].provider);
        }
      }

      setIsLoadingLocation(false);
    };

    initializeLocation();
  }, []);

  const handleViewProviders = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount greater than zero.");
      return;
    }
    setShowProviderModal(true);
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

    try {
      setWebViewLoading(true);
      const url = await buildOnrampUrl(
        selectedProvider,
        profile.walletAddress,
        amount
      );
      setWebViewUrl(url);
      setShowWebView(true);
    } catch (error) {
      console.error("Failed to build onramp URL:", error);
      Alert.alert("Error", "Failed to open payment provider. Please try again.");
    }
  };

  const handleCopyAddress = () => {
    if (profile?.walletAddress) {
      Clipboard.setString(profile.walletAddress);
      showToast("Wallet address copied to clipboard", "success");
    }
  };

  const handleShareAddress = async () => {
    if (profile?.walletAddress) {
      try {
        await Share.share({
          message: `My Celo Wallet Address:\n${profile.walletAddress}\n\nNetwork: Celo\nToken: cUSD`,
          title: "My Wallet Address",
        });
      } catch (error) {
        console.error("Error sharing:", error);
      }
    }
  };

  const closeWebView = () => {
    setShowWebView(false);
    setWebViewLoading(true);
    setWebViewUrl(null);
  };

  const closeProviderModal = () => {
    setShowProviderModal(false);
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
            {selectedProvider?.toUpperCase()} Deposit
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
          onLoad Start={() => setWebViewLoading(true)}
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

  // Wallet Deposit View (Show QR Code)
  if (isWalletDeposit) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View
            style={[
              styles.animatedContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
              }
            ]}
          >
            {/* Hero Header */}
            <View style={styles.heroHeader}>
              <View style={styles.heroIconContainer}>
                <Text style={styles.heroIcon}>💰</Text>
              </View>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
                Receive Funds
              </Text>
              <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
                Share your wallet address or QR code to receive cUSD on the Celo network
              </Text>
            </View>

            {/* Premium QR Code Card */}
            <View style={[styles.qrCardPremium, { backgroundColor: colors.cardBackground }]}>
              <View style={styles.qrCardGlow} />
              <View style={styles.qrCardInner}>
                <Text style={[styles.qrCardLabel, { color: colors.textSecondary }]}>
                  SCAN TO SEND
                </Text>
                <View style={styles.qrWrapper}>
                  {profile?.walletAddress ? (
                    <View style={[styles.qrCodeContainer, { backgroundColor: '#FFFFFF' }]}>
                      <QRCodeGenerator
                        value={profile.walletAddress}
                        size={200}
                        color="#000000"
                        backgroundColor="#FFFFFF"
                      />
                    </View>
                  ) : (
                    <View style={[styles.qrPlaceholderPremium, { backgroundColor: colors.background }]}>
                      <Text style={styles.qrPlaceholderIcon}>📱</Text>
                      <Text style={[styles.qrPlaceholderText, { color: colors.textSecondary }]}>
                        {profile?.walletAddress ? "QR Code Ready" : "No wallet address"}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={[styles.networkBadge, { backgroundColor: `${colors.primary}20` }]}>
                  <View style={[styles.networkDot, { backgroundColor: colors.primary }]} />
                  <Text style={[styles.networkBadgeText, { color: colors.primary }]}>
                    Celo Network • cUSD
                  </Text>
                </View>
              </View>
            </View>

            {/* Wallet Address Card */}
            <View style={[styles.addressCardPremium, { backgroundColor: colors.cardBackground }]}>
              <View style={styles.addressCardHeader}>
                <Text style={[styles.addressCardTitle, { color: colors.textPrimary }]}>
                  Your Wallet Address
                </Text>
                <View style={[styles.securityBadge, { backgroundColor: `${colors.success}15` }]}>
                  <Text style={[styles.securityBadgeText, { color: colors.success }]}>
                    🔒 Secure
                  </Text>
                </View>
              </View>

              <View style={[styles.addressBoxPremium, { backgroundColor: colors.background }]}>
                <Text style={[styles.addressTextPremium, { color: colors.textPrimary }]} numberOfLines={1} ellipsizeMode="middle">
                  {profile?.walletAddress || "No wallet address available"}
                </Text>
              </View>

              <View style={styles.actionButtons}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonPrimary, { backgroundColor: `${colors.primary}15` }]}
                  onPress={handleCopyAddress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionButtonIcon, { backgroundColor: colors.primary }]}>
                    <Text style={styles.actionButtonEmoji}>📋</Text>
                  </View>
                  <View style={styles.actionButtonContent}>
                    <Text style={[styles.actionButtonTitle, { color: colors.primary }]}>Copy</Text>
                    <Text style={[styles.actionButtonSubtitle, { color: colors.primary, opacity: 0.7 }]}>
                      Copy address
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.actionButtonSecondary, { backgroundColor: `${colors.primary}15` }]}
                  onPress={handleShareAddress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.actionButtonIcon, { backgroundColor: colors.primary }]}>
                    <Text style={styles.actionButtonEmoji}>📤</Text>
                  </View>
                  <View style={styles.actionButtonContent}>
                    <Text style={[styles.actionButtonTitle, { color: colors.primary }]}>Share</Text>
                    <Text style={[styles.actionButtonSubtitle, { color: colors.primary, opacity: 0.7 }]}>
                      Send via apps
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Safety Warning Card */}
            <View style={[styles.warningCardPremium, { backgroundColor: `${colors.error}10` }]}>
              <View style={[styles.warningIcon, { backgroundColor: colors.error }]}>
                <Text style={styles.warningEmoji}>⚠️</Text>
              </View>
              <View style={styles.warningContent}>
                <Text style={[styles.warningTitle, { color: colors.error }]}>
                  Important: Network Selection
                </Text>
                <Text style={[styles.warningText, { color: colors.textSecondary }]}>
                  Always select <Text style={{ fontWeight: '700', color: colors.textPrimary }}>Celo</Text> network when sending from exchanges or wallets. Sending on the wrong network will result in lost funds.
                </Text>
              </View>
            </View>

            {/* Instructions Accordion */}
            <View style={[styles.instructionsCard, { backgroundColor: colors.cardBackground }]}>
              <Text style={[styles.instructionsTitle, { color: colors.textPrimary }]}>
                💡 How to deposit from exchanges
              </Text>

              <View style={[styles.instructionItem, { borderLeftColor: colors.primary }]}>
                <Text style={[styles.instructionPlatform, { color: colors.textPrimary }]}>
                  Binance / Coinbase / Kraken
                </Text>
                <Text style={[styles.instructionStep, { color: colors.textSecondary }]}>
                  1. Navigate to Wallet → Withdraw{'\n'}
                  2. Search for "cUSD" or "Celo Dollar"{'\n'}
                  3. Select <Text style={{ fontWeight: '600' }}>Celo</Text> network{'\n'}
                  4. Paste address above{'\n'}
                  5. Enter amount and confirm
                </Text>
              </View>

              <View style={[styles.instructionItem, { borderLeftColor: colors.primary }]}>
                <Text style={[styles.instructionPlatform, { color: colors.textPrimary }]}>
                  MetaMask / Trust Wallet
                </Text>
                <Text style={[styles.instructionStep, { color: colors.textSecondary }]}>
                  1. Switch to  Celo network{'\n'}
                  2. Select cUSD token{'\n'}
                  3. Send to the address above
                </Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Local Payment Method View
  const region = getRegionFromCountryCode(userCountryCode);
  const recommendations = getRegionRecommendations(region);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View
          style={[
            styles.animatedContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
            }
          ]}
        >
          {/* Hero Header */}
          <View style={styles.heroHeader}>
            <View style={styles.heroIconContainer}>
              <Text style={styles.heroIcon}>💳</Text>
            </View>
            <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
              Add Funds
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
              Buy cUSD instantly using your local currency and payment method
            </Text>
          </View>

          {isLoadingLocation ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Detecting your location...
              </Text>
            </View>
          ) : (
            <>
              {/* Location Card */}
              <View style={[styles.locationCardPremium, { backgroundColor: colors.cardBackground }]}>
                <View style={styles.locationRow}>
                  <View style={styles.locationItem}>
                    <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>📍 Location</Text>
                    <Text style={[styles.locationValue, { color: colors.textPrimary }]}>
                      {userCountryCode || "Global"}
                    </Text>
                  </View>
                  <View style={[styles.locationDivider, { backgroundColor: colors.border }]} />
                  <View style={[styles.locationItem, { alignItems: 'flex-end' }]}>
                    <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>💰 Currency</Text>
                    <Text style={[styles.locationValue, { color: colors.textPrimary }]}>
                      {userCurrency} ({currencySymbol})
                    </Text>
                  </View>
                </View>
              </View>

              {availableProviders.length === 0 ? (
                <View style={[styles.noProvidersCardPremium, { backgroundColor: `${colors.warning}10` }]}>
                  <View style={[styles.noProvidersIcon, { backgroundColor: colors.warning }]}>
                    <Text style={styles.noProvidersEmoji}>⚠️</Text>
                  </View>
                  <View style={styles.noProvidersContent}>
                    <Text style={[styles.noProvidersTitle, { color: colors.textPrimary }]}>
                      No Providers Available
                    </Text>
                    <Text style={[styles.noProvidersText, { color: colors.textSecondary }]}>
                      Payment providers are not available for your region yet. Please try the Wallet/Exchange deposit option instead.
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  {/* Amount Input Section */}
                  <View style={[styles.amountCardPremium, { backgroundColor: colors.cardBackground }]}>
                    <Text style={[styles.amountLabelPremium, { color: colors.textSecondary }]}>
                      Enter Amount
                    </Text>
                    <View style={[styles.amountInputPremium, { borderColor: colors.border }]}>
                      <Text style={[styles.currencySymbolPremium, { color: colors.textPrimary }]}>
                        {currencySymbol}
                      </Text>
                      <TextInput
                        style={[styles.amountInputField, { color: colors.textPrimary }]}
                        value={amount}
                        onChangeText={setAmount}
                        placeholder="0.00"
                        placeholderTextColor={`${colors.textSecondary}60`}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.currencyCodePremium, { color: colors.textSecondary }]}>
                        {userCurrency}
                      </Text>
                    </View>
                    <Text style={[styles.amountHint, { color: colors.textSecondary }]}>
                      You'll receive approximately {amount ? `${parseFloat(amount).toFixed(2)} ` : '0.00 '}cUSD
                    </Text>
                  </View>

                  {/* Providers Info Card */}
                  <View style={[styles.providersInfoCard, { backgroundColor: `${colors.primary}10` }]}>
                    <View style={styles.providersInfoHeader}>
                      <Text style={styles.providersInfoIcon}>💡</Text>
                      <View style={styles.providersInfoContent}>
                        <Text style={[styles.providersInfoTitle, { color: colors.textPrimary }]}>
                          {availableProviders.length} Provider{availableProviders.length > 1 ? 's' : ''} Available
                        </Text>
                        <Text style={[styles.providersInfoText, { color: colors.textSecondary }]}>
                          {recommendations.paymentMethods.slice(0, 3).join(', ')}
                          {recommendations.paymentMethods.length > 3 && ' & more'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Continue Button */}
                  <PrimaryButton
                    title="View Providers & Continue"
                    onPress={handleViewProviders}
                    disabled={!amount || parseFloat(amount) <= 0}
                  />
                </>
              )}
            </>
          )}
        </Animated.View>
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
                Choose a provider to deposit {currencySymbol}{amount} {userCurrency}
              </Text>

              {availableProviders.map((provider) => {
                const isSelected = selectedProvider === provider.provider;

                return (
                  <TouchableOpacity
                    key={provider.provider}
                    style={[
                      styles.providerCard,
                      {
                        borderColor: isSelected ? colors.primary : colors.border,
                        backgroundColor: isSelected ? `${colors.primary}10` : colors.cardBackground,
                      }
                    ]}
                    onPress={() => handleProviderSelect(provider.provider)}
                  >
                    <View style={styles.providerHeader}>
                      <View style={styles.providerIcon}>
                        <Text style={styles.providerEmoji}>{provider.logo}</Text>
                      </View>
                      <View style={styles.providerInfo}>
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
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <PrimaryButton
                title={selectedProvider ? `Continue with ${availableProviders.find(p => p.provider === selectedProvider)?.name}` : "Select a Provider"}
                onPress={handleContinueWithProvider}
                disabled={!selectedProvider}
              />
            </View>
          </View>
        </View>
      </Modal>
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

  // QR Code Styles
  qrContainer: {
    alignItems: 'center',
    marginVertical: spacing.xl,
  },
  qrCodeWrapper: {
    padding: spacing.lg,
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
  },
  qrPlaceholder: {
    width: 220 + spacing.lg * 2,
    height: 220 + spacing.lg * 2,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrPlaceholderText: {
    ...typography.body,
    fontSize: 16,
    textAlign: 'center',
  },
  addressCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressBox: {
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  addressText: {
    ...typography.body,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  addressActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addressActionButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  addressActionText: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
  },
  networkCard: {
    backgroundColor: `${colors.error}15`,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  networkTitle: {
    ...typography.subtitle,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  networkText: {
    ...typography.body,
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  networkBullet: {
    ...typography.body,
    fontSize: 14,
    marginTop: spacing.xs / 2,
  },

  // Premium Wallet Deposit Styles
  animatedContainer: {
    width: '100%',
  },
  heroHeader: {
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingTop: spacing.md,
  },
  heroIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  heroIcon: {
    fontSize: 40,
  },
  heroTitle: {
    ...typography.title,
    fontSize: 32,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...typography.body,
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.md,
    opacity: 0.8,
  },

  // Premium QR Card
  qrCardPremium: {
    borderRadius: 24,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
  },
  qrCardGlow: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    height: 150,
    backgroundColor: colors.primary,
    opacity: 0.05,
    borderRadius: 100,
  },
  qrCardInner: {
    alignItems: 'center',
  },
  qrCardLabel: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  qrWrapper: {
    marginBottom: spacing.md,
  },
  qrCodeContainer: {
    padding: spacing.md,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  qrPlaceholderPremium: {
    width: 200 + spacing.md * 2,
    height: 200 + spacing.md * 2,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  qrPlaceholderIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  networkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.xs,
  },
  networkBadgeText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },

  // Premium Address Card
  addressCardPremium: {
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  addressCardTitle: {
    ...typography.subtitle,
    fontSize: 18,
    fontWeight: '700',
  },
  securityBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: 12,
  },
  securityBadgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  addressBoxPremium: {
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressTextPremium: {
    ...typography.body,
    fontSize: 13,
    fontFamily: 'monospace',
    textAlign: 'center',
  },

  // Premium Action Buttons
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  actionButtonPrimary: {
    // Additional styles if needed
  },
  actionButtonSecondary: {
    // Additional styles if needed
  },
  actionButtonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  actionButtonEmoji: {
    fontSize: 16,
  },
  actionButtonContent: {
    flex: 1,
  },
  actionButtonTitle: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  actionButtonSubtitle: {
    ...typography.caption,
    fontSize: 11,
  },

  // Premium Warning Card
  warningCardPremium: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  warningIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  warningEmoji: {
    fontSize: 20,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  warningText: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
  },

  // Premium Instructions Card
  instructionsCard: {
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instructionsTitle: {
    ...typography.subtitle,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  instructionItem: {
    marginBottom: spacing.md,
    paddingLeft: spacing.md,
    borderLeftWidth: 3,
    paddingVertical: spacing.sm,
  },
  instructionPlatform: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  instructionStep: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 20,
  },

  // Premium Local Payment Styles
  locationCardPremium: {
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  locationItem: {
    flex: 1,
  },
  locationLabel: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  locationValue: {
    ...typography.subtitle,
    fontSize: 20,
    fontWeight: '700',
  },
  locationDivider: {
    width: 1,
    height: 40,
    marginHorizontal: spacing.md,
  },

  // No Providers Premium
  noProvidersCardPremium: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: spacing.md,
    marginVertical: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  noProvidersIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  noProvidersEmoji: {
    fontSize: 20,
  },
  noProvidersContent: {
    flex: 1,
  },
  noProvidersTitle: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },

  // Amount Input Premium
  amountCardPremium: {
    borderRadius: 20,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  amountLabelPremium: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
  },
  amountInputPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  currencySymbolPremium: {
    ...typography.title,
    fontSize: 32,
    fontWeight: '700',
    marginRight: spacing.sm,
  },
  amountInputField: {
    flex: 1,
    ...typography.title,
    fontSize: 32,
    fontWeight: '700',
    paddingVertical: 0,
  },
  currencyCodePremium: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  amountHint: {
    ...typography.caption,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.7,
  },

  // Providers Info Card
  providersInfoCard: {
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  providersInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providersInfoIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  providersInfoContent: {
    flex: 1,
  },
  providersInfoTitle: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.xs / 2,
  },
  providersInfoText: {
    ...typography.caption,
    fontSize: 13,
    lineHeight: 18,
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
    maxHeight: '75%',
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
    maxHeight: '60%',
  },
  modalSubtitle: {
    ...typography.body,
    fontSize: 14,
    padding: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    lineHeight: 20,
  },
  providerCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 16,
    borderWidth: 2,
    overflow: 'hidden',
    padding: spacing.md,
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerIcon: {
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
  providerInfo: {
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
