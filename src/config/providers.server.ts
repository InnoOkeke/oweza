import { ProviderId } from "../constants/internationalProviders";

type ProviderSecrets = Partial<Record<ProviderId, string>>;

type ProviderSecretMap = {
  apiKeys: ProviderSecrets;
  secretKeys: ProviderSecrets;
};

const normalize = (value?: string | null) => {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "placeholder") {
    return undefined;
  }
  return trimmed;
};

const buildProviderSecrets = (): ProviderSecretMap => {
  const apiKeys: ProviderSecrets = {
    coinbase: normalize(process.env.COINBASE_API_KEY),
    moonpay: normalize(process.env.MOONPAY_API_KEY),
    transak: normalize(process.env.TRANSAK_API_KEY),
    alchemy_pay: normalize(process.env.ALCHEMY_PAY_API_KEY),
    mercuryo: normalize(process.env.MERCURYO_API_KEY),
    paycrest: normalize(process.env.PAYCREST_API_KEY),
    payant: normalize(process.env.PAYANT_API_KEY),
    paybis: normalize(process.env.PAYBIS_API_KEY),
  };

  const secretKeys: ProviderSecrets = {
    moonpay: normalize(process.env.MOONPAY_SECRET_KEY),
    transak: normalize(process.env.TRANSAK_SECRET_KEY),
    paycrest: normalize(process.env.PAYCREST_SECRET_KEY),
  };

  return { apiKeys, secretKeys };
};

const { apiKeys, secretKeys } = buildProviderSecrets();

export const providerApiKeys = apiKeys;
export const providerSecretKeys = secretKeys;

export const getProviderApiKey = (providerId: ProviderId) => providerApiKeys[providerId];
export const getProviderSecretKey = (providerId: ProviderId) => providerSecretKeys[providerId];
export const hasProviderApiKey = (providerId: ProviderId) => Boolean(getProviderApiKey(providerId));
export const hasProviderSecretKey = (providerId: ProviderId) => Boolean(getProviderSecretKey(providerId));
