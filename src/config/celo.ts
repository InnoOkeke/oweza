import { celoSepolia } from 'viem/chains';

// Celo Network Constants - Using Sepolia Testnet
export const CELO_CHAIN_ID = 11142220; // Celo Sepolia
export const CELO_RPC_URL = "https://forno.celo-sepolia.celo-testnet.org";
export const CUSD_TOKEN_ADDRESS = "0xA99dC247d6b7B2E3ab48a1fEE101b83cD6aCd82a" as const; // cUSD on Celo Sepolia
export const CUSD_DECIMALS = 18; // cUSD has 18 decimals, unlike USDC's 6

// Reown AppKit Configuration
export const REOWN_PROJECT_ID = 'e3cdce8b52918105b472fccabf0ba198';

// Metadata for AppKit
export const APP_METADATA = {
  name: 'Oweza',
  description: 'Oweza Celo App',
  url: 'https://oweza.com',
  icons: ['https://oweza.com/icon.png'],
  redirect: {
    native: 'oweza://',
    universal: 'https://oweza.com',
  },
};

export const CELO_CHAIN = celoSepolia;
