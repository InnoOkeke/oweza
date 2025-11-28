import React, { useMemo, useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Modal,
  Pressable,
  BackHandler,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery } from "@tanstack/react-query";

import { RootStackParamList } from "../../navigation/RootNavigator";
import { useTheme } from "../../providers/ThemeProvider";
import { spacing, typography } from "../../utils/theme";
import type { ColorPalette } from "../../utils/theme";
import { PrimaryButton } from "../../components/PrimaryButton";
import { TextField } from "../../components/TextField";
import { ToastModal } from "../../components/ToastModal";
import { useToast } from "../../utils/toast";
import {
  FundingMethod,
  PayoutMethod,
  PROVIDERS,
  SUPPORTED_COUNTRIES,
  ProviderConfig,
} from "../../constants/internationalProviders";
import {
  InternationalTransferDraft,
  InternationalTransferService,
  RecipientDetails,
} from "../../services/InternationalTransferService";
// Inline step render functions are used in this file; removed split step imports

const STEP_TITLES = [
  "Destination",
  "Amount",
  "Provider",
  "Payout Method",
  "Recipient",
  "Review",
];

const payoutLabels: Record<string, string> = {
  bank_account: "Bank account",
  mobile_money: "Mobile money",
  cash_pickup: "Cash pickup",
  crypto_wallet: "Crypto wallet",
  ach: "ACH bank",
  credit_card: "Credit card",
};
type ProviderQuote = Awaited<ReturnType<typeof InternationalTransferService.getQuotes>>[number];
// Funding no longer selectable in the UI — users fund via their crypto wallet only.
// Removed fundingLabels as funding is now always via crypto wallet.

type Props = NativeStackScreenProps<RootStackParamList, "InternationalTransfer">;

type RecipientField = {
  key: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

const RECIPIENT_FIELDS: Record<string, RecipientField[]> = {
  bank_account: [
    { key: "fullName", label: "Recipient full name", placeholder: "Jane Doe", required: true },
    { key: "bankName", label: "Bank name", placeholder: "Bank of America", required: true },
    { key: "accountNumber", label: "Account number", placeholder: "0123456789", required: true },
    { key: "iban", label: "IBAN / Routing", placeholder: "Optional" },
    { key: "swift", label: "SWIFT / Sort code", placeholder: "Optional" },
    { key: "email", label: "Contact email", placeholder: "recipient@example.com" },
  ],
  ach: [
    { key: "fullName", label: "Recipient full name", placeholder: "Jane Doe", required: true },
    { key: "bankName", label: "Bank name", placeholder: "Bank of America", required: true },
    { key: "accountNumber", label: "Account number", placeholder: "0123456789", required: true },
    { key: "routingNumber", label: "Routing number", placeholder: "Optional" },
    { key: "email", label: "Contact email", placeholder: "recipient@example.com" },
  ],
  mobile_money: [
    { key: "fullName", label: "Recipient full name", placeholder: "Ama Mensah", required: true },
    { key: "mobileWalletProvider", label: "Wallet provider", placeholder: "MTN Momo", required: true },
    { key: "mobileNumber", label: "Phone number", placeholder: "+233 55 000 0000", required: true },
    { key: "email", label: "Contact email", placeholder: "Optional" },
  ],
  cash_pickup: [
    { key: "fullName", label: "Recipient full name", required: true },
    { key: "email", label: "Email", placeholder: "Optional" },
  ],
  crypto_wallet: [
    { key: "fullName", label: "Recipient name (optional)" },
    { key: "accountNumber", label: "Wallet address", placeholder: "0x...", required: true },
  ],
  credit_card: [
    { key: "fullName", label: "Cardholder full name", placeholder: "Jane Doe", required: true },
    { key: "cardNumber", label: "Card number", placeholder: "4111 1111 1111 1111", required: true },
    { key: "expiry", label: "Expiry (MM/YY)", placeholder: "05/28", required: true },
    { key: "cvv", label: "CVV", placeholder: "123", required: true },
    { key: "email", label: "Contact email", placeholder: "recipient@example.com" },
  ],
};

export const InternationalTransferScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [stepIndex, setStepIndex] = useState(0);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  
  const [search, setSearch] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [draft, setDraft] = useState<InternationalTransferDraft>({});
  const [recipientErrors, setRecipientErrors] = useState<Record<string, string>>({});
  const { toast, showToast, hideToast } = useToast();

  const recommendationFallback = useMemo(
    () =>
      InternationalTransferService.recommendProviders({
        countryCode: draft.destinationCountry?.code,
        amountUsd: draft.amountUsd,
        payoutMethod: draft.payoutMethod,
        fundingMethod: draft.fundingMethod,
      }),
    [draft.destinationCountry?.code, draft.amountUsd, draft.payoutMethod, draft.fundingMethod]
  );

  const quotesQuery = useQuery({
    queryKey: [
      "internationalQuotes",
      draft.destinationCountry?.code,
      draft.amountUsd,
      draft.payoutMethod,
      draft.fundingMethod,
    ],
    queryFn: () =>
      InternationalTransferService.getQuotes({
        countryCode: draft.destinationCountry?.code,
        amountUsd: draft.amountUsd,
        payoutMethod: draft.payoutMethod,
        fundingMethod: draft.fundingMethod,
      }),
    enabled: Boolean(draft.destinationCountry?.code && draft.amountUsd && draft.amountUsd > 0),
    staleTime: 60_000,
    retry: 1,
  });

  const providerQuotes = quotesQuery.data ?? recommendationFallback;
  const quotesLoading = quotesQuery.isFetching && Boolean(draft.destinationCountry?.code && draft.amountUsd);

  const selectedProvider = useMemo(() => {
    if (!draft.providerId) return undefined;
    return PROVIDERS.find((provider) => provider.id === draft.providerId);
  }, [draft.providerId]);

  const { fxRate, amountLocal } = useMemo(
    () => InternationalTransferService.calculateLocalAmount(draft.destinationCountry?.code, draft.amountUsd),
    [draft.destinationCountry?.code, draft.amountUsd]
  );

  const transferMutation = useMutation({
    mutationFn: InternationalTransferService.submitTransfer,
    onSuccess: (result) => {
      showToast(`Transfer submitted via ${result.providerId}. Reference ${result.referenceCode ?? "pending"}.`, "success");
      // After a successful transfer, prefer to go back to the opener instead of navigating home.
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else if (route?.params && (route.params as any).returnTo) {
        const rt = (route.params as any).returnTo;
        const rtParams = (route.params as any).returnToParams;
        navigation.navigate(rt as any, rtParams);
      }
    },
    onError: (error) => {
      showToast(error instanceof Error ? error.message : "Transfer failed", "error");
    },
  });

  const filteredCountries = useMemo(() => {
    if (!search.trim()) return SUPPORTED_COUNTRIES;
    return SUPPORTED_COUNTRIES.filter((country) =>
      country.name.toLowerCase().includes(search.trim().toLowerCase())
    );
  }, [search]);

  const handleSelectCountry = (code: string) => {
    const country = SUPPORTED_COUNTRIES.find((entry) => entry.code === code);
    if (!country) return;
    setDraft((prev) => ({ ...prev, destinationCountry: country, providerId: undefined }));
  };

  const handleSelectProvider = (provider: ProviderConfig) => {
    // Auto-select a sensible payout method from the provider based on region
    const defaultPayout = provider.payoutMethods?.[0];
    setDraft((prev) => ({
      ...prev,
      providerId: provider.id,
      payoutMethod: defaultPayout,
      // funding is fixed to crypto wallet
      fundingMethod: "crypto_wallet",
    }));
  };

  const handleSelectPayoutMethod = (method: PayoutMethod) => {
    setDraft((prev) => ({ ...prev, payoutMethod: method }));
  };

  // Funding selection removed; users fund via crypto wallet only.

  const updateRecipientField = (key: string, value: string) => {
    setRecipientErrors((prev) => ({ ...prev, [key]: "" }));
    setDraft((prev) => ({
      ...prev,
      recipientDetails: {
        ...(prev.recipientDetails ?? {}),
        [key]: value,
      },
    }));
  };

  const validateRecipientDetails = () => {
    if (!draft.payoutMethod) return false;
    const fields = RECIPIENT_FIELDS[draft.payoutMethod];
    const details: Record<string, any> = draft.recipientDetails ?? {};
    const nextErrors: Record<string, string> = {};

    fields.forEach((field) => {
      if (field.required && !details[field.key]) {
        nextErrors[field.key] = `${field.label} is required`;
      }
    });

    setRecipientErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (stepIndex >= STEP_TITLES.length - 1) return;
    setStepIndex((prev) => prev + 1);
  };

  const goBack = () => {
    if (stepIndex === 0) {
      // Prefer popping the navigation stack when possible
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else if (route?.params && (route.params as any).returnTo) {
        // If the opener provided a return route, navigate there
        const rt = (route.params as any).returnTo;
        const rtParams = (route.params as any).returnToParams;
        navigation.navigate(rt as any, rtParams);
      } else {
        // No known previous route — do nothing to avoid jumping to home unexpectedly
        // Optionally you could navigate to a safe default here.
      }
      return;
    }
    setStepIndex((prev) => prev - 1);
  };

  // Handle Android hardware back button to navigate between steps.
  useEffect(() => {
    const onBackPress = () => {
      if (stepIndex > 0) {
        goBack();
        return true; // handled
      }
      // allow default behavior (pop stack)
      return false;
    };

    const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
    return () => subscription.remove();
  }, [stepIndex]);

  const handleContinueFromStep = () => {
    switch (stepIndex) {
      case 0:
        if (!draft.destinationCountry) {
          showToast("Select a destination country", "error");
          return;
        }
        goNext();
        break;
      case 1:
        if (!draft.amountUsd || draft.amountUsd <= 0) {
          showToast("Enter a valid amount", "error");
          return;
        }
        goNext();
        break;
      case 2:
        if (!draft.providerId) {
          showToast("Choose a provider", "error");
          return;
        }
        // Open payout modal so user can pick a payout method (compact UX)
        setShowPayoutModal(true);
        break;
      case 3:
        // Recipient step validation
        if (!validateRecipientDetails()) {
          showToast("Fill in recipient details", "error");
          return;
        }
        goNext();
        break;
      case 4:
        // Review step (final) — nothing to validate here
        break;
      default:
        break;
    }
  };

  // Funding is not selectable; users fund via crypto wallet.

  const handleSubmitTransfer = () => {
    if (!draft.destinationCountry || !draft.amountUsd || !draft.providerId || !draft.payoutMethod) {
      showToast("Complete all steps before sending", "error");
      return;
    }

    transferMutation.mutate(draft);
  };

  const handlePayoutSelect = (method: PayoutMethod | string) => {
    setDraft((prev) => ({ ...prev, payoutMethod: method as PayoutMethod }));
  };

  const handlePayoutModalContinue = () => {
    if (!draft.payoutMethod) {
      showToast("Choose a payout method", "error");
      return;
    }
    setShowPayoutModal(false);
    // go directly to recipient step
    setStepIndex(4);
  };

  const renderCountryStep = () => (
    <>
      <TextField
        label="Search destination"
        placeholder="Type a country name"
        value={search}
        onChangeText={setSearch}
      />
      <ScrollView style={styles.listContainer}>
        {filteredCountries.map((country) => {
          const selected = draft.destinationCountry?.code === country.code;
          return (
            <TouchableOpacity
              key={country.code}
              style={[styles.countryRow, selected && styles.countryRowSelected]}
              onPress={() => handleSelectCountry(country.code)}
            >
              <View>
                <Text style={styles.countryName}>{country.name}</Text>
                <Text style={styles.countryMeta}>{country.currency} • {country.region}</Text>
              </View>
              {selected ? <Text style={styles.selectedBadge}>Selected</Text> : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  const renderAmountStep = () => (
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 0 }} keyboardShouldPersistTaps="handled">
      <TextField
        label="Amount in USD"
        keyboardType="decimal-pad"
        value={amountInput}
        onChangeText={(value) => {
          setAmountInput(value);
          const parsed = parseFloat(value);
          setDraft((prev) => ({
            ...prev,
            amountUsd: Number.isFinite(parsed) ? parsed : undefined,
          }));
        }}
      />
      {draft.destinationCountry && amountLocal && (
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>Estimated payout</Text>
          <Text style={styles.infoValue}>
            {amountLocal.toFixed(2)} {draft.destinationCountry.currency}
          </Text>
          <Text style={styles.infoMeta}>FX ~ 1 USD = {fxRate.toFixed(2)} {draft.destinationCountry.currency}</Text>
        </View>
      )}
    </ScrollView>
  );

  const renderProviderStep = () => (
    <ScrollView style={styles.listContainer}>
      {quotesLoading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.emptyStateSubtitle, { marginTop: spacing.sm }]}>Fetching live quotes…</Text>
        </View>
      ) : providerQuotes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>No providers yet</Text>
          <Text style={styles.emptyStateSubtitle}>
            Pick a destination country to see available remittance providers.
          </Text>
        </View>
      ) : (
        providerQuotes.map((quote, index) => {
          const selected = draft.providerId === quote.provider.id;
          return (
            <TouchableOpacity
              key={quote.provider.id}
              style={[styles.providerCard, selected && styles.providerCardSelected]}
              onPress={() => handleSelectProvider(quote.provider)}
            >
              <View style={styles.providerHeader}>
                <Text style={styles.providerName}>{quote.provider.name}</Text>
                {index === 0 && <Text style={styles.recommendBadge}>Recommended</Text>}
              </View>
              <Text style={styles.providerDescription}>{quote.provider.description}</Text>
              <View style={styles.providerMetaRow}>
                <Text style={styles.providerMeta}>Fee ≈ ${quote.totalFeeUsd.toFixed(2)}</Text>
                <Text style={styles.providerMeta}>ETA {quote.deliveryEtaHours}h</Text>
              </View>
              {selected ? (
                <View style={styles.quoteDetails}>
                  <Text style={styles.sectionTitle}>Quotes</Text>
                  <View style={{ marginTop: spacing.sm }}>
                    <Text style={styles.providerMeta}>Fee ≈ ${quote.totalFeeUsd.toFixed(2)}</Text>
                    <Text style={styles.providerMeta}>ETA {quote.deliveryEtaHours}h</Text>
                  </View>
                  <Text style={[styles.sectionTitle, { marginTop: spacing.md }]}>Available payout methods</Text>
                  <View style={[styles.chipGroup, { marginTop: spacing.sm }]}> 
                    {(quote.provider.payoutMethods ?? []).map((method) => (
                      <View key={method} style={styles.payoutListItem}>
                        <Text style={styles.chipLabel}>{payoutLabels[method] ?? method}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })
      )}
        {/* If a provider is selected show available payout methods inline (we removed the separate payout screen)
            Funding (payment) methods remain in the modal. */}
        {/* payout options moved into modal; quotes are shown inline inside the provider card when selected */}
    </ScrollView>
  );

  const renderPaymentStep = () => (
    <View style={styles.methodContainer}>
      <Text style={styles.sectionTitle}>Payout method</Text>
      <View style={[styles.chipGroup, { marginTop: spacing.sm }]}> 
        {(selectedProvider?.payoutMethods ?? []).map((method) => {
          const selected = draft.payoutMethod === method;
          return (
            <TouchableOpacity
              key={method}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => handleSelectPayoutMethod(method)}
            >
              <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {payoutLabels[method]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  // Funding selection removed; users will fund via their crypto wallet only.

  

  const renderRecipientStep = () => {
    if (!draft.payoutMethod) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Select payout method first</Text>
          <Text style={styles.emptyStateSubtitle}>
            Choose how the recipient should receive funds before entering their details.
          </Text>
        </View>
      );
    }

    const fields = RECIPIENT_FIELDS[draft.payoutMethod];
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 110 : 80}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.lg * 6 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.recipientForm}>
            {fields.map((field) => (
              <View key={field.key}>
                <TextField
                  label={field.label}
                  value={(draft.recipientDetails as any)?.[field.key] ?? ""}
                  placeholder={field.placeholder}
                  onChangeText={(value) => updateRecipientField(field.key, value)}
                />
                {recipientErrors[field.key] ? (
                  <Text style={styles.errorText}>{recipientErrors[field.key]}</Text>
                ) : null}
              </View>
            ))}
            <TextField
              label="Reference / note (optional)"
              value={draft.note ?? ""}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, note: value }))}
              multiline
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  };

  const renderReviewStep = () => (
    <View style={styles.reviewCard}>
      <Text style={styles.reviewTitle}>Review transfer</Text>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Destination</Text>
        <Text style={styles.reviewValue}>{draft.destinationCountry?.name}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Amount</Text>
        <Text style={styles.reviewValue}>{draft.amountUsd?.toFixed(2)} USD</Text>
      </View>
      {draft.destinationCountry && amountLocal && (
        <View style={styles.reviewRow}>
          <Text style={styles.reviewLabel}>Payout</Text>
          <Text style={styles.reviewValue}>
            {amountLocal.toFixed(2)} {draft.destinationCountry.currency}
          </Text>
        </View>
      )}
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Provider</Text>
        <Text style={styles.reviewValue}>{selectedProvider?.name}</Text>
      </View>
      <View style={styles.reviewRow}>
        <Text style={styles.reviewLabel}>Methods</Text>
        <Text style={styles.reviewValue}>
          {draft.payoutMethod ? payoutLabels[draft.payoutMethod] : ""} — funded via Crypto wallet
        </Text>
      </View>
      <PrimaryButton
        title={transferMutation.isPending ? "Submitting..." : "Send transfer"}
        onPress={handleSubmitTransfer}
        loading={transferMutation.isPending}
      />
    </View>
  );

  const renderStepContent = () => {
    switch (stepIndex) {
      case 0:
        return renderCountryStep();
      case 1:
        return renderAmountStep();
      case 2:
        return renderProviderStep();
      case 3:
        return renderPaymentStep();
      case 4:
        return renderRecipientStep();
      case 5:
        return renderReviewStep();
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.screen}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={goBack}>
            <Text style={styles.backAction}>{stepIndex === 0 ? "Cancel" : "Back"}</Text>
          </TouchableOpacity>
          <Text style={styles.stepTitle}>{STEP_TITLES[stepIndex]}</Text>
          <Text style={styles.stepCounter}>Step {stepIndex + 1} / {STEP_TITLES.length}</Text>
        </View>

        <View style={styles.content}>{renderStepContent()}</View>

        {stepIndex < STEP_TITLES.length - 1 && (
          <View style={styles.footer}>
            <PrimaryButton title="Continue" onPress={handleContinueFromStep} />
          </View>
        )}
      </KeyboardAvoidingView>

      {transferMutation.isPending && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Connecting to provider…</Text>
        </View>
      )}

      {/* Funding via crypto wallet only — no modal required */}

      <Modal
        visible={showPayoutModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowPayoutModal(false)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentSmall}>
            <View style={styles.modalHeaderSmall}>
              <Text style={styles.modalTitleSmall}>Choose payout method</Text>
              <Pressable onPress={() => setShowPayoutModal(false)} style={styles.modalCloseSmall}>
                <Text style={styles.modalCloseTextSmall}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalBodySmall} keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionTitle}>Payout method</Text>
              <View style={[styles.chipGroup, { marginTop: spacing.sm }]}> 
                {(selectedProvider?.payoutMethods ?? []).map((method) => {
                  const selected = draft.payoutMethod === method;
                  return (
                    <TouchableOpacity
                      key={method}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => handlePayoutSelect(method)}
                    >
                      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{payoutLabels[method]}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ marginTop: spacing.lg }}>
                <PrimaryButton title="Continue" onPress={handlePayoutModalContinue} />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <ToastModal visible={toast.visible} message={toast.message} type={toast.type} onDismiss={hideToast} />
    </View>
  );
};

const createStyles = (colors: ColorPalette) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backAction: {
      color: colors.textSecondary,
      marginBottom: spacing.xs,
    },
    stepTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    stepCounter: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    content: {
      flex: 1,
      padding: spacing.lg,
    },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.cardBackground,
    },
    listContainer: {
      flex: 1,
    },
    countryRow: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    countryRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.cardBackground,
    },
    countryName: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    countryMeta: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    selectedBadge: {
      color: colors.primary,
      fontWeight: "600",
    },
    infoCard: {
      marginTop: spacing.lg,
      padding: spacing.lg,
      borderRadius: 16,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoTitle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    infoValue: {
      fontSize: 24,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: spacing.xs,
    },
    infoMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: spacing.xs,
    },
    providerCard: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: spacing.lg,
      marginBottom: spacing.md,
      backgroundColor: colors.cardBackground,
    },
    providerCardSelected: {
      borderColor: colors.primary,
      shadowColor: "rgba(0,0,0,0.1)",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
      elevation: 3,
    },
    providerHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: spacing.xs,
    },
    providerName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    recommendBadge: {
      color: colors.success,
      fontSize: 12,
      fontWeight: "600",
    },
    providerDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: spacing.sm,
    },
    providerMetaRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    providerMeta: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    emptyState: {
      padding: spacing.lg,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyStateTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    emptyStateSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: spacing.xs,
    },
    methodContainer: {
      gap: spacing.md,
    },
    sectionTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    chipGroup: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    chip: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    chipLabel: {
      color: colors.textSecondary,
      fontWeight: "500",
    },
    chipLabelSelected: {
      color: "#fff",
    },
    recipientForm: {
      gap: spacing.md,
    },
    errorText: {
      color: colors.error,
      marginTop: spacing.xs,
      fontSize: 12,
    },
    reviewCard: {
      padding: spacing.lg,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      gap: spacing.md,
    },
    reviewTitle: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    reviewRow: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    reviewLabel: {
      color: colors.textSecondary,
    },
    reviewValue: {
      color: colors.textPrimary,
      fontWeight: "600",
    },
    loadingOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.35)",
      alignItems: "center",
      justifyContent: "center",
      gap: spacing.sm,
    },
    loadingText: {
      color: "#fff",
      fontWeight: "600",
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "flex-end",
    },
    modalContentSmall: {
      backgroundColor: colors.cardBackground,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: "85%",
    },
    modalHeaderSmall: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitleSmall: {
      ...typography.subtitle,
      color: colors.textPrimary,
    },
    modalCloseSmall: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      justifyContent: "center",
      alignItems: "center",
    },
    modalCloseTextSmall: {
      fontSize: 16,
      color: colors.textPrimary,
    },
    modalBodySmall: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    quoteDetails: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.cardBackground,
      borderWidth: 1,
      borderColor: colors.border,
    },
    payoutListItem: {
      paddingVertical: spacing.xs,
    },
      
    });
