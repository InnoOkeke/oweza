import Constants from 'expo-constants';

export const CIRCLE_API_KEY = Constants?.expoConfig?.extra?.circleApiKey || 'TEST_API_KEY:057a0d954d6cf4e928bc81ef6260b363:d00b829867e430f09d861d6e3ff372d8';

export const CIRCLE_CONFIG = {
    apiKey: CIRCLE_API_KEY,
    environment: 'testnet' as const,
    // Base Sepolia for testing
    chain: 'BASE-SEPOLIA' as const,
};

// Circle API endpoints
export const CIRCLE_API_URL = 'https://api-sandbox.circle.com/v1/w3s';
