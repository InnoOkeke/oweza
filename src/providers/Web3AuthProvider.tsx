import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform } from 'react-native';
import Web3Auth, { LOGIN_PROVIDER } from '@web3auth/react-native-sdk';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import Constants, { AppOwnership } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { createWalletClient, createPublicClient, custom, http, parseEther, Address } from 'viem';
import { celoSepolia } from 'viem/chains';
import { ethers } from 'ethers';
import { WEB3AUTH_CLIENT_ID, WEB3AUTH_CHAIN_CONFIG, WEB3AUTH_REDIRECT_URL, WEB3AUTH_NETWORK, getLoginProviders } from '../config/web3auth';
import { CUSD_TOKEN_ADDRESS } from '../config/celo';
import { registerUser } from '../services/api';

const queryClient = new QueryClient();

export type UserProfile = {
    userId: string;
    email: string;
    walletAddress: string;
    displayName?: string;
    photoUrl?: string;
    username?: string;
};

export type AuthContextValue = {
    walletAddress: string | null;
    profile: UserProfile | null;
    isConnected: boolean;
    loading: boolean;
    login: (provider?: string, email?: string) => Promise<void>;
    logout: () => Promise<void>;
    error: string | null;
    openAppKit: () => void;  // Keep for compatibility
    sendUserOperation: (calls: any[]) => Promise<{ userOperationHash: string }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthProviderContent: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);
    const [walletAddress, setWalletAddress] = useState<string | null>(null);

    // Initialize Web3Auth
    useEffect(() => {
        // Handle deep links for Web3Auth redirects
        const handleUrl = (event: { url: string }) => {
            console.log('🔗 Deep link received:', event.url);
            // Web3Auth should handle the redirect internally
        };

        const subscription = Linking.addEventListener('url', handleUrl);

        const init = async () => {
            try {
                console.log('🔧 Web3Auth runtime config:', {
                    WEB3AUTH_CLIENT_ID,
                    WEB3AUTH_REDIRECT_URL,
                    WEB3AUTH_NETWORK,
                    WEB3AUTH_CHAIN_CONFIG: WEB3AUTH_CHAIN_CONFIG && Object.keys(WEB3AUTH_CHAIN_CONFIG),
                    Web3AuthType: typeof Web3Auth,
                });

                if (!WEB3AUTH_CLIENT_ID) {
                    const msg = 'Missing WEB3AUTH_CLIENT_ID. Check app config / Constants.expoConfig.extra';
                    console.error('Web3Auth init error:', msg);
                    setError(msg);
                    return;
                }

                if (!Web3Auth) {
                    const msg = 'Web3Auth SDK not found (import returned undefined)';
                    console.error('Web3Auth init error:', msg);
                    setError(msg);
                    return;
                }

                const privateKeyProvider = new EthereumPrivateKeyProvider({
                    config: { chainConfig: WEB3AUTH_CHAIN_CONFIG }
                });

                // Compute redirect URL based on Expo environment
                const redirectUrl = Linking.createURL('auth', {});

                const options = {
                    clientId: WEB3AUTH_CLIENT_ID,
                    network: WEB3AUTH_NETWORK,
                    redirectUrl: redirectUrl,
                    privateKeyProvider,
                } as any;

                console.log('Web3Auth options prepared:', {
                    clientIdPresent: !!options.clientId,
                    network: options.network,
                    redirectUrl: options.redirectUrl,
                });

                // Initialize Web3Auth with correct constructor
                const web3authInstance = new Web3Auth(WebBrowser, SecureStore, options);
                await web3authInstance.init();

                setWeb3auth(web3authInstance);

                // Check if user is already logged in
                if (web3authInstance.connected && web3authInstance.provider) {
                    const userInfo = await web3authInstance.userInfo();
                    await handleUserAuthenticated(web3authInstance.provider, userInfo);
                }
            } catch (err) {
                console.error('Web3Auth init error:', err);
                setError(err instanceof Error ? err.message : 'Failed to initialize Web3Auth');
            }
        };

        init();
    }, []);

    const handleUserAuthenticated = async (provider: any, userInfo: any) => {
        try {
            // Create ethers provider to get address
            const ethersProvider = new ethers.providers.Web3Provider(provider);
            const signer = ethersProvider.getSigner();
            const address = await signer.getAddress();

            setWalletAddress(address);

            // Extract user info
            const email = userInfo?.email || `${address.slice(2, 10)}@oweza.local`;
            const displayName = userInfo?.name || `User ${address.slice(0, 6)}`;
            const photoUrl = userInfo?.profileImage || '';
            const userId = `web3auth_${address.slice(2, 10)}`;

            const userProfile: UserProfile = {
                userId,
                email,
                walletAddress: address,
                displayName,
                photoUrl,
                username: userInfo?.name || address.slice(0, 8),
            };

            setProfile(userProfile);
            console.log('✅ User authenticated:', userProfile);

            // Register with backend
            try {
                await registerUser({
                    userId,
                    email,
                    emailVerified: !!userInfo?.email,
                    walletAddress: address,
                    displayName,
                    photoUrl,
                });
                console.log('✅ User registered with backend');
            } catch (err) {
                console.warn('⚠️ Backend registration failed:', err);
            }
        } catch (err) {
            console.error('Error handling authenticated user:', err);
        }
    };

    const login = async (provider?: string, email?: string) => {
        if (!web3auth) {
            setError('Web3Auth not initialized');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Determine which provider to use
            let loginProvider: string;
            let extraLoginOptions: any = {};

            if (provider === 'google') {
                loginProvider = LOGIN_PROVIDER.GOOGLE;
            } else if (provider === 'apple') {
                loginProvider = LOGIN_PROVIDER.APPLE;
            } else if (provider === 'email' && email) {
                loginProvider = LOGIN_PROVIDER.EMAIL_PASSWORDLESS;
                extraLoginOptions = { login_hint: email };
            } else {
                // Default to email passwordless if no provider specified
                loginProvider = LOGIN_PROVIDER.EMAIL_PASSWORDLESS;
            }

            console.log(`🔐 Logging in with ${loginProvider}...`, extraLoginOptions);

            await web3auth.login({ loginProvider, extraLoginOptions });

            if (web3auth.connected && web3auth.provider) {
                const userInfo = await web3auth.userInfo();
                await handleUserAuthenticated(web3auth.provider, userInfo);
            }
        } catch (err) {
            console.error('Login error:', err);
            setError(err instanceof Error ? err.message : 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        if (!web3auth) return;

        try {
            await web3auth.logout();
            setProfile(null);
            setWalletAddress(null);
            setError(null);
        } catch (err) {
            console.error('Logout error:', err);
        }
    };

    const openAppKit = () => {
        // Keep for compatibility - just trigger email login
        login('email');
    };

    const sendUserOperation = async (calls: any[]): Promise<{ userOperationHash: string }> => {
        if (!web3auth || !web3auth.connected || !web3auth.provider || !walletAddress) {
            throw new Error("Wallet not connected");
        }

        try {
            console.log("🚀 Sending gasless transaction on Celo");

            const call = calls[0];
            if (!call) throw new Error("No calls provided");

            // Get private key from provider
            const privateKey = await (web3auth.provider as any).getPrivateKey();

            // Create wallet client with private key
            const account = privateKeyToAccount(`0x${privateKey}` as `0x${string}`);

            const walletClient = createWalletClient({
                account,
                chain: celoSepolia,
                transport: http(),
            });

            // Send transaction with feeCurrency (pay gas in cUSD!)
            const hash = await walletClient.sendTransaction({
                account,
                to: call.to as Address,
                data: call.data as `0x${string}`,
                value: call.value ? parseEther(call.value.toString()) : 0n,
                // @ts-ignore - feeCurrency is Celo-specific
                feeCurrency: CUSD_TOKEN_ADDRESS,
            });

            console.log("✅ Gasless transaction sent:", hash);

            // Wait for confirmation
            const publicClient = createPublicClient({
                chain: celoSepolia,
                transport: http(),
            });

            await publicClient.waitForTransactionReceipt({ hash });

            return { userOperationHash: hash };
        } catch (err) {
            console.error("❌ Transaction failed:", err);
            throw err;
        }
    };

    const value = useMemo(() => ({
        walletAddress,
        profile,
        isConnected: !!walletAddress && !!profile,
        loading,
        login,
        logout,
        error,
        openAppKit,
        sendUserOperation
    }), [walletAddress, profile, loading, error]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Helper to convert private key to account
function privateKeyToAccount(privateKey: `0x${string}`) {
    // Import from viem/accounts
    const { privateKeyToAccount } = require('viem/accounts');
    return privateKeyToAccount(privateKey);
}

export const Web3AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <QueryClientProvider client={queryClient}>
            <AuthProviderContent>
                {children}
            </AuthProviderContent>
        </QueryClientProvider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within Web3AuthProvider");
    return context;
};

// Keep old export name for compatibility
export const AppKitProvider = Web3AuthProvider;
