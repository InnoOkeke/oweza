import * as SecureStore from "expo-secure-store";
import { CdpClient } from "@coinbase/cdp-sdk";

export const SESSION_STORAGE_KEY = "metasend.coinbase.session";

// Initialize CDP client
const cdp = new CdpClient();

export type CoinbaseSignInStrategy = "email" | "social";

export type EmbeddedWalletProfile = {
  userId: string;
  email: string;
  walletAddress: string;
  accountName: string;
  displayName?: string;
  photoUrl?: string;
};

export type CoinbaseSession = {
  accountAddress: string;
  accountName: string;
  createdAt: number;
};

export type CoinbaseSessionPayload = {
  session: CoinbaseSession;
  profile: EmbeddedWalletProfile;
};

export type StartSessionInput = {
  email: string;
  strategy?: CoinbaseSignInStrategy;
  displayName?: string;
};

export async function startEmbeddedWalletSession(
  input: StartSessionInput
): Promise<CoinbaseSessionPayload> {
  return createEmbeddedWallet(input);
}

export async function persistSession(session: CoinbaseSession, profile: EmbeddedWalletProfile): Promise<void> {
  await SecureStore.setItemAsync(
    SESSION_STORAGE_KEY,
    JSON.stringify({ session, profile } satisfies CoinbaseSessionPayload)
  );
}

export async function loadCachedSession(): Promise<CoinbaseSessionPayload | null> {
  const raw = await SecureStore.getItemAsync(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CoinbaseSessionPayload;
    return parsed;
  } catch (err) {
    console.warn("Failed to parse cached Coinbase session", err);
    await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
    return null;
  }
}

export async function removeCachedSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_STORAGE_KEY);
}

export async function revokeCoinbaseSession(session: CoinbaseSession): Promise<void> {
  // Session is stored locally only, no server-side revocation needed
  console.log("Revoking session for account:", session.accountAddress);
}

async function createEmbeddedWallet(input: StartSessionInput): Promise<CoinbaseSessionPayload> {
  try {
    // Generate a unique account name based on email
    const accountName = `${input.email.split('@')[0]}-${Date.now()}`;
    
    // Create a server-managed EVM account using CDP SDK
    const account = await cdp.evm.getOrCreateAccount({ name: accountName });
    
    const userId = generateUserId(input.email);
    
    const session: CoinbaseSession = {
      accountAddress: account.address,
      accountName: accountName,
      createdAt: Date.now(),
    };
    
    const profile: EmbeddedWalletProfile = {
      userId,
      email: input.email,
      walletAddress: account.address,
      accountName: accountName,
      displayName: input.displayName || input.email.split('@')[0],
    };
    
    return { session, profile };
  } catch (error) {
    console.error("Failed to create embedded wallet:", error);
    throw new Error("Unable to create wallet. Please try again.");
  }
}

function generateUserId(email: string): string {
  // Generate a deterministic user ID from email
  return `user_${Buffer.from(email).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)}`;
}
