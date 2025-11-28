export type RegionCode =
  | "global"
  | "north-america"
  | "europe"
  | "latin-america"
  | "asia"
  | "africa";

export const PAYOUT_METHODS = [
  "bank_account",
  "mobile_money",
  "cash_pickup",
  "crypto_wallet",
] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const FUNDING_METHODS = [
  "ach",
  "bank_transfer",
  "debit_card",
  "credit_card",
  "crypto_wallet",
] as const;
export type FundingMethod = (typeof FUNDING_METHODS)[number];

export type ProviderId =
  | "coinbase"
  | "moonpay"
  | "transak"
  | "alchemy_pay"
  | "mercuryo"
  | "paycrest"
  | "payant"
  | "paybis";

export type SettlementSpeed = "instant" | "same_day" | "one_to_three_days";

export const FX_RATES: Record<string, number> = {
  USD: 1,
  CAD: 1.36,
  GBP: 0.82,
  EUR: 0.93,
  NGN: 1580,
  GHS: 12.4,
  KES: 150,
  UGX: 3800,
  XAF: 618,
  ZAR: 18.7,
  BRL: 5.2,
  MXN: 17,
  COP: 4090,
  ARS: 855,
  PEN: 3.7,
  CLP: 930,
  INR: 83,
  PHP: 56,
  IDR: 15600,
  VND: 24700,
  SGD: 1.34,
  JPY: 151,
  CNY: 7.2,
};

export const SETTLEMENT_SPEED_HOURS: Record<SettlementSpeed, number> = {
  instant: 1,
  same_day: 8,
  one_to_three_days: 72,
};

export type ProviderConfig = {
  id: ProviderId;
  name: string;
  description: string;
  regions: RegionCode[];
  countries: string[]; // ISO alpha-2
  payoutMethods: PayoutMethod[];
  fundingMethods: FundingMethod[];
  supportedCurrencies: string[];
  minAmountUsd: number;
  maxAmountUsd: number;
  baseFeeBps: number; // basis points (hundredths of a percent)
  flatFeeUsd: number;
  speed: SettlementSpeed;
  allowsInAppFlow: boolean;
  status: "live" | "placeholder";
};

export type CountryMetadata = {
  code: string;
  name: string;
  region: RegionCode;
  currency: string;
  mobileMoneyAvailable?: boolean;
};

export const SUPPORTED_COUNTRIES: CountryMetadata[] = [
  { code: "US", name: "United States", region: "north-america", currency: "USD" },
  { code: "CA", name: "Canada", region: "north-america", currency: "CAD" },
  { code: "GB", name: "United Kingdom", region: "europe", currency: "GBP" },
  { code: "DE", name: "Germany", region: "europe", currency: "EUR" },
  { code: "FR", name: "France", region: "europe", currency: "EUR" },
  { code: "ES", name: "Spain", region: "europe", currency: "EUR" },
  { code: "IT", name: "Italy", region: "europe", currency: "EUR" },
  { code: "NG", name: "Nigeria", region: "africa", currency: "NGN", mobileMoneyAvailable: true },
  { code: "GH", name: "Ghana", region: "africa", currency: "GHS", mobileMoneyAvailable: true },
  { code: "KE", name: "Kenya", region: "africa", currency: "KES", mobileMoneyAvailable: true },
  { code: "ZA", name: "South Africa", region: "africa", currency: "ZAR" },
  { code: "UG", name: "Uganda", region: "africa", currency: "UGX", mobileMoneyAvailable: true },
  { code: "CM", name: "Cameroon", region: "africa", currency: "XAF", mobileMoneyAvailable: true },
  { code: "BR", name: "Brazil", region: "latin-america", currency: "BRL" },
  { code: "MX", name: "Mexico", region: "latin-america", currency: "MXN" },
  { code: "CO", name: "Colombia", region: "latin-america", currency: "COP" },
  { code: "AR", name: "Argentina", region: "latin-america", currency: "ARS" },
  { code: "PE", name: "Peru", region: "latin-america", currency: "PEN" },
  { code: "CL", name: "Chile", region: "latin-america", currency: "CLP" },
  { code: "IN", name: "India", region: "asia", currency: "INR" },
  { code: "PH", name: "Philippines", region: "asia", currency: "PHP" },
  { code: "ID", name: "Indonesia", region: "asia", currency: "IDR" },
  { code: "VN", name: "Vietnam", region: "asia", currency: "VND" },
  { code: "SG", name: "Singapore", region: "asia", currency: "SGD" },
  { code: "JP", name: "Japan", region: "asia", currency: "JPY" },
  { code: "CN", name: "China", region: "asia", currency: "CNY" },
];

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "coinbase",
    name: "Coinbase International",
    description: "Native Coinbase off-ramp and remittance rails",
    regions: ["global"],
    countries: SUPPORTED_COUNTRIES.map((country) => country.code),
    payoutMethods: ["bank_account", "crypto_wallet"],
    fundingMethods: ["crypto_wallet", "bank_transfer", "ach"],
    supportedCurrencies: ["USD", "EUR", "GBP", "NGN", "GHS", "KES", "BRL", "MXN", "INR"],
    minAmountUsd: 1,
    maxAmountUsd: 25000,
    baseFeeBps: 90,
    flatFeeUsd: 0,
    speed: "one_to_three_days",
    allowsInAppFlow: true,
    status: "live",
  },
  {
    id: "moonpay",
    name: "MoonPay",
    description: "Card and bank payouts across 160+ countries",
    regions: ["north-america", "europe", "latin-america", "asia"],
    countries: ["US", "CA", "GB", "DE", "FR", "ES", "IT", "BR", "MX", "AR", "PE", "CL", "IN", "PH", "VN"],
    payoutMethods: ["bank_account", "crypto_wallet"],
    fundingMethods: ["debit_card", "credit_card", "bank_transfer"],
    supportedCurrencies: ["USD", "EUR", "GBP", "BRL", "MXN", "INR"],
    minAmountUsd: 10,
    maxAmountUsd: 5000,
    baseFeeBps: 150,
    flatFeeUsd: 1.99,
    speed: "instant",
    allowsInAppFlow: true,
    status: "live",
  },
  {
    id: "transak",
    name: "Transak",
    description: "Regional fiat ramps with mobile money support",
    regions: ["africa", "asia", "europe", "latin-america"],
    countries: ["NG", "GH", "KE", "UG", "CM", "ZA", "IN", "PH", "ID", "VN", "BR", "MX"],
    payoutMethods: ["bank_account", "mobile_money", "crypto_wallet"],
    fundingMethods: ["bank_transfer", "debit_card", "credit_card"],
    supportedCurrencies: ["NGN", "GHS", "KES", "UGX", "XAF", "ZAR", "INR", "PHP", "IDR", "VND", "BRL", "MXN"],
    minAmountUsd: 5,
    maxAmountUsd: 15000,
    baseFeeBps: 130,
    flatFeeUsd: 0.5,
    speed: "same_day",
    allowsInAppFlow: true,
    status: "live",
  },
  {
    id: "alchemy_pay",
    name: "Alchemy Pay",
    description: "Enterprise fiat-to-crypto hub for APAC and LATAM",
    regions: ["asia", "latin-america", "europe"],
    countries: ["SG", "ID", "VN", "JP", "CN", "BR", "MX", "CO", "DE", "FR"],
    payoutMethods: ["bank_account", "crypto_wallet"],
    fundingMethods: ["bank_transfer", "debit_card"],
    supportedCurrencies: ["SGD", "IDR", "VND", "JPY", "CNY", "BRL", "MXN", "COP", "EUR"],
    minAmountUsd: 50,
    maxAmountUsd: 30000,
    baseFeeBps: 110,
    flatFeeUsd: 2,
    speed: "same_day",
    allowsInAppFlow: true,
    status: "placeholder",
  },
  {
    id: "mercuryo",
    name: "Mercuryo",
    description: "Card-focused payouts for US, EU, LATAM",
    regions: ["north-america", "europe", "latin-america"],
    countries: ["US", "CA", "GB", "DE", "FR", "ES", "IT", "BR", "MX", "AR"],
    payoutMethods: ["bank_account", "crypto_wallet"],
    fundingMethods: ["debit_card", "credit_card"],
    supportedCurrencies: ["USD", "EUR", "GBP", "BRL", "MXN"],
    minAmountUsd: 20,
    maxAmountUsd: 7500,
    baseFeeBps: 140,
    flatFeeUsd: 2.5,
    speed: "instant",
    allowsInAppFlow: true,
    status: "placeholder",
  },
  {
    id: "paycrest",
    name: "Paycrest",
    description: "African settlement network (bank + mobile money)",
    regions: ["africa"],
    countries: ["NG", "GH", "KE", "UG", "CM", "ZA"],
    payoutMethods: ["bank_account", "mobile_money"],
    fundingMethods: ["ach", "bank_transfer"],
    supportedCurrencies: ["NGN", "GHS", "KES", "UGX", "XAF", "ZAR"],
    minAmountUsd: 1,
    maxAmountUsd: 10000,
    baseFeeBps: 80,
    flatFeeUsd: 0.25,
    speed: "same_day",
    allowsInAppFlow: true,
    status: "live",
  },
  {
    id: "payant",
    name: "Payant",
    description: "Nigeria-focused payouts (bank + mobile money)",
    regions: ["africa"],
    countries: ["NG", "GH", "KE"],
    payoutMethods: ["bank_account", "mobile_money"],
    fundingMethods: ["bank_transfer", "ach"],
    supportedCurrencies: ["NGN", "GHS", "KES"],
    minAmountUsd: 1,
    maxAmountUsd: 5000,
    baseFeeBps: 70,
    flatFeeUsd: 0.2,
    speed: "instant",
    allowsInAppFlow: true,
    status: "placeholder",
  },
  {
    id: "paybis",
    name: "Paybis",
    description: "Global cards with fast settlements",
    regions: ["global"],
    countries: SUPPORTED_COUNTRIES.map((country) => country.code),
    payoutMethods: ["bank_account", "crypto_wallet"],
    fundingMethods: ["debit_card", "credit_card"],
    supportedCurrencies: ["USD", "EUR", "GBP", "NGN", "KES", "INR"],
    minAmountUsd: 15,
    maxAmountUsd: 20000,
    baseFeeBps: 160,
    flatFeeUsd: 3,
    speed: "instant",
    allowsInAppFlow: true,
    status: "placeholder",
  },
];
