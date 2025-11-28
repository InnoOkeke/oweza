import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createAppKit, AppKit } from '@reown/appkit-react-native';
import { defaultWagmiConfig } from '@reown/appkit-wagmi';
import { WagmiProvider, useAccount, useDisconnect, useWalletClient } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { celoSepolia } from 'viem/chains';
import { REOWN_PROJECT_ID, APP_METADATA, CUSD_TOKEN_ADDRESS } from '../config/celo';
import { registerUser } from "../services/api";

// 1. Get projectId
const projectId = REOWN_PROJECT_ID;

// 2. Create config
const chains = [celoSepolia] as const;

const wagmiConfig = defaultWagmiConfig({
    chains,
    projectId,
    metadata: APP_METADATA,
});

// 3. Create modal
createAppKit({
    projectId,
    wagmiConfig,
    defaultChain: celoSepolia,
    enableAnalytics: true,
});

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
    const { address, isConnected } = useAccount();
    const { disconnect } = useDisconnect();
    const { data: walletClient } = useWalletClient();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Mock login/logout for now as AppKit handles it via UI
    const openAppKit = async () => {
        // Placeholder for opening modal if needed programmatically
    };

    useEffect(() => {
        if (isConnected && address) {
            const fetchProfile = async () => {
                try {
                    setLoading(true);
                    const userProfile: UserProfile = {
                        userId: address,
                        email: "",
                        walletAddress: address,
                        displayName: "User",
                        username: address.slice(0, 6),
                    };
                    setProfile(userProfile);
                } catch (e) {
                    console.error("Profile fetch error", e);
                } finally {
                    setLoading(false);
                }
            };
            fetchProfile();
        } else {
            setProfile(null);
        }
    }, [isConnected, address]);

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

    const value = useMemo(() => ({
        walletAddress: address || null,
        profile,
        isConnected,
        loading,
        login: async () => { /* Trigger AppKit */ },
        logout: async () => { await disconnect(); },
        error,
        openAppKit,
        sendUserOperation
    }), [address, profile, isConnected, loading, error, disconnect, walletClient]);

    return (
        <AuthContext.Provider value={value}>
            {children}
            <AppKit />
        </AuthContext.Provider>
    );
};

export const AppKitProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <AuthProviderContent>
                    {children}
                </AuthProviderContent>
            </QueryClientProvider>
        </WagmiProvider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AppKitProvider");
    return context;
};
