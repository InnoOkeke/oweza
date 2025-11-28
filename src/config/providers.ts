import Constants from "expo-constants";

export type ProviderKeyMap = {
  coinbaseApiKey?: string;
  moonpayApiKey?: string;
  moonpaySecretKey?: string;
  transakApiKey?: string;
  transakSecretKey?: string;
  paycrestApiKey?: string;
  paycrestSecretKey?: string;
  alchemyPayApiKey?: string;
  mercuryoApiKey?: string;
  payantApiKey?: string;
  paybisApiKey?: string;
};

type ExpoExtra = ProviderKeyMap;

const extra = (Constants?.expoConfig?.extra ?? {}) as ExpoExtra;

export const PROVIDER_KEYS: Required<ProviderKeyMap> = {
  coinbaseApiKey: extra.coinbaseApiKey ?? "",
  moonpayApiKey: extra.moonpayApiKey ?? "",
  moonpaySecretKey: extra.moonpaySecretKey ?? "",
  transakApiKey: extra.transakApiKey ?? "",
  transakSecretKey: extra.transakSecretKey ?? "",
  paycrestApiKey: extra.paycrestApiKey ?? "",
  paycrestSecretKey: extra.paycrestSecretKey ?? "",
  alchemyPayApiKey: extra.alchemyPayApiKey ?? "",
  mercuryoApiKey: extra.mercuryoApiKey ?? "",
  payantApiKey: extra.payantApiKey ?? "",
  paybisApiKey: extra.paybisApiKey ?? "",
};

export const getProviderKey = (key: keyof ProviderKeyMap) => PROVIDER_KEYS[key] ?? "";
