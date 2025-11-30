import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppKit, useAccount, useProvider } from '@reown/appkit-react-native';
import { ethers } from 'ethers';
import { CUSD_TOKEN_ADDRESS, CELO_RPC_URL } from '../config/celo';
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
    login: () => Promise<void>;
    logout: () => Promise<void>;
    error: string | null;
    openAppKit: () => void;
    sendUserOperation: (calls: any[]) => Promise<{ userOperationHash: string }>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthProviderContent: React.FC<React.PropsWithChildren> = ({ children }) => {
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [provider, setProvider] = useState<ethers.providers.JsonRpcProvider | null>(null);
    
    // Use Reown AppKit hooks
    const { open } = useAppKit();
    const { address, isConnected } = useAccount();
    const { provider: walletProvider } = useProvider();

    // Initialize provider
    useEffect(() => {
        const rpcProvider = new ethers.providers.JsonRpcProvider(CELO_RPC_URL);
        setProvider(rpcProvider);
    }, []);

    const login = async () => {
        try {
            setLoading(true);
            setError(null);
            console.log('🔐 Opening Reown AppKit authentication...');
            
            // Open Reown AppKit modal for authentication
            await open();
        } catch (err) {
            console.error('❌ Failed to open authentication:', err);
            setError('Failed to open authentication');
        } finally {
            setLoading(false);
        }
    };

    const openAppKit = async () => {
        await open();
    };

    // Handle wallet connection and registration
    useEffect(() => {
        const handleWalletConnection = async () => {
            if (address && isConnected && !profile) {
                console.log('✅ Wallet connected:', address);
                
                // Try to get user info from Reown
                let email = '';
                let displayName = '';
                let photoUrl = '';
                
                try {
                    // Reown provides user info when authenticated via email/social
                    // @ts-ignore - accessing Reown's internal state
                    const appKitState = walletProvider?.session?.peer?.metadata;
                    if (appKitState) {
                        email = appKitState.email || '';
                        displayName = appKitState.name || '';
                        photoUrl = appKitState.icons?.[0] || '';
                    }
                } catch (err) {
                    console.warn('⚠️ Could not get user info from Reown:', err);
                }
                
                // Fallback if no email from Reown
                if (!email) {
                    email = `${address.slice(2, 10)}@oweza.local`;
                }
                
                const userId = `reown_${address.slice(2, 10)}`;
                
                // Create user profile
                const userProfile: UserProfile = {
                    userId,
                    email,
                    walletAddress: address,
                    displayName: displayName || `User ${address.slice(0, 6)}`,
                    photoUrl,
                    username: address.slice(0, 8),
                };
                
                setProfile(userProfile);
                console.log('✅ User profile created:', userProfile);
                
                // Register with backend (non-blocking)
                try {
                    console.log('📝 Registering user with backend...');
                    await registerUser({
                        userId,
                        email,
                        emailVerified: !!displayName, // If we got name from social, email is verified
                        walletAddress: address,
                        displayName: userProfile.displayName,
                        photoUrl: photoUrl,
                    });
                    console.log('✅ User registered with backend');
                } catch (err) {
                    console.warn('⚠️ Backend registration failed (continuing anyway):', err);
                }
            } else if (!isConnected && profile) {
                // User disconnected
                setProfile(null);
            }
        };
        
        handleWalletConnection();
    }, [address, isConnected, profile, walletProvider]);

    const sendUserOperation = async (calls: any[]): Promise<{ userOperationHash: string }> => {
        if (!walletProvider || !provider || !address) {
            throw new Error("Wallet not connected");
        }

        try {
            console.log("🚀 Sending transaction with Celo fee currency");

            const call = calls[0];
            if (!call) throw new Error("No calls provided");

            // Create ethers provider from Reown wallet provider
            const ethersProvider = new ethers.providers.Web3Provider(walletProvider as any);
            const signer = ethersProvider.getSigner();
            
            const tx = await signer.sendTransaction({
                to: call.to,
                data: call.data,
                value: call.value,
                // @ts-ignore - feeCurrency is Celo-specific
                feeCurrency: CUSD_TOKEN_ADDRESS
            });

            console.log("✅ Transaction sent:", tx.hash);
            await tx.wait();
            
            return { userOperationHash: tx.hash };
        } catch (err) {
            console.error("❌ Transaction failed:", err);
            throw err;
        }
    };

    const logout = async () => {
        try {
            // Disconnect from Reown
            if (walletProvider && (walletProvider as any).disconnect) {
                await (walletProvider as any).disconnect();
            }
            setProfile(null);
            setError(null);
        } catch (err) {
            console.error('❌ Logout failed:', err);
        }
    };

    const value = useMemo(() => ({
        walletAddress: address || null,
        profile,
        isConnected: isConnected && !!address,
        loading,
        login,
        logout,
        error,
        openAppKit,
        sendUserOperation
    }), [address, profile, isConnected, loading, error, provider, walletProvider]);

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
