import { celoSepolia } from 'viem/chains';

// Celo Network Constants - Using Sepolia Testnet
export const CELO_CHAIN_ID = 11142220; // Celo Sepolia
export const CELO_RPC_URL = "https://forno.celo-sepolia.celo-testnet.org";
export const CUSD_TOKEN_ADDRESS = "0xde9e4c3ce781b4ba68120d6261cbad65ce0ab00b" as const; // cUSD on Celo Sepolia
export const CUSD_DECIMALS = 18; // cUSD has 18 decimals, unlike USDC's 6

export const CELO_CHAIN = celoSepolia;
