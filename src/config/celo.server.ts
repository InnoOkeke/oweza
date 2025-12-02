/**
 * Server-safe Celo configuration
 * Contains only constants that don't require Expo/React Native
 */

// Celo Network Constants - Using Sepolia Testnet
export const CELO_CHAIN_ID = 11142220; // Celo Sepolia Testnet
export const CELO_RPC_URL = "https://forno.celo-sepolia.celo-testnet.org";
export const CUSD_TOKEN_ADDRESS = "0xde9e4c3ce781b4ba68120d6261cbad65ce0ab00b" as const; // cUSD on Celo Sepolia
export const CUSD_DECIMALS = 18;

// Paymaster API - Placeholder or Celo specific if applicable
// For Celo, we often use the feeCurrency field, but for server-side sponsorship, we might need a specific provider.
// Leaving as placeholder or reusing Coinbase if compatible (unlikely for Celo native).
export const PAYMASTER_API_URL = ""; 
