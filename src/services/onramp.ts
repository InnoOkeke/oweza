import { getAvailableProviders, buildRampUrl, type RampProvider } from "./ramp";

// Onramp provider type with additional metadata
export type OnrampProvider = {
    provider: RampProvider;
    name: string;
    description: string;
    logo: string;
    paymentMethods: string[];
    fees: string;
    processingTime: string;
};

// Region types
export type Region = "africa" | "europe" | "north-america" | "asia" | "latin-america" | "global";

// Region recommendations
type RegionRecommendation = {
    preferredProvider: RampProvider;
    paymentMethods: string[];
    estimatedFees: string;
};

/**
 * Get region from country code
 */
export function getRegionFromCountryCode(countryCode: string): Region {
    const africaCountries = ["NG", "KE", "GH", "ZA", "EG", "TZ", "UG", "RW", "ET", "SN"];
    const europeCountries = ["GB", "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PT", "IE", "FI", "GR"];
    const northAmericaCountries = ["US", "CA"];
    const asiaCountries = ["JP", "CN", "IN", "SG", "KR", "TH", "VN", "ID", "MY"];
    const latinAmericaCountries = ["BR", "MX", "AR", "CL", "CO", "PE"];

    if (africaCountries.includes(countryCode)) return "africa";
    if (europeCountries.includes(countryCode)) return "europe";
    if (northAmericaCountries.includes(countryCode)) return "north-america";
    if (asiaCountries.includes(countryCode)) return "asia";
    if (latinAmericaCountries.includes(countryCode)) return "latin-america";

    return "global";
}

/**
 * Get region-specific recommendations
 */
export function getRegionRecommendations(region: Region): RegionRecommendation {
    const recommendations: Record<Region, RegionRecommendation> = {
        africa: {
            preferredProvider: "transak",
            paymentMethods: ["Mobile Money", "Bank Transfer", "Card"],
            estimatedFees: "3-5%",
        },
        europe: {
            preferredProvider: "moonpay",
            paymentMethods: ["SEPA", "Card", "Bank Transfer"],
            estimatedFees: "1-4%",
        },
        "north-america": {
            preferredProvider: "moonpay",
            paymentMethods: ["Card", "Bank Transfer", "Apple Pay"],
            estimatedFees: "1-4.5%",
        },
        asia: {
            preferredProvider: "transak",
            paymentMethods: ["Card", "Bank Transfer", "UPI"],
            estimatedFees: "2-5%",
        },
        "latin-america": {
            preferredProvider: "transak",
            paymentMethods: ["PIX", "Card", "Bank Transfer"],
            estimatedFees: "3-6%",
        },
        global: {
            preferredProvider: "moonpay",
            paymentMethods: ["Card", "Bank Transfer"],
            estimatedFees: "3-5%",
        },
    };

    return recommendations[region];
}

/**
 * Get available onramp providers with detailed information
 */
export async function getAvailableOnrampProviders(countryCode: string): Promise<OnrampProvider[]> {
    // Get base providers from ramp service
    const baseProviders = await getAvailableProviders("onramp");

    // Map to OnrampProvider with additional metadata
    const providers: OnrampProvider[] = baseProviders.map(provider => {
        switch (provider) {
            case "moonpay":
                return {
                    provider,
                    name: "MoonPay",
                    description: "Fast & secure crypto purchases with cards and bank transfers",
                    logo: "🌙",
                    paymentMethods: ["Credit Card", "Debit Card", "Bank Transfer", "Apple Pay", "Google Pay"],
                    fees: "1-4.5%",
                    processingTime: "5-30 minutes",
                };
            case "transak":
                return {
                    provider,
                    name: "Transak",
                    description: "Buy crypto with 100+ payment methods worldwide",
                    logo: "🔷",
                    paymentMethods: ["Credit Card", "Debit Card", "Bank Transfer", "Mobile Money", "UPI", "PIX"],
                    fees: "2-5%",
                    processingTime: "10-30 minutes",
                };
            default:
                return {
                    provider,
                    name: provider.charAt(0).toUpperCase() + provider.slice(1),
                    description: "Buy crypto securely",
                    logo: "💳",
                    paymentMethods: ["Credit Card", "Bank Transfer"],
                    fees: "3-5%",
                    processingTime: "10-60 minutes",
                };
        }
    });

    return providers;
}

/**
 * Build onramp URL for a specific provider
 */
export async function buildOnrampUrl(
    provider: RampProvider,
    walletAddress: string,
    amount?: string
): Promise<string> {
    return buildRampUrl({
        provider,
        type: "onramp",
        walletAddress,
        assetSymbol: "CUSD",
        destinationNetwork: "celo",
        amount,
    });
}
