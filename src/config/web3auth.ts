import Constants from 'expo-constants';
import { celo } from 'viem/chains';

// Read runtime expo config extras first (set in app.config.js), then fall back to hardcoded values.
const expoExtra = (Constants?.expoConfig?.extra ?? {}) as any;

// Web3Auth Configuration
export const WEB3AUTH_CLIENT_ID =
    expoExtra.web3authClientId || process.env.WEB3AUTH_CLIENT_ID || 'BKEyKKYw8w625n-H0CY4KotAfdjt0ehyFvXTcJxNBMlLWCBhRYrzJZHc59pHN6M1TA5pQh-itL23M28smoJxJ_c';

// Redirect configuration for OAuth
export const WEB3AUTH_REDIRECT_URL =
    expoExtra.web3authRedirectUrl || process.env.WEB3AUTH_REDIRECT_URL || 'oweza://auth';

// Web3Auth network - use mainnet for production
export const WEB3AUTH_NETWORK = expoExtra.web3authNetwork || process.env.WEB3AUTH_NETWORK || 'sapphire_mainnet';

// Chain configuration for Web3Auth (use expo extra overrides when available)
export const WEB3AUTH_CHAIN_CONFIG = {
    chainNamespace: 'eip155' as const,
    chainId: expoExtra.web3authChainId || '0x' + celo.id.toString(16),
    rpcTarget: expoExtra.web3authChainRpc || celo.rpcUrls.default.http[0],
    displayName: celo.name,
    blockExplorer: celo.blockExplorers?.default.url || '',
    ticker: celo.nativeCurrency.symbol,
    tickerName: celo.nativeCurrency.name,
};

// Login providers based on platform
export const getLoginProviders = (platform: string) => {
    const baseProviders = ['email_passwordless'];

    if (platform === 'android') {
        return [...baseProviders, 'google'];
    } else if (platform === 'ios') {
        return [...baseProviders, 'apple'];
    }

    return baseProviders;
};
