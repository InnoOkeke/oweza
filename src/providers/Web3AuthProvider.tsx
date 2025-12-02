import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform, AppState, AppStateStatus } from 'react-native';
import Web3Auth, { LOGIN_PROVIDER } from '@web3auth/react-native-sdk';
import { EthereumPrivateKeyProvider } from '@web3auth/ethereum-provider';
import * as WebBrowser from '@toruslabs/react-native-web-browser';
import EncryptedStorage from 'react-native-encrypted-storage';
import Constants, { AppOwnership } from 'expo-constants';
import * as Linking from 'expo-linking';
import * as AuthSession from 'expo-auth-session';
import { createWalletClient, createPublicClient, custom, http, parseEther, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
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
                // Warm up browser on Android to reduce time in background
                if (Platform.OS === 'android') {
                    console.log('🔥 Warming up browser for Android...');
                    await WebBrowser.warmUpAsync().catch((err: any) => {
                        console.warn('Browser warmup failed (not critical):', err);
                    });
                }


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

                // Configure custom verifier for email passwordless
                // This makes email login use your custom "app-oweza-dev" verifier
                const loginConfig = {
                    email_passwordless: {
                        verifier: "app-oweza-dev", // Your custom verifier from dashboard
                        typeOfLogin: "email_passwordless",
                        clientId: WEB3AUTH_CLIENT_ID,
                    },
                };

                const options = {
                    clientId: WEB3AUTH_CLIENT_ID,
                    network: WEB3AUTH_NETWORK,
                    redirectUrl: redirectUrl,
                    privateKeyProvider,
                    loginConfig, // Use custom verifier config
                } as any;

                console.log('Web3Auth options prepared:', {
                    clientIdPresent: !!options.clientId,
                    network: options.network,
                    redirectUrl: options.redirectUrl,
                });

                // Initialize Web3Auth with correct constructor
                const web3authInstance = new Web3Auth(WebBrowser, EncryptedStorage, options);
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

        // Handle app state changes (background/foreground)
        const handleAppStateChange = async (nextAppState: AppStateStatus) => {
            console.log('📱 App state changed to:', nextAppState);

            if (nextAppState === 'active') {
                // App has come to foreground
                console.log('🔄 App became active, checking Web3Auth session...');

                if (web3auth && web3auth.connected && web3auth.provider && !profile) {
                    console.log('✅ Found active Web3Auth session, restoring...');
                    try {
                        const userInfo = await web3auth.userInfo();
                        await handleUserAuthenticated(web3auth.provider, userInfo);
                    } catch (err) {
                        console.error('❌ Failed to restore session:', err);
                    }
                }
            }
        };

        const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

        return () => {
            subscription.remove();
            appStateSubscription.remove();

            // Cool down browser on Android
            if (Platform.OS === 'android') {
                WebBrowser.coolDownAsync().catch(() => {
                    // Ignore errors in cleanup
                });
            }
        };
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
            const errorMsg = 'Web3Auth not initialized';
            console.error(errorMsg);
            setError(errorMsg);
            return;
        }

        if (web3auth.connected) {
            console.log('⚠️ Already logged in');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            console.log(`🔐 Initiating login with provider: ${provider || 'email'}`);

            // Web3Auth Login Parameters (Official SDK Pattern)
            let loginParams: {
                loginProvider: string;
                extraLoginOptions?: {
                    login_hint?: string;
                    [key: string]: any;
                };
                redirectUrl?: string;
            };

            if (provider === 'google') {
                loginParams = {
                    loginProvider: LOGIN_PROVIDER.GOOGLE,
                    redirectUrl: Linking.createURL('auth'),
                };
            } else if (provider === 'apple') {
                loginParams = {
                    loginProvider: LOGIN_PROVIDER.APPLE,
                    redirectUrl: Linking.createURL('auth'),
                };
            } else if (email) {
                loginParams = {
                    loginProvider: LOGIN_PROVIDER.EMAIL_PASSWORDLESS,
                    extraLoginOptions: {
                        login_hint: email,
                    },
                    redirectUrl: Linking.createURL('auth'),
                };
            } else {
                throw new Error('Invalid login parameters: provider or email required');
            }

            console.log('📤 Calling Web3Auth login with params:', {
                provider: loginParams.loginProvider,
                hasExtraOptions: !!loginParams.extraLoginOptions,
                redirectUrl: loginParams.redirectUrl,
            });

            // Official Web3Auth login call
            await web3auth.login(loginParams);

            console.log('✅ Login successful, connection status:', web3auth.connected);

            // Verify connection and get user info
            if (!web3auth.connected) {
                throw new Error('Login completed but connection not established');
            }

            if (!web3auth.provider) {
                throw new Error('Login completed but provider not available');
            }

            // Get user information (official SDK method)
            const userInfo = await web3auth.userInfo();
            console.log('👤 User info retrieved:', {
                email: userInfo?.email,
                name: userInfo?.name,
                verifier: userInfo?.verifier,
                verifierId: userInfo?.verifierId,
            });

            // Process authenticated user
            await handleUserAuthenticated(web3auth.provider, userInfo);

            console.log('🎉 Login flow completed successfully');
        } catch (err: any) {
            console.error('❌ Login error:', err);

            // Clear any partial state
            setProfile(null);
            setWalletAddress(null);

            // User-friendly error messages
            let errorMessage = 'Login failed';
            if (err?.message?.includes('User cancelled') || err?.message?.includes('user closed')) {
                errorMessage = 'Login cancelled by user';
            } else if (err?.message?.includes('network')) {
                errorMessage = 'Network error. Please check your connection';
            } else if (err?.message) {
                errorMessage = err.message;
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        if (!web3auth) {
            console.warn('⚠️ Web3Auth not initialized');
            return;
        }

        if (!web3auth.connected) {
            console.log('⚠️ Already logged out');
            // Clean up state anyway
            setProfile(null);
            setWalletAddress(null);
            setError(null);
            return;
        }

        try {
            console.log('🔓 Logging out...');

            // Official Web3Auth logout
            await web3auth.logout();

            // Clear all auth state
            setProfile(null);
            setWalletAddress(null);
            setError(null);

            console.log('✅ Logout successful');
        } catch (err: any) {
            console.error('❌ Logout error:', err);

            // Even if logout fails, clear local state
            setProfile(null);
            setWalletAddress(null);
            setError(null);

            // Log error but don't show to user since state is cleared
            console.warn('Logout completed with errors, but local state cleared');
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

            if (calls.length === 0) throw new Error("No calls provided");

            // Get private key from provider
            const privateKey = await web3auth.provider.request({ method: "eth_private_key" });

            // Create wallet client with private key
            const account = privateKeyToAccount(`0x${privateKey}` as `0x${string}`);

            const walletClient = createWalletClient({
                account,
                chain: celoSepolia,
                transport: http(),
            });

            let lastHash = "";

            for (const call of calls) {
                console.log(`🚀 Sending transaction to ${call.to}`);

                // Send transaction with feeCurrency (pay gas in cUSD!)
                const hash = await walletClient.sendTransaction({
                    account,
                    to: call.to as Address,
                    data: call.data as `0x${string}`,
                    value: call.value ? parseEther(call.value.toString()) : 0n,
                    // @ts-ignore - feeCurrency is Celo-specific
                    feeCurrency: CUSD_TOKEN_ADDRESS,
                });

                console.log("✅ Transaction sent:", hash);
                lastHash = hash;

                // Wait for confirmation before sending the next one
                const publicClient = createPublicClient({
                    chain: celoSepolia,
                    transport: http(),
                });

                await publicClient.waitForTransactionReceipt({ hash });
            }

            return { userOperationHash: lastHash };
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

// Helper to convert private key to account - REMOVED, using top-level import instead

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
