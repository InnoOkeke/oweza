import Constants from "expo-constants";
import * as Localization from "expo-localization";
import { getUserCountryCode } from "./location";

type ExpoExtra = {

  moonpayApiKey?: string;
  paycrestApiKey?: string;
  transakApiKey?: string;
};

const extra = (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;


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

export type RampProvider = "moonpay" | "paycrest" | "transak";

export type RampType = "onramp" | "offramp";



export type RampConfig = {
  provider: RampProvider;
  type: RampType;
  walletAddress: string;
  assetSymbol?: string;
  amount?: string;
  destinationCurrency?: string;
  destinationNetwork?: string;
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
  const providers: RampProvider[] = ["moonpay", "transak"];

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
/**
 * Build ramp URL for any provider with automatic session token for Coinbase
 * This is the recommended async entry point for building ramp URLs
 */
export async function buildRampUrlWithSession(config: RampConfig): Promise<string> {
  return buildRampUrl(config);
}

/**
 * Build ramp URL for any provider (synchronous version)
 * Note: For Coinbase, use buildRampUrlWithSession instead to support sessionToken
 */
export function buildRampUrl(config: RampConfig): string {
  switch (config.provider) {

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
