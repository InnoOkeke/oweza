import Constants from 'expo-constants';

export interface UserProfile {
    userId: string;
    email: string;
    displayName?: string;
    avatar?: string;
    walletAddress?: string;
}

const API_URL = Constants?.expoConfig?.extra?.API_URL || 'http://localhost:3000';
const API_KEY = Constants?.expoConfig?.extra?.METASEND_API_KEY;

/**
 * Client-side user service for React Native
 * This service uses API endpoints instead of direct MongoDB access
 */
export class ClientUserService {
    private static instance: ClientUserService;

    private constructor() { }

    static getInstance(): ClientUserService {
        if (!ClientUserService.instance) {
            ClientUserService.instance = new ClientUserService();
        }
        return ClientUserService.instance;
    }

    /**
     * Find user by wallet address via API
     */
    async findUserByWalletAddress(walletAddress: string): Promise<UserProfile | null> {
        try {
            const url = `${API_URL}/api/users?walletAddress=${encodeURIComponent(walletAddress)}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.error('Failed to fetch user by wallet address:', response.status);
                return null;
            }

            const data = await response.json();
            if (!data.success || !data.user) {
                return null;
            }

            return this.mapUserToProfile(data.user);
        } catch (error) {
            console.error('Error fetching user by wallet address:', error);
            return null;
        }
    }

    /**
     * Find user by email via API
     */
    async findUserByEmail(email: string): Promise<UserProfile | null> {
        try {
            const url = `${API_URL}/api/users?email=${encodeURIComponent(email)}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.error('Failed to fetch user by email:', response.status);
                return null;
            }

            const data = await response.json();
            if (!data.success || !data.user) {
                return null;
            }

            return this.mapUserToProfile(data.user);
        } catch (error) {
            console.error('Error fetching user by email:', error);
            return null;
        }
    }

    /**
     * Search users by email pattern via API
     */
    async searchUsers(searchTerm: string, limit: number = 10): Promise<UserProfile[]> {
        try {
            const url = `${API_URL}/api/users?search=${encodeURIComponent(searchTerm)}&limit=${limit}`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                console.error('Failed to search users:', response.status);
                return [];
            }

            const data = await response.json();
            if (!data.success || !data.users) {
                return [];
            }

            return data.users.map((user: any) => this.mapUserToProfile(user));
        } catch (error) {
            console.error('Error searching users:', error);
            return [];
        }
    }

    /**
     * Map database user to profile
     */
    private mapUserToProfile(user: any): UserProfile {
        return {
            userId: user.userId,
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0],
            avatar: user.avatar,
            walletAddress: user.wallets?.base || user.walletAddress,
        };
    }
}

// Export singleton instance
export const clientUserService = ClientUserService.getInstance();
