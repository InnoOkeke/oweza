import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAppKit, useAccount as useAppKitAccount } from '@reown/appkit-react-native';
import { useDisconnect, useWalletClient } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { celoSepolia } from 'viem/chains';
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
    login: () => Promise<void>;
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

    const openAppKit = async () => {
        try {
            setLoading(true);
            setError(null);
            await open();
        } catch (err) {
            console.error("Failed to open AppKit:", err);
            setError("Failed to open wallet connection");
        } finally {
            setLoading(false);
        }
    };

    const login = async () => {
        await openAppKit();
    };

    // Handle wallet connection and user registration
    useEffect(() => {
        const handleWalletConnection = async () => {
            if (walletConnected && address && !profile) {
                try {
                    console.log('💼 Wallet connected:', address);
                    console.log('📝 Registering user with backend...');
                    
                    // Use wallet address as userId for now
                    const userId = `wallet_${address.slice(2, 10)}`;
                    const email = `${address.slice(2, 10)}@oweza.local`; // Temporary email
                    
                    // Register user with backend
                    const registeredUser = await registerUser({
                        userId,
                        email,
                        emailVerified: false,
                        walletAddress: address,
                        displayName: `User ${address.slice(0, 6)}`,
                    });
                    
                    console.log('✅ User registered successfully');
                    
                    // Create user profile
                    const userProfile: UserProfile = {
                        userId,
                        email,
                        walletAddress: address,
                        displayName: `User ${address.slice(0, 6)}`,
                        username: address.slice(0, 8),
                    };
                    
                    setProfile(userProfile);
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
    }, [walletConnected, address, profile]);

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
        setError(null);
        if (walletConnected) {
            disconnect();
        }
    };

    const value = useMemo(() => ({
        walletAddress: address || null,
        profile,
        isConnected: walletConnected,
        loading,
        login,
        logout,
        error,
        openAppKit,
        sendUserOperation
    }), [address, profile, walletConnected, loading, error]);

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
