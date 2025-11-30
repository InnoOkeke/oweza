import "@walletconnect/react-native-compat";
import { createAppKit } from '@reown/appkit-react-native';
import { EthersAdapter } from '@reown/appkit-ethers-react-native';
import { CELO_CHAIN } from './config/celo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { REOWN_PROJECT_ID, APP_METADATA } from './config/celo';
import * as WebBrowser from 'expo-web-browser';

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

// Configure WebBrowser for OAuth flows
WebBrowser.maybeCompleteAuthSession();

// Create AppKit with email and social authentication enabled
// Reown AppKit v2 for React Native automatically includes:
// - Email authentication (magic link)
// - Social logins (Google, Apple, etc.)
// - Embedded wallet creation
export const appKit = createAppKit({
  projectId,
  networks: [CELO_CHAIN],
  defaultNetwork: CELO_CHAIN,
  adapters: [ethersAdapter],
  storage: storageAdapter,
  metadata: APP_METADATA,
  // Configure to use in-app browser for authentication
  customWallets: [],
  // Reown v2 enables email/social auth by default when projectId is configured
  // Users can sign in with:
  // 1. Email (magic link) - opens in app browser
  // 2. Google OAuth - opens in app browser
  // 3. Apple Sign In - opens in app browser
  // 4. External wallets (MetaMask, etc.)
});
