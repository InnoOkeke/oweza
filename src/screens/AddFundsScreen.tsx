import React, { useState, useEffect, useMemo } from "react";
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Modal,
    Pressable,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { WebView } from "react-native-webview";
import { useAuth } from "../providers/AppKitProvider";
import { useTheme } from "../providers/ThemeProvider";
import { RootStackParamList } from "../navigation/RootNavigator";
import { spacing, typography } from "../utils/theme";
import type { ColorPalette } from "../utils/theme";
import {
    buildRampUrlWithSession,
    getAvailableProviders,
    getCoinbasePaymentMethods,
    fetchCoinbasePaymentMethods,
    getPaymentMethodName,
    getPaymentMethodDescription,
    getProviderInfo,
    type PaymentMethod,
    type RampProvider,
} from "../services/ramp";
import { useToast } from "../utils/toast";

type AddFundsScreenProps = NativeStackScreenProps<RootStackParamList, "AddFunds">;

export const AddFundsScreen: React.FC<AddFundsScreenProps> = ({ navigation }) => {
    const { profile } = useAuth();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const { showToast } = useToast();

    const [selectedProvider, setSelectedProvider] = useState<RampProvider | null>(null);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
    const [availableProviders, setAvailableProviders] = useState<RampProvider[]>([]);
    const [availablePaymentMethods, setAvailablePaymentMethods] = useState<PaymentMethod[]>([]);
    const [loadingPaymentMethods, setLoadingPaymentMethods] = useState(false);
    const [showWebView, setShowWebView] = useState(false);
    const [webViewLoading, setWebViewLoading] = useState(true);
    const [rampUrl, setRampUrl] = useState<string | null>(null);

    // Fetch available providers on mount
    useEffect(() => {
        getAvailableProviders("onramp").then(providers => {
            setAvailableProviders(providers);
        });
    }, []);

    // Fetch payment methods when Coinbase is selected
    useEffect(() => {
        if (selectedProvider === "coinbase" && profile?.walletAddress) {
            setLoadingPaymentMethods(true);
            fetchCoinbasePaymentMethods("onramp", profile.walletAddress)
                .then(methods => {
                    setAvailablePaymentMethods(methods);
                })
                .catch(error => {
                    console.error("Error fetching payment methods:", error);
                    setAvailablePaymentMethods(getCoinbasePaymentMethods("onramp"));
                })
                .finally(() => {
                    setLoadingPaymentMethods(false);
                });
        } else {
            setAvailablePaymentMethods([]);
        }
    }, [selectedProvider, profile?.walletAddress]);

    const handleProviderSelect = (provider: RampProvider) => {
        setSelectedProvider(provider);
        const info = getProviderInfo(provider);

        if (info.supportsPaymentMethods) {
            setSelectedPaymentMethod(null);
        } else {
            openRamp(provider, null);
        }
    };

    const handlePaymentMethodSelect = (method: PaymentMethod) => {
        setSelectedPaymentMethod(method);
        if (selectedProvider) {
            openRamp(selectedProvider, method);
        }
    };

    const openRamp = async (provider: RampProvider, paymentMethod: PaymentMethod | null) => {
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
                destinationNetwork: "celo",
                paymentMethod: paymentMethod ?? undefined,
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
        setSelectedProvider(null);
        setSelectedPaymentMethod(null);
    };

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
                <Text style={styles.title}>Add Funds</Text>
                <Text style={styles.subtitle}>
                    Choose a payment provider to add funds to your wallet
                </Text>

                {/* Provider Selection */}
                {!selectedProvider && (
                    <>
                        <Text style={styles.sectionTitle}>Select Provider</Text>
                        {availableProviders.map((provider) => {
                            const info = getProviderInfo(provider);
                            if (!info.supportsBuy) return null;

                            return (
                                <TouchableOpacity
                                    key={provider}
                                    style={styles.providerCard}
                                    onPress={() => handleProviderSelect(provider)}
                                >
                                    <View style={styles.providerHeader}>
                                        <Text style={styles.providerLogo}>{info.logo}</Text>
                                        <Text style={styles.providerName}>{info.name}</Text>
                                    </View>
                                    <Text style={styles.providerDescription}>{info.description}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </>
                )}

                {/* Payment Method Selection (Coinbase only) */}
                {selectedProvider === "coinbase" && (
                    <>
                        <Pressable style={styles.backButton} onPress={() => setSelectedProvider(null)}>
                            <Text style={styles.backButtonText}>← Back to providers</Text>
                        </Pressable>

                        <Text style={styles.sectionTitle}>Select Payment Method</Text>

                        {loadingPaymentMethods ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color={colors.primary} />
                                <Text style={styles.loadingText}>Loading payment methods...</Text>
                            </View>
                        ) : availablePaymentMethods.length > 0 ? (
                            availablePaymentMethods.map((method) => (
                                <TouchableOpacity
                                    key={method}
                                    style={styles.providerCard}
                                    onPress={() => handlePaymentMethodSelect(method)}
                                >
                                    <Text style={styles.providerName}>{getPaymentMethodName(method)}</Text>
                                    <Text style={styles.providerDescription}>{getPaymentMethodDescription(method)}</Text>
                                </TouchableOpacity>
                            ))
                        ) : (
                            <Text style={styles.emptyText}>No payment methods available for your region</Text>
                        )}
                    </>
                )}
            </ScrollView>

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
        title: {
            ...typography.title,
            color: colors.textPrimary,
            marginBottom: spacing.sm,
        },
        subtitle: {
            ...typography.body,
            color: colors.textSecondary,
            marginBottom: spacing.xl,
        },
        sectionTitle: {
            ...typography.subtitle,
            color: colors.textPrimary,
            marginBottom: spacing.md,
            marginTop: spacing.lg,
        },
        providerCard: {
            backgroundColor: colors.cardBackground,
            borderRadius: 12,
            padding: spacing.lg,
            marginBottom: spacing.md,
            borderWidth: 1,
            borderColor: colors.border,
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
        providerName: {
            ...typography.subtitle,
            color: colors.textPrimary,
        },
        providerDescription: {
            ...typography.body,
            color: colors.textSecondary,
        },
        backButton: {
            paddingVertical: spacing.sm,
            marginBottom: spacing.md,
        },
        backButtonText: {
            ...typography.body,
            color: colors.primary,
        },
        loadingContainer: {
            padding: spacing.xl,
            alignItems: "center",
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
            padding: spacing.xl,
        },
        webViewContainer: {
            flex: 1,
            backgroundColor: colors.background,
        },
        webViewHeader: {
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: spacing.lg,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.cardBackground,
        },
        webViewTitle: {
            ...typography.title,
            color: colors.textPrimary,
        },
        closeButton: {
            padding: spacing.sm,
        },
        closeButtonText: {
            fontSize: 24,
            color: colors.textPrimary,
        },
        webView: {
            flex: 1,
        },
    });
