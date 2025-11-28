import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
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
  PAYOUT_METHODS,
  FUNDING_METHODS,
} from "../../src/constants/internationalProviders";

const authorize = (req: VercelRequest): boolean => {
  const authHeader = req.headers.authorization;
  return Boolean(authHeader && authHeader === `Bearer ${process.env.METASEND_API_KEY}`);
};

const QuoteSchema = z.object({
  countryCode: z.string().length(2),
  amountUsd: z.number().positive(),
  payoutMethod: z.enum(PAYOUT_METHODS).optional(),
  fundingMethod: z.enum(FUNDING_METHODS).optional(),
});

const providerKeyMap: Partial<Record<ProviderId, string>> = {
  coinbase: process.env.COINBASE_API_KEY,
  moonpay: process.env.MOONPAY_API_KEY,
  transak: process.env.TRANSAK_API_KEY,
  alchemy_pay: process.env.ALCHEMY_PAY_API_KEY,
  mercuryo: process.env.MERCURYO_API_KEY,
  paycrest: process.env.PAYCREST_API_KEY,
  payant: process.env.PAYANT_API_KEY,
  paybis: process.env.PAYBIS_API_KEY,
};

const providerSecretMap: Partial<Record<ProviderId, string | undefined>> = {
  moonpay: process.env.MOONPAY_SECRET_KEY,
  transak: process.env.TRANSAK_SECRET_KEY,
  paycrest: process.env.PAYCREST_SECRET_KEY,
};

type QuoteContext = z.infer<typeof QuoteSchema> & { country: CountryMetadata };

type ProviderQuote = {
  provider: ProviderConfig;
  totalFeeUsd: number;
  fxRate: number;
  deliveryEtaHours: number;
  score: number;
};

const responseOk = (res: VercelResponse, quotes: ProviderQuote[]) =>
  res.status(200).json({ success: true, quotes });

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

  const parsed = QuoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return badRequest(res, parsed.error.message);
  }

  const country = SUPPORTED_COUNTRIES.find((entry) => entry.code === parsed.data.countryCode);
  if (!country) {
    return badRequest(res, "Unsupported destination country");
  }

  try {
    const quotes = await buildQuotes({ ...parsed.data, country });
    return responseOk(res, quotes);
  } catch (error) {
    console.error("❌ Failed to build international quotes", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Internal error",
    });
  }
}

async function buildQuotes(context: QuoteContext): Promise<ProviderQuote[]> {
  const providers = PROVIDERS.filter((provider) => provider.countries.includes(context.country.code));
  const results = await Promise.all(
    providers.map((provider) => buildQuoteForProvider(provider, context))
  );

  return results
    .filter((quote): quote is ProviderQuote => Boolean(quote))
    .sort((a, b) => b.score - a.score);
}

function buildFallbackQuote(
  provider: ProviderConfig,
  context: QuoteContext
): ProviderQuote {
  const fee = calculateFee(provider, context.amountUsd);
  const fxRate = getFxRate(context.country);
  const deliveryEtaHours = SETTLEMENT_SPEED_HOURS[provider.speed];
  const score = scoreProvider(provider, context.amountUsd, context.payoutMethod, context.fundingMethod);

  return { provider, totalFeeUsd: fee, fxRate, deliveryEtaHours, score };
}

const hasRealKey = (value?: string | null) => Boolean(value && value !== "placeholder");

async function buildQuoteForProvider(
  provider: ProviderConfig,
  context: QuoteContext
): Promise<ProviderQuote | undefined> {
  const fallback = buildFallbackQuote(provider, context);
  const apiKey = providerKeyMap[provider.id];

  if (!hasRealKey(apiKey)) {
    return fallback;
  }

  try {
    switch (provider.id) {
      case "moonpay":
        return await fetchMoonpayQuote(provider, context, fallback);
      case "transak":
        return await fetchTransakQuote(provider, context, fallback);
      case "paycrest":
        return await fetchPaycrestQuote(provider, context, fallback);
      case "coinbase":
        return { ...fallback, totalFeeUsd: Math.max(fallback.totalFeeUsd - 0.5, 0) };
      default:
        return fallback;
    }
  } catch (error) {
    console.warn(`⚠️ Quote fallback for ${provider.id}:`, (error as Error).message);
    return fallback;
  }
}

function calculateFee(provider: ProviderConfig, amountUsd: number) {
  const percentageFee = (provider.baseFeeBps / 10000) * amountUsd;
  return provider.flatFeeUsd + percentageFee;
}

function scoreProvider(
  provider: ProviderConfig,
  amountUsd: number,
  payoutMethod?: PayoutMethod,
  fundingMethod?: FundingMethod
) {
  let score = 0;

  if (payoutMethod && provider.payoutMethods.includes(payoutMethod)) {
    score += 25;
  }

  if (fundingMethod && provider.fundingMethods.includes(fundingMethod)) {
    score += 15;
  }

  const fee = calculateFee(provider, amountUsd);
  score += Math.max(0, 40 - fee);

  const speedHours = SETTLEMENT_SPEED_HOURS[provider.speed];
  score += Math.max(0, 20 - speedHours / 4);

  if (provider.status === "live") {
    score += 10;
  }

  return score;
}

function getFxRate(country: CountryMetadata) {
  return FX_RATES[country.currency] ?? 1;
}

async function fetchMoonpayQuote(
  provider: ProviderConfig,
  context: QuoteContext,
  fallback: ProviderQuote
): Promise<ProviderQuote> {
  const apiKey = providerKeyMap.moonpay;
  if (!hasRealKey(apiKey)) {
    return fallback;
  }
  const key = apiKey as string;

  const url = new URL("https://api.moonpay.com/v3/currencies/usdc/sell_quote");
  url.searchParams.set("apiKey", key);
  url.searchParams.set("baseCurrencyAmount", context.amountUsd.toString());
  url.searchParams.set("baseCurrencyCode", "usd");
  url.searchParams.set("quoteCurrencyCode", context.country.currency.toLowerCase());

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`MoonPay quote failed: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const fee = typeof data.feeAmount === "number" ? data.feeAmount : fallback.totalFeeUsd;
  const quoteAmount = typeof data.quoteCurrencyAmount === "number"
    ? data.quoteCurrencyAmount
    : context.amountUsd * fallback.fxRate;
  const fxRate = quoteAmount / context.amountUsd;
  const eta = typeof data.estimatedTimeMinutes === "number"
    ? Math.max(1, data.estimatedTimeMinutes / 60)
    : fallback.deliveryEtaHours;

  return {
    ...fallback,
    totalFeeUsd: fee,
    fxRate,
    deliveryEtaHours: eta,
  };
}

async function fetchTransakQuote(
  provider: ProviderConfig,
  context: QuoteContext,
  fallback: ProviderQuote
): Promise<ProviderQuote> {
  const apiKey = providerKeyMap.transak;
  if (!hasRealKey(apiKey)) {
    return fallback;
  }

  const url = new URL("https://staging-api.transak.com/api/v1/price");
  url.searchParams.set("fiatCurrency", "USD");
  url.searchParams.set("cryptoCurrency", "USDC");
  url.searchParams.set("isBuyOrSell", "SELL");
  url.searchParams.set("paymentMethod", mapFundingMethod(context.fundingMethod));
  url.searchParams.set("fiatAmount", context.amountUsd.toString());
  url.searchParams.set("countryCode", context.country.code);

  const response = await fetch(url.toString(), {
    headers: {
      "apiKey": apiKey as string,
      "secretKey": hasRealKey(providerSecretMap.transak) ? (providerSecretMap.transak as string) : "",
    },
  });

  if (!response.ok) {
    throw new Error(`Transak quote failed: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const fee = typeof data.data?.fee === "number" ? data.data.fee : fallback.totalFeeUsd;
  const payout = typeof data.data?.payoutAmount === "number"
    ? data.data.payoutAmount
    : context.amountUsd * fallback.fxRate;
  const fxRate = payout / context.amountUsd;

  return {
    ...fallback,
    totalFeeUsd: fee,
    fxRate,
  };
}

async function fetchPaycrestQuote(
  provider: ProviderConfig,
  context: QuoteContext,
  fallback: ProviderQuote
): Promise<ProviderQuote> {
  const apiKey = providerKeyMap.paycrest;
  if (!hasRealKey(apiKey)) {
    return fallback;
  }

  const response = await fetch("https://sandbox.paycrest.io/api/v1/quotes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey as string,
      "x-api-secret": hasRealKey(providerSecretMap.paycrest) ? (providerSecretMap.paycrest as string) : "",
    },
    body: JSON.stringify({
      amount: context.amountUsd,
      sourceCurrency: "USD",
      destinationCurrency: context.country.currency,
      payoutMethod: context.payoutMethod ?? "bank_account",
    }),
  });

  if (!response.ok) {
    throw new Error(`Paycrest quote failed: ${response.status}`);
  }

  const data = (await response.json()) as any;
  const fee = typeof data.fee === "number" ? data.fee : fallback.totalFeeUsd;
  const fxRate = typeof data.fxRate === "number" ? data.fxRate : fallback.fxRate;
  const eta = typeof data.etaHours === "number" ? data.etaHours : fallback.deliveryEtaHours;

  return {
    ...fallback,
    totalFeeUsd: fee,
    fxRate,
    deliveryEtaHours: eta,
  };
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
