import Constants from "expo-constants";
import * as Localization from "expo-localization";
import { getUserCountryCode } from "./location";

type ExpoExtra = {
  coinbaseAppId?: string;
  moonpayApiKey?: string;
  paycrestApiKey?: string;
  transakApiKey?: string;
};

const extra = (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;

export const COINBASE_APP_ID = extra.coinbaseAppId ?? "";
export const MOONPAY_API_KEY = extra.moonpayApiKey ?? "";
export const PAYCREST_API_KEY = extra.paycrestApiKey ?? "";
export const TRANSAK_API_KEY = extra.transakApiKey ?? "";

// African country codes for Paycrest availability
const AFRICAN_COUNTRIES = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "ZM", "ZW"
];

export type RampProvider = "coinbase" | "moonpay" | "paycrest" | "transak";

export type RampType = "onramp" | "offramp";

export type PaymentMethod =
  | "CRYPTO_ACCOUNT"    // Crypto balance in Coinbase account
  | "FIAT_WALLET"       // Fiat balance in Coinbase account  
  | "CARD"              // Debit/Credit cards
  | "ACH_BANK_ACCOUNT"  // US Bank Transfer
  | "PAYPAL";           // PayPal

export type RampConfig = {
  provider: RampProvider;
  type: RampType;
  walletAddress: string;
  assetSymbol?: string;
  amount?: string;
  paymentMethod?: PaymentMethod;
  destinationCurrency?: string;
  destinationNetwork?: string;
  sessionToken?: string; // Required for secure Coinbase projects
};

/**
 * Check if user is in an African country (for Paycrest availability)
 */
export async function isAfricanUser(): Promise<boolean> {
  // Try to get country from location permission first
  let countryCode = await getUserCountryCode();

  // Fallback to device locale if location not available
  if (!countryCode) {
    countryCode = Localization.getLocales()[0]?.regionCode?.toUpperCase() ?? "";
  }

  return AFRICAN_COUNTRIES.includes(countryCode);
}

/**
 * Get available ramp providers based on user location and ramp type
 */
export async function getAvailableProviders(type: RampType): Promise<RampProvider[]> {
  const providers: RampProvider[] = ["coinbase", "moonpay", "transak"];

  // Paycrest only for off-ramp in African countries
  if (type === "offramp" && await isAfricanUser()) {
    providers.push("paycrest");
  }

  return providers;
}

/**
 * Get available payment methods for Coinbase
 * Based on: https://docs.cdp.coinbase.com/onramp-&-offramp/developer-guidance/payment-methods
 */
export function getCoinbasePaymentMethods(type: RampType, countryCode?: string): PaymentMethod[] {
  const country = countryCode?.toUpperCase() ?? Localization.getLocales()[0]?.regionCode?.toUpperCase() ?? "";

  const methods: PaymentMethod[] = [
    "CRYPTO_ACCOUNT", // Available globally
    "FIAT_WALLET",    // Available globally
  ];

  // Card payments available in US and 90+ countries (EU, UK, CA, etc.)
  // Note: Credit cards have lower acceptance rate depending on issuer bank
  // Debit cards more widely accepted than credit cards
  const cardSupportedCountries = [
    "US", "CA", "GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "SE", "DK", "NO", "CH",
    "AU", "NZ", "SG", "HK", "JP", "KR", "MX", "BR", "AR", "CL", "CO", "PE", "PL", "CZ", "RO", "GR", "BG",
    // Add more countries as needed - 90+ total supported
  ];
  if (cardSupportedCountries.includes(country) || country.length > 0) {
    methods.push("CARD");
  }

  // ACH only in US
  if (country === "US") {
    methods.push("ACH_BANK_ACCOUNT");
  }

  // PayPal for sell only (offramp) in Canada, UK, Gibraltar, Guernsey, Isle of Man, Jersey, Andorra, Monaco, San Marino, Switzerland
  const paypalCountries = ["CA", "GB", "GI", "GG", "IM", "JE", "AD", "MC", "SM", "CH"];
  if (type === "offramp" && paypalCountries.includes(country)) {
    methods.push("PAYPAL");
  }

  return methods;
}

/**
 * Fetch available payment methods from Coinbase API
 * https://docs.cdp.coinbase.com/onramp-&-offramp/docs/api-configurations#get-payment-methods
 */
export async function fetchCoinbasePaymentMethods(
  type: RampType,
  walletAddress: string,
  countryCode?: string
): Promise<PaymentMethod[]> {
  try {
    const country = countryCode?.toUpperCase() ?? Localization.getLocales()[0]?.regionCode?.toUpperCase() ?? "US";

    // Coinbase API endpoint for fetching payment methods
    const url = `https://api.coinbase.com/onramp/v1/payment-methods?country=${country}&type=${type}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.warn("Failed to fetch Coinbase payment methods, falling back to static list");
      return getCoinbasePaymentMethods(type, country);
    }

    const data = await response.json();

    // Parse API response and extract payment method IDs
    const methods = data.paymentMethods?.map((pm: any) => pm.id as PaymentMethod) ?? [];

    return methods.length > 0 ? methods : getCoinbasePaymentMethods(type, country);
  } catch (error) {
    console.error("Error fetching Coinbase payment methods:", error);
    // Fallback to static list
    return getCoinbasePaymentMethods(type, countryCode);
  }
}

/**
 * Get payment method display name
 */
export function getPaymentMethodName(method: PaymentMethod): string {
  const names: Record<PaymentMethod, string> = {
    CRYPTO_ACCOUNT: "Crypto Balance (Coinbase Account)",
    FIAT_WALLET: "Fiat Wallet (Coinbase Account)",
    CARD: "Credit/Debit Card",
    ACH_BANK_ACCOUNT: "ACH Transfer (US Bank)",
    PAYPAL: "PayPal",
  };
  return names[method];
}

/**
 * Get payment method description
 */
export function getPaymentMethodDescription(method: PaymentMethod): string {
  const descriptions: Record<PaymentMethod, string> = {
    CRYPTO_ACCOUNT: "Use crypto balance from your Coinbase account",
    FIAT_WALLET: "Use fiat balance from your Coinbase account",
    CARD: "Debit cards widely accepted. Credit cards have variable acceptance.",
    ACH_BANK_ACCOUNT: "US bank transfer (2-5 business days)",
    PAYPAL: "Pay with your PayPal account",
  };
  return descriptions[method];
}

/**
 * Build Coinbase Onramp URL
 * Docs: https://docs.cdp.coinbase.com/onramp-&-offramp/docs/api-configurations
 * Updated to use new API parameters (addresses, assets) and sessionToken
 */
export async function buildCoinbaseRampUrl(config: RampConfig): Promise<string> {
  const baseUrl = config.type === "onramp"
    ? "https://pay.coinbase.com/buy/select-asset"
    : "https://pay.coinbase.com/sell/select-asset";

  // Fetch sessionToken if not provided
  let sessionToken = config.sessionToken;
  if (!sessionToken) {
    sessionToken = await getCoinbaseSessionToken(config.walletAddress) ?? undefined;
  }

  // New API format: Use addresses and assets instead of destinationWallets
  const params = new URLSearchParams({
    appId: COINBASE_APP_ID,
    addresses: JSON.stringify({ [config.walletAddress]: [config.destinationNetwork ?? "celo"] }),
    assets: JSON.stringify([config.assetSymbol ?? "CUSD"]),
  });

  // Add sessionToken if available
  if (sessionToken) {
    params.append("sessionToken", sessionToken);
  }

  if (config.amount) {
    params.append("presetCryptoAmount", config.amount);
  }

  if (config.paymentMethod) {
    params.append("defaultPaymentMethod", config.paymentMethod);
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Build MoonPay URL
 * https://dev.moonpay.com/docs/on-ramp-widget
 */
export function buildMoonPayUrl(config: RampConfig): string {
  const params = new URLSearchParams({
    apiKey: MOONPAY_API_KEY,
    walletAddress: config.walletAddress,
    // Use cusd_celo for Celo network
    currencyCode: config.assetSymbol === "CUSD" ? "cusd_celo" : (config.assetSymbol?.toLowerCase() ?? "cusd_celo"),
  });

  if (config.amount) {
    params.append("baseCurrencyAmount", config.amount);
  }

  // MoonPay uses different URLs for buy vs sell
  const baseUrl = config.type === "onramp"
    ? "https://buy.moonpay.com"
    : "https://sell.moonpay.com";

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Build Transak URL
 * https://docs.transak.com/docs/query-parameters
 */
export function buildTransakUrl(config: RampConfig): string {
  const baseUrl = "https://global.transak.com";

  const params = new URLSearchParams({
    apiKey: TRANSAK_API_KEY,
    walletAddress: config.walletAddress,
    cryptoCurrencyCode: config.assetSymbol?.toUpperCase() ?? "CUSD",
    network: config.destinationNetwork ?? "celo",
    productsAvailed: config.type === "onramp" ? "BUY" : "SELL",
  });

  if (config.amount) {
    params.append("cryptoCurrencyAmount", config.amount);
  }

  if (config.destinationCurrency) {
    params.append("fiatCurrency", config.destinationCurrency.toUpperCase());
  }

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Build Paycrest URL (off-ramp for African users)
 * https://docs.paycrest.io
 */
export function buildPaycrestUrl(config: RampConfig): string {
  const params = new URLSearchParams({
    apiKey: PAYCREST_API_KEY,
    walletAddress: config.walletAddress,
    asset: config.assetSymbol?.toUpperCase() ?? "CUSD",
    network: config.destinationNetwork ?? "CELO",
  });

  if (config.amount) {
    params.append("amount", config.amount);
  }

  if (config.destinationCurrency) {
    params.append("currency", config.destinationCurrency.toUpperCase());
  }

  return `https://app.paycrest.io/offramp?${params.toString()}`;
}

/**
 * Fetch session token from backend for secure Coinbase projects
 */
export async function getCoinbaseSessionToken(walletAddress: string): Promise<string | null> {
  try {
    const apiKey = Constants.expoConfig?.extra?.metasendApiKey;
    const apiBaseUrl = Constants.expoConfig?.extra?.metasendApiBaseUrl;

    if (!apiKey || !apiBaseUrl) {
      console.warn("API configuration missing, skipping session token");
      return null;
    }

    const response = await fetch(`${apiBaseUrl}/api/coinbase-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ walletAddress }),
    });

    if (!response.ok) {
      console.warn("Failed to get session token:", response.statusText);
      return null;
    }

    const data = await response.json();
    return data.sessionToken;
  } catch (error) {
    console.error("Error fetching session token:", error);
    return null;
  }
}


/**
 * Build ramp URL for any provider with automatic session token for Coinbase
 * This is the recommended async entry point for building ramp URLs
 */
export async function buildRampUrlWithSession(config: RampConfig): Promise<string> {
  if (config.provider === "coinbase") {
    return await buildCoinbaseRampUrl(config);
  }

  return buildRampUrl(config);
}

/**
 * Build ramp URL for any provider (synchronous version)
 * Note: For Coinbase, use buildRampUrlWithSession instead to support sessionToken
 */
export function buildRampUrl(config: RampConfig): string {
  switch (config.provider) {
    case "coinbase":
      throw new Error("Use buildRampUrlWithSession for Coinbase to support sessionToken");
    case "moonpay":
      return buildMoonPayUrl(config);
    case "paycrest":
      return buildPaycrestUrl(config);
    case "transak":
      return buildTransakUrl(config);
    default:
      throw new Error(`Unknown ramp provider: ${config.provider}`);
  }
}

/**
 * Get provider display information
 */
export function getProviderInfo(provider: RampProvider) {
  const info = {
    coinbase: {
      name: "Coinbase",
      description: "Buy & sell crypto with your Coinbase account, cards, or bank",
      logo: "💎",
      supportsBuy: true,
      supportsSell: true,
      supportsPaymentMethods: true,
    },
    moonpay: {
      name: "MoonPay",
      description: "Buy & sell crypto with cards and bank transfers",
      logo: "🌙",
      supportsBuy: true,
      supportsSell: true,
      supportsPaymentMethods: false,
    },
    paycrest: {
      name: "Paycrest",
      description: "Cash out to mobile money and local bank accounts",
      logo: "🌍",
      supportsBuy: false,
      supportsSell: true,
      supportsPaymentMethods: false,
    },
    transak: {
      name: "Transak",
      description: "Buy & sell crypto with cards, bank transfers, and mobile money",
      logo: "🔷",
      supportsBuy: true,
      supportsSell: true,
      supportsPaymentMethods: false,
    },
  };

  return info[provider];
}
