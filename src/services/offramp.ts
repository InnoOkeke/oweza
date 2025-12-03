import Constants from "expo-constants";
import { RampProvider, RampConfig, buildRampUrlWithSession, getProviderInfo } from "./ramp";

type ExpoExtra = {
    moonpayApiKey?: string;
    paycrestApiKey?: string;
    transakApiKey?: string;
};

const extra = (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;

export type Region = "africa" | "europe" | "north-america" | "south-america" | "asia" | "oceania" | "middle-east";

// Country to region mapping
const COUNTRY_REGION_MAP: Record<string, Region> = {
    // Africa
    "DZ": "africa", "AO": "africa", "BJ": "africa", "BW": "africa", "BF": "africa", "BI": "africa",
    "CM": "africa", "CV": "africa", "CF": "africa", "TD": "africa", "KM": "africa", "CG": "africa",
    "CD": "africa", "CI": "africa", "DJ": "africa", "EG": "africa", "GQ": "africa", "ER": "africa",
    "SZ": "africa", "ET": "africa", "GA": "africa", "GM": "africa", "GH": "africa", "GN": "africa",
    "GW": "africa", "KE": "africa", "LS": "africa", "LR": "africa", "LY": "africa", "MG": "africa",
    "MW": "africa", "ML": "africa", "MR": "africa", "MU": "africa", "MA": "africa", "MZ": "africa",
    "NA": "africa", "NE": "africa", "NG": "africa", "RW": "africa", "ST": "africa", "SN": "africa",
    "SC": "africa", "SL": "africa", "SO": "africa", "ZA": "africa", "SS": "africa", "SD": "africa",
    "TZ": "africa", "TG": "africa", "TN": "africa", "UG": "africa", "ZM": "africa", "ZW": "africa",

    // Europe
    "AL": "europe", "AD": "europe", "AT": "europe", "BY": "europe", "BE": "europe", "BA": "europe",
    "BG": "europe", "HR": "europe", "CY": "europe", "CZ": "europe", "DK": "europe", "EE": "europe",
    "FI": "europe", "FR": "europe", "DE": "europe", "GR": "europe", "HU": "europe", "IS": "europe",
    "IE": "europe", "IT": "europe", "XK": "europe", "LV": "europe", "LI": "europe", "LT": "europe",
    "LU": "europe", "MT": "europe", "MD": "europe", "MC": "europe", "ME": "europe", "NL": "europe",
    "MK": "europe", "NO": "europe", "PL": "europe", "PT": "europe", "RO": "europe", "RU": "europe",
    "SM": "europe", "RS": "europe", "SK": "europe", "SI": "europe", "ES": "europe", "SE": "europe",
    "CH": "europe", "UA": "europe", "GB": "europe", "VA": "europe",

    // North America
    "AG": "north-america", "BS": "north-america", "BB": "north-america", "BZ": "north-america",
    "CA": "north-america", "CR": "north-america", "CU": "north-america", "DM": "north-america",
    "DO": "north-america", "SV": "north-america", "GD": "north-america", "GT": "north-america",
    "HT": "north-america", "HN": "north-america", "JM": "north-america", "MX": "north-america",
    "NI": "north-america", "PA": "north-america", "KN": "north-america", "LC": "north-america",
    "VC": "north-america", "TT": "north-america", "US": "north-america",

    // South America
    "AR": "south-america", "BO": "south-america", "BR": "south-america", "CL": "south-america",
    "CO": "south-america", "EC": "south-america", "GY": "south-america", "PY": "south-america",
    "PE": "south-america", "SR": "south-america", "UY": "south-america", "VE": "south-america",

    // Asia
    "AF": "asia", "AM": "asia", "AZ": "asia", "BH": "asia", "BD": "asia", "BT": "asia",
    "BN": "asia", "KH": "asia", "CN": "asia", "GE": "asia", "IN": "asia", "ID": "asia",
    "IR": "asia", "IQ": "asia", "IL": "asia", "JP": "asia", "JO": "asia", "KZ": "asia",
    "KW": "asia", "KG": "asia", "LA": "asia", "LB": "asia", "MY": "asia", "MV": "asia",
    "MN": "asia", "MM": "asia", "NP": "asia", "KP": "asia", "OM": "asia", "PK": "asia",
    "PS": "asia", "PH": "asia", "QA": "asia", "SA": "asia", "SG": "asia", "KR": "asia",
    "LK": "asia", "SY": "asia", "TW": "asia", "TJ": "asia", "TH": "asia", "TL": "asia",
    "TR": "asia", "TM": "asia", "AE": "asia", "UZ": "asia", "VN": "asia", "YE": "asia",

    // Oceania
    "AU": "oceania", "FJ": "oceania", "KI": "oceania", "MH": "oceania", "FM": "oceania",
    "NR": "oceania", "NZ": "oceania", "PW": "oceania", "PG": "oceania", "WS": "oceania",
    "SB": "oceania", "TO": "oceania", "TV": "oceania", "VU": "oceania",

};

// Provider availability by region
const PROVIDER_REGIONS: Record<RampProvider, Region[]> = {
    moonpay: ["africa", "europe", "north-america", "south-america", "asia", "oceania", "middle-east"],
    transak: ["africa", "europe", "north-america", "south-america", "asia", "oceania", "middle-east"],
    paycrest: ["africa"], // Paycrest focuses on Africa
};

export interface OfframpProvider {
    provider: RampProvider;
    name: string;
    description: string;
    logo: string;
    regions: Region[];
    isAvailable: boolean;
}

/**
 * Get user's region based on country code
 */
export function getRegionFromCountryCode(countryCode: string): Region {
    return COUNTRY_REGION_MAP[countryCode.toUpperCase()] ?? "north-america"; // Default to North America
}

/**
 * Get available offramp providers for user's region
 */
export async function getAvailableOfframpProviders(countryCode?: string): Promise<OfframpProvider[]> {
    const region = countryCode ? getRegionFromCountryCode(countryCode) : "north-america";

    const allProviders: RampProvider[] = ["moonpay", "transak", "paycrest"];

    return allProviders.map(provider => {
        const info = getProviderInfo(provider);
        const regions = PROVIDER_REGIONS[provider];
        const isAvailable = regions.includes(region) && info.supportsSell;

        return {
            provider,
            name: info.name,
            description: info.description,
            logo: info.logo,
            regions,
            isAvailable,
        };
    }).filter(p => p.isAvailable); // Only return available providers
}

/**
 * Build offramp URL for a provider
 */
export async function buildOfframpUrl(
    provider: RampProvider,
    walletAddress: string,
    amount?: string,
    currency?: string
): Promise<string> {
    const config: RampConfig = {
        provider,
        type: "offramp",
        walletAddress,
        assetSymbol: "CUSD",
        destinationNetwork: "celo",
        amount,
        destinationCurrency: currency,
    };

    return buildRampUrlWithSession(config);
}

/**
 * Get region-specific recommendations
 */
export function getRegionRecommendations(region: Region): {
    popularCurrencies: string[];
    preferredProvider?: RampProvider;
    paymentMethods: string[];
} {
    const recommendations: Record<Region, {
        popularCurrencies: string[];
        preferredProvider?: RampProvider;
        paymentMethods: string[];
    }> = {
        africa: {
            popularCurrencies: ["NGN", "KES", "ZAR", "GHS", "UGX"],
            preferredProvider: "paycrest",
            paymentMethods: ["Mobile Money", "Bank Transfer"],
        },
        europe: {
            popularCurrencies: ["EUR", "GBP", "CHF", "SEK", "NOK"],
            preferredProvider: "moonpay",
            paymentMethods: ["Bank Transfer", "Card", "SEPA"],
        },
        "north-america": {
            popularCurrencies: ["USD", "CAD", "MXN"],
            preferredProvider: "moonpay",
            paymentMethods: ["Bank Transfer", "Card", "ACH"],
        },
        "south-america": {
            popularCurrencies: ["BRL", "ARS", "CLP", "COP", "PEN"],
            preferredProvider: "transak",
            paymentMethods: ["Bank Transfer", "PIX", "Card"],
        },
        asia: {
            popularCurrencies: ["CNY", "JPY", "INR", "SGD", "HKD", "PHP", "THB", "VND"],
            preferredProvider: "transak",
            paymentMethods: ["Bank Transfer", "Card", "UPI"],
        },
        oceania: {
            popularCurrencies: ["AUD", "NZD"],
            preferredProvider: "moonpay",
            paymentMethods: ["Bank Transfer", "Card", "POLi"],
        },
        "middle-east": {
            popularCurrencies: ["AED", "SAR", "QAR", "KWD", "BHD"],
            preferredProvider: "transak",
            paymentMethods: ["Bank Transfer", "Card"],
        },
    };

    return recommendations[region] ?? recommendations["north-america"];
}

/**
 * Check if API keys are configured
 */
export function areOfframpKeysConfigured(): {
    moonpay: boolean;
    transak: boolean;
    paycrest: boolean;
} {
    return {
        moonpay: Boolean(extra.moonpayApiKey),
        transak: Boolean(extra.transakApiKey),
        paycrest: Boolean(extra.paycrestApiKey),
    };
}
