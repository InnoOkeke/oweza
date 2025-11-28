import {
  PROVIDERS,
  SUPPORTED_COUNTRIES,
  CountryMetadata,
  ProviderConfig,
  ProviderId,
  PayoutMethod,
  FundingMethod,
  FX_RATES,
  SETTLEMENT_SPEED_HOURS,
} from "../constants/internationalProviders";

export type ProviderQuote = {
  provider: ProviderConfig;
  totalFeeUsd: number;
  fxRate: number;
  deliveryEtaHours: number;
  score: number;
};

export type RecipientDetails = {
  fullName?: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  swift?: string;
  mobileWalletProvider?: string;
  mobileNumber?: string;
  email?: string;
};

export type InternationalTransferDraft = {
  destinationCountry?: CountryMetadata;
  amountUsd?: number;
  providerId?: ProviderId;
  payoutMethod?: PayoutMethod;
  fundingMethod?: FundingMethod;
  recipientDetails?: RecipientDetails;
  note?: string;
};

export type TransferSubmissionResult = {
  id: string;
  status: "processing" | "completed" | "failed";
  providerId: ProviderId;
  trackingUrl?: string;
  referenceCode?: string;
};

type ExpoExtra = {
  metasendApiBaseUrl?: string;
  metasendApiKey?: string;
};

const isReactNative = typeof navigator !== "undefined" && navigator.product === "ReactNative";

const getExpoExtra = (): ExpoExtra => {
  if (!isReactNative) {
    return {};
  }

  try {
    const Constants = require("expo-constants").default;
    return (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;
  } catch (_error) {
    return {} as ExpoExtra;
  }
};

const extra = getExpoExtra();
const apiBaseUrl = (isReactNative ? extra.metasendApiBaseUrl : process.env.METASEND_API_BASE_URL) || "";
const apiKey = (isReactNative ? extra.metasendApiKey : process.env.METASEND_API_KEY) || "";

const ensureApiConfig = () => {
  if (!apiBaseUrl || !apiKey) {
    throw new Error("MetaSend API configuration missing. Set METASEND_API_BASE_URL and METASEND_API_KEY.");
  }
};

type ApiResponse<T> = {
  success: boolean;
  quotes?: ProviderQuote[];
  result?: TransferSubmissionResult;
} & T;

const apiRequest = async <T>(path: string, init?: RequestInit): Promise<T> => {
  ensureApiConfig();

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `International transfer API failed with status ${response.status}`);
  }

  return (await response.json()) as T;
};

async function simulateSubmission(providerId: ProviderId): Promise<TransferSubmissionResult> {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return {
    id: `itr_${Date.now()}`,
    status: "processing",
    providerId,
    referenceCode: Math.random().toString(36).slice(2, 10).toUpperCase(),
  };
}

function calculateFee(provider: ProviderConfig, amountUsd: number) {
  const percentageFee = (provider.baseFeeBps / 10000) * amountUsd;
  return provider.flatFeeUsd + percentageFee;
}

function scoreProvider(
  config: ProviderConfig,
  amountUsd: number,
  desiredPayout?: PayoutMethod,
  desiredFunding?: FundingMethod
) {
  let score = 0;

  if (desiredPayout && config.payoutMethods.includes(desiredPayout)) {
    score += 25;
  }

  if (desiredFunding && config.fundingMethods.includes(desiredFunding)) {
    score += 15;
  }

  // Lower fees => higher score
  const fee = calculateFee(config, amountUsd || config.minAmountUsd);
  score += Math.max(0, 40 - fee);

  // Faster speeds => higher score
  const speedHours = SETTLEMENT_SPEED_HOURS[config.speed];
  score += Math.max(0, 20 - speedHours / 4);

  if (config.status === "live") {
    score += 10;
  }

  return score;
}

function getFxRateForCountry(country: CountryMetadata | undefined) {
  if (!country) return 1;
  return FX_RATES[country.currency] ?? 1;
}

function ensureProviderSupportsCountry(provider: ProviderConfig, countryCode?: string) {
  if (!countryCode) return false;
  return provider.countries.includes(countryCode);
}

export const InternationalTransferService = {
  getSupportedCountries() {
    return SUPPORTED_COUNTRIES;
  },

  getProvidersForCountry(countryCode?: string) {
    return PROVIDERS.filter((provider) => ensureProviderSupportsCountry(provider, countryCode));
  },

  recommendProviders(options: {
    countryCode?: string;
    amountUsd?: number;
    payoutMethod?: PayoutMethod;
    fundingMethod?: FundingMethod;
  }): ProviderQuote[] {
    const { countryCode, amountUsd = 100, payoutMethod, fundingMethod } = options;
    const providers = this.getProvidersForCountry(countryCode);

    return providers
      .map((provider) => {
        const fee = calculateFee(provider, amountUsd);
        const fxRate = getFxRateForCountry(
          SUPPORTED_COUNTRIES.find((country) => country.code === countryCode)
        );
        const deliveryEtaHours = SETTLEMENT_SPEED_HOURS[provider.speed];
        const score = scoreProvider(provider, amountUsd, payoutMethod, fundingMethod);

        return { provider, totalFeeUsd: fee, fxRate, deliveryEtaHours, score } satisfies ProviderQuote;
      })
      .sort((a, b) => b.score - a.score);
  },

  async getQuotes(options: {
    countryCode?: string;
    amountUsd?: number;
    payoutMethod?: PayoutMethod;
    fundingMethod?: FundingMethod;
  }): Promise<ProviderQuote[]> {
    const { countryCode, amountUsd } = options;
    if (!countryCode || !amountUsd) {
      return this.recommendProviders(options);
    }

    if (!apiBaseUrl || !apiKey) {
      return this.recommendProviders(options);
    }

    try {
      const response = await apiRequest<ApiResponse<{}>>("/api/international/quotes", {
        method: "POST",
        body: JSON.stringify(options),
      });

      if (response.success && Array.isArray(response.quotes)) {
        return response.quotes;
      }

      return this.recommendProviders(options);
    } catch (error) {
      console.warn("⚠️ Live quote fetch failed", error);
      return this.recommendProviders(options);
    }
  },

  calculateLocalAmount(countryCode: string | undefined, amountUsd: number | undefined) {
    if (!countryCode || !amountUsd) return { fxRate: 1, amountLocal: undefined };
    const country = SUPPORTED_COUNTRIES.find((entry) => entry.code === countryCode);
    const fxRate = getFxRateForCountry(country);
    return { fxRate, amountLocal: amountUsd * fxRate };
  },

  async submitTransfer(draft: InternationalTransferDraft) {
    if (!draft.providerId) {
      throw new Error("Select a provider before sending");
    }

    if (!apiBaseUrl || !apiKey) {
      return simulateSubmission(draft.providerId);
    }

    try {
      const response = await apiRequest<ApiResponse<{}>>("/api/international/transfers", {
        method: "POST",
        body: JSON.stringify(draft),
      });

      if (response.success && response.result) {
        return response.result;
      }

      throw new Error("International transfer API responded without result");
    } catch (error) {
      console.warn("⚠️ International transfer submission failed, falling back", error);
      return simulateSubmission(draft.providerId);
    }
  },
};
