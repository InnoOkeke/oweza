/**
 * Server-safe Coinbase configuration
 * Contains only constants that don't require Expo/React Native
 */

// Base Network Constants - Using Sepolia Testnet
export const BASE_CHAIN_ID = 84532; // Base Sepolia Testnet
export const BASE_RPC_URL = "https://sepolia.base.org";
export const USDC_TOKEN_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const; // USDC on Base Sepolia
export const USDC_DECIMALS = 6;

// Coinbase Paymaster API
export const PAYMASTER_API_URL = "https://api.developer.coinbase.com/rpc/v1/base-sepolia";
