import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useAppKit, useAccount as useAppKitAccount } from '@reown/appkit-react-native';
import { useDisconnect, useWalletClient } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { celoSepolia } from 'viem/chains';
import { CUSD_TOKEN_ADDRESS } from '../config/celo';
import { registerUser } from '../services/api';

WebBrowser.maybeCompleteAuthSession();

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
    login: (provider: "google" | "apple" | "email_passwordless", email?: string) => Promise<void>;
    logout: () => Promise<void>;
    error: string | null;
    openAppKit: () => void;
    sendUserOperation: (calls: any[]) => Promise<{ userOperationHash: string }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthProviderContent: React.FC<React.PropsWithChildren> = ({ children }) => {
    const { address, isConnected: walletConnected } = useAppKitAccount();
    const { disconnect } = useDisconnect();
    const { data: walletClient } = useWalletClient();
    const { open } = useAppKit();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [socialAuthData, setSocialAuthData] = useState<{
        userId: string;
        email: string;
        displayName?: string;
        photoUrl?: string;
    } | null>(null);

    // Google OAuth configuration
    const googleDiscovery = AuthSession.useAutoDiscovery('https://accounts.google.com');
    
    const [googleRequest, googleResponse, googlePromptAsync] = AuthSession.useAuthRequest(
        {
            clientId: Platform.select({
                android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
                ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
                default: '',
            }),
            scopes: ['openid', 'profile', 'email'],
            redirectUri: AuthSession.makeRedirectUri({
                scheme: 'oweza',
                path: 'auth'
            }),
        },
        googleDiscovery
    );

    const openAppKit = async () => {
        try {
            await open();
        } catch (err) {
            console.error("Failed to open AppKit:", err);
            setError("Failed to open wallet connection");
        }
    };

    const handleGoogleAuth = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const result = await googlePromptAsync();
            
            if (result.type === 'success') {
                const { authentication } = result;
                
                // Fetch user info from Google
                const userInfoResponse = await fetch(
                    'https://www.googleapis.com/oauth2/v3/userinfo',
                    {
                        headers: { Authorization: `Bearer ${authentication?.accessToken}` },
                    }
                );
                
                const userInfo = await userInfoResponse.json();
                
                console.log('✅ Google authentication successful');
                console.log('📧 User email:', userInfo.email);
                
                // Store social auth data temporarily
                setSocialAuthData({
                    userId: userInfo.sub,
                    email: userInfo.email,
                    displayName: userInfo.name,
                    photoUrl: userInfo.picture,
                });
                
                // Now open AppKit to create/connect smart wallet
                console.log('🔐 Opening wallet connection...');
                await open();
            } else {
                setError('Google authentication was cancelled');
            }
        } catch (err) {
            console.error('❌ Google authentication failed:', err);
            setError('Failed to authenticate with Google');
            setLoading(false);
        }
    };

    const handleAppleAuth = async () => {
        try {
            setLoading(true);
            setError(null);
            
            // Apple Sign In implementation would go here
            // For now, show a placeholder
            console.log('Apple Sign In not yet implemented');
            setError('Apple Sign In coming soon');
        } catch (err) {
            console.error('❌ Apple authentication failed:', err);
            setError('Failed to authenticate with Apple');
        } finally {
            setLoading(false);
        }
    };

    const handleEmailAuth = async (email: string) => {
        try {
            setLoading(true);
            setError(null);
            
            console.log('📧 Email authentication for:', email);
            
            // For now, we'll use email as the userId
            // In production, you'd send a magic link or OTP
            const userId = `email_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
            
            // Store email auth data temporarily
            setSocialAuthData({
                userId,
                email,
                displayName: email.split('@')[0],
            });
            
            // Open AppKit to create/connect smart wallet
            console.log('🔐 Opening wallet connection...');
            await open();
        } catch (err) {
            console.error('❌ Email authentication failed:', err);
            setError('Failed to authenticate with email');
            setLoading(false);
        }
    };

    const login = async (provider: "google" | "apple" | "email_passwordless", email?: string) => {
        switch (provider) {
            case "google":
                await handleGoogleAuth();
                break;
            case "apple":
                await handleAppleAuth();
                break;
            case "email_passwordless":
                if (email) {
                    await handleEmailAuth(email);
                }
                break;
            default:
                setError('Unknown authentication provider');
        }
    };

    // Handle wallet connection after social auth
    useEffect(() => {
        const handleWalletConnection = async () => {
            if (walletConnected && address && socialAuthData && !profile) {
                try {
                    console.log('💼 Wallet connected:', address);
                    console.log('📝 Registering user with backend...');
                    
                    // Register user with backend
                    const registeredUser = await registerUser({
                        userId: socialAuthData.userId,
                        email: socialAuthData.email,
                        emailVerified: true,
                        walletAddress: address,
                        displayName: socialAuthData.displayName,
                        photoUrl: socialAuthData.photoUrl,
                    });
                    
                    console.log('✅ User registered successfully');
                    
                    // Create user profile
                    const userProfile: UserProfile = {
                        userId: socialAuthData.userId,
                        email: socialAuthData.email,
                        walletAddress: address,
                        displayName: socialAuthData.displayName,
                        photoUrl: socialAuthData.photoUrl,
                        username: socialAuthData.email.split('@')[0],
                    };
                    
                    setProfile(userProfile);
                    setIsConnected(true);
                    setSocialAuthData(null); // Clear temporary data
                    setLoading(false);
                    
                    console.log('🎉 Authentication complete!');
                } catch (err) {
                    console.error('❌ Failed to register user:', err);
                    setError('Failed to complete registration');
                    setLoading(false);
                }
            } else if (walletConnected && address && profile && profile.walletAddress !== address) {
                // Update wallet address if it changed
                setProfile({
                    ...profile,
                    walletAddress: address,
                });
            }
        };
        
        handleWalletConnection();
    }, [walletConnected, address, socialAuthData, profile]);

    const sendUserOperation = async (calls: any[]): Promise<{ userOperationHash: string }> => {
        if (!walletClient) throw new Error("Wallet not connected");

        try {
            console.log("🚀 Sending transaction with Celo fee currency");

            // Note: EOA only supports one call per tx. We take the first one.
            const call = calls[0];
            if (!call) throw new Error("No calls provided");

            const hash = await walletClient.sendTransaction({
                to: call.to,
                data: call.data,
                value: call.value,
                chain: celoSepolia,
                kzg: undefined,
                // @ts-ignore - feeCurrency is a Celo extension supported by viem but might need type assertion
                feeCurrency: CUSD_TOKEN_ADDRESS
            });

            console.log("✅ Transaction sent:", hash);
            return { userOperationHash: hash };
        } catch (err) {
            console.error("❌ Transaction failed:", err);
            throw err;
        }
    };

    const logout = async () => {
        setProfile(null);
        setIsConnected(false);
        setError(null);
        if (walletConnected) {
            disconnect();
        }
    };

    const value = useMemo(() => ({
        walletAddress: address || null,
        profile,
        isConnected,
        loading,
        login,
        logout,
        error,
        openAppKit,
        sendUserOperation
    }), [address, profile, isConnected, loading, error, walletConnected, googleRequest]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const AppKitProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
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
    if (!context) throw new Error("useAuth must be used within AppKitProvider");
    return context;
};
