import { celo } from 'viem/chains';

// Celo Network Constants - Mainnet
export const CELO_CHAIN_ID = 42220; // Celo Mainnet
export const CELO_RPC_URL = "https://forno.celo.org";
export const CUSD_TOKEN_ADDRESS = "0x765DE816845861e75A25fCA122bb6898B8B1282a" as const; // cUSD on Celo Mainnet
export const CUSD_DECIMALS = 18; // cUSD has 18 decimals

export const CELO_CHAIN = celo;

