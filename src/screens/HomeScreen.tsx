import React, { useCallback, useMemo, useState, useEffect } from "react";
import { ActivityIndicator, StyleSheet, Text, View, FlatList, ListRenderItemInfo, RefreshControl, Modal, Pressable, TouchableOpacity, ScrollView, Clipboard, Alert, BackHandler, SafeAreaView, GestureResponderEvent, Image } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { WebView } from "react-native-webview";

import { ToastModal } from "../components/ToastModal";
import { useAuth } from "../providers/Web3AuthProvider";
import { useTheme } from "../providers/ThemeProvider";
import { listTransfers, TransferRecord } from "../services/transfers";
import { getCusdBalance, getCusdTransactions, type BlockchainTransaction } from "../services/blockchain";
import { getPendingTransfers, type PendingTransferSummary, claimPendingTransfer, autoClaimPendingTransfers } from "../services/api";
import { RootStackParamList } from "../navigation/RootNavigator";
import { spacing, typography } from "../utils/theme";
import type { ColorPalette } from "../utils/theme";
import { formatRelativeDate, formatShortAddress } from "../utils/format";
import { SettingsScreen } from "./SettingsScreen";
import { useToast } from "../utils/toast";
import {
  buildRampUrl,
  buildRampUrlWithSession,
  getAvailableProviders,
  getProviderInfo,
  type RampProvider,
  type RampType,
} from "../services/ramp";
import {
  checkLocationPermission,
  requestLocationPermission,
  getUserLocation,
  getUserLocationFromIP,
  type LocationPermissionStatus,
} from "../services/location";
import { useRecentActivity, ActivityItem } from "../hooks/useRecentActivity";
import { TransactionCard } from "../components/TransactionCard";
import { TransactionDetailsModal } from "../components/TransactionDetailsModal";
import { QRScanner } from "../components/QRScanner";

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, "Home">;

export const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const { profile, logout } = useAuth();
  // Hide header for this screen
  React.useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isDepositModalVisible, setIsDepositModalVisible] = useState(false);
  const [isWithdrawModalVisible, setIsWithdrawModalVisible] = useState(false);
  const [isSendOptionsVisible, setIsSendOptionsVisible] = useState(false);
  const [isMoreFeaturesModalVisible, setIsMoreFeaturesModalVisible] = useState(false);
  const [isLocationModalVisible, setIsLocationModalVisible] = useState(false);
  const [isCurrencySelectorVisible, setIsCurrencySelectorVisible] = useState(false);
  const [selectedRampType, setSelectedRampType] = useState<RampType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<RampProvider | null>(null);
  const [showWebView, setShowWebView] = useState(false);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"home" | "settings">("home");
  const [isQRScannerVisible, setIsQRScannerVisible] = useState(false);

  const [availableProviders, setAvailableProviders] = useState<RampProvider[]>([]);
  const [locationPermission, setLocationPermission] = useState<LocationPermissionStatus>('undetermined');
  const [userCountry, setUserCountry] = useState<string>('');
  const [userCountryCode, setUserCountryCode] = useState<string>('');
  const [userCurrency, setUserCurrency] = useState<string>('USD');
  const [currencySymbol, setCurrencySymbol] = useState<string>('$');
  const [fxRate, setFxRate] = useState<number>(1);
  const { scheme, setScheme } = useTheme();
  const { toast, showToast, hideToast } = useToast();
  const { activities } = useRecentActivity();
  const [selectedTransaction, setSelectedTransaction] = useState<ActivityItem | null>(null);
  const [isTransactionModalVisible, setIsTransactionModalVisible] = useState(false);
  const [rampUrl, setRampUrl] = useState<string | null>(null);

  // Helper function to get currency from country code
  const fetchFxRate = async (currency: string) => {
    if (currency === 'USD') {
      setFxRate(1);
      return;
    }

    try {
      // Using a free FX API (exchangerate-api.com)
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/USD`);
      const data = await response.json();

      if (data.rates && data.rates[currency]) {
        setFxRate(data.rates[currency]);
      } else {
        setFxRate(1);
      }
    } catch (error) {
      console.error('Error fetching FX rate:', error);
      setFxRate(1);
    }
  };

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

  // Popular currencies for manual selection
  const popularCurrencies = [
    { currency: 'USD', symbol: '$', name: 'US Dollar' },
    { currency: 'EUR', symbol: '€', name: 'Euro' },
    { currency: 'GBP', symbol: '£', name: 'British Pound' },
    { currency: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
    { currency: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
    { currency: 'ZAR', symbol: 'R', name: 'South African Rand' },
    { currency: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
    { currency: 'JPY', symbol: '¥', name: 'Japanese Yen' },
    { currency: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
    { currency: 'INR', symbol: '₹', name: 'Indian Rupee' },
    { currency: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
    { currency: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
    { currency: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
    { currency: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
    { currency: 'MXN', symbol: 'MX$', name: 'Mexican Peso' },
    { currency: 'ARS', symbol: 'AR$', name: 'Argentine Peso' },
  ];

  const handleCurrencySelect = (selectedCurrency: { currency: string; symbol: string; name: string }) => {
    setUserCurrency(selectedCurrency.currency);
    setCurrencySymbol(selectedCurrency.symbol);
    setIsCurrencySelectorVisible(false);
  };

  // Auto-detect location from IP on mount
  React.useEffect(() => {
    const initializeLocation = async () => {
      // Try IP-based location first (no permission needed)
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

      // ipinfo.io returns country code as 'country', e.g. 'US'
      if (location && location.country) {
        setUserCountry(location.country);
        setUserCountryCode(location.country);
        const currencyData = getCurrencyFromCountryCode(location.country);
        setUserCurrency(currencyData.currency);
        setCurrencySymbol(currencyData.symbol);
        await fetchFxRate(currencyData.currency);
      } else {
        // Fallback to device locale
        const locale = Intl.NumberFormat().resolvedOptions().locale;
        const region = locale.split('-')[1]?.toUpperCase();
        if (region) {
          const currencyData = getCurrencyFromCountryCode(region);
          setUserCurrency(currencyData.currency);
          setCurrencySymbol(currencyData.symbol);
        }
      }
    };

    initializeLocation();
  }, []);

  // Fetch available providers when ramp type changes
  React.useEffect(() => {
    if (selectedRampType) {
      getAvailableProviders(selectedRampType).then(providers => {
        setAvailableProviders(providers);
      });
    } else {
      setAvailableProviders([]);
    }
  }, [selectedRampType]);



  const hasCeloWallet = Boolean(profile?.walletAddress && profile.walletAddress.startsWith("0x"));

  // Query cUSD balance
  const { data: cusdBalance, isLoading: loadingBalance, refetch: refetchBalance } = useQuery({
    queryKey: ["cusdBalance", profile?.walletAddress],
    queryFn: () => {
      if (!profile?.walletAddress) throw new Error("No wallet");
      return getCusdBalance(profile.walletAddress as `0x${string}`);
    },
    enabled: hasCeloWallet,
    refetchInterval: 10000, // Refetch every 10 seconds
  });



  const {
    data: pendingTransfers = [],
    isFetching: loadingPendingTransfers,
    refetch: refetchPendingTransfers,
  } = useQuery<PendingTransferSummary[]>({
    queryKey: ["pendingTransfers", profile?.email],
    enabled: Boolean(profile?.email),
    staleTime: 60 * 1000,
    queryFn: async () => {
      if (!profile?.email) return [];
      return getPendingTransfers(profile.email);
    },
  });

  const pendingClaimables = useMemo(
    () => pendingTransfers.filter((transfer) => transfer.status === "pending"),
    [pendingTransfers]
  );
  const displayedPendingTransfers = pendingClaimables.slice(0, 2);

  const getDaysRemaining = useCallback((transfer: PendingTransferSummary) => {
    if (typeof transfer.daysRemaining === "number") {
      return transfer.daysRemaining;
    }
    const expires = new Date(transfer.expiresAt).getTime();
    return Math.max(0, Math.ceil((expires - Date.now()) / (1000 * 60 * 60 * 24)));
  }, []);

  const claimTransferMutation = useMutation<string, Error, string>({
    mutationFn: async (transferId: string) => {
      if (!profile?.userId) {
        throw new Error("Please sign in to claim transfers.");
      }
      return claimPendingTransfer(transferId, profile.userId);
    },
  });

  const claimAllMutation = useMutation<number, Error, void>({
    mutationFn: async () => {
      if (!profile?.userId || !profile?.email) {
        throw new Error("Missing account details for claiming transfers.");
      }
      return autoClaimPendingTransfers(profile.userId, profile.email);
    },
  });

  const handleManualClaim = async (transfer: PendingTransferSummary) => {
    try {
      await claimTransferMutation.mutateAsync(transfer.transferId);
      showToast(`Claimed ${transfer.amount} ${transfer.token}`, "success");
      await Promise.all([refetchPendingTransfers(), refetchBalance()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to claim transfer";
      showToast(message, "error");
    }
  };

  const handleManualClaimAll = async () => {
    try {
      const claimedCount = await claimAllMutation.mutateAsync();
      if (claimedCount > 0) {
        showToast(`Claimed ${claimedCount} pending ${claimedCount === 1 ? "transfer" : "transfers"}`, "success");
      } else {
        showToast("No pending transfers found for this email", "info");
      }
      await Promise.all([refetchPendingTransfers(), refetchBalance()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to claim pending transfers";
      showToast(message, "error");
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (hasCeloWallet) {
        refetchBalance();
        refetchPendingTransfers();
      }
    }, [hasCeloWallet, refetchBalance, refetchPendingTransfers])
  );

  // Fetch FX rate when currency changes
  useEffect(() => {
    fetchFxRate(userCurrency);
  }, [userCurrency]);

  // Auto-detect location on mount
  useEffect(() => {
    const initializeLocation = async () => {
      const permission = await checkLocationPermission();
      setLocationPermission(permission);

      if (permission === 'granted') {
        const location = await getUserLocation();
        if (location) {
          setUserCountry(location.country);
          setUserCountryCode(location.countryCode);
          const currencyData = getCurrencyFromCountryCode(location.countryCode);
          setUserCurrency(currencyData.currency);
          setCurrencySymbol(currencyData.symbol);
        }
      }
    };

    initializeLocation();
  }, []);

  useEffect(() => {
    if (!isSendOptionsVisible) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCloseSendOptions();
      return true;
    });

    return () => subscription.remove();
  }, [isSendOptionsVisible]);

  const handleOpenSendOptions = () => {
    setIsSendOptionsVisible(true);
  };

  const handleCloseSendOptions = () => {
    setIsSendOptionsVisible(false);
  };

  const handleSendViaEmail = () => {
    setIsSendOptionsVisible(false);
    navigation.navigate("Send");
  };

  const handleInternationalTransfer = () => {
    setIsSendOptionsVisible(false);
    navigation.navigate("InternationalTransfer");
  };

  const handleBuyFunds = () => {
    setIsDepositModalVisible(true);
  };

  const handleWithdraw = () => {
    setIsWithdrawModalVisible(true);
  };

  const handleScanQR = () => {
    setIsQRScannerVisible(true);
  };

  const handleQRScanned = (data: { address: string; email?: string }) => {
    setIsQRScannerVisible(false);
    // Navigate to Send screen with email pre-populated
    if (data.email) {
      navigation.navigate("Send", { recipientEmail: data.email });
    } else {
      // If only address is available, navigate anyway (user can still send to address)
      navigation.navigate("Send", { recipientAddress: data.address });
    }
  };

  const handleProviderSelect = (provider: RampProvider) => {
    setSelectedProvider(provider);
    openRamp(provider);
  };

  const openRamp = async (provider: RampProvider) => {
    if (!profile?.walletAddress) {
      console.error("No wallet address available");
      return;
    }

    try {
      setWebViewLoading(true);

      // Build ramp URL with sessionToken support for Coinbase
      const url = await buildRampUrlWithSession({
        provider,
        type: selectedRampType!,
        walletAddress: profile.walletAddress,
        assetSymbol: "CUSD",
        destinationNetwork: "celo",
      });

      setRampUrl(url);
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
    setSelectedRampType(null);
    setSelectedProvider(null);
  };

  const handleTransactionPress = (item: ActivityItem) => {
    setSelectedTransaction(item);
    setIsTransactionModalVisible(true);
  };

  const renderActivity = ({ item }: ListRenderItemInfo<ActivityItem>) => {
    // Icon logic
    let icon = null;
    switch (item.type) {
      case 'gift-sent': icon = <Text style={{ fontSize: 20 }}>🎁</Text>; break;
      case 'tip-sent': icon = <Text style={{ fontSize: 20 }}>💸</Text>; break;
      case 'invoice-sent': icon = <Text style={{ fontSize: 20 }}>📄</Text>; break;
      case 'invoice-received': icon = <Text style={{ fontSize: 20 }}>📄</Text>; break;
      case 'blockchain-received': icon = <Text style={{ fontSize: 20 }}>💰</Text>; break;
      case 'blockchain-sent': icon = <Text style={{ fontSize: 20 }}>↗️</Text>; break;
      case 'transfer-sent': icon = <Text style={{ fontSize: 20 }}>📧</Text>; break;
      default: icon = <Text style={{ fontSize: 20 }}>💸</Text>;
    }

    return (
      <TouchableOpacity onPress={() => handleTransactionPress(item)}>
        <TransactionCard
          icon={icon}
          title={item.title}
          subtitle={formatRelativeDate(new Date(item.timestamp).toISOString())}
          amount={`${item.amount > 0 ? '+' : ''}${item.amount.toFixed(2)} ${item.currency}`}
        />
      </TouchableOpacity>
    );
  };



  const copyWalletAddress = () => {
    if (profile?.walletAddress) {
      Clipboard.setString(profile.walletAddress);
      Alert.alert("Copied!", "Wallet address copied to clipboard");
    }
  };

  const handleLocationIconPress = () => {
    setIsLocationModalVisible(true);
  };

  const handleRequestLocation = async () => {
    const status = await requestLocationPermission();
    setLocationPermission(status);

    if (status === 'granted') {
      const location = await getUserLocation();
      if (location) {
        setUserCountry(location.country);
        setUserCountryCode(location.countryCode);
        const currencyData = getCurrencyFromCountryCode(location.countryCode);
        setUserCurrency(currencyData.currency);
        setCurrencySymbol(currencyData.symbol);
        await fetchFxRate(currencyData.currency);

        // Refresh providers if on withdraw screen
        if (selectedRampType) {
          getAvailableProviders(selectedRampType).then(providers => {
            setAvailableProviders(providers);
          });
        }

        setIsLocationModalVisible(false);
        Alert.alert(
          "Location Access Granted",
          `Your location is set to ${location.country}. Currency updated to ${currencyData.currency}. This helps us show relevant payment providers.`
        );
      }
    } else if (status === 'denied') {
      Alert.alert(
        "Location Access Denied",
        "Please enable location access in your device settings to see region-specific payment options and currency."
      );
    }
  };

  // Disconnect function for SettingsScreen
  function disconnect(): void {
    logout();
  }

  return (
    <>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Home Screen */}
          {activeTab === "home" && (
            <>
              <View style={styles.heroCard}>
                <View style={styles.profileRow}>
                  <TouchableOpacity
                    style={styles.profileImageContainer}
                    onPress={() => setActiveTab("settings")}
                    activeOpacity={0.7}
                  >
                    {profile?.photoUrl ? (
                      <Image
                        source={{ uri: profile.photoUrl }}
                        style={styles.profileImage}
                      />
                    ) : (
                      <View style={styles.profileImageFallback}>
                        <Text style={styles.profileImageInitials}>
                          {(profile?.displayName || profile?.email || 'U').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.profileDetails}>
                    <Text style={styles.greeting}>Welcome back,</Text>
                    <Text style={styles.username}>{(profile?.username ?? profile?.displayName ?? profile?.email ?? 'user').split('@')[0].split(' ')[0]}</Text>
                  </View>
                  <View style={styles.profileActions}>
                    <TouchableOpacity style={styles.locationIcon} onPress={handleScanQR}>
                      <Text style={styles.locationEmoji}>📷</Text>
                      <Text style={styles.locationText}>Scan QR</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.balanceSection}>
                  <Text style={styles.balanceLabel}>Account Balance</Text>
                  <Text style={styles.balanceAmount}>
                    {loadingBalance ? "..." : cusdBalance !== undefined ? `${currencySymbol}${(cusdBalance * fxRate).toFixed(2)}` : `${currencySymbol}0.00`}
                  </Text>
                  <Text style={styles.balanceSubtext}>
                    {cusdBalance !== undefined && fxRate !== 1 ? `≈ $${cusdBalance.toFixed(2)} cUSD · ` : ''}Celo Sepolia
                  </Text>
                </View>
                <TouchableOpacity style={styles.walletPill} onPress={copyWalletAddress} activeOpacity={0.7}>
                  <Text style={styles.walletLabel}>📍 Wallet</Text>
                  <Text style={styles.walletAddress}>
                    {profile && profile.walletAddress
                      ? hasCeloWallet
                        ? formatShortAddress(profile.walletAddress)
                        : "Celo wallet pending"
                      : "-"}
                  </Text>
                </TouchableOpacity>
              </View>

              {pendingClaimables.length > 0 && (
                <View style={styles.pendingTransfersCard}>
                  <Text style={styles.pendingTitle}>Transfers waiting for you</Text>
                  <Text style={styles.pendingSubtitle}>
                    We auto-claim as soon as you sign in. If something is still pending, use the buttons below to finish the claim.
                  </Text>

                  {displayedPendingTransfers.map((transfer) => {
                    const isClaimingThis =
                      claimTransferMutation.isPending && claimTransferMutation.variables === transfer.transferId;
                    return (
                      <View key={transfer.transferId} style={styles.pendingRow}>
                        <View style={styles.pendingInfo}>
                          <Text style={styles.pendingAmount}>
                            {transfer.amount} {transfer.token}
                          </Text>
                          <Text style={styles.pendingMeta}>from {transfer.senderName || transfer.senderEmail}</Text>
                          <Text style={styles.pendingMeta}>Expires in {getDaysRemaining(transfer)} days</Text>
                          <TouchableOpacity
                            onPress={() => navigation.navigate("Claim", { transferId: transfer.transferId })}
                            style={styles.pendingLinkButton}
                          >
                            <Text style={styles.pendingLinkText}>Open manual claim screen</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.pendingClaimButton,
                            (isClaimingThis || claimAllMutation.isPending) && styles.pendingClaimButtonDisabled,
                          ]}
                          onPress={() => handleManualClaim(transfer)}
                          disabled={isClaimingThis || claimAllMutation.isPending}
                        >
                          {isClaimingThis ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <Text style={styles.pendingClaimButtonText}>Claim</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}

                  {pendingClaimables.length > displayedPendingTransfers.length && (
                    <Text style={styles.pendingMeta}>
                      +{pendingClaimables.length - displayedPendingTransfers.length} more pending transfer
                      {pendingClaimables.length - displayedPendingTransfers.length > 1 ? "s" : ""}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={[
                      styles.claimAllButton,
                      claimAllMutation.isPending && styles.pendingClaimButtonDisabled,
                    ]}
                    onPress={handleManualClaimAll}
                    disabled={claimAllMutation.isPending}
                  >
                    {claimAllMutation.isPending ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.claimAllButtonText}>Claim everything automatically</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.quickActions}>

                <TouchableOpacity style={styles.actionCard} onPress={handleBuyFunds}>
                  <View style={styles.actionIconContainer}>
                    <Text style={styles.actionIcon}>💳</Text>
                  </View>
                  <Text style={styles.actionLabel}>Add Funds</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard} onPress={handleWithdraw}>
                  <View style={styles.actionIconContainer}>
                    <Text style={styles.actionIcon}>💰</Text>
                  </View>
                  <Text style={styles.actionLabel}>Withdraw</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard} onPress={handleScanQR}>
                  <View style={styles.actionIconContainer}>
                    <Text style={styles.actionIcon}>📷</Text>
                  </View>
                  <Text style={styles.actionLabel}>Scan QR</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionCard} onPress={() => setIsMoreFeaturesModalVisible(true)}>
                  <View style={styles.actionIconContainer}>
                    <Text style={styles.actionIcon}>✨</Text>
                  </View>
                  <Text style={styles.actionLabel}>More</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleRow}>
                  <View>
                    <Text style={styles.sectionTitle}>Recent Activity</Text>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('TransactionHistory')}>
                    <Text style={styles.seeAllText}>See All</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <FlatList
                data={hasCeloWallet ? activities.slice(0, 5) : []}
                keyExtractor={(item) => item.id}
                renderItem={(info) => {
                  const item = info.item;
                  if (item.id === 'no-aa-wallet' || item.id === 'no-activity') {
                    return (
                      <View style={{ alignItems: 'center', marginTop: 32 }}>
                        <Text style={{ fontSize: 16, color: '#888' }}>{item.title}</Text>
                        {item.subtitle && (
                          <Text style={{ fontSize: 14, color: '#aaa', marginTop: 8 }}>{item.subtitle}</Text>
                        )}
                      </View>
                    );
                  }
                  return renderActivity(info);
                }}
                style={styles.list}
                contentContainerStyle={styles.listContentHome}
                ListEmptyComponent={
                  <Text style={styles.emptyState}>
                    {!hasCeloWallet
                      ? "Connect your wallet to view transactions"
                      : activities.length === 0
                        ? "No transactions yet"
                        : null}
                  </Text>
                }
              />

              <TransactionDetailsModal
                visible={isTransactionModalVisible}
                onClose={() => setIsTransactionModalVisible(false)}
                transaction={selectedTransaction}
                userCurrency={userCurrency}
                fxRate={fxRate}
                onCancel={(transaction) => {
                  setIsTransactionModalVisible(false);
                  navigation.navigate('TransactionHistory');
                }}
              />

            </>
          )}

          {isSendOptionsVisible && (
            <View style={styles.inlineSendOverlay} pointerEvents="box-none">
              <Pressable style={styles.inlineSendBackdrop} onPress={handleCloseSendOptions} />
              <View style={styles.inlineSendSheet} accessibilityLabel="Send options">
                <Text style={styles.inlineSendTitle}>Choose how to send</Text>
                <Text style={styles.inlineSendSubtitle}>
                  Pick Oweza email delivery or route funds to a global payout provider.
                </Text>

                <TouchableOpacity style={styles.inlineSendButton} onPress={handleSendViaEmail}>
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Send via email</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>
                      Resolve wallets automatically and keep funds pending for new recipients.
                    </Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>Oweza</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inlineSendButton} onPress={handleInternationalTransfer}>
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>International transfer</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>
                      Bank, mobile money, and card payouts via Coinbase, MoonPay, Transak & more.
                    </Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>New</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inlineSendDismiss} onPress={handleCloseSendOptions}>
                  <Text style={styles.inlineSendDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isDepositModalVisible && (
            <View style={styles.inlineSendOverlay} pointerEvents="box-none">
              <Pressable style={styles.inlineSendBackdrop} onPress={() => setIsDepositModalVisible(false)} />
              <View style={styles.inlineSendSheet}>
                <Text style={styles.inlineSendTitle}>Deposit From</Text>
                <Text style={styles.inlineSendSubtitle}>
                  Choose how you want to add funds to your wallet.
                </Text>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsDepositModalVisible(false);
                    navigation.navigate("Deposit", { type: 'local' });
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Local Payment Method</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Buy crypto with cards, bank, or mobile money</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>🏦</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsDepositModalVisible(false);
                    navigation.navigate("Deposit", { type: 'wallet' });
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Exchange or Wallet</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Deposit from your wallet or exchange</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>👛</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    Alert.alert("Coming Soon", "ACH Bank Transfer is coming soon!");
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>ACH Bank Transfer</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>US/Canada Users</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>🏛️</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inlineSendDismiss} onPress={() => setIsDepositModalVisible(false)}>
                  <Text style={styles.inlineSendDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isWithdrawModalVisible && (
            <View style={styles.inlineSendOverlay} pointerEvents="box-none">
              <Pressable style={styles.inlineSendBackdrop} onPress={() => setIsWithdrawModalVisible(false)} />
              <View style={styles.inlineSendSheet}>
                <Text style={styles.inlineSendTitle}>Withdraw</Text>
                <Text style={styles.inlineSendSubtitle}>
                  Choose how you want to withdraw your funds.
                </Text>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsWithdrawModalVisible(false);
                    navigation.navigate("Withdraw", { type: 'local' });
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Local Payment Method</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Bank transfer, Card</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>🏦</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsWithdrawModalVisible(false);
                    navigation.navigate("Withdraw", { type: 'wallet' });
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Exchange/Wallet</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Transfer to another wallet</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>👛</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inlineSendDismiss} onPress={() => setIsWithdrawModalVisible(false)}>
                  <Text style={styles.inlineSendDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          {isMoreFeaturesModalVisible && (
            <View style={styles.inlineSendOverlay} pointerEvents="box-none">
              <Pressable style={styles.inlineSendBackdrop} onPress={() => setIsMoreFeaturesModalVisible(false)} />
              <View style={styles.inlineSendSheet} accessibilityLabel="More features">
                <Text style={styles.inlineSendTitle}>More Features</Text>
                <Text style={styles.inlineSendSubtitle}>
                  Explore additional features and tools.
                </Text>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsMoreFeaturesModalVisible(false);
                    navigation.navigate('Tipping');
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Micro-Tipping</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Send tips to creators</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>💸</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsMoreFeaturesModalVisible(false);
                    navigation.navigate('Invoices');
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Invoices</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Create professional invoices</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>📄</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.inlineSendButton}
                  onPress={() => {
                    setIsMoreFeaturesModalVisible(false);
                    navigation.navigate('Gifts');
                  }}
                >
                  <View style={styles.inlineSendButtonCopy}>
                    <Text style={styles.inlineSendButtonTitle}>Crypto Gifts</Text>
                    <Text style={styles.inlineSendButtonSubtitle}>Send themed crypto gifts</Text>
                  </View>
                  <Text style={styles.inlineSendBadge}>🎁</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.inlineSendDismiss} onPress={() => setIsMoreFeaturesModalVisible(false)}>
                  <Text style={styles.inlineSendDismissText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Location Modal */}
          <Modal
            visible={isLocationModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setIsLocationModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setIsLocationModalVisible(false)}>
              <View style={styles.modalContent}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Location & Currency</Text>

                <View style={styles.locationInfoContainer}>
                  <View style={styles.locationInfoRow}>
                    <Text style={styles.locationInfoLabel}>Current Location:</Text>
                    <Text style={styles.locationInfoValue}>{userCountry || 'Not set'}</Text>
                  </View>
                  <View style={styles.locationInfoRow}>
                    <Text style={styles.locationInfoLabel}>Display Currency:</Text>
                    <Text style={styles.locationInfoValue}>{userCurrency} ({currencySymbol})</Text>
                  </View>
                  {fxRate !== 1 && (
                    <View style={styles.locationInfoRow}>
                      <Text style={styles.locationInfoLabel}>Exchange Rate:</Text>
                      <Text style={styles.locationInfoValue}>1 USD = {fxRate.toFixed(4)} {userCurrency}</Text>
                    </View>
                  )}
                  <View style={styles.locationInfoRow}>
                    <Text style={styles.locationInfoLabel}>Permission Status:</Text>
                    <Text style={[styles.locationInfoValue, locationPermission === 'granted' ? styles.permissionGranted : styles.permissionDenied]}>
                      {locationPermission === 'granted' ? '✓ Granted' : locationPermission === 'denied' ? '✗ Denied' : '⊙ Not Set'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    setIsLocationModalVisible(false);
                    handleRequestLocation();
                  }}
                >
                  <View style={styles.modalOptionIcon}>
                    <Text style={styles.modalOptionEmoji}>📍</Text>
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionTitle}>Update Location</Text>
                    <Text style={styles.modalOptionSubtitle}>Use GPS to detect your location</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomWidth: 0 }]}
                  onPress={() => setIsLocationModalVisible(false)}
                >
                  <View style={styles.modalOptionIcon}>
                    <Text style={styles.modalOptionEmoji}>✖️</Text>
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionTitle}>Cancel</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>

          {/* More Features Modal */}


          {/* Location Modal */}
          <Modal
            visible={isLocationModalVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setIsLocationModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setIsLocationModalVisible(false)}>
              <View style={styles.modalContent}>
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Location & Currency</Text>

                <View style={styles.locationInfoContainer}>
                  <View style={styles.locationInfoRow}>
                    <Text style={styles.locationInfoLabel}>Current Location:</Text>
                    <Text style={styles.locationInfoValue}>{userCountry || 'Not set'}</Text>
                  </View>
                  <View style={styles.locationInfoRow}>
                    <Text style={styles.locationInfoLabel}>Display Currency:</Text>
                    <Text style={styles.locationInfoValue}>{userCurrency} ({currencySymbol})</Text>
                  </View>
                  {fxRate !== 1 && (
                    <View style={styles.locationInfoRow}>
                      <Text style={styles.locationInfoLabel}>Exchange Rate:</Text>
                      <Text style={styles.locationInfoValue}>1 USD = {fxRate.toFixed(4)} {userCurrency}</Text>
                    </View>
                  )}
                  <View style={styles.locationInfoRow}>
                    <Text style={styles.locationInfoLabel}>Permission Status:</Text>
                    <Text style={[styles.locationInfoValue, locationPermission === 'granted' ? styles.permissionGranted : styles.permissionDenied]}>
                      {locationPermission === 'granted' ? '✓ Granted' : locationPermission === 'denied' ? '✗ Denied' : '⊙ Not Set'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.modalOption}
                  onPress={() => {
                    setIsLocationModalVisible(false);
                    handleRequestLocation();
                  }}
                >
                  <View style={styles.modalOptionIcon}>
                    <Text style={styles.modalOptionEmoji}>📍</Text>
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionTitle}>Update Location</Text>
                    <Text style={styles.modalOptionSubtitle}>Use GPS to detect your location</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalOption, { borderBottomWidth: 0 }]}
                  onPress={() => setIsLocationModalVisible(false)}
                >
                  <View style={styles.modalOptionIcon}>
                    <Text style={styles.modalOptionEmoji}>✖️</Text>
                  </View>
                  <View style={styles.modalOptionText}>
                    <Text style={styles.modalOptionTitle}>Cancel</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>



          {/* Ramp Provider Selection Modal */}
          <Modal
            visible={selectedRampType !== null && !showWebView}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={closeRamp}
          >
            <View style={styles.rampModalContainer}>
              <View style={styles.rampModalHeader}>
                <Text style={styles.rampModalTitle}>
                  {selectedRampType === "onramp" ? "Buy Crypto" : "Withdraw to Bank"}
                </Text>
                <Pressable style={styles.closeButton} onPress={closeRamp}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.rampScrollView} showsVerticalScrollIndicator={false}>
                {/* Provider Selection */}
                {!selectedProvider && (
                  <>
                    <Text style={styles.rampSectionTitle}>Select Provider</Text>
                    {availableProviders.map((provider) => {
                      const info = getProviderInfo(provider);
                      const canUse = selectedRampType === "onramp" ? info.supportsBuy : info.supportsSell;

                      if (!canUse) return null;

                      return (
                        <TouchableOpacity
                          key={provider}
                          style={styles.rampProviderCard}
                          onPress={() => handleProviderSelect(provider)}
                        >
                          <View style={styles.rampProviderHeader}>
                            <Text style={styles.rampProviderLogo}>{info.logo}</Text>
                            <Text style={styles.rampProviderName}>{info.name}</Text>
                          </View>
                          <Text style={styles.rampProviderDescription}>{info.description}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}


              </ScrollView>
            </View>
          </Modal>

          {/* In-App WebView Modal for Ramp */}
          <Modal
            visible={showWebView}
            animationType="slide"
            presentationStyle="fullScreen"
            onRequestClose={closeRamp}
          >
            <View style={styles.webViewModalContainer}>
              <View style={styles.webViewModalHeader}>
                <Text style={styles.webViewModalTitle}>
                  {selectedProvider && getProviderInfo(selectedProvider).name}
                </Text>
                <Pressable style={styles.closeButton} onPress={closeRamp}>
                  <Text style={styles.closeButtonText}>✕</Text>
                </Pressable>
              </View>

              {webViewLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading...</Text>
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

          {/* Currency Selector Modal */}
          <Modal
            visible={isCurrencySelectorVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setIsCurrencySelectorVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.rampModalHeader}>
                  <Text style={styles.rampModalTitle}>Select Display Currency</Text>
                  <Pressable onPress={() => setIsCurrencySelectorVisible(false)} style={styles.closeButton}>
                    <Text style={styles.closeButtonText}>✕</Text>
                  </Pressable>
                </View>

                <ScrollView style={styles.currencyList} showsVerticalScrollIndicator={false}>
                  {popularCurrencies.map((curr) => (
                    <TouchableOpacity
                      key={curr.currency}
                      style={[
                        styles.currencyOption,
                        userCurrency === curr.currency && styles.currencyOptionActive
                      ]}
                      onPress={() => handleCurrencySelect(curr)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.currencyInfo}>
                        <Text style={styles.currencySymbol}>{curr.symbol}</Text>
                        <View style={styles.currencyDetails}>
                          <Text style={styles.currencyCode}>{curr.currency}</Text>
                          <Text style={styles.currencyName}>{curr.name}</Text>
                        </View>
                      </View>
                      {userCurrency === curr.currency && (
                        <Text style={styles.currencyCheckmark}>✓</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Settings Screen */}
          {activeTab === "settings" && (
            <SettingsScreen
              profile={profile}
              scheme={scheme}
              setScheme={setScheme}
              copyWalletAddress={copyWalletAddress}
              disconnect={disconnect}
            />
          )}

          {/* Bottom Tab Navigation */}
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab("home")}
            >
              <View style={[styles.tabIconContainer, activeTab === "home" && styles.tabIconContainerActive]}>
                <Text style={[styles.tabIcon, activeTab === "home" && styles.tabIconActive]}>💳</Text>
              </View>
              <Text style={[styles.tabLabel, activeTab === "home" && styles.tabLabelActive]}>Wallet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={handleOpenSendOptions}
            >
              <View style={[styles.tabIconContainer, isSendOptionsVisible && styles.tabIconContainerActive]}>
                <Text style={[styles.tabIcon, isSendOptionsVisible && styles.tabIconActive]}>📤</Text>
              </View>
              <Text style={[styles.tabLabel, isSendOptionsVisible && styles.tabLabelActive]}>Send</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.tabItem}
              onPress={() => setActiveTab("settings")}
            >
              <View style={[styles.tabIconContainer, activeTab === "settings" && styles.tabIconContainerActive]}>
                <Text style={[styles.tabIcon, activeTab === "settings" && styles.tabIconActive]}>⚙️</Text>
              </View>
              <Text style={[styles.tabLabel, activeTab === "settings" && styles.tabLabelActive]}>Settings</Text>
            </TouchableOpacity>
          </View>
        </View>



        <ToastModal
          visible={toast.visible}
          message={toast.message}
          type={toast.type}
          onDismiss={hideToast}
        />

        {/* QR Scanner */}
        <QRScanner
          visible={isQRScannerVisible}
          onClose={() => setIsQRScannerVisible(false)}
          onScan={handleQRScanned}
        />
      </SafeAreaView>
    </>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    heroCard: {
      backgroundColor: colors.primary,
      borderRadius: 28,
      padding: spacing.xl,
      marginHorizontal: spacing.lg,
      marginTop: 64, // bring card further down
      marginBottom: spacing.md,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 8,
      borderWidth: 1,
      borderColor: `${colors.primary}20`,
    },
    pendingTransfersCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 20,
      padding: spacing.lg,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: `${colors.primary}26`,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
      elevation: 4,
      gap: spacing.md,
    },
    pendingTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "700",
    },
    pendingSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
    },
    pendingRow: {
      flexDirection: "row",
      gap: spacing.md,
      alignItems: "flex-start",
    },
    pendingInfo: {
      flex: 1,
      gap: spacing.xs,
    },
    pendingAmount: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    pendingMeta: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 12,
    },
    pendingClaimButton: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.primary,
      minWidth: 88,
      alignItems: "center",
      justifyContent: "center",
    },
    pendingClaimButtonDisabled: {
      opacity: 0.6,
    },
    pendingClaimButtonText: {
      color: "#FFFFFF",
      fontWeight: "600",
    },
    pendingLinkButton: {
      alignSelf: "flex-start",
      paddingVertical: spacing.xs,
    },
    pendingLinkText: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: "600",
    },
    claimAllButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: spacing.sm,
      borderRadius: 12,
      backgroundColor: colors.textPrimary,
      marginTop: spacing.sm,
    },
    claimAllButtonText: {
      color: colors.background,
      fontWeight: "600",
    },
    profileRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: spacing.xl,
    },
    profileDetails: {
      flex: 1,
    },
    profileActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    profileImageContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
      borderWidth: 2,
      borderColor: "#FFFFFF",
      backgroundColor: "#FFFFFF20",
    },
    profileImage: {
      width: "100%",
      height: "100%",
    },
    profileImageFallback: {
      width: "100%",
      height: "100%",
      backgroundColor: "#FFFFFF30",
      alignItems: "center",
      justifyContent: "center",
    },
    profileImageInitials: {
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "700",
    },
    greeting: {
      ...typography.body,
      color: "#FFFFFF",
      fontSize: 14,
    },
    username: {
      ...typography.subtitle,
      color: "#FFFFFF",
      fontSize: 18,
      fontWeight: "600",
    },
    balanceSection: {
      alignItems: "center",
      marginBottom: spacing.xl,
    },
    balanceLabel: {
      ...typography.body,
      color: "#FFFFFF",
      fontSize: 14,
      marginBottom: spacing.xs,
    },
    balanceAmount: {
      fontSize: 48,
      fontWeight: "800",
      color: "#FFFFFF",
      marginBottom: spacing.xs,
      letterSpacing: -1,
    },
    balanceSubtext: {
      ...typography.body,
      color: "#FFFFFF",
      fontSize: 13,
    },
    walletLabel: {
      ...typography.body,
      color: "#FFFFFF",
      fontSize: 13,
    },
    walletAddress: {
      ...typography.body,
      color: "#FFFFFF",
      fontFamily: "monospace",
      fontSize: 13,
    },
    walletPill: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: "rgba(255, 255, 255, 0.3)",
    },
    quickActions: {
      flexDirection: "row",
      justifyContent: "space-around",
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.lg,
    },
    actionCard: {
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
    },
    actionIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.cardBackground,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: spacing.xs,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: `${colors.border}50`,
    },
    actionIcon: {
      fontSize: 20,
    },
    actionLabel: {
      ...typography.body,
      color: colors.textPrimary,
      fontSize: 11,
      fontWeight: "600",
    },
    sectionHeader: {
      marginBottom: spacing.md,
      paddingHorizontal: spacing.lg,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "600",
      marginBottom: spacing.xs,
    },
    sectionSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
    },
    seeAllText: {
      ...typography.body,
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    list: {
      flex: 1,
    },
    listContent: {
      rowGap: spacing.md,
      paddingBottom: 100,
      paddingHorizontal: spacing.lg,
    },
    listContentHome: {
      rowGap: spacing.md,
      paddingBottom: 20,
      paddingHorizontal: spacing.lg,
    },
    transferRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.cardBackground,
      padding: spacing.lg,
      borderRadius: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
      borderWidth: 1,
      borderColor: `${colors.border}40`,
    },
    transferEmail: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "500",
    },
    transferMeta: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    transferAmount: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    transferAmountReceived: {
      color: "#10B981", // Green for received
    },
    emptyState: {
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.xl,
      fontSize: 14,
    },
    locationIcon: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.cardBackground,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 4,
    },
    locationEmoji: {
      fontSize: 16,
    },
    locationText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textPrimary,
    },
    locationInfoContainer: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      gap: 12,
    },
    locationInfoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    locationInfoLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      fontWeight: '500',
    },
    locationInfoValue: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: '600',
    },
    permissionGranted: {
      color: '#4ade80',
    },
    permissionDenied: {
      color: '#f87171',
    },
    signOut: {
      color: colors.textSecondary,
      textAlign: "center",
      marginVertical: spacing.lg,
      fontSize: 14,
    },
    footer: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 84,
      backgroundColor: colors.background,
      borderTopWidth: 1,
      borderTopColor: `${colors.border}40`,
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: spacing.sm,
    },
    exchangeButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    exchangeIconWrapper: {
      width: "100%",
      height: "100%",
      alignItems: "center",
      justifyContent: "center",
    },
    exchangeIconText: {
      fontSize: 28,
      fontWeight: "300",
      color: "#FFFFFF",
      lineHeight: 28,
    },
    exchangeIcon: {
      fontSize: 32,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalContent: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: spacing.md,
      paddingBottom: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    modalHandle: {
      width: 40,
      height: 4,
      backgroundColor: colors.textSecondary,
      borderRadius: 2,
      alignSelf: "center",
      marginBottom: spacing.lg,
      opacity: 0.3,
    },
    modalTitle: {
      ...typography.subtitle,
      fontSize: 24,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: spacing.lg,
      textAlign: "center",
    },
    modalOption: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalOptionIcon: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: `${colors.primary}14`,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    },
    modalOptionEmoji: {
      fontSize: 24,
    },
    modalOptionText: {
      flex: 1,
    },
    modalOptionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: "600",
    },
    modalOptionSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
      marginTop: 2,
    },
    inlineSendOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
      zIndex: 20,
    },
    inlineSendBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    inlineSendSheet: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: spacing.lg,
      gap: spacing.md,
    },
    inlineSendTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "700",
    },
    inlineSendSubtitle: {
      ...typography.body,
      color: colors.textSecondary,
    },
    inlineSendButton: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: spacing.md,
      backgroundColor: colors.background,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      gap: spacing.md,
    },
    inlineSendButtonCopy: {
      flex: 1,
      gap: spacing.xs,
    },
    inlineSendButtonTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    inlineSendButtonSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    inlineSendBadge: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      borderRadius: 999,
      backgroundColor: colors.primary,
      color: "#fff",
      fontSize: 12,
      fontWeight: "600",
    },
    inlineSendDismiss: {
      alignSelf: "center",
      marginTop: spacing.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    inlineSendDismissText: {
      color: colors.textSecondary,
      fontWeight: "600",
    },
    // Ramp Modal Styles
    rampModalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    rampModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
      backgroundColor: colors.cardBackground,
    },
    rampModalTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 20,
      fontWeight: "700",
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    closeButtonText: {
      fontSize: 18,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    rampScrollView: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
    },
    rampSectionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "600",
      marginBottom: spacing.md,
    },
    rampProviderCard: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.md,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    rampProviderHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    rampProviderLogo: {
      fontSize: 28,
    },
    rampProviderName: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 17,
      fontWeight: "600",
    },
    rampProviderDescription: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 14,
      marginTop: spacing.xs,
    },
    backButton: {
      paddingVertical: spacing.sm,
      marginBottom: spacing.md,
    },
    backButtonText: {
      ...typography.body,
      color: colors.primary,
      fontSize: 15,
      fontWeight: "500",
    },
    webViewModalContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    webViewModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    webViewModalTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: "600",
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
    emptyText: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.lg,
      marginHorizontal: spacing.lg,
    },
    // Tab Bar Styles
    tabBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 80,
      flexDirection: "row",
      backgroundColor: colors.cardBackground,
      paddingBottom: spacing.lg,
      paddingTop: spacing.xs,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
      elevation: 10,
    },
    tabItem: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
    },
    tabItemCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    tabIconContainer: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "transparent",
    },
    tabIconContainerActive: {
      backgroundColor: `${colors.primary}18`,
    },
    tabIcon: {
      fontSize: 26,
      opacity: 0.6,
    },
    tabIconActive: {
      opacity: 1,
    },
    tabLabel: {
      ...typography.body,
      fontSize: 11,
      color: colors.textSecondary,
      fontWeight: "500",
    },
    tabLabelActive: {
      color: colors.primary,
      fontWeight: "600",
    },

    // Deposit Modal Styles
    depositModalHeader: {
      marginBottom: spacing.lg,
    },
    depositModalTitle: {
      ...typography.title,
      fontSize: 24,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: spacing.xs,
    },
    depositModalSubtitle: {
      ...typography.body,
      fontSize: 15,
      color: colors.textSecondary,
    },
    depositMethodsContainer: {
      gap: spacing.md,
      marginBottom: spacing.lg,
    },
    depositMethodCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    depositMethodCardDisabled: {
      opacity: 0.6,
      backgroundColor: `${colors.background}80`,
    },
    depositMethodIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: `${colors.primary}10`,
      alignItems: "center",
      justifyContent: "center",
      marginRight: spacing.md,
    },
    depositMethodIcon: {
      fontSize: 24,
    },
    depositMethodContent: {
      flex: 1,
      marginRight: spacing.sm,
    },
    depositMethodTitle: {
      ...typography.subtitle,
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    depositMethodDescription: {
      ...typography.caption,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    depositMethodBadge: {
      alignSelf: "flex-start",
      backgroundColor: `${colors.success}20`,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 6,
      marginTop: spacing.xs,
    },
    depositMethodBadgeComingSoon: {
      backgroundColor: `${colors.textSecondary}20`,
    },
    depositMethodBadgeText: {
      ...typography.caption,
      fontSize: 11,
      fontWeight: "700",
      color: colors.success,
      textTransform: "uppercase",
    },
    depositMethodBadgeTextComingSoon: {
      color: colors.textSecondary,
    },
    depositMethodArrow: {
      width: 32,
      height: 32,
      alignItems: "center",
      justifyContent: "center",
    },
    depositMethodArrowText: {
      fontSize: 20,
      color: colors.textSecondary,
      fontWeight: "300",
    },

    // Settings Screen Styles
    settingsContainer: {
      flex: 1,
      paddingBottom: 90,
    },
    settingsScroll: {
      flex: 1,
    },
    settingsSection: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    settingsSectionTitle: {
      ...typography.subtitle,
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: spacing.md,
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: spacing.md,
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    settingInfo: {
      flex: 1,
    },
    settingTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "600",
      marginBottom: 2,
    },
    settingDescription: {
      ...typography.body,
      color: colors.textSecondary,
      fontSize: 13,
    },
    settingArrow: {
      fontSize: 20,
      color: colors.textSecondary,
    },
    settingCopy: {
      fontSize: 18,
      color: colors.textSecondary,
      opacity: 0.6,
    },

    // Currency Selector Modal Styles
    currencyList: {
      flex: 1,
    },
    currencyOption: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: spacing.md,
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      marginBottom: spacing.sm,
      borderWidth: 2,
      borderColor: "transparent",
    },
    currencyOptionActive: {
      borderColor: "#3B82F6",
      backgroundColor: colors.background,
    },
    currencyInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
    },
    currencySymbol: {
      fontSize: 32,
      width: 40,
      textAlign: "center",
    },
    currencyDetails: {
      gap: 2,
    },
    currencyCode: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    currencyName: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    currencyCheckmark: {
      fontSize: 24,
      color: "#3B82F6",
      fontWeight: "bold",
    },
    themeSelector: {
      flexDirection: "row",
      gap: spacing.md,
    },
    themeOption: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
      paddingVertical: spacing.md,
      backgroundColor: colors.cardBackground,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
    },
    themeOptionActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}10`,
    },
    themeOptionIcon: {
      fontSize: 20,
    },
    themeOptionText: {
      ...typography.body,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    themeOptionTextActive: {
      color: colors.primary,
    },
    locationButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.sm,
      alignItems: "center",
    },
    locationButtonText: {
      ...typography.body,
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "600",
    },
    locationButtonSubtext: {
      ...typography.body,
      color: "#FFFFFF",
      fontSize: 12,
      opacity: 0.8,
      marginTop: spacing.xs,
      textAlign: "center",
    },
  });
