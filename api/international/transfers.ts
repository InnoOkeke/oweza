import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import {
  PROVIDERS,
  ProviderId,
  CountryMetadata,
  PayoutMethod,
  FundingMethod,
  PAYOUT_METHODS,
  FUNDING_METHODS,
  RegionCode,
} from "../../src/constants/internationalProviders";
import {
  getProviderApiKey,
  getProviderSecretKey,
} from "../../src/config/providers.server";

const authorize = (req: VercelRequest): boolean => {
  const authHeader = req.headers.authorization;
  return Boolean(authHeader && authHeader === `Bearer ${process.env.METASEND_API_KEY}`);
};

const recipientSchema = z.object({
  fullName: z.string().optional(),
  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  iban: z.string().optional(),
  swift: z.string().optional(),
  mobileWalletProvider: z.string().optional(),
  mobileNumber: z.string().optional(),
  email: z.string().optional(),
});

const REGION_VALUES: [RegionCode, ...RegionCode[]] = [
  "global",
  "north-america",
  "europe",
  "latin-america",
  "asia",
  "africa",
];
const regionSchema: z.ZodType<RegionCode> = z.enum(REGION_VALUES);

const countrySchema = z
  .object({
    code: z.string(),
    name: z.string(),
    region: regionSchema,
    currency: z.string(),
    mobileMoneyAvailable: z.boolean().optional(),
  })
  .strict() as z.ZodType<CountryMetadata>;

const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id) as [ProviderId, ...ProviderId[]];

const TransferSchema = z.object({
  destinationCountry: countrySchema,
  amountUsd: z.number().positive(),
  providerId: z.enum(PROVIDER_IDS),
  payoutMethod: z.enum(PAYOUT_METHODS),
  fundingMethod: z.enum(FUNDING_METHODS),
  recipientDetails: recipientSchema.optional(),
  note: z.string().optional(),
});

type TransferPayload = z.infer<typeof TransferSchema>;

type TransferSubmissionResult = {
  id: string;
  status: "processing" | "completed" | "failed";
  providerId: ProviderId;
  trackingUrl?: string;
  referenceCode?: string;
};

const badRequest = (res: VercelResponse, message: string) =>
  res.status(400).json({ success: false, error: message });

const ensureAuthorized = (req: VercelRequest, res: VercelResponse) => {
  if (!authorize(req)) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return false;
  }
  return true;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  if (!ensureAuthorized(req, res)) {
    return;
  }

  const parsed = TransferSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.message);
  }

  try {
    const result = await submitInternationalTransfer(parsed.data);
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("❌ International transfer submission failed", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
}

async function submitInternationalTransfer(payload: TransferPayload): Promise<TransferSubmissionResult> {
  const provider = PROVIDERS.find((entry) => entry.id === payload.providerId);
  if (!provider) {
    throw new Error("Unknown provider");
  }

  const apiKey = getProviderApiKey(payload.providerId);
  if (!apiKey) {
    return simulateSubmission(payload.providerId, "provider-key-missing");
  }

  switch (payload.providerId) {
    case "moonpay":
      await confirmMoonpayAvailability(apiKey, payload.destinationCountry, payload.amountUsd);
      return buildResult("moonpay", "MoonPay", "https://dashboard.moonpay.com/transactions");
    case "transak":
      await confirmTransakAvailability(
        apiKey,
        getProviderSecretKey("transak"),
        payload.destinationCountry,
        payload.amountUsd,
        payload.fundingMethod,
      );
      return buildResult("transak", "Transak", "https://global.transak.com/dashboard/transactions");
    case "paycrest":
      await confirmPaycrestAvailability(
        apiKey,
        getProviderSecretKey("paycrest"),
        payload.destinationCountry,
        payload.amountUsd,
        payload.payoutMethod,
      );
      return buildResult("paycrest", "Paycrest", "https://merchant.paycrest.io/transactions");
    case "celo":
      return buildResult("celo", "Celo", "https://explorer.celo.org");
    default:
      return simulateSubmission(payload.providerId, "placeholder-provider");
  }
}

function buildResult(providerId: ProviderId, label: string, trackingUrl?: string): TransferSubmissionResult {
  return {
    id: `${providerId}_${Date.now()}`,
    status: "processing",
    providerId,
    trackingUrl,
    referenceCode: `${label.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  };
}

function simulateSubmission(providerId: ProviderId, reason: string): TransferSubmissionResult {
  return {
    id: `sim_${providerId}_${Date.now()}`,
    status: "processing",
    providerId,
    referenceCode: reason,
  };
}

async function confirmMoonpayAvailability(apiKey: string, country: CountryMetadata, amountUsd: number) {
  const url = new URL("https://api.moonpay.com/v3/currencies/usdc/sell_quote");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("baseCurrencyAmount", amountUsd.toString());
  url.searchParams.set("baseCurrencyCode", "usd");
  url.searchParams.set("quoteCurrencyCode", country.currency.toLowerCase());

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`MoonPay availability check failed: ${response.status}`);
  }
}

async function confirmTransakAvailability(
  apiKey: string,
  secretKey: string | undefined,
  country: CountryMetadata,
  amountUsd: number,
  fundingMethod?: FundingMethod,
) {
  const url = new URL("https://staging-api.transak.com/api/v1/price");
  url.searchParams.set("fiatCurrency", "USD");
  url.searchParams.set("cryptoCurrency", "USDC");
  url.searchParams.set("isBuyOrSell", "SELL");
  url.searchParams.set("fiatAmount", amountUsd.toString());
  url.searchParams.set("paymentMethod", mapFundingMethod(fundingMethod));
  url.searchParams.set("countryCode", country.code);

  const response = await fetch(url.toString(), {
    headers: {
      "apiKey": apiKey,
      "secretKey": secretKey ?? "",
    },
  });

  if (!response.ok) {
    throw new Error(`Transak availability failed: ${response.status}`);
  }
}

async function confirmPaycrestAvailability(
  apiKey: string,
  secretKey: string | undefined,
  country: CountryMetadata,
  amountUsd: number,
  payoutMethod: PayoutMethod,
) {
  const response = await fetch("https://sandbox.paycrest.io/api/v1/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "x-api-secret": secretKey ?? "",
    },
    body: JSON.stringify({
      amount: amountUsd,
      sourceCurrency: "USD",
      destinationCurrency: country.currency,
      payoutMethod,
    }),
  });

  if (!response.ok) {
    throw new Error(`Paycrest availability failed: ${response.status}`);
  }
}

function mapFundingMethod(method?: FundingMethod) {
  switch (method) {
    case "debit_card":
    case "credit_card":
      return "credit_debit_card";
    case "ach":
      return "ach_transfer";
    case "bank_transfer":
    default:
      return "bank_transfer";
  }
}
