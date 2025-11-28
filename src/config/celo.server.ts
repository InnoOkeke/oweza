/**
 * Server-safe Celo configuration
 * Contains only constants that don't require Expo/React Native
 */

// Celo Network Constants - Using Sepolia Testnet
export const CELO_CHAIN_ID = 11142220; // Celo Sepolia Testnet
export const CELO_RPC_URL = "https://forno.celo-sepolia.celo-testnet.org";
export const CUSD_TOKEN_ADDRESS = "0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a" as const; // cUSD on Celo Sepolia
export const CUSD_DECIMALS = 18;

// Paymaster API - Placeholder or Celo specific if applicable
// For Celo, we often use the feeCurrency field, but for server-side sponsorship, we might need a specific provider.
// Leaving as placeholder or reusing Coinbase if compatible (unlikely for Celo native).
export const PAYMASTER_API_URL = ""; 
