import "@walletconnect/react-native-compat";
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import { CELO_CHAIN } from './config/celo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REOWN_PROJECT_ID, APP_METADATA } from './config/celo';

// Storage adapter for AppKit
const storageAdapter = {
  async getItem<T = any>(key: string): Promise<T | undefined> {
    const value = await AsyncStorage.getItem(key);
    if (value == null) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as unknown as T;
    }
  },
  async setItem<T = any>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },
  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
  async getKeys(): Promise<string[]> {
    const keys = await AsyncStorage.getAllKeys();
    return keys.slice(); // Convert readonly array to mutable array
  },
  async getEntries<T = any>(): Promise<[string, T][]> {
    const keys = await AsyncStorage.getAllKeys();
    const entries = await AsyncStorage.multiGet(keys);
    return entries.map(([key, value]) => {
      let parsed: T;
      try {
        parsed = value ? JSON.parse(value) : undefined;
      } catch {
        parsed = value as unknown as T;
      }
      return [key, parsed];
    });
  },
};

const projectId = REOWN_PROJECT_ID;

const ethersAdapter = new EthersAdapter();

export const appKit = createAppKit({
  projectId,
  networks: [CELO_CHAIN],
  defaultNetwork: CELO_CHAIN,
  adapters: [ethersAdapter],
  storage: storageAdapter,
  metadata: APP_METADATA,
  // Note: Social login features are experimental and may not work properly
  // Users should connect with WalletConnect-compatible wallets
});
